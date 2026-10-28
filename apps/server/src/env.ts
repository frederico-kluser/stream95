import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT } from '@stream95/shared';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repository root: the first ancestor whose package.json declares workspaces. */
export function findRoot(start: string = here): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    const pkg = path.join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        if (JSON.parse(readFileSync(pkg, 'utf8')).workspaces) return dir;
      } catch {
        // ignore malformed package.json and keep walking up
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
/** "false", "0", "no", "off" or "não" turn a flag off; any other value turns it on. */
const flag = (v: unknown) => {
  if (typeof v !== 'string') return v;
  const s = v.trim().toLowerCase();
  if (s === '') return undefined;
  return !['false', '0', 'no', 'off', 'nao', 'não'].includes(s);
};

export const EnvSchema = z.object({
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(65535).default(DEFAULT_PORT)),
  /**
   * Phones and tablets on the local network may use the deck once paired (QR code in the terminal).
   * Unset: on, unless HOST is set (an older .env with HOST keeps its old mode). See defaultLan.
   */
  LAN: z.preprocess(flag, z.boolean().optional()),
  /** Bind address. Default: 0.0.0.0 with LAN on, 127.0.0.1 with LAN off. */
  HOST: optionalString,
  DATA_DIR: optionalString,
  /** Soundboard folder (one subfolder per category). Default: stream95/sons in the real Documents folder. */
  SOUNDS_DIR: optionalString,
  TWITCH_CHANNEL: optionalString,
  TWITCH_CLIENT_ID: optionalString,
  OPENROUTER_API_KEY: optionalString,
  MODERATION_MODEL: z.preprocess(emptyToUndefined, z.string().default('google/gemini-2.5-flash-lite')),
  MODERATION_FALLBACK_MODEL: z.preprocess(emptyToUndefined, z.string().default('mistralai/ministral-8b-2512')),
  /** Decision model for real-time moderation (pin a versioned id, never the ~latest alias). */
  JEV_MODEL: z.preprocess(emptyToUndefined, z.string().default('typesafe/jev-1.14')),
  ASSISTANT_MODEL: z.preprocess(emptyToUndefined, z.string().default('openai/gpt-4.1-mini')),
  ASSISTANT_FALLBACK_MODEL: z.preprocess(emptyToUndefined, z.string().default('google/gemini-2.5-flash-lite')),
  TTS_MODEL: z.preprocess(emptyToUndefined, z.string().default('elevenlabs/eleven-flash-v2.5')),
  GITHUB_USER: optionalString,
  GITHUB_TOKEN: optionalString,
  OBS_WS_URL: z.preprocess(emptyToUndefined, z.string().default('ws://127.0.0.1:4455')),
  OBS_WS_PASSWORD: optionalString,
});

export type Env = Omit<z.infer<typeof EnvSchema>, 'LAN' | 'HOST'> & {
  LAN: boolean;
  HOST: string;
  /** HOST came from the environment or .env (not from the LAN default). */
  hostFromEnv: boolean;
  root: string;
  dataDir: string;
  overlayDist: string;
  deckDist: string;
};

/**
 * LAN mode: an explicit LAN wins. Without it, LAN is on, except when HOST is set: an .env from before
 * LAN existed (HOST=0.0.0.0 for OBS on a second PC) keeps the old trusted-network mode, without pairing.
 */
export function defaultLan(lan?: boolean, host?: string): boolean {
  return lan ?? host === undefined;
}

/** Bind address: an explicit HOST wins; otherwise every interface with LAN on, only this PC with LAN off. */
export function defaultHost(lan: boolean, host?: string): string {
  return host ?? (lan ? '0.0.0.0' : '127.0.0.1');
}

/** Load `.env` from the repo root (process env wins) and validate everything. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env, root: string = findRoot()): Env {
  const file = source.STREAM95_ENV_FILE ?? path.join(root, '.env');
  if (source === process.env && existsSync(file)) process.loadEnvFile(file);
  const parsed = EnvSchema.parse(source);
  const lan = defaultLan(parsed.LAN, parsed.HOST);
  return {
    ...parsed,
    LAN: lan,
    HOST: defaultHost(lan, parsed.HOST),
    hostFromEnv: parsed.HOST !== undefined,
    root,
    dataDir: parsed.DATA_DIR ? path.resolve(root, parsed.DATA_DIR) : path.join(root, 'data'),
    overlayDist: path.join(root, 'apps', 'overlay', 'dist'),
    deckDist: path.join(root, 'apps', 'deck', 'dist'),
  };
}
