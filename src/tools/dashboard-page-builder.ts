import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import type { PlutioClient } from "../client.js";
import type { ToolDefinition } from "./factory.js";

const PAGE_BLOCK_TYPES = [
  "content",
  "image",
  "canvas",
  "video",
  "html",
] as const;

interface PresetBlock {
  type: (typeof PAGE_BLOCK_TYPES)[number];
  textHTML?: string;
}

interface DashboardPagePreset {
  slug: string;
  displayName: string;
  description: string;
  blocks: PresetBlock[];
}

const BUILTIN_PAGES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "presets",
  "dashboard-pages",
);

function loadPresets(): DashboardPagePreset[] {
  const dirs = [BUILTIN_PAGES_DIR];
  if (process.env.PLUTIO_USER_PRESETS_DIR) {
    dirs.push(path.join(process.env.PLUTIO_USER_PRESETS_DIR, "dashboard-pages"));
  }
  const out: DashboardPagePreset[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      try {
        const data = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as DashboardPagePreset;
        if (data?.slug) out.push(data);
      } catch {
        // skip
      }
    }
  }
  return out;
}

// ─── plutio_list_dashboard_page_presets ─────────────────────────────────────

export function createListDashboardPagePresetsTool(): ToolDefinition {
  return {
    name: "plutio_list_dashboard_page_presets",
    description:
      "List dashboard-page presets shipped with the server. Each preset is a starter layout for a new page on a Plutio role dashboard (Owner / Co-Owner / Client / Manager / Team Member). Use plutio_create_dashboard_page_from_preset to instantiate one.",
    inputSchema: z.object({}),
    handler: async () => {
      const presets = loadPresets();
      return {
        count: presets.length,
        presets: presets.map((p) => ({
          slug: p.slug,
          displayName: p.displayName,
          description: p.description,
          blocks: p.blocks.length,
        })),
      };
    },
  };
}

// ─── plutio_create_dashboard_page_from_preset ───────────────────────────────

export function createDashboardPageFromPresetTool(client: PlutioClient): ToolDefinition {
  const schema = z.object({
    preset: z
      .string()
      .min(1)
      .describe("Preset slug from plutio_list_dashboard_page_presets (e.g. 'client-welcome')."),
    dashboardId: z
      .string()
      .min(1)
      .describe(
        "The role dashboard's _id this page should belong to. Get from plutio_dashboards list — typically you want the one titled 'Client'.",
      ),
    title: z.string().min(1).optional().describe("Page title. Defaults to preset.displayName."),
    overrides: z
      .object({
        blocks: z
          .array(
            z.object({
              type: z.enum(PAGE_BLOCK_TYPES),
              textHTML: z.string().optional(),
            }),
          )
          .optional(),
      })
      .optional(),
  });

  return {
    name: "plutio_create_dashboard_page_from_preset",
    description:
      "Add a new page to a Plutio role dashboard (Settings → Custom Pages → <role>) populated from a preset scaffold. Creates the page record + posts content blocks against entityType: 'dashboard-page'. Useful for personalized client onboarding pages, project status snapshots, etc. NOTE: Plutio's REST API does NOT support updating or deleting dashboard pages — manage them in the web UI after creation.",
    inputSchema: schema,
    handler: async (rawArgs) => {
      const args = schema.parse(rawArgs);
      const presets = loadPresets();
      const preset = presets.find((p) => p.slug === args.preset);
      if (!preset) {
        throw new Error(
          `Unknown dashboard page preset "${args.preset}". Available: ${presets.map((p) => p.slug).join(", ")}`,
        );
      }

      // Step 1 — create the page
      const page = await client.create<{ _id: string }>("dashboard-pages", {
        title: args.title ?? preset.displayName,
        dashboardId: args.dashboardId,
      });
      if (!page?._id) {
        throw new Error("Plutio did not return a page _id on create. The dashboardId may be invalid.");
      }

      // Step 2 — create each block, in order, pinned to this page
      const blockList = args.overrides?.blocks ?? preset.blocks;
      const createdBlockIds: string[] = [];
      const skippedTypes: string[] = [];
      for (const block of blockList) {
        const body: Record<string, unknown> = {
          entityType: "dashboard-page",
          entityId: page._id,
          type: block.type,
        };
        if (block.textHTML && block.type === "content") {
          body.textHTML = block.textHTML;
        }
        try {
          const b = await client.create<{ _id: string }>("blocks", body);
          if (b?._id) createdBlockIds.push(b._id);
        } catch (err) {
          skippedTypes.push(block.type);
          process.stderr.write(
            `[plutio_create_dashboard_page_from_preset] block create failed for type=${block.type}: ${err instanceof Error ? err.message : String(err)}\n`,
          );
        }
      }

      return {
        ok: true,
        page: {
          _id: page._id,
          dashboardId: args.dashboardId,
          presetUsed: preset.slug,
          title: args.title ?? preset.displayName,
          blockCount: createdBlockIds.length,
          blockIds: createdBlockIds,
          skippedBlockTypes: skippedTypes,
        },
        warning:
          "Dashboard pages cannot be updated or deleted via REST. Open Plutio's web UI to manage this page after creation.",
      };
    },
  };
}
