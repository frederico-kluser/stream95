import { SFX_COLORS, SFX_EXTENSIONS, type SfxButton, type SfxColor, type SfxSound } from '@stream95/shared';
import { mmss, seconds } from '@/lib/format';

/** "Criar botões para os sons sem botão" stops at this many buttons (the grid stays usable on a phone). */
export const MAX_BUTTONS = 24;
export const MAX_UPLOAD_FILES = 20;
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Select values for the library root and a new folder (":" never appears in a Windows folder name). */
export const ROOT_CATEGORY = ':root';
export const NEW_CATEGORY = ':new';

/** File picker filter: any audio, plus the containers the PC also converts (.mp4, .webm…). */
export const UPLOAD_ACCEPT = ['audio/*', ...SFX_EXTENSIONS].join(',');

/** Quick picks for the button icon (the field keeps one emoji; the newest replaces the old one). */
export const QUICK_EMOJIS = ['😂', '💀', '🔥', '👏', '🎉', '😱', '🤡', '😎', '🚨', '💥', '🥁', '🐐'] as const;

/** Server limits for a button, in code points (sfx/routes.ts). */
export const MAX_LABEL = 32;
export const MAX_EMOJI = 8;

export type Overlap = 'stack' | 'restart' | 'single';

export const OVERLAP_HINT: Record<Overlap, string> = {
  stack: 'Os sons tocam juntos, até o mesmo som repetido.',
  restart: 'O mesmo som recomeça; sons diferentes tocam juntos.',
  single: 'Um som novo interrompe os outros.',
};

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Lowercase without accents, for search. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function categoryLabel(category: string): string {
  return category === '' ? 'Pasta principal' : category;
}

/** 2400 → "2,4 s"; 125000 → "2:05"; unknown → "". */
export function durationText(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return '';
  return ms < 60_000 ? seconds(ms) : mmss(ms);
}

/** 3_400_000 → "3,2 MB"; 20_000 → "20 KB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** "bruh-sound_effect" → "Bruh sound effect" (button label from a file name). */
export function labelFromName(name: string): string {
  const words = name
    .replace(/[-_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!words) return 'Som';
  const label = words.charAt(0).toLocaleUpperCase('pt-BR') + words.slice(1);
  // cut by code points, like the server counts them: never half an emoji
  return Array.from(label).slice(0, MAX_LABEL).join('').trim();
}

const byName = (a: SfxSound, b: SfxSound): number =>
  a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base', numeric: true });

const byCategory = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a === '') return -1;
  if (b === '') return 1;
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true });
};

export type SoundGroup = { category: string; label: string; sounds: SfxSound[] };

/** Sounds grouped by folder (root first, then A→Z), filtered by a case and accent insensitive query. */
export function groupSounds(sounds: readonly SfxSound[], query = ''): SoundGroup[] {
  const q = fold(query.trim());
  const groups = new Map<string, SfxSound[]>();
  for (const sound of sounds) {
    if (q && !fold(`${sound.name} ${sound.category}`).includes(q)) continue;
    const list = groups.get(sound.category);
    if (list) list.push(sound);
    else groups.set(sound.category, [sound]);
  }
  return [...groups.keys()].sort(byCategory).map((category) => ({
    category,
    label: categoryLabel(category),
    sounds: (groups.get(category) ?? []).sort(byName),
  }));
}

/** Subfolders that already exist in the library (the root is not listed). */
export function categoriesOf(sounds: readonly SfxSound[]): string[] {
  return [...new Set(sounds.map((s) => s.category).filter((c) => c !== ''))].sort(byCategory);
}

export type StatusCounts = Record<SfxSound['status'], number>;

export function countByStatus(sounds: readonly SfxSound[]): StatusCounts {
  const counts: StatusCounts = { ready: 0, converting: 0, error: 0 };
  for (const sound of sounds) counts[sound.status] += 1;
  return counts;
}

export type Availability =
  | { ok: true; sound: SfxSound }
  | { ok: false; kind: 'empty' | 'missing' | 'converting' | 'error'; text: string };

/** Whether a button can play right now and, when it cannot, the reason shown on the tile. */
export function availability(button: Pick<SfxButton, 'soundId'>, sound: SfxSound | undefined): Availability {
  if (!button.soundId) return { ok: false, kind: 'empty', text: 'sem som escolhido' };
  // short: it must fit one line of the smallest tile
  if (!sound) return { ok: false, kind: 'missing', text: 'sem arquivo' };
  if (sound.status === 'converting') return { ok: false, kind: 'converting', text: 'convertendo…' };
  if (sound.status === 'error') return { ok: false, kind: 'error', text: 'erro no arquivo' };
  return { ok: true, sound };
}

