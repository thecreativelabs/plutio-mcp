import { z } from "zod";

const ConfigSchema = z.object({
  clientId: z.string().min(1, "PLUTIO_CLIENT_ID is required"),
  clientSecret: z.string().min(1, "PLUTIO_CLIENT_SECRET is required"),
  business: z.string().min(1).optional(),
  apiBase: z.string().url().default("https://api.plutio.com/v1.11"),
  oauthUrl: z.string().url().optional(),
  readOnly: z.boolean().default(true),
  maxRequestsPerHour: z.number().int().positive().default(1000),
  logLevel: z.enum(["error", "warn", "info", "debug"]).default("info"),
  httpMode: z.boolean().default(false),
  httpPort: z.number().int().positive().max(65535).default(8080),
  httpHost: z.string().default("127.0.0.1"),
  authToken: z.string().min(1).optional(),
  userPresetsDir: z.string().min(1).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

function parseBool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const apiBase = env.PLUTIO_API_BASE ?? "https://api.plutio.com/v1.11";
  return ConfigSchema.parse({
    clientId: env.PLUTIO_CLIENT_ID,
    clientSecret: env.PLUTIO_CLIENT_SECRET,
    business: env.PLUTIO_BUSINESS,
    apiBase,
    oauthUrl: env.PLUTIO_OAUTH_URL ?? `${apiBase}/oauth/token`,
    readOnly: parseBool(env.PLUTIO_READ_ONLY, true),
    maxRequestsPerHour: env.PLUTIO_MAX_REQUESTS_PER_HOUR
      ? Number(env.PLUTIO_MAX_REQUESTS_PER_HOUR)
      : 1000,
    logLevel: (env.PLUTIO_LOG_LEVEL as Config["logLevel"]) ?? "info",
    httpMode: parseBool(env.PLUTIO_MCP_HTTP, false),
    httpPort: env.PLUTIO_MCP_HTTP_PORT ? Number(env.PLUTIO_MCP_HTTP_PORT) : 8080,
    httpHost: env.PLUTIO_MCP_HTTP_HOST ?? "127.0.0.1",
    authToken: env.PLUTIO_MCP_AUTH_TOKEN,
    userPresetsDir: env.PLUTIO_USER_PRESETS_DIR,
  });
}
