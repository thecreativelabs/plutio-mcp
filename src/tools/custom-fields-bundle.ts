import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import type { PlutioClient } from "../client.js";
import type { ToolDefinition } from "./factory.js";

const FIELD_TYPES = [
  "text",
  "currency",
  "date",
  "checkbox",
  "rating",
  "select",
  "multiselect",
  "number",
  "url",
  "email",
  "phone",
  "color",
  "time",
  "richtext",
  "file",
] as const;

const ENTITY_TYPES = [
  "person",
  "company",
  "project",
  "task",
  "invoice",
  "proposal",
  "contract",
  "form",
  "event",
  "time-track",
  "item",
] as const;

interface CustomFieldDefinition {
  entityType: string;
  inputType: string;
  title: string;
  options?: Array<{ name: string }>;
  permissions?: Record<string, "view" | "edit" | "hidden">;
  isAddedByDefault?: boolean;
}

interface CustomFieldsBundle {
  slug: string;
  displayName: string;
  description: string;
  fields: CustomFieldDefinition[];
}

const BUILTIN_BUNDLES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "presets",
  "custom-fields",
);

function loadBundles(): CustomFieldsBundle[] {
  const builtinDirs = [BUILTIN_BUNDLES_DIR];
  if (process.env.PLUTIO_USER_PRESETS_DIR) {
    builtinDirs.push(path.join(process.env.PLUTIO_USER_PRESETS_DIR, "custom-fields"));
  }
  const out: CustomFieldsBundle[] = [];
  for (const dir of builtinDirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      try {
        const data = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as CustomFieldsBundle;
        if (data?.slug) out.push(data);
      } catch {
        // skip
      }
    }
  }
  return out;
}

// ─── plutio_list_custom_fields_bundles ──────────────────────────────────────

export function createListCustomFieldsBundlesTool(): ToolDefinition {
  return {
    name: "plutio_list_custom_fields_bundles",
    description:
      "List custom-fields bundles available for plutio_apply_custom_fields_bundle. Each bundle is a curated set of related custom fields — e.g., 'lead-intake' (lead source, budget, status), 'client-onboarding' (onboarding stage, NDA signed, account tier).",
    inputSchema: z.object({}),
    handler: async () => {
      const bundles = loadBundles();
      return {
        count: bundles.length,
        bundles: bundles.map((b) => ({
          slug: b.slug,
          displayName: b.displayName,
          description: b.description,
          fieldCount: b.fields.length,
          fieldTitles: b.fields.map((f) => f.title),
        })),
      };
    },
  };
}

// ─── plutio_apply_custom_fields_bundle ──────────────────────────────────────

export function createApplyCustomFieldsBundleTool(client: PlutioClient): ToolDefinition {
  const schema = z
    .object({
      bundle: z
        .string()
        .min(1)
        .optional()
        .describe("Slug from plutio_list_custom_fields_bundles. One of bundle/fields is required."),
      fields: z
        .array(
          z.object({
            entityType: z.enum(ENTITY_TYPES),
            inputType: z.enum(FIELD_TYPES),
            title: z.string().min(1),
            options: z.array(z.object({ name: z.string() })).optional(),
            isAddedByDefault: z.boolean().optional(),
          }),
        )
        .optional()
        .describe("Custom fields to create directly without using a bundle."),
      skipExisting: z
        .boolean()
        .default(true)
        .describe(
          "If true, fields with the same (entityType, title) as an existing custom field are skipped. Default true.",
        ),
    })
    .refine((d) => d.bundle || d.fields, { message: "Provide either bundle or fields" });

  return {
    name: "plutio_apply_custom_fields_bundle",
    description:
      "Create a curated set of custom fields in your workspace in one call. Either by `bundle` slug (use plutio_list_custom_fields_bundles to see options) or by `fields` array. By default skips fields whose (entityType, title) already exists. NOTE: Plutio's REST API does NOT support updating or deleting custom fields — these creates are permanent until you remove them in Plutio's UI. Verify the bundle is what you want before running.",
    inputSchema: schema,
    handler: async (rawArgs) => {
      const args = schema.parse(rawArgs);

      let toCreate: CustomFieldDefinition[] = [];
      let bundleMeta: CustomFieldsBundle | undefined;
      if (args.bundle) {
        const bundles = loadBundles();
        bundleMeta = bundles.find((b) => b.slug === args.bundle);
        if (!bundleMeta) {
          throw new Error(
            `Unknown bundle "${args.bundle}". Available: ${bundles.map((b) => b.slug).join(", ")}`,
          );
        }
        toCreate = bundleMeta.fields;
      } else if (args.fields) {
        toCreate = args.fields;
      }

      // Get existing fields to skip duplicates
      const existing = await client.list<Array<{ entityType: string; title: string }>>(
        "custom-fields",
        { limit: 500 },
      );
      const existingKeys = new Set(
        (Array.isArray(existing) ? existing : []).map(
          (f) => `${f.entityType}::${(f.title ?? "").toLowerCase()}`,
        ),
      );

      const created: Array<{ _id: string; entityType: string; inputType: string; title: string }> = [];
      const skipped: Array<{ entityType: string; title: string; reason: string }> = [];
      const errored: Array<{ entityType: string; title: string; error: string }> = [];

      for (const field of toCreate) {
        const key = `${field.entityType}::${field.title.toLowerCase()}`;
        if (args.skipExisting && existingKeys.has(key)) {
          skipped.push({
            entityType: field.entityType,
            title: field.title,
            reason: "already exists",
          });
          continue;
        }
        try {
          const result = await client.create<{ _id: string }>("custom-fields", field);
          if (result?._id) {
            created.push({
              _id: result._id,
              entityType: field.entityType,
              inputType: field.inputType,
              title: field.title,
            });
          } else {
            errored.push({
              entityType: field.entityType,
              title: field.title,
              error: "no _id returned",
            });
          }
        } catch (err) {
          errored.push({
            entityType: field.entityType,
            title: field.title,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return {
        bundle: bundleMeta
          ? { slug: bundleMeta.slug, displayName: bundleMeta.displayName }
          : undefined,
        attempted: toCreate.length,
        created,
        skipped,
        errored,
        warning:
          "Custom fields created via REST cannot be updated or deleted via REST. To remove or rename, use Plutio's web UI: Settings → Custom Fields.",
      };
    },
  };
}
