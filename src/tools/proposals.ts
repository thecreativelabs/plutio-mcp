import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import type { PlutioClient } from "../client.js";
import type { ToolDefinition } from "./factory.js";

/** A billable line item in the shape Plutio's POST /proposals accepts. */
interface PresetBillableItem {
  title: string;
  descriptionHTML?: string;
  quantity: number;
  amount: number;
  tax?: string;
}

/** A block entry in a preset — the `textHTML` goes into `main.textHTML`. */
interface PresetBlock {
  type: "intro" | "content" | "items" | "fees" | "signature" | "image" | "video" | "html" | "canvas";
  textHTML?: string;
}

interface Preset {
  slug: string;
  displayName: string;
  description: string;
  defaultCurrency: string;
  billableItems: PresetBillableItem[];
  blocks: PresetBlock[];
}

// ─── Preset loading ─────────────────────────────────────────────────────────

const PRESETS_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "presets",
  "proposals",
);

function loadPresets(): Preset[] {
  try {
    const files = readdirSync(PRESETS_DIR).filter((f) => f.endsWith(".json"));
    return files.map((f) => JSON.parse(readFileSync(path.join(PRESETS_DIR, f), "utf8")) as Preset);
  } catch {
    return [];
  }
}

// ─── plutio_list_proposal_presets ───────────────────────────────────────────

export function createListProposalPresetsTool(): ToolDefinition {
  return {
    name: "plutio_list_proposal_presets",
    description:
      "List proposal presets shipped with this server. Each preset is a reusable scaffold — line items, pricing, and block content — that plutio_proposal_from_preset will instantiate as a real Plutio proposal. Call this first to discover what's available.",
    inputSchema: z.object({}),
    handler: async () => {
      const presets = loadPresets();
      return {
        count: presets.length,
        presets: presets.map((p) => ({
          slug: p.slug,
          displayName: p.displayName,
          description: p.description,
          defaultCurrency: p.defaultCurrency,
          lineItems: p.billableItems.length,
          blocks: p.blocks.length,
          estimatedTotal: p.billableItems.reduce((sum, i) => sum + i.amount * i.quantity, 0),
        })),
      };
    },
  };
}

// ─── plutio_proposal_from_preset ────────────────────────────────────────────

