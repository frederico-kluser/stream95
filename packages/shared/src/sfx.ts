/** Audio formats the soundboard accepts (anything else in the library folder is ignored). */
export const SFX_EXTENSIONS = [
  '.mp3',
  '.wav',
  '.ogg',
  '.oga',
  '.opus',
  '.m4a',
  '.aac',
  '.flac',
  '.webm',
  '.weba',
  '.aif',
  '.aiff',
  '.wma',
  '.mp4',
] as const;

/** Sounds longer than this are rejected: a soundboard plays short clips, and WAV is 192 KB/s. */
export const SFX_MAX_DURATION_MS = 120_000;

/** File (inside the server data folder) where the soundboard buttons live: `{ version: 1, buttons: SfxButton[] }`. */
export const SFX_BUTTONS_FILE = 'sfx-buttons.json';

function fnv1a(text: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Normalizes a path relative to the library folder: forward slashes, no leading slash. */
export function sfxRelPath(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * Stable id of a sound from its path relative to the library folder. Case-insensitive (Windows
 * file names are), 64 bits from two FNV-1a passes, so ids survive restarts and re-scans.
 */
export function sfxSoundId(relPath: string): string {
  const key = sfxRelPath(relPath).toLowerCase();
  return `s${fnv1a(key, 0x811c9dc5).toString(36)}${fnv1a(key, 0x01000193).toString(36)}`;
}
