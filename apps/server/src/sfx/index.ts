import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SFX_BUTTONS_FILE } from '@stream95/shared';

export * from './convert.js';
export * from './library.js';
export * from './routes.js';

const SHELL_FOLDERS_KEY = String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders`;

const unescapeReg = (s: string): string => s.replace(/\\(.)/g, '$1');

/**
 * A REG_SZ or REG_EXPAND_SZ value from the text of a `reg export` file (variables not expanded yet),
 * or null when the value is missing or of another type.
 */
export function regExportValue(text: string, name: string): string | null {
  // long hex lists go on in the next line after ",\"
  const lines = text.replace(/,\\\r?\n[ \t]*/g, ',').split(/\r?\n/);
  const wanted = name.toLowerCase();
  for (const line of lines) {
    const m = /^"((?:[^"\\]|\\.)*)"=(.*)$/.exec(line.trim());
    if (!m || unescapeReg(m[1] ?? '').toLowerCase() !== wanted) continue;
    const data = m[2] ?? '';
    const sz = /^"((?:[^"\\]|\\.)*)"$/.exec(data);
    if (sz) return unescapeReg(sz[1] ?? '');
    // REG_EXPAND_SZ: UTF-16LE bytes in hex, ending in a NUL
    const hex = /^hex\(2\):([0-9a-f,]*)$/i.exec(data);
    if (!hex) return null;
    const bytes = (hex[1] ?? '')
      .split(',')
      .filter(Boolean)
      .map((h) => Number.parseInt(h, 16));
    return Buffer.from(bytes).toString('utf16le').replace(/\0+$/, '');
  }
  return null;
}

/** Expands %NAME% with `env` (names in any case, like Windows); null when a variable is not set. */
export function expandWindowsVars(value: string, env: Record<string, string | undefined>): string | null {
  let missing = false;
  const expanded = value.replace(/%([^%]+)%/g, (_match, name: string) => {
    const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
    const found = key === undefined ? undefined : env[key];
    if (found === undefined) missing = true;
    return found ?? '';
  });
  return missing ? null : expanded;
}

/**
 * The Documents folder Windows really uses (Explorer's "Documentos"), which OneDrive folder backup moves
 * to OneDrive\Documentos. Read from the registry with `reg export`: its file is always UTF-16, so a
 * user name with accents survives, while `reg query` prints in the console code page.
 */
function windowsDocuments(): string | null {
  const file = path.join(os.tmpdir(), `stream95-shell-folders-${process.pid}-${Date.now()}.reg`);
  try {
    execFileSync('reg', ['export', SHELL_FOLDERS_KEY, file, '/y'], {
      windowsHide: true,
      timeout: 3000,
      stdio: 'ignore',
    });
    const value = regExportValue(readFileSync(file, 'utf16le'), 'Personal');
    const dir = value === null ? null : expandWindowsVars(value, process.env);
    return dir && path.isAbsolute(dir) && statSync(dir).isDirectory() ? path.normalize(dir) : null;
  } catch {
    return null;
  } finally {
    try {
      rmSync(file, { force: true });
    } catch {
      // a leftover temp file is harmless
    }
  }
}

let documents: string | undefined;

/** The user's Documents folder (on Windows also when OneDrive moved it); read once, on first use. */
export function documentsDir(): string {
  documents ??= (process.platform === 'win32' ? windowsDocuments() : null) ?? path.join(os.homedir(), 'Documents');
  return documents;
}

/** Default sounds folder, easy to find on the PC (`npm run sfx:pack` uses the same). */
export function defaultSoundsDir(): string {
  return path.join(documentsDir(), 'stream95', 'sons');
}

/**
 * Soundboard locations. `soundsDir` (e.g. the SOUNDS_DIR env var) is the folder the user fills with
 * sounds and resolves against the repo root; the converted cache and the buttons stay in the data folder.
 */
export function sfxPaths(opts: { dataDir: string; root: string; soundsDir?: string | undefined }): {
  dir: string;
  cacheDir: string;
  buttonsFile: string;
} {
  const custom = opts.soundsDir?.trim();
  return {
    dir: custom ? path.resolve(opts.root, custom) : defaultSoundsDir(),
    cacheDir: path.join(opts.dataDir, 'cache', 'sfx'),
    buttonsFile: path.join(opts.dataDir, SFX_BUTTONS_FILE),
  };
}
