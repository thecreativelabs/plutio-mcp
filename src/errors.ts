export class PlutioError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "PlutioError";
  }

  toToolResponse(): { isError: true; content: Array<{ type: "text"; text: string }> } {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: this.name,
              status: this.status,
              message: this.message,
              body: this.body,
              requestId: this.requestId,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
}

export class PlutioAuthError extends PlutioError {
  constructor(message: string, body: unknown, status: number = 401) {
    super(message, status, body);
    this.name = "PlutioAuthError";
  }
}

export class PlutioRateLimitError extends PlutioError {
  constructor(
    public readonly retryAfterMs: number,
    body: unknown,
  ) {
    super(`Plutio rate limit hit — retry after ${Math.ceil(retryAfterMs / 1000)}s`, 429, body);
    this.name = "PlutioRateLimitError";
  }
}

export function mapHttpError(status: number, body: unknown, requestId?: string): PlutioError {
  if (status === 401 || status === 403) {
    return new PlutioAuthError(
      status === 401 ? "Unauthorized — check PLUTIO_CLIENT_ID and PLUTIO_CLIENT_SECRET" : "Forbidden",
      body,
      status,
    );
  }
  if (status === 429) {
    return new PlutioRateLimitError(60_000, body);
  }
  const msg = extractMessage(body) ?? `Plutio API error (HTTP ${status})`;
  return new PlutioError(msg, status, body, requestId);
}

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.message === "string") return b.message;
  if (typeof b.error === "string") return b.error;
  if (b.errors && Array.isArray(b.errors) && b.errors.length > 0) {
    const first = b.errors[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && "message" in first && typeof first.message === "string") {
      return first.message;
    }
  }
  return null;
}
