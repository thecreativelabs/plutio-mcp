import { z } from "zod";
import type { PlutioClient } from "../client.js";
import type { ToolDefinition } from "./factory.js";
import { RESOURCES } from "./registry.js";

interface CustomFieldRecord {
  _id: string;
  entityType: string;
  inputType: string;
  title: string;
  options?: Array<{ _id: string; name?: string; title?: string }>;
  allowCreate?: boolean;
  min?: number;
  max?: number;
  isAddedByDefault?: boolean;
}

export function createRequestTool(client: PlutioClient, writeable: boolean): ToolDefinition {
  const methods = writeable
    ? (["GET", "POST", "PUT", "DELETE", "PATCH"] as const)
    : (["GET"] as const);

  const schema = z.object({
    method: z
      .enum(methods)
      .describe(
        writeable
          ? "HTTP method. Use sparingly — prefer resource-specific tools when available."
          : "HTTP method. Server is in read-only mode so only GET is allowed.",
      ),
    path: z
      .string()
      .min(1)
      .describe(
        "API path relative to the base URL. Must start with '/' or a resource name. Example: '/people' or 'people/abc123'. Do NOT include the hostname.",
      ),
    query: z.record(z.string(), z.unknown()).optional().describe("Query string parameters."),
    body: z.unknown().optional().describe("JSON body for POST/PUT/PATCH requests."),
  });

  return {
    name: "plutio_request",
    description: [
      "Escape hatch — call any Plutio API endpoint directly.",
      "Use this when the resource-specific tools don't cover what you need (e.g. specialized endpoints, new API additions, or custom integrations).",
      writeable
        ? "All HTTP methods enabled."
        : "Read-only mode — only GET allowed. Set PLUTIO_READ_ONLY=false to enable writes.",
    ].join(" "),
    inputSchema: schema,
    handler: async (rawArgs) => {
      const args = schema.parse(rawArgs);
      return client.request({
        method: args.method,
        path: args.path,
        query: args.query,
        body: args.body,
      });
    },
  };
}

export function createApiReferenceTool(): ToolDefinition {
  const schema = z.object({
    category: z
      .string()
      .optional()
      .describe(
        "Optional category filter (e.g. 'crm', 'financial', 'project-management'). Leave empty for the full reference.",
      ),
  });

  return {
    name: "plutio_api_reference",
    description:
      "Return a compact, machine-readable reference of every Plutio resource this server exposes — name, API path, category, supported actions. Call this first when you're unsure which tool to use.",
    inputSchema: schema,
    handler: async (rawArgs) => {
      const { category } = schema.parse(rawArgs);
      const items = RESOURCES.filter((r) => !category || r.category === category).map((r) => ({
        tool: `plutio_${r.name}`,
        category: r.category,
        apiPath: `/${r.path}`,
        description: r.description,
        supportsArchive: Boolean(r.archive),
        supportsBulk: r.bulk !== false,
        designatedReadOnly: Boolean(r.readOnly),
      }));
      return {
        baseUrl: "https://api.plutio.com/v1.11",
        authentication: "OAuth2 bearer token (client_credentials grant)",
        rateLimit: "1000 requests/hour per client_id",
        filteringSyntax:
          "Pass filter objects via the `query` field of a list action — supports equality, $regex, $or, $and, $gte, $lte, $in.",
        customFields:
          "Most resources accept a `customFields` array in create/update payloads: [{ _id: <field_id>, value: <value> }].",
        resources: items,
      };
    },
  };
}

export function createRateLimitTool(client: PlutioClient): ToolDefinition {
  return {
    name: "plutio_rate_limit_status",
    description:
      "Report how many Plutio API requests this server can still make in the current hour. Useful for pacing bulk operations.",
    inputSchema: z.object({}),
    handler: async () => client.getRateLimitStatus(),
  };
}

export function createWorkspaceSchemaTool(client: PlutioClient): ToolDefinition {
  // 5-minute cache so repeat calls in a conversation are cheap.
  let cache: {
    fetchedAt: number;
    fields: CustomFieldRecord[];
  } | null = null;
  const ttlMs = 5 * 60 * 1000;

  const schema = z.object({
    entity: z
      .string()
      .optional()
      .describe(
        "Filter to one entity type (e.g. 'person', 'proposal', 'invoice', 'project'). Omit for all entities.",
      ),
    refresh: z
      .boolean()
      .optional()
      .describe("Bypass the 5-minute cache and fetch fresh from Plutio."),
    includeRaw: z
      .boolean()
      .optional()
      .describe("Include the full raw field definitions (default: compact view)."),
  });

  return {
    name: "plutio_workspace_schema",
    description:
      "Introspect this Plutio workspace's custom fields. Returns a compact per-entity map of every custom field's _id, inputType, and (for select fields) option titles → ids. Call this BEFORE creating/updating records that involve custom fields so you can build the correct `customFields: [{_id, value}]` payload. Cached for 5 minutes.",
    inputSchema: schema,
    handler: async (rawArgs) => {
      const { entity, refresh, includeRaw } = schema.parse(rawArgs);

      if (!cache || refresh || Date.now() - cache.fetchedAt > ttlMs) {
        const fields = await client.list<CustomFieldRecord[]>("custom-fields", { limit: 500 });
        cache = {
          fetchedAt: Date.now(),
          fields: Array.isArray(fields) ? fields : [],
        };
      }

      const filtered = entity
        ? cache.fields.filter((f) => f.entityType === entity)
        : cache.fields;

      const byEntity: Record<string, Record<string, unknown>> = {};
      for (const f of filtered) {
        const e = f.entityType || "(unknown)";
        byEntity[e] ??= {};
        const compact: Record<string, unknown> = {
          _id: f._id,
          inputType: f.inputType,
        };
        if (f.options && f.options.length > 0) {
          compact.options = Object.fromEntries(
            f.options.map((o) => [o.name ?? o.title ?? o._id, o._id]),
          );
        }
        if (f.min !== undefined) compact.min = f.min;
        if (f.max !== undefined) compact.max = f.max;
        if (f.isAddedByDefault) compact.isAddedByDefault = true;
        byEntity[e][f.title] = includeRaw ? f : compact;
      }

      return {
        entities: byEntity,
        totalFields: filtered.length,
        cacheAgeMs: Date.now() - cache.fetchedAt,
        usage:
          "To set a custom field on a create/update: include `customFields: [{_id: <field_id>, value: <value>}]` in the record data. For select fields, `value` must be one of the option _ids from this map.",
      };
    },
  };
}
