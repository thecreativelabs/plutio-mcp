import { PlutioAuthError } from "./errors.js";

interface TokenResponse {
  accessToken?: string;
  access_token?: string;
  accessTokenExpiresAt?: string | number;
  expires_in?: number;
  tokenType?: string;
  token_type?: string;
  client?: {
    id?: string;
    userId?: string;
    businesses?: string[];
    grants?: string[];
  };
}

export interface TokenState {
  token: string;
  expiresAt: number;
  businesses: string[];
}

export class OAuthTokenManager {
  private state: TokenState | null = null;
  private inflight: Promise<TokenState> | null = null;
  private readonly safetyWindowMs = 60_000;

  constructor(
    private readonly oauthUrl: string,
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  async getToken(): Promise<string> {
    const state = await this.getState();
    return state.token;
  }

  async getState(): Promise<TokenState> {
    if (this.state && this.state.expiresAt - Date.now() > this.safetyWindowMs) {
      return this.state;
    }
    if (!this.inflight) {
      this.inflight = this.refresh().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  private async refresh(): Promise<TokenState> {
    // Plutio's OAuth endpoint requires form-encoded bodies (JSON returns 400 invalid_request).
    const form = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "client_credentials",
    }).toString();

    const res = await fetch(this.oauthUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });

    const text = await res.text();
    let parsed: TokenResponse | string;
    try {
      parsed = text ? (JSON.parse(text) as TokenResponse) : text;
    } catch {
      parsed = text;
    }

    if (!res.ok || typeof parsed !== "object") {
      throw new PlutioAuthError(
        `Failed to obtain Plutio access token (HTTP ${res.status})`,
        parsed,
      );
    }

    const token = parsed.accessToken ?? parsed.access_token;
    if (!token) {
      throw new PlutioAuthError("Plutio token response missing access token", parsed);
    }

    let expiresAt: number;
    if (parsed.accessTokenExpiresAt) {
      const ts =
        typeof parsed.accessTokenExpiresAt === "number"
          ? parsed.accessTokenExpiresAt
          : new Date(parsed.accessTokenExpiresAt).getTime();
      expiresAt = Number.isFinite(ts) ? ts : Date.now() + 3600_000;
    } else if (typeof parsed.expires_in === "number") {
      expiresAt = Date.now() + parsed.expires_in * 1000;
    } else {
      expiresAt = Date.now() + 3600_000;
    }

    const businesses = Array.isArray(parsed.client?.businesses) ? parsed.client!.businesses : [];

    this.state = { token, expiresAt, businesses };
    return this.state;
  }

  invalidate(): void {
    this.state = null;
  }
}
