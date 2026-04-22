import { OAuthTokenManager } from "./auth.js";
import type { Config } from "./config.js";
import { PlutioAuthError, PlutioRateLimitError, mapHttpError } from "./errors.js";
import { RateLimiter } from "./rate-limiter.js";

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
}

export class PlutioClient {
  private readonly auth: OAuthTokenManager;
  private readonly limiter: RateLimiter;

  constructor(private readonly config: Config) {
    this.auth = new OAuthTokenManager(
      config.oauthUrl ?? `${config.apiBase}/oauth/token`,
      config.clientId,
      config.clientSecret,
    );
    this.limiter = new RateLimiter(config.maxRequestsPerHour);
  }

  async request<T = unknown>(opts: RequestOptions): Promise<T> {
    await this.limiter.acquire();

    const url = this.buildUrl(opts.path, opts.query);
    const state = await this.auth.getState();
    const business = this.resolveBusiness(state.businesses);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${state.token}`,
      Business: business,
      Accept: "application/json",
      ...(opts.headers ?? {}),
    };

    const hasBody = opts.body !== undefined && opts.method !== "GET";
    if (hasBody) headers["Content-Type"] = "application/json";

    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers,
      body: hasBody ? JSON.stringify(opts.body) : undefined,
    });

    const text = await res.text();
    let body: unknown = text;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (res.status === 401) {
      this.auth.invalidate();
    }

    if (!res.ok) {
      const err = mapHttpError(res.status, body, res.headers.get("x-request-id") ?? undefined);
      if (err instanceof PlutioRateLimitError) {
        const retryAfter = Number(res.headers.get("retry-after"));
        if (Number.isFinite(retryAfter) && retryAfter > 0) {
          (err as { retryAfterMs: number }).retryAfterMs = retryAfter * 1000;
        }
      }
      throw err;
    }

    return body as T;
  }

  private resolveBusiness(fromToken: string[]): string {
    if (this.config.business) return this.config.business;
    if (fromToken.length === 1) return fromToken[0]!;
    if (fromToken.length === 0) {
      throw new PlutioAuthError(
        "No business associated with this OAuth client. Set PLUTIO_BUSINESS explicitly.",
        { businessesFromToken: fromToken },
      );
    }
    throw new PlutioAuthError(
      `OAuth client is enabled for multiple businesses (${fromToken.join(", ")}). Set PLUTIO_BUSINESS to pick one.`,
      { businessesFromToken: fromToken },
    );
  }

  private buildUrl(path: string, query?: Record<string, unknown>): string {
    const base = this.config.apiBase.replace(/\/$/, "");
    const cleaned = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(base + cleaned);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        if (typeof value === "object") {
          url.searchParams.set(key, JSON.stringify(value));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  list<T = unknown>(path: string, query?: Record<string, unknown>): Promise<T> {
    return this.request<T>({ method: "GET", path, query });
  }

  get<T = unknown>(path: string, id: string): Promise<T> {
    return this.request<T>({ method: "GET", path: `${path}/${encodeURIComponent(id)}` });
  }

  create<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>({ method: "POST", path, body });
  }

  // Plutio's API only supports mutations via /bulk endpoints — even for a single
  // record. PUT /{resource}/{id} universally returns 403 "Method not allowed".
  // These single-record helpers transparently route through the bulk API.
  update<T = unknown>(path: string, id: string, body: Record<string, unknown>): Promise<T> {
    return this.bulkUpdate<T>(path, { _ids: [id], ...body });
  }

  delete<T = unknown>(path: string, id: string): Promise<T> {
    return this.bulkDelete<T>(path, [id]);
  }

  archive<T = unknown>(path: string, id: string): Promise<T> {
    return this.bulkArchive<T>(path, [id], true);
  }

  unarchive<T = unknown>(path: string, id: string): Promise<T> {
    return this.bulkArchive<T>(path, [id], false);
  }

  bulkUpdate<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
    return this.request<T>({ method: "PUT", path: `${path}/bulk`, body });
  }

  bulkDelete<T = unknown>(path: string, ids: string[]): Promise<T> {
    return this.request<T>({
      method: "DELETE",
      path: `${path}/bulk`,
      body: { _ids: ids },
    });
  }

  bulkArchive<T = unknown>(path: string, ids: string[], isArchived = true): Promise<T> {
    return this.request<T>({
      method: "POST",
      path: `${path}/bulk/archive`,
      body: { _ids: ids, isArchived },
    });
  }

  getRateLimitStatus(): { available: number; capacity: number } {
    return {
      available: this.limiter.available(),
      capacity: this.config.maxRequestsPerHour,
    };
  }

  // Expose for specialized tools that need raw error handling
  get rateLimiter(): RateLimiter {
    return this.limiter;
  }
}

export { PlutioError } from "./errors.js";
