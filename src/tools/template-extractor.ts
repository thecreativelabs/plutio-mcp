import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import type { PlutioClient } from "../client.js";
import type { ToolDefinition } from "./factory.js";

interface TemplateMeta {
  _id: string;
  entityType: string;
  entityId: string;
  title?: string;
  group?: string;
  isPublic?: boolean;
}

interface TemplateBody {
  _id: string;
  name?: string;
  isTemplate?: boolean;
  blocks?: string[];
  billableItems?: Array<{
    title?: string;
    descriptionHTML?: string;
    quantity?: number;
    amount?: number;
    tax?: string;
  }>;
  currency?: string;
}

interface BlockRecord {
  _id: string;
  type: string;
  textHTML?: string;
  main?: { textHTML?: string };
  isTemplate?: boolean;
}

const PRESETS_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "presets",
);

/** Convert "MASTER SERVICES AGREEMENT" → "master-services-agreement" */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * Convert common placeholder patterns in HTML to {{ snake_case }} variables.
 * Handles [CLIENT NAME], [[CLIENT]], <<DATE>>, {CLIENT_NAME} etc.
 * Returns the rewritten HTML and the set of variable names created.
 */
function detectVariables(html: string): { html: string; variables: Set<string> } {
  const variables = new Set<string>();
  const patterns: Array<RegExp> = [
    /\[\[([A-Z][A-Z0-9_ ]{2,50})\]\]/g, // [[VAR]]
    /<<([A-Z][A-Z0-9_ ]{2,50})>>/g, // <<VAR>>
    /\[([A-Z][A-Z0-9_ ]{2,50})\]/g, // [VAR]
    /\{([A-Z][A-Z0-9_ ]{2,50})\}/g, // {VAR}
  ];
  let result = html;
  for (const pattern of patterns) {
    result = result.replace(pattern, (_match, raw: string) => {
      const name = raw.trim().toLowerCase().replace(/\s+/g, "_");
      variables.add(name);
      return `{{ ${name} }}`;
    });
  }
  return { html: result, variables };
}

