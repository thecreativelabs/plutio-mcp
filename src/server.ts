import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { PlutioClient } from "./client.js";
import type { Config } from "./config.js";
import { PlutioError } from "./errors.js";
import { Logger } from "./logger.js";
import { registerResources } from "./resources.js";
import { buildTools } from "./tools/index.js";
import type { ToolDefinition } from "./tools/factory.js";

const SERVER_NAME = "plutio-mcp";
const SERVER_VERSION = "0.9.0";

/**
 * Pre-built handlers shared across `Server` instances.
 *
 * The MCP SDK's `Server` is bound 1:1 to a single `Transport` and refuses to
 * connect to a second one. For HTTP mode, each incoming request needs its own
 * `Server`+`Transport` pair to support concurrency. We build the heavy stuff
 * (tools, client, resource handlers) once and then attach them to a fresh
 * `Server` shell per request via `attachHandlers()`. Stdio mode uses
 * `createServer()` and gets a single long-lived instance.
 */
export interface ServerHandlers {
  client: PlutioClient;
  tools: ToolDefinition[];
  toolIndex: Map<string, ToolDefinition>;
  logger: Logger;
}

export function buildHandlers(config: Config): ServerHandlers {
  const logger = new Logger(config.logLevel);
  const client = new PlutioClient(config);
  const tools = buildTools(client, { readOnly: config.readOnly });
  const toolIndex = new Map<string, ToolDefinition>(tools.map((t) => [t.name, t]));

  logger.info(
    `loaded ${tools.length} tools (readOnly=${config.readOnly}, rateLimit=${config.maxRequestsPerHour}/hr)`,
  );

  return { client, tools, toolIndex, logger };
}

export function newMcpServer(handlers: ServerHandlers): Server {
  const { client, tools, toolIndex, logger } = handlers;

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {}, resources: {} } },
  );

  registerResources(server, client);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: toInputSchema(tool.inputSchema),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = toolIndex.get(name);
    if (!tool) {
      return errorResponse(`Unknown tool: ${name}`);
    }

    try {
      logger.debug(`→ ${name}`, args);
      const result = await tool.handler(args ?? {});
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      logger.warn(
        `✗ ${name} failed`,
        err instanceof Error ? err.message : String(err),
      );
      if (err instanceof PlutioError) {
        return err.toToolResponse();
      }
      if (err instanceof z.ZodError) {
        return errorResponse(`Invalid arguments: ${formatZodError(err)}`);
      }
      return errorResponse(err instanceof Error ? err.message : String(err));
    }
  });

  return server;
}

/**
 * Stdio entry: builds handlers and a single long-lived Server.
 * HTTP entry uses `buildHandlers()` + `newMcpServer()` per request.
 */
export function createServer(config: Config): { server: Server; logger: Logger } {
  const handlers = buildHandlers(config);
  return { server: newMcpServer(handlers), logger: handlers.logger };
}

function toInputSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  // MCP expects top-level { type: "object" }. Discriminated unions serialize as anyOf — wrap them.
  if (json.type !== "object") {
    return {
      type: "object",
      ...json,
    };
  }
  return json;
}

function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

function errorResponse(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}
