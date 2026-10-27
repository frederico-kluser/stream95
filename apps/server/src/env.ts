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

export const EnvSchema = z.object({
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(65535).default(DEFAULT_PORT)),
  HOST: z.preprocess(emptyToUndefined, z.string().default('127.0.0.1')),
  DATA_DIR: optionalString,
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

export type Env = z.infer<typeof EnvSchema> & { root: string; dataDir: string; overlayDist: string };

/** Load `.env` from the repo root (process env wins) and validate everything. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env, root: string = findRoot()): Env {
  const file = source.STREAM95_ENV_FILE ?? path.join(root, '.env');
  if (source === process.env && existsSync(file)) process.loadEnvFile(file);
  const parsed = EnvSchema.parse(source);
  return {
    ...parsed,
    root,
    dataDir: parsed.DATA_DIR ? path.resolve(root, parsed.DATA_DIR) : path.join(root, 'data'),
    overlayDist: path.join(root, 'apps', 'overlay', 'dist'),
  };
}
