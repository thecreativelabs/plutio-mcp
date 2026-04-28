import { z } from "zod";
import type { PlutioClient } from "../client.js";
import type { ToolDefinition } from "./factory.js";
import { listPresetSources, loadPresetsFor } from "./preset-loader.js";

/**
 * Block schema for contracts is a strict subset of proposals. Plutio's API
 * enforces this enum at validation time:
 *
 *   contract block types: content, image, canvas, video, html, signature
 *   (no intro / items / fees — those throw 400 "Type X is invalid")
 */
type ContractBlockType = "content" | "image" | "canvas" | "video" | "html" | "signature";

interface PresetBlock {
  type: ContractBlockType;
  textHTML?: string;
}

interface ContractPreset {
  slug: string;
  displayName: string;
  description: string;
  blocks: PresetBlock[];
}

function loadPresets(): ContractPreset[] {
  return loadPresetsFor<ContractPreset>("contracts");
}

// ─── plutio_list_contract_presets ───────────────────────────────────────────

export function createListContractPresetsTool(): ToolDefinition {
  return {
    name: "plutio_list_contract_presets",
    description:
      "List contract presets shipped with this server. Each preset is a structured legal scaffold (parties, scope, payment, IP, confidentiality, signature) that plutio_contract_from_preset will instantiate as a real Plutio contract. Note: the legal text in shipped presets contains placeholder TODOs — review and customize for your jurisdiction before sending.",
    inputSchema: z.object({}),
    handler: async () => {
      const presets = loadPresets();
      const sources = listPresetSources("contracts");
      return {
        count: presets.length,
        presets: presets.map((p) => ({
          slug: p.slug,
          displayName: p.displayName,
          description: p.description,
          blocks: p.blocks.length,
        })),
        sources,
        warning:
          "Built-in presets contain TODO placeholders and are NOT legal advice. User presets (from PLUTIO_USER_PRESETS_DIR) come from your own Plutio templates. Always review with counsel before sending.",
      };
    },
  };
}

// ─── plutio_contract_from_preset ────────────────────────────────────────────

export function createContractFromPresetTool(client: PlutioClient): ToolDefinition {
  const schema = z.object({
    preset: z
      .string()
      .min(1)
      .describe("The preset slug from plutio_list_contract_presets (e.g. 'service-agreement', 'nda')."),
    clientId: z
      .string()
      .min(1)
      .optional()
      .describe(
        "Plutio person _id to attach as a signee. Optional — contract can be created without signees and assigned later in the Plutio UI.",
      ),
    name: z.string().min(1).optional().describe("Contract name. Defaults to preset displayName."),
    projectId: z.string().min(1).optional().describe("Optional project _id to link the contract to."),
    variables: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        "String substitutions applied to all block textHTML using {{ var_name }} syntax. Common keys used by shipped presets: provider_legal_name, client_legal_name, effective_date, party_a_name, party_b_name, purpose_short.",
      ),
    overrides: z
      .object({
        blocks: z
          .array(
            z.object({
              type: z.enum(["content", "image", "canvas", "video", "html", "signature"]),
              textHTML: z.string().optional(),
            }),
          )
          .optional()
          .describe(
            "Replace the preset's block list. Block types are restricted to contract-valid ones (no intro/items/fees — those are proposal-only).",
          ),
      })
      .optional(),
  });

  return {
    name: "plutio_contract_from_preset",
    description:
      "Create a Plutio contract from a preset scaffold. Handles the multi-step flow transparently: POST the contract, replace its auto-generated blocks with the preset's blocks (using contract-valid types only), and link to a signee if provided. Variables in the preset's textHTML are substituted before the block is created. Requires writes (PLUTIO_READ_ONLY=false).",
    inputSchema: schema,
    handler: async (rawArgs) => {
      const args = schema.parse(rawArgs);
      const presets = loadPresets();
      const preset = presets.find((p) => p.slug === args.preset);
      if (!preset) {
        throw new Error(
          `Unknown contract preset "${args.preset}". Available: ${presets.map((p) => p.slug).join(", ")}`,
        );
      }

      // Step 1 — create the contract
      const payload: Record<string, unknown> = {
        name: args.name ?? preset.displayName,
      };
      if (args.projectId) payload.projectId = args.projectId;
      if (args.clientId) {
        payload.signees = [{ _id: args.clientId, entityType: "person" }];
      }

      const created = await client.create<{ _id: string; blocks: string[] }>("contracts", payload);

      // Step 2 — delete auto-generated default blocks
      for (const autoBlockId of created.blocks ?? []) {
        try {
          await client.request({
            method: "DELETE",
            path: `blocks/bulk`,
            body: { _ids: [autoBlockId] },
          });
        } catch {
          // ignore — replaced in the blocks array below
        }
      }

      // Step 3 — substitute variables and create preset blocks
      const blockList = args.overrides?.blocks ?? preset.blocks;
      const variables = args.variables ?? {};

      const createdBlockIds: string[] = [];
      const skippedTypes: string[] = [];
      for (const block of blockList) {
        const html = block.textHTML ? substituteVariables(block.textHTML, variables) : undefined;
        const body: Record<string, unknown> = {
          entityType: "contract",
          entityId: created._id,
          type: block.type,
        };
        // Contract block schema by type:
        //   content → top-level textHTML
        //   signature, html, image, canvas, video → bare (no textHTML payload)
        if (html && block.type === "content") {
          body.textHTML = html;
        }
        try {
          const b = await client.create<{ _id: string }>("blocks", body);
          if (b?._id) createdBlockIds.push(b._id);
        } catch (err) {
          skippedTypes.push(block.type);
          process.stderr.write(
            `[plutio_contract_from_preset] block create failed for type=${block.type}: ${err instanceof Error ? err.message : String(err)}\n`,
          );
        }
      }

      // Step 4 — set the contract's blocks array in preset order
      if (createdBlockIds.length > 0) {
        try {
          await client.update("contracts", created._id, { blocks: createdBlockIds });
        } catch {
          // If reorder fails, blocks still exist — user can reorder in Plutio UI
        }
      }

      return {
        ok: true,
        contract: {
          _id: created._id,
          name: payload.name,
          presetUsed: preset.slug,
          signeeId: args.clientId,
          projectId: args.projectId,
          blockCount: createdBlockIds.length,
          blockIds: createdBlockIds,
          skippedBlockTypes: skippedTypes,
          variablesApplied: Object.keys(variables),
        },
        warnings:
          preset.slug === "service-agreement" || preset.slug === "nda"
            ? "Shipped preset contains TODO placeholders. Review the contract in Plutio's UI and replace placeholders with your actual clauses BEFORE sending for signature."
            : undefined,
        nextSteps: [
          "Open the contract in Plutio's web UI to review the rendered HTML",
          "Replace any <!-- TODO: ... --> placeholders with your real clause language",
          "Set signee details and send for signature from Plutio's UI (REST API doesn't expose signature flow)",
        ],
      };
    },
  };
}

/** Replace all `{{ key }}` (with or without surrounding spaces) using the given vars. */
function substituteVariables(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_match, key: string) => {
    return vars[key] !== undefined ? vars[key] : `{{ ${key} }}`;
  });
}
