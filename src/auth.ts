import { PlutioAuthError } from "./errors.js";

interface TokenResponse {
  accessToken?: string;
  access_token?: string;
  accessTokenExpiresAt?: string | number;
  expires_in?: number;
  tokenType?: string;
  token_type?: string;
}

export interface TokenState {
  token: string;
  expiresAt: number;
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
    if (this.state && this.state.expiresAt - Date.now() > this.safetyWindowMs) {
      return this.state.token;
    }
    if (!this.inflight) {
      this.inflight = this.refresh().finally(() => {
        this.inflight = null;
      });
    }
    const state = await this.inflight;
    return state.token;
  }

  private async refresh(): Promise<TokenState> {
    const res = await fetch(this.oauthUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: "client_credentials",
      }),
    });

    const text = await res.text();
    let body: TokenResponse | string;
    try {
      body = text ? (JSON.parse(text) as TokenResponse) : text;
    } catch {
      body = text;
    }

    if (!res.ok || typeof body !== "object") {
      throw new PlutioAuthError(
        `Failed to obtain Plutio access token (HTTP ${res.status})`,
        body,
      );
    }

    const token = body.accessToken ?? body.access_token;
    if (!token) {
      throw new PlutioAuthError("Plutio token response missing access token", body);
    }

    let expiresAt: number;
    if (body.accessTokenExpiresAt) {
      const parsed =
        typeof body.accessTokenExpiresAt === "number"
          ? body.accessTokenExpiresAt
          : new Date(body.accessTokenExpiresAt).getTime();
      expiresAt = Number.isFinite(parsed) ? parsed : Date.now() + 3600_000;
    } else if (typeof body.expires_in === "number") {
      expiresAt = Date.now() + body.expires_in * 1000;
    } else {
      expiresAt = Date.now() + 3600_000;
    }

    this.state = { token, expiresAt };
    return this.state;
  }

  invalidate(): void {
    this.state = null;
  }
}
