import { describe, expect, it } from "vitest";
import { z } from "zod";
import { loadConfig } from "../config.js";

describe("loadConfig", () => {
  it("loads required credentials", () => {
    const cfg = loadConfig({
      PLUTIO_CLIENT_ID: "id",
      PLUTIO_CLIENT_SECRET: "secret",
    } as NodeJS.ProcessEnv);
    expect(cfg.clientId).toBe("id");
    expect(cfg.clientSecret).toBe("secret");
  });

  it("defaults readOnly to true", () => {
    const cfg = loadConfig({
      PLUTIO_CLIENT_ID: "id",
      PLUTIO_CLIENT_SECRET: "secret",
    } as NodeJS.ProcessEnv);
    expect(cfg.readOnly).toBe(true);
  });

  it("parses readOnly=false", () => {
    const cfg = loadConfig({
      PLUTIO_CLIENT_ID: "id",
      PLUTIO_CLIENT_SECRET: "secret",
      PLUTIO_READ_ONLY: "false",
    } as NodeJS.ProcessEnv);
    expect(cfg.readOnly).toBe(false);
  });

  it.each(["1", "true", "YES", "on", "True"])("treats %s as true for readOnly", (value) => {
    const cfg = loadConfig({
      PLUTIO_CLIENT_ID: "id",
      PLUTIO_CLIENT_SECRET: "secret",
      PLUTIO_READ_ONLY: value,
    } as NodeJS.ProcessEnv);
    expect(cfg.readOnly).toBe(true);
  });

  it("uses the default Plutio API base", () => {
    const cfg = loadConfig({
      PLUTIO_CLIENT_ID: "id",
      PLUTIO_CLIENT_SECRET: "secret",
    } as NodeJS.ProcessEnv);
    expect(cfg.apiBase).toBe("https://api.plutio.com/v1.11");
    expect(cfg.oauthUrl).toBe("https://api.plutio.com/v1.11/oauth/token");
  });

  it("honors PLUTIO_API_BASE override", () => {
    const cfg = loadConfig({
      PLUTIO_CLIENT_ID: "id",
      PLUTIO_CLIENT_SECRET: "secret",
      PLUTIO_API_BASE: "https://custom.example.com/v2",
    } as NodeJS.ProcessEnv);
    expect(cfg.apiBase).toBe("https://custom.example.com/v2");
    expect(cfg.oauthUrl).toBe("https://custom.example.com/v2/oauth/token");
  });

  it("honors PLUTIO_OAUTH_URL override independently", () => {
    const cfg = loadConfig({
      PLUTIO_CLIENT_ID: "id",
      PLUTIO_CLIENT_SECRET: "secret",
      PLUTIO_OAUTH_URL: "https://auth.example.com/token",
    } as NodeJS.ProcessEnv);
    expect(cfg.oauthUrl).toBe("https://auth.example.com/token");
  });

  it("parses numeric rate limit", () => {
    const cfg = loadConfig({
      PLUTIO_CLIENT_ID: "id",
      PLUTIO_CLIENT_SECRET: "secret",
      PLUTIO_MAX_REQUESTS_PER_HOUR: "5000",
    } as NodeJS.ProcessEnv);
    expect(cfg.maxRequestsPerHour).toBe(5000);
  });

  it("rejects missing client id", () => {
    expect(() =>
      loadConfig({
        PLUTIO_CLIENT_SECRET: "secret",
      } as NodeJS.ProcessEnv),
    ).toThrow(z.ZodError);
  });

  it("rejects missing client secret", () => {
    expect(() =>
      loadConfig({
        PLUTIO_CLIENT_ID: "id",
      } as NodeJS.ProcessEnv),
    ).toThrow(z.ZodError);
  });

  it("rejects invalid log level", () => {
    expect(() =>
      loadConfig({
        PLUTIO_CLIENT_ID: "id",
        PLUTIO_CLIENT_SECRET: "secret",
        PLUTIO_LOG_LEVEL: "loud",
      } as NodeJS.ProcessEnv),
    ).toThrow(z.ZodError);
  });
});
