import type { Config } from "./config.js";

type Level = "error" | "warn" | "info" | "debug";
const ORDER: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export class Logger {
  private readonly threshold: number;

  constructor(level: Config["logLevel"]) {
    this.threshold = ORDER[level];
  }

  private log(level: Level, msg: string, data?: unknown): void {
    if (ORDER[level] > this.threshold) return;
    const line = data !== undefined ? `${msg} ${safeStringify(data)}` : msg;
    // MCP stdio transport uses stdout — logs MUST go to stderr.
    process.stderr.write(`[plutio-mcp] [${level}] ${line}\n`);
  }

  error(msg: string, data?: unknown): void {
    this.log("error", msg, data);
  }
  warn(msg: string, data?: unknown): void {
    this.log("warn", msg, data);
  }
  info(msg: string, data?: unknown): void {
    this.log("info", msg, data);
  }
  debug(msg: string, data?: unknown): void {
    this.log("debug", msg, data);
  }
}

function safeStringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}
