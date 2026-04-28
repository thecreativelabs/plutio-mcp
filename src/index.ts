#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { startHttpServer } from "./http-transport.js";
import { buildHandlers, newMcpServer } from "./server.js";

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof z.ZodError) {
      process.stderr.write(
        `[plutio-mcp] Configuration error:\n${err.issues
          .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
          .join("\n")}\n\nSee .env.example for the full list of variables.\n`,
      );
    } else {
      process.stderr.write(
        `[plutio-mcp] Failed to load configuration: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    process.exit(1);
  }

  const handlers = buildHandlers(config);
  const { logger } = handlers;

  if (config.httpMode) {
    const httpServer = await startHttpServer({
      port: config.httpPort,
      host: config.httpHost,
      authToken: config.authToken,
      handlers,
      logger,
    });
    const shutdown = async (signal: string) => {
      logger.info(`received ${signal}, shutting down HTTP server`);
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      process.exit(0);
    };
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    return;
  }

  // stdio mode: single long-lived McpServer
  const server = newMcpServer(handlers);
  const transport = new StdioServerTransport();

  const shutdown = async (signal: string) => {
    logger.info(`received ${signal}, shutting down`);
    try {
      await server.close();
    } catch (err) {
      logger.warn("error during shutdown", err);
    }
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await server.connect(transport);
  logger.info("plutio-mcp ready on stdio");
}

main().catch((err) => {
  process.stderr.write(`[plutio-mcp] Fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
