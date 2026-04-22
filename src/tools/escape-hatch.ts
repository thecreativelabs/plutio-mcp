import { z } from "zod";
import type { PlutioClient } from "../client.js";
import type { ToolDefinition } from "./factory.js";
import { RESOURCES } from "./registry.js";

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
