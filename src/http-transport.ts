import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Logger } from "./logger.js";
import { newMcpServer, type ServerHandlers } from "./server.js";

export interface HttpTransportOptions {
  port: number;
  host: string;
  /** If set, incoming requests must carry `Authorization: Bearer <authToken>`. */
  authToken?: string;
  /** Shared handlers (client, tools, registry). A fresh McpServer is built per request. */
  handlers: ServerHandlers;
  logger: Logger;
}

/**
 * Starts an HTTP server that speaks MCP's Streamable HTTP transport at `/mcp`
 * and advertises a `/sse` alias for clients (notably ChatGPT) that still expect
 * the older SSE endpoint name. Plus `/health` for tunnel-health checks.
 *
 * Stateless mode: every request creates a new transport. Suitable for most uses
 * including ChatGPT, which issues fresh JSON-RPC calls per prompt.
 */
export async function startHttpServer(opts: HttpTransportOptions): Promise<http.Server> {
  const { port, host, authToken, handlers, logger } = opts;

  // Per-request McpServer + Transport pair (stateless). The MCP SDK's Server
  // is bound 1:1 to a Transport, so concurrent requests need fully isolated
  // pairs. We pre-build the heavy `handlers` (tools, Plutio client, resource
  // bindings) once and assemble a fresh Server shell per request — that's
  // cheap (just attaching request handlers).

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${host}:${port}`}`);

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", server: "plutio-mcp" }));
      return;
    }

    // All non-health routes require auth if a token is configured
    if (authToken) {
      const header = req.headers.authorization ?? "";
      const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (provided !== authToken) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
      }
    }

    if (url.pathname !== "/mcp" && url.pathname !== "/sse" && url.pathname !== "/messages") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found", knownPaths: ["/mcp", "/sse", "/health"] }));
      return;
    }

    let body: unknown;
    if (req.method === "POST") {
      try {
        body = await readJsonBody(req);
      } catch (err) {
        logger.warn("failed to parse request body", err instanceof Error ? err.message : String(err));
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
        return;
      }
    }

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    transport.onerror = (error) =>
      logger.warn("transport error", error instanceof Error ? error.message : String(error));

    const mcpServer = newMcpServer(handlers);

    let closed = false;
    const cleanup = async () => {
      if (closed) return;
      closed = true;
      try {
        await mcpServer.close();
      } catch {
        // ignore — server may already be closed
      }
      try {
        await transport.close();
      } catch {
        // ignore
      }
    };
    res.on("close", () => void cleanup());

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      logger.error(
        "transport handleRequest failed",
        err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
      );
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal error" }));
      }
    } finally {
      await cleanup();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  logger.info(`plutio-mcp HTTP listening on http://${host}:${port}`);
  logger.info(`  POST http://${host}:${port}/mcp     — MCP Streamable HTTP`);
  logger.info(`  GET  http://${host}:${port}/sse     — MCP SSE alias (for ChatGPT)`);
  logger.info(`  GET  http://${host}:${port}/health  — health check`);
  if (authToken) logger.info("  auth: Bearer token required");

  return server;
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  return JSON.parse(raw);
}