export function createProposalFromPresetTool(client: PlutioClient): ToolDefinition {
  const schema = z.object({
    preset: z.string().min(1).describe("The preset slug from plutio_list_proposal_presets (e.g. 'web-design', 'seo-services')."),
    clientId: z.string().min(1).optional().describe("Plutio person _id to attach as the proposal's client. Optional — proposal can be created without a client and assigned later."),
    name: z.string().min(1).optional().describe("Proposal name/title. Defaults to '{preset.displayName} — {client name or Prospect}'."),
    currency: z.string().optional().describe("Override the preset's default currency (e.g. 'EUR', 'GBP')."),
    overrides: z
      .object({
        billableItems: z
          .array(
            z.object({
              title: z.string().optional(),
              descriptionHTML: z.string().optional(),
              quantity: z.number().optional(),
              amount: z.number().optional(),
              tax: z.string().optional(),
            }),
          )
          .optional()
          .describe("Replace or extend the preset's billable items. Pass a full list to replace; use plutio_proposal_from_preset -> update flow to tweak after."),
        blocks: z
          .array(
            z.object({
              type: z.enum(["intro", "content", "items", "fees", "signature", "image", "video", "html", "canvas"]),
              textHTML: z.string().optional(),
            }),
          )
          .optional()
          .describe("Replace the preset's block list (not merge). Use plutio_analyze_proposal first to borrow structure from a past proposal."),
      })
      .optional(),
  });

  return {
    name: "plutio_proposal_from_preset",
    description:
      "Create a fully-populated proposal in Plutio from a preset scaffold. Handles the multi-step flow transparently: POST the proposal, then POST each custom block linked to it, then reorder. Returns the created proposal with its block ids. Requires writes (PLUTIO_READ_ONLY=false).",
    inputSchema: schema,
    handler: async (rawArgs) => {
      const args = schema.parse(rawArgs);
      const presets = loadPresets();
      const preset = presets.find((p) => p.slug === args.preset);
      if (!preset) {
        throw new Error(
          `Unknown preset "${args.preset}". Available: ${presets.map((p) => p.slug).join(", ")}`,
        );
      }

      const currency = args.currency ?? preset.defaultCurrency;
      const billableItems = args.overrides?.billableItems
        ? (args.overrides.billableItems as PresetBillableItem[])
        : preset.billableItems;

      // Resolve client name for the default title (optional)
      let clientPayload: { _id: string; entityType: "person" } | undefined;
      let clientName: string | undefined;
      if (args.clientId) {
        clientPayload = { _id: args.clientId, entityType: "person" };
        try {
          const person = await client.get<{ name?: { first?: string; last?: string } }>(
            "people",
            args.clientId,
          );
          clientName = [person.name?.first, person.name?.last].filter(Boolean).join(" ");
        } catch {
          // ignore — we can still create without a resolved name
        }
      }

      const name =
        args.name ?? `${preset.displayName} — ${clientName ?? "Prospect"}`;

      // Step 1 — create the proposal with items (Plutio auto-adds 3 default blocks)
      const created = await client.create<{ _id: string; blocks: string[] }>("proposals", {
        name,
        currency,
        client: clientPayload,
        billableItems,
      });

      // Step 2 — delete Plutio's auto-generated blocks so our preset blocks are the only ones
      for (const autoBlockId of created.blocks ?? []) {
        try {
          await client.request({ method: "DELETE", path: `blocks/bulk`, body: { _ids: [autoBlockId] } });
        } catch {
          // Some default blocks aren't deletable; that's fine — they'll be replaced in the blocks array below.
        }
      }

      // Step 3 — create each preset block, in order, pinned to this proposal.
      // Plutio's schema differs by block type:
      //   intro              → textHTML wrapped in `main: { textHTML, hasText: true }`
      //   content            → textHTML at the top level
      //   items/fees/signature → bare — no content field, these are structural
      //   html/image/video/canvas → specialized payloads (not yet handled)
      const blockList = args.overrides?.blocks ?? preset.blocks;
      const createdBlockIds: string[] = [];
      const skippedTypes: string[] = [];
      for (const block of blockList) {
        const body: Record<string, unknown> = {
          entityType: "proposal",
          entityId: created._id,
          type: block.type,
        };
        if (block.textHTML) {
          if (block.type === "intro") {
            body.main = { textHTML: block.textHTML, hasText: true };
          } else if (block.type === "content") {
            body.textHTML = block.textHTML;
          }
          // For items/fees/signature, textHTML is ignored — those are structural blocks
        }
        try {
          const b = await client.create<{ _id: string }>("blocks", body);
          if (b?._id) createdBlockIds.push(b._id);
        } catch (err) {
          skippedTypes.push(block.type);
          // Continue on individual-block errors — partial proposal beats no proposal
          process.stderr.write(
            `[plutio_proposal_from_preset] block create failed for type=${block.type}: ${err instanceof Error ? err.message : String(err)}\n`,
          );
        }
      }

      // Step 4 — reorder the proposal's blocks array to match the preset order
      if (createdBlockIds.length > 0) {
        try {
          await client.update("proposals", created._id, { blocks: createdBlockIds });
        } catch {
          // If reorder fails, the blocks still exist — user can reorder manually in Plutio UI
        }
      }

      return {
        ok: true,
        proposal: {
          _id: created._id,
          name,
          currency,
          presetUsed: preset.slug,
          clientId: args.clientId,
          billableItemCount: billableItems.length,
          blockCount: createdBlockIds.length,
          blockIds: createdBlockIds,
          skippedBlockTypes: skippedTypes,
        },
        plutioLink: `(open your workspace → Proposals to view and send)`,
        nextSteps: [
          "Review the proposal in the Plutio web UI (REST API doesn't expose send/publish actions)",
          "Adjust line-item pricing if needed via plutio_invoice_subscriptions or plutio_request",
          "Send the proposal to the client from Plutio's UI",
        ],
      };
    },
  };
}