export function createTemplateToPresetTool(client: PlutioClient): ToolDefinition {
  const schema = z.object({
    templateName: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Match a Plutio template by title (case-insensitive substring). One of templateName/templateId is required.",
      ),
    templateId: z.string().min(1).optional().describe("A specific Plutio template _id."),
    entityType: z
      .enum(["contract", "proposal"])
      .default("contract")
      .describe("Which kind of template to extract. Default: contract."),
    detectVariables: z
      .boolean()
      .default(true)
      .describe(
        "Convert ALL-CAPS placeholders like [CLIENT NAME], [[DATE]], <<TERM>> into {{ snake_case }} variables.",
      ),
    writeToDisk: z
      .boolean()
      .default(false)
      .describe(
        "Save the output to src/presets/{entityType}s/<slug>.json. Default false (return only).",
      ),
    slug: z.string().optional().describe("Override the auto-generated slug."),
  }).refine((d) => d.templateName || d.templateId, { message: "Provide templateName or templateId" });

  return {
    name: "plutio_template_to_preset",
    description:
      "Extract one of your existing Plutio contract or proposal templates into a preset JSON ready for plutio_contract_from_preset / plutio_proposal_from_preset. Reads the template's blocks (including text-HTML content) and optionally converts ALL-CAPS placeholders to {{ variable }} tokens. Use this once per template you care about — the resulting JSON lives in the repo and stays usable forever, even if Plutio's REST API never adds template-write support.",
    inputSchema: schema,
    handler: async (rawArgs) => {
      const args = schema.parse(rawArgs);

      // 1. Find the template metadata record
      let template: TemplateMeta | null = null;
      if (args.templateId) {
        const list = await client.list<TemplateMeta[]>("templates", {
          q: { _id: args.templateId },
          limit: 1,
        });
        template = Array.isArray(list) && list[0] ? list[0] : null;
      } else if (args.templateName) {
        const list = await client.list<TemplateMeta[]>("templates", {
          q: { entityType: args.entityType },
          limit: 200,
        });
        const needle = args.templateName.toLowerCase();
        template =
          (Array.isArray(list) ? list : []).find((t) =>
            (t.title ?? "").toLowerCase().includes(needle),
          ) ?? null;
      }

      if (!template) {
        return {
          found: false,
          note: `No ${args.entityType} template matched. Use plutio_templates list with q: { entityType: '${args.entityType}' } to browse.`,
        };
      }

      // 2. Read the template's body record (a contract/proposal flagged isTemplate: true)
      const bodyList = await client.list<TemplateBody[]>(`${args.entityType}s`, {
        q: { isTemplate: true },
        limit: 200,
      });
      const body = Array.isArray(bodyList)
        ? bodyList.find((c) => c._id === template!.entityId)
        : undefined;

      if (!body) {
        return {
          found: false,
          note: `Template metadata found, but its body record (id=${template.entityId}) is not retrievable. Plutio may have changed how template bodies are stored.`,
          template,
        };
      }

      // 3. Fetch all blocks for that template body in canonical order
      const blockIds = body.blocks ?? [];
      const blocks = await client.list<BlockRecord[]>("blocks", {
        q: { isTemplate: true, entityType: args.entityType, entityId: template.entityId },
        limit: 200,
      });
      const blocksMap = new Map(
        (Array.isArray(blocks) ? blocks : []).map((b) => [b._id, b]),
      );

      const allVariables = new Set<string>();
      const orderedBlocks = blockIds
        .map((id) => blocksMap.get(id))
        .filter((b): b is BlockRecord => b !== undefined);

      const presetBlocks = orderedBlocks.map((block) => {
        // Source HTML: content blocks use top-level textHTML; intro blocks wrap it in main.textHTML
        let html = block.textHTML ?? block.main?.textHTML ?? undefined;
        if (html && args.detectVariables) {
          const { html: rewritten, variables } = detectVariables(html);
          html = rewritten;
          variables.forEach((v) => allVariables.add(v));
        }
        const out: { type: string; textHTML?: string } = { type: block.type };
        if (html && (block.type === "content" || block.type === "intro")) {
          out.textHTML = html;
        }
        return out;
      });

      const slug = args.slug ?? slugify(template.title ?? `${args.entityType}-${template._id}`);

      const preset: Record<string, unknown> = {
        slug,
        displayName: template.title ?? "Extracted template",
        description: `Extracted from Plutio template ${template._id} on ${new Date().toISOString().slice(0, 10)}. ${args.detectVariables ? `Detected ${allVariables.size} variable(s): ${[...allVariables].join(", ")}.` : ""}`.trim(),
      };

      if (args.entityType === "proposal") {
        preset.defaultCurrency = body.currency ?? "USD";
        preset.billableItems = (body.billableItems ?? []).map((bi) => ({
          title: bi.title ?? "",
          descriptionHTML: bi.descriptionHTML,
          quantity: bi.quantity ?? 1,
          amount: bi.amount ?? 0,
          tax: bi.tax,
        }));
      }

      preset.blocks = presetBlocks;

      let written: string | undefined;
      if (args.writeToDisk) {
        const dir = path.join(PRESETS_ROOT, `${args.entityType}s`);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, `${slug}.json`);
        writeFileSync(filePath, JSON.stringify(preset, null, 2) + "\n", "utf8");
        written = filePath;
      }

      return {
        found: true,
        template: {
          id: template._id,
          title: template.title,
          entityType: template.entityType,
          entityBodyId: template.entityId,
        },
        preset,
        detectedVariables: [...allVariables],
        blockTypeDistribution: orderedBlocks.reduce<Record<string, number>>(
          (acc, b) => ({ ...acc, [b.type]: (acc[b.type] ?? 0) + 1 }),
          {},
        ),
        savedTo: written,
        nextSteps: written
          ? [
              `Preset written to ${written}`,
              `Use it via plutio_${args.entityType}_from_preset({ preset: "${slug}", ... })`,
              `If detected variables are wrong, edit the JSON and rename {{ tokens }}.`,
            ]
          : [
              `Save this JSON to src/presets/${args.entityType}s/${slug}.json`,
              `Run with writeToDisk: true to skip the manual save.`,
              `Then: plutio_${args.entityType}_from_preset({ preset: "${slug}", ... })`,
            ],
      };
    },
  };
}