/** Ready sounds that no button plays yet, in library order. */
export function unmappedReadySounds(sounds: readonly SfxSound[], buttons: readonly SfxButton[]): SfxSound[] {
  const mapped = new Set(buttons.map((b) => b.soundId));
  return sounds
    .filter((s) => s.status === 'ready' && !mapped.has(s.id))
    .sort((a, b) => byCategory(a.category, b.category) || byName(a, b));
}

/** How many buttons play each sound. */
export function buttonsBySound(buttons: readonly SfxButton[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const b of buttons) if (b.soundId) counts.set(b.soundId, (counts.get(b.soundId) ?? 0) + 1);
  return counts;
}

const AUTO_COLORS: readonly SfxColor[] = SFX_COLORS.filter((c) => c !== 'slate');

/** Same folder, same color: buttons created in bulk stay visually grouped. */
export function colorForCategory(category: string): SfxColor {
  let h = 7;
  for (const ch of category) h = (Math.imul(h, 31) + (ch.codePointAt(0) ?? 0)) >>> 0;
  return AUTO_COLORS[h % AUTO_COLORS.length] ?? 'violet';
}

/** Moves `id` one place before (-1) or after (+1); out of range leaves the order as is. */
export function moveId(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const next = [...ids];
  const from = next.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= next.length) return next;
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** A local order (still being saved) over the server list: unknown ids drop out, new buttons go last. */
export function applyOrder(buttons: readonly SfxButton[], order: readonly string[] | null): SfxButton[] {
  if (!order) return [...buttons];
  const byId = new Map(buttons.map((b) => [b.id, b]));
  const out: SfxButton[] = [];
  for (const id of order) {
    const button = byId.get(id);
    if (!button) continue;
    out.push(button);
    byId.delete(id);
  }
  for (const button of buttons) if (byId.has(button.id)) out.push(button);
  return out;
}

export function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

const EXTENSIONS = new Set<string>(SFX_EXTENSIONS);

export type Rejected = { name: string; why: string };

/** Splits picked files into what the server accepts and what it would refuse (with the reason). */
export function checkUploads<T extends { name: string; size: number }>(
  files: readonly T[],
): { accepted: T[]; rejected: Rejected[] } {
  const accepted: T[] = [];
  const rejected: Rejected[] = [];
  for (const file of files) {
    if (!EXTENSIONS.has(extensionOf(file.name))) rejected.push({ name: file.name, why: 'formato não aceito' });
    else if (file.size === 0) rejected.push({ name: file.name, why: 'arquivo vazio' });
    else if (file.size > MAX_UPLOAD_BYTES) rejected.push({ name: file.name, why: 'maior que 50 MB' });
    else if (accepted.length >= MAX_UPLOAD_FILES) rejected.push({ name: file.name, why: 'passou de 20 arquivos' });
    else accepted.push(file);
  }
  return { accepted, rejected };
}

// Same rule as the server's sanitizeCategory (sfx/library.ts), so the preview shows the folder it creates.
const UNSAFE_FOLDER_CHARS = /[^\p{L}\p{M}\p{N} _()-]+/gu;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
const MAX_CATEGORY = 40;
const trimEdges = (s: string): string => s.replace(/^[\s.]+|[\s.]+$/gu, '');

/** The folder the PC creates for a new folder name: letters, digits, space and `_ ( ) -`, up to 40. */
export function cleanCategory(input: string): string {
  const clean = trimEdges(input.normalize('NFC').replace(UNSAFE_FOLDER_CHARS, ' ').replace(/\s+/gu, ' '));
  const cut = trimEdges(Array.from(clean).slice(0, MAX_CATEGORY).join(''));
  return WINDOWS_RESERVED.test(cut) ? `_${cut}` : cut;
}

/** Keeps the last character typed (an emoji is often several code points). */
export function lastGrapheme(text: string): string {
  const value = text.trim();
  if (!value) return '';
  if (typeof Intl.Segmenter === 'function') {
    let last = '';
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)) {
      last = segment;
    }
    return last;
  }
  return Array.from(value).at(-1) ?? '';
}

/** The last emoji typed, or null when it is longer than the server keeps (a kiss with two skin tones has 10). */
export function pickEmoji(text: string): string | null {
  const emoji = lastGrapheme(text);
  return Array.from(emoji).length > MAX_EMOJI ? null : emoji;
}

/** Slider values come as a number or a one-item array. */
export const sliderValue = (value: number | readonly number[]): number =>
  typeof value === 'number' ? value : (value[0] ?? 0);
