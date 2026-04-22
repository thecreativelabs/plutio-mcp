import { OAuthTokenManager } from "./auth.js";
import type { Config } from "./config.js";
import { PlutioRateLimitError, mapHttpError } from "./errors.js";
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
    const token = await this.auth.getToken();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
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

  update<T = unknown>(path: string, id: string, body: unknown): Promise<T> {
    return this.request<T>({ method: "PUT", path: `${path}/${encodeURIComponent(id)}`, body });
  }

  delete<T = unknown>(path: string, id: string): Promise<T> {
    return this.request<T>({ method: "DELETE", path: `${path}/${encodeURIComponent(id)}` });
  }

  bulkUpdate<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>({ method: "PUT", path: `${path}/bulk`, body });
  }

  bulkDelete<T = unknown>(path: string, ids: string[]): Promise<T> {
    return this.request<T>({
      method: "DELETE",
      path: `${path}/bulk`,
      body: { _ids: ids },
    });
  }

  archive<T = unknown>(path: string, id: string): Promise<T> {
    return this.request<T>({ method: "POST", path: `${path}/archive`, body: { _id: id } });
  }

  bulkArchive<T = unknown>(path: string, ids: string[]): Promise<T> {
    return this.request<T>({ method: "POST", path: `${path}/bulk/archive`, body: { _ids: ids } });
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
