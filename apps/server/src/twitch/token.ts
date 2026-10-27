import { readFile, rm } from 'node:fs/promises';
import type { Logger } from '../log.js';
import { JsonStore } from '../store.js';

const ID_BASE = 'https://id.twitch.tv/oauth2';

/** Scopes requested at login. Everything stays optional: features degrade if a scope is missing. */
export const TWITCH_SCOPES = [
  'user:read:chat', // chat + subs/gifts/raids via EventSub (Twitch's preferred path over IRC)
  'moderator:read:followers', // follow alerts (EventSub channel.follow v2)
  'channel:read:redemptions', // channel points alerts
  'user:write:chat', // Clippy answers in chat (Helix Send Chat Message)
  'moderator:manage:chat_messages', // delete blocked messages on Twitch too
] as const;

export type StoredToken = {
  clientId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scopes: string[];
  login: string;
  userId: string;
};

export type DeviceFlow = { userCode: string; verificationUri: string; expiresIn: number };

const form = (data: Record<string, string>) => new URLSearchParams(data).toString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * OAuth for a PUBLIC Twitch app (no client secret on the streamer's machine):
 * Device Code Flow to log in, refresh without secret, token persisted in data/.
 */
export class TwitchTokenManager {
  private token: StoredToken | null = null;
  private readonly store: JsonStore<StoredToken | null>;
  private refreshing: Promise<StoredToken | null> | null = null;
  private flowAbort: AbortController | null = null;

  constructor(
    private readonly clientId: string | undefined,
    private readonly file: string,
    private readonly log: Logger,
    private readonly onChange: (token: StoredToken | null) => void,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.store = new JsonStore<StoredToken | null>(file, 0);
  }

  get configured(): boolean {
    return Boolean(this.clientId);
  }

  get current(): StoredToken | null {
    return this.token;
  }

  has(scope: string): boolean {
    return Boolean(this.token?.scopes.includes(scope));
  }

  async load(): Promise<StoredToken | null> {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as StoredToken;
      if (raw && raw.clientId === this.clientId) this.token = raw;
    } catch {
      this.token = null;
    }
    if (this.token) {
      const valid = await this.getAccessToken().catch(() => null);
      if (!valid) this.token = null;
    }
    this.onChange(this.token);
    return this.token;
  }

  /** A valid access token (refreshing it when close to expiry), or null when logged out. */
  async getAccessToken(): Promise<string | null> {
    if (!this.token) return null;
    if (Date.now() < this.token.expiresAt - 5 * 60_000) return this.token.accessToken;
    this.refreshing ??= this.refresh().finally(() => {
      this.refreshing = null;
    });
    const t = await this.refreshing;
    return t?.accessToken ?? null;
  }

  /** Start the Device Code Flow. Polls in the background and resolves `done` when the user approves. */
  async startDeviceFlow(): Promise<DeviceFlow & { done: Promise<StoredToken | null> }> {
    if (!this.clientId) throw new Error('defina TWITCH_CLIENT_ID no .env (app "Public" em dev.twitch.tv)');
    this.flowAbort?.abort();
    const abort = new AbortController();
    this.flowAbort = abort;
    const res = await this.fetchImpl(`${ID_BASE}/device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ client_id: this.clientId, scopes: TWITCH_SCOPES.join(' ') }),
    });
    if (!res.ok) throw new Error(`device flow: HTTP ${res.status} ${await res.text()}`);
    const data = (await res.json()) as {
      device_code: string;
      user_code: string;
      verification_uri: string;
      expires_in: number;
      interval: number;
    };
    const done = this.pollDevice(data.device_code, data.interval, data.expires_in, abort.signal);
    return { userCode: data.user_code, verificationUri: data.verification_uri, expiresIn: data.expires_in, done };
  }

  async logout(): Promise<void> {
    this.token = null;
    await rm(this.file, { force: true });
    this.onChange(null);
  }

  private async pollDevice(
    deviceCode: string,
    intervalSec: number,
    expiresIn: number,
    signal: AbortSignal,
  ): Promise<StoredToken | null> {
    const deadline = Date.now() + expiresIn * 1000;
    let interval = Math.max(1, intervalSec) * 1000;
    while (Date.now() < deadline && !signal.aborted) {
      await sleep(interval);
      const res = await this.fetchImpl(`${ID_BASE}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form({
          client_id: this.clientId!,
          scopes: TWITCH_SCOPES.join(' '),
          device_code: deviceCode,
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) return this.accept(body);
      const message = String(body.message ?? '');
      if (message === 'authorization_pending') continue;
      if (message === 'slow_down') {
        interval += 5000;
        continue;
      }
      this.log.warn({ status: res.status, message }, 'twitch device flow stopped');
      return null;
    }
    return null;
  }

  private async refresh(): Promise<StoredToken | null> {
    const t = this.token;
    if (!t || !this.clientId) return null;
    const res = await this.fetchImpl(`${ID_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form({ client_id: this.clientId, grant_type: 'refresh_token', refresh_token: t.refreshToken }),
    });
    if (!res.ok) {
      this.log.warn({ status: res.status }, 'twitch token refresh failed — run "npm run twitch:login" again');
      this.token = null;
      this.onChange(null);
      return null;
    }
    return this.accept((await res.json()) as Record<string, unknown>);
  }

  private async accept(body: Record<string, unknown>): Promise<StoredToken | null> {
    const accessToken = String(body.access_token ?? '');
    if (!accessToken) return null;
    const validate = await this.fetchImpl(`${ID_BASE}/validate`, {
      headers: { Authorization: `OAuth ${accessToken}` },
    });
    if (!validate.ok) return null;
    const info = (await validate.json()) as { login: string; user_id: string; scopes: string[]; expires_in: number };
    this.token = {
      clientId: this.clientId!,
      accessToken,
      refreshToken: String(body.refresh_token ?? ''),
      expiresAt: Date.now() + (Number(body.expires_in ?? info.expires_in) || 3600) * 1000,
      scopes: info.scopes ?? [],
      login: info.login,
      userId: info.user_id,
    };
    await this.store.writeNow(this.token);
    this.onChange(this.token);
    return this.token;
  }
}