// ─── plutio_analyze_proposal ────────────────────────────────────────────────

export function createAnalyzeProposalTool(client: PlutioClient): ToolDefinition {
  const schema = z.object({
    proposalId: z.string().min(1).optional().describe("A specific proposal _id to analyze."),
    name: z.string().optional().describe("Match by proposal name (first match wins). Useful for past-template-named proposals."),
    includeBlockContent: z.boolean().default(false).describe("Include the main.textHTML / main.textPlain of each block in the result. Default false — just types + length summary."),
  }).refine((d) => d.proposalId || d.name, { message: "Provide proposalId or name." });

  return {
    name: "plutio_analyze_proposal",
    description:
      "Inspect an existing proposal's structure: block types, order, line-item count, pricing tiers, total amount, and optional block-content sample. Useful before creating a similar one — borrow structure from a past proposal that worked well, then pass it as `overrides` to plutio_proposal_from_preset.",
    inputSchema: schema,
    handler: async (rawArgs) => {
      const args = schema.parse(rawArgs);

      let proposal: Record<string, unknown> | null = null;
      if (args.proposalId) {
        const list = await client.list<Array<Record<string, unknown>>>("proposals", {
          q: { _id: args.proposalId },
          limit: 1,
        });
        proposal = Array.isArray(list) && list[0] ? list[0] : null;
      } else if (args.name) {
        const list = await client.list<Array<Record<string, unknown>>>("proposals", {
          q: { name: args.name },
          limit: 1,
        });
        proposal = Array.isArray(list) && list[0] ? list[0] : null;
      }

      if (!proposal) return { found: false, note: "No matching proposal found." };

      const proposalId = proposal._id as string;

      const blocks = await client.list<Array<Record<string, unknown>>>("blocks", {
        q: { entityType: "proposal", entityId: proposalId },
        limit: 100,
      });
      const blockList = Array.isArray(blocks) ? blocks : [];

      const billableItems = (proposal.billableItems as Array<{ title?: string; amount?: number; quantity?: number; tax?: string }>) ?? [];

      const blockTypes: Record<string, number> = {};
      const blockDetails = blockList.map((b) => {
        const t = (b.type as string) ?? "?";
        blockTypes[t] = (blockTypes[t] ?? 0) + 1;
        const main = (b.main as { textHTML?: string; textPlain?: string } | undefined) ?? {};
        const entry: Record<string, unknown> = {
          id: b._id,
          type: t,
          textHTMLLength: main.textHTML?.length ?? 0,
          textPlainPreview: main.textPlain ? (main.textPlain as string).slice(0, 120) : undefined,
        };
        if (args.includeBlockContent) {
          entry.textHTML = main.textHTML;
          entry.textPlain = main.textPlain;
        }
        return entry;
      });

      return {
        found: true,
        proposal: {
          id: proposalId,
          name: proposal.name,
          status: proposal.status,
          currency: proposal.currency,
          amount: proposal.amount,
          subTotal: proposal.subTotal,
          clientId: (proposal.client as { _id?: string } | undefined)?._id,
          createdAt: proposal.createdAt,
        },
        structure: {
          blockOrder: blockList.map((b) => b.type),
          blockTypes,
          blockCount: blockList.length,
          billableItemCount: billableItems.length,
          billableItemTitles: billableItems.map((i) => i.title).filter(Boolean),
          pricingSpread: {
            min: billableItems.reduce(
              (m, i) => Math.min(m, i.amount ?? Infinity),
              Infinity,
            ),
            max: billableItems.reduce((m, i) => Math.max(m, i.amount ?? 0), 0),
            total: billableItems.reduce(
              (sum, i) => sum + (i.amount ?? 0) * (i.quantity ?? 1),
              0,
            ),
          },
        },
        blocks: blockDetails,
        hint:
          "Pass this proposal's block types as the `overrides.blocks` shape to plutio_proposal_from_preset to mirror the same structure with fresh content for a different client.",
      };
    },
  };
}
