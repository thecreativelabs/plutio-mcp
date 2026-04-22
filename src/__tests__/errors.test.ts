import { describe, expect, it } from "vitest";
import { PlutioAuthError, PlutioError, PlutioRateLimitError, mapHttpError } from "../errors.js";

describe("mapHttpError", () => {
  it("maps 401 to PlutioAuthError with a helpful hint", () => {
    const err = mapHttpError(401, { message: "invalid_token" });
    expect(err).toBeInstanceOf(PlutioAuthError);
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/PLUTIO_CLIENT_ID/);
  });

  it("maps 403 to PlutioAuthError (forbidden)", () => {
    const err = mapHttpError(403, { message: "forbidden" });
    expect(err).toBeInstanceOf(PlutioAuthError);
    expect(err.status).toBe(403);
  });

  it("maps 429 to PlutioRateLimitError", () => {
    const err = mapHttpError(429, {});
    expect(err).toBeInstanceOf(PlutioRateLimitError);
    expect((err as PlutioRateLimitError).retryAfterMs).toBe(60_000);
  });

  it("extracts nested error message when available", () => {
    const err = mapHttpError(422, { errors: [{ message: "Name is required" }] });
    expect(err).toBeInstanceOf(PlutioError);
    expect(err.message).toBe("Name is required");
    expect(err.status).toBe(422);
  });

  it("falls back to a generic message when body lacks a message", () => {
    const err = mapHttpError(500, { unexpected: true });
    expect(err.message).toMatch(/HTTP 500/);
  });
});

describe("PlutioError.toToolResponse", () => {
  it("produces an MCP-compatible error payload", () => {
    const err = new PlutioError("boom", 500, { id: 1 }, "req-123");
    const res = err.toToolResponse();
    expect(res.isError).toBe(true);
    expect(res.content[0]?.type).toBe("text");
    const parsed = JSON.parse(res.content[0]!.text);
    expect(parsed).toMatchObject({
      error: "PlutioError",
      status: 500,
      message: "boom",
      requestId: "req-123",
    });
  });
});
