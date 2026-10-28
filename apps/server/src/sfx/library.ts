import { createHash, randomBytes } from 'node:crypto';
import { type BigIntStats, type Dirent, type FSWatcher, watch as watchFs } from 'node:fs';
import { copyFile, lstat, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type Settings,
  SFX_COLORS,
  SFX_EXTENSIONS,
  type SfxButton,
  type SfxColor,
  type SfxLibrary,
  type SfxSound,
  sfxSoundId,
} from '@stream95/shared';
import type { Logger } from '../log.js';
import { JsonStore } from '../store.js';
import { CONVERTER_VERSION, ConvertError, convertToWav, DEFAULT_FFMPEG_PATH, readWavInfo } from './convert.js';
import { removeFileWithRetry, renameWithRetry } from './fs.js';

export type SfxSettings = Settings['sfx'];

export type SoundLibraryOptions = {
  /** Folder with the user's sounds; each subfolder is a category. */
  dir: string;
  /** Folder for the converted WAV files (`<id>-<rev>.wav`). */
  cacheDir: string;
  /** JSON file with the buttons: `{ version: 1, buttons }`. */
  buttonsFile: string;
  log: Logger;
  settings: () => SfxSettings;
  /** ffmpeg binary; null or undefined uses ffmpeg-static. */
  ffmpegPath?: string | null;
  /** Rescan when something changes in `dir` (tests turn it off). */
  watch?: boolean;
  /** Wait before trying an unreachable sounds folder again (default 5 s). */
  retryMs?: number;
};

export type SfxErrorCode = 'invalid' | 'not_found' | 'not_ready' | 'too_large' | 'io';

/** Error with a user-facing message ("Erro: ... — Solução: ...") and a code the routes map to HTTP. */
export class SfxError extends Error {
  constructor(
    readonly code: SfxErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SfxError';
  }
}

export type ButtonInput = {
  label: string;
  soundId: string | null;
  /** null or '' removes the emoji. */
  emoji?: string | null;
  color?: SfxColor;
  volume?: number;
};
export type ButtonPatch = Partial<ButtonInput>;
export type PlayTarget = { buttonId: string } | { soundId: string };
export type PlayResolution =
  | { ok: true; sound: SfxSound; rev: string; volume: number }
  | { ok: false; error: 'not_found' | 'not_ready'; message: string };
export type UploadFile = { filename: string; data: Buffer };

type ButtonsFile = { version: 1; buttons: SfxButton[] };
type Ready = { rev: string; path: string; durationMs: number };
type Entry = {
  id: string;
  name: string;
  category: string;
  file: string;
  abs: string;
  /** Wanted version: source size + mtime + normalize + converter version. */
  rev: string;
  /** Which file this is on disk (see `statSource`): a rename or move keeps it, another file never has it. */
  fileId: string | null;
  normalize: boolean;
  /** Converted file that plays now; it may lag behind `rev` while a new conversion runs. */
  ready: Ready | null;
  error: string | null;
};
/** An audio file found by a scan. */
type Found = { id: string; rel: string; abs: string; rev: string; fileId: string | null };
/** A running conversion and its own cancel switch. */
type Job = { done: Promise<void>; cancel: AbortController };
/** Converted WAV files by sound id, then by rev. */
type CacheIndex = Map<string, Map<string, string>>;

const MAX_LABEL = 32;
const MAX_EMOJI = 8;
const MAX_FILE_NAME = 80;
const MAX_CATEGORY = 40;
const MAX_BUTTONS = 200;
const MAX_SOUNDS = 1000;
const MAX_DEPTH = 4;
const DEFAULT_COLOR: SfxColor = 'slate';
const DEFAULT_BUTTON_VOLUME = 0.9;
const WATCH_DEBOUNCE_MS = 400;
const WATCH_MAX_WAIT_MS = 3000;
const WATCH_RETRY_MS = 5000;
const EMIT_GAP_MS = 150;
const SAVE_DEBOUNCE_MS = 200;
const UPLOAD_WAIT_MS = 8000;
const NS_PER_S = 1_000_000_000n;

const AUDIO_EXTENSIONS: ReadonlySet<string> = new Set<string>(SFX_EXTENSIONS);
const IGNORED_SUFFIXES = ['.part', '.crdownload', '.tmp'];
const CACHE_FILE = /^(s[0-9a-z]+)-([0-9a-f]{10})\.wav$/;
const UNSAFE_NAME_CHARS = /[^\p{L}\p{M}\p{N} ._()-]+/gu;
const UNSAFE_FOLDER_CHARS = /[^\p{L}\p{M}\p{N} _()-]+/gu;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
const BUTTON_ID = /^[\w-]{1,40}$/;
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

const NO_SOUND = 'Erro: som não encontrado — Solução: confira se o arquivo ainda está na pasta de sons';

// ------------------------------------------------------------------------------------------------ helpers

const codePoints = (s: string): string[] => Array.from(s);
const trimEdges = (s: string): string => s.replace(/^[\s.]+|[\s.]+$/gu, '');
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isColor = (v: unknown): v is SfxColor => typeof v === 'string' && (SFX_COLORS as readonly string[]).includes(v);
const errCode = (err: unknown): string => (err as NodeJS.ErrnoException)?.code ?? 'falha';
const jobKey = (id: string, rev: string): string => `${id}-${rev}`;
const pathExists = (p: string): Promise<boolean> =>
  lstat(p).then(
    () => true,
    () => false,
  );

/** Names the scanner skips: hidden files, Office lock files and downloads still in progress. */
export function isIgnoredName(name: string): boolean {
  const lower = name.toLowerCase();
  return name.startsWith('.') || name.startsWith('~$') || IGNORED_SUFFIXES.some((s) => lower.endsWith(s));
}

export function isAudioName(name: string): boolean {
  return AUDIO_EXTENSIONS.has(path.extname(name).toLowerCase());
}

/** Version of a converted sound: changes with the source file, the normalize setting and the converter. */
export function soundRev(size: number, mtimeMs: number, normalize: boolean): string {
  return createHash('sha1').update(`${size}:${mtimeMs}:${normalize}:${CONVERTER_VERSION}`).digest('hex').slice(0, 10);
}

/**
 * Version and identity of a source file, from one stat. The identity is volume + file id + creation time:
 * a rename or a move on the same disk keeps all three, while a different file never has them all, even
 * with the same size and mtime (bigint keeps the 64-bit NTFS file id exact; the creation time covers a
 * freed inode that ext4 hands to the next new file). null when the path is not a readable file.
 */
async function statSource(abs: string, normalize: boolean): Promise<{ rev: string; fileId: string | null } | null> {
  let st: BigIntStats;
  try {
    st = await stat(abs, { bigint: true });
  } catch {
    return null;
  }
  if (!st.isFile()) return null;
  // the same number as the plain Stats.mtimeMs (sec * 1000 + nsec / 1e6)
  const mtimeMs = Number(st.mtimeNs / NS_PER_S) * 1000 + Number(st.mtimeNs % NS_PER_S) / 1e6;
  return {
    rev: soundRev(Number(st.size), mtimeMs, normalize),
    fileId: st.ino ? `${st.dev}:${st.ino}:${st.birthtimeNs}` : null,
  };
}

/** The same file as before (rename or move) with the same content. */
const sameSource = (a: { rev: string; fileId: string | null }, b: { rev: string; fileId: string | null }): boolean =>
  a.fileId !== null && a.fileId === b.fileId && a.rev === b.rev;

function cleanSegment(raw: string, unsafe: RegExp, max: number): string {
  const s = trimEdges(raw.normalize('NFC').replace(unsafe, ' ').replace(/\s+/gu, ' '));
  const cut = trimEdges(codePoints(s).slice(0, max).join(''));
  return WINDOWS_RESERVED.test(cut) ? `_${cut}` : cut;
}

/**
 * Safe file name for an upload: folders stripped, only letters (accents too), digits, space and
 * `- _ . ( )`, at most 80 characters, and an audio extension (anything else is rejected).
 */
export function sanitizeFileName(raw: string): string {
  const last = (raw.split(/[\\/]/).pop() ?? '').normalize('NFC').trim();
  const ext = path.extname(last).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(ext)) {
    const shown = codePoints(last).slice(0, 60).join('') || 'arquivo sem nome';
    throw new SfxError(
      'invalid',
      `Erro: "${shown}" não é um formato de áudio aceito — Solução: envie MP3, WAV, OGG, M4A, FLAC ou outro áudio comum`,
    );
  }
  const base = cleanSegment(last.slice(0, last.length - ext.length), UNSAFE_NAME_CHARS, MAX_FILE_NAME - ext.length);
  return `${base || 'som'}${ext}`;
}

/** A single safe folder name for an upload category ('' = library root). Separators and ".." are rejected. */
export function sanitizeCategory(raw: string | null | undefined): string {
  const value = (raw ?? '').normalize('NFC').trim();
  if (!value) return '';
  if (/[\\/]/.test(value) || value.includes('..')) {
    throw new SfxError(
      'invalid',
      'Erro: categoria inválida — Solução: use só o nome de uma pasta, sem barras nem ".."',
    );
  }
  const clean = cleanSegment(value, UNSAFE_FOLDER_CHARS, MAX_CATEGORY);
  if (!clean) throw new SfxError('invalid', 'Erro: categoria sem letras nem números — Solução: escolha outro nome');
  return clean;
}

function describeFile(rel: string): { name: string; category: string; file: string } {
  const parts = rel.split('/');
  const base = parts[parts.length - 1] ?? rel;
  return {
    file: rel,
    name: base.slice(0, base.length - path.extname(base).length),
    // deeper files belong to their first folder
    category: parts.length > 1 ? (parts[0] ?? '') : '',
  };
}

function compareSounds(a: SfxSound, b: SfxSound): number {
  if (a.category !== b.category) {
    if (!a.category) return -1;
    if (!b.category) return 1;
    const byCategory = collator.compare(a.category, b.category);
    if (byCategory) return byCategory;
  }
  return collator.compare(a.name, b.name) || collator.compare(a.file, b.file) || (a.file < b.file ? -1 : 1);
}

function checkLabel(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : '';
  const n = codePoints(s).length;
  if (n < 1 || n > MAX_LABEL) {
    throw new SfxError(
      'invalid',
      `Erro: o nome do botão precisa ter de 1 a ${MAX_LABEL} caracteres — Solução: ajuste o nome`,
    );
  }
  return s;
}

function checkEmoji(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = typeof v === 'string' ? v.trim() : null;
  if (s === null || codePoints(s).length > MAX_EMOJI) {
    throw new SfxError('invalid', `Erro: o emoji pode ter até ${MAX_EMOJI} caracteres — Solução: use um emoji só`);
  }
  return s || undefined;
}

function checkColor(v: unknown): SfxColor {
  if (!isColor(v)) throw new SfxError('invalid', `Erro: cor inválida — Solução: use ${SFX_COLORS.join(', ')}`);
  return v;
}

function checkVolume(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
    throw new SfxError('invalid', 'Erro: volume do botão fora da faixa — Solução: use um valor de 0 a 1');
  }
  return v;
}

/** Fixed key order, so the JSON file stays tidy. */
function shapeButton(b: SfxButton): SfxButton {
  return {
    id: b.id,
    label: b.label,
    soundId: b.soundId,
    ...(b.emoji ? { emoji: b.emoji } : {}),
    color: b.color,
    volume: b.volume,
  };
}

/** Lenient read of a stored button (bad fields fall back to defaults, broken entries are dropped). */
function coerceButton(v: unknown): SfxButton | null {
  if (!isRecord(v) || typeof v.id !== 'string' || !BUTTON_ID.test(v.id)) return null;
  const label = typeof v.label === 'string' ? codePoints(v.label.trim()).slice(0, MAX_LABEL).join('') : '';
  if (!label) return null;
  const emoji = typeof v.emoji === 'string' ? codePoints(v.emoji.trim()).slice(0, MAX_EMOJI).join('') : '';
  const volume = typeof v.volume === 'number' && v.volume >= 0 && v.volume <= 1 ? v.volume : DEFAULT_BUTTON_VOLUME;
  return shapeButton({
    id: v.id,
    label,
    soundId: typeof v.soundId === 'string' ? v.soundId : null,
    ...(emoji ? { emoji } : {}),
    color: isColor(v.color) ? v.color : DEFAULT_COLOR,
    volume,
  });
}

// ------------------------------------------------------------------------------------------------ library

/**
 * The soundboard library: a folder of audio files on the streaming PC (subfolders = categories),
 * each converted once to a 48 kHz PCM WAV in `cacheDir`, plus the deck buttons mapped to them.
 * Playback always happens on the PC; the deck only picks sounds by id.
 */
export class SoundLibrary {
  readonly dir: string;
  readonly cacheDir: string;
  private readonly buttonsFile: string;
  private readonly log: Logger;
  private readonly settings: () => SfxSettings;
  private readonly ffmpegPath: string;
  private readonly watchEnabled: boolean;
  private readonly retryMs: number;
  private readonly store: JsonStore<ButtonsFile>;
  private readonly sounds = new Map<string, Entry>();
  private buttons: SfxButton[] = [];
  private readonly jobs = new Map<string, Job>();
  private readonly listeners = new Set<(library: SfxLibrary) => void>();
  private readonly abort = new AbortController();
  /** Serializes scans, uploads and deletes (conversions run outside of it). */
  private lock: Promise<unknown> = Promise.resolve();
  private watcher: FSWatcher | null = null;
  private scanTimer: NodeJS.Timeout | null = null;
  private watchRetry: NodeJS.Timeout | null = null;
  private firstEventAt = 0;
  private emitTimer: NodeJS.Timeout | null = null;
  private lastEmitAt = 0;
  private saveTimer: NodeJS.Timeout | null = null;
  private saving: Promise<void> = Promise.resolve();
  private lastNormalize: boolean | null = null;
  /** The sounds folder could not be opened (already logged; retried every `retryMs`). */
  private dirDown = false;
  private stopped = false;

  constructor(opts: SoundLibraryOptions) {
    this.dir = path.resolve(opts.dir);
    this.cacheDir = path.resolve(opts.cacheDir);
    this.buttonsFile = path.resolve(opts.buttonsFile);
    this.log = opts.log;
    this.settings = opts.settings;
    this.ffmpegPath = opts.ffmpegPath || DEFAULT_FFMPEG_PATH;
    this.watchEnabled = opts.watch ?? true;
    this.retryMs = opts.retryMs ?? WATCH_RETRY_MS;
    this.store = new JsonStore<ButtonsFile>(this.buttonsFile);
  }

  // ---------------------------------------------------------------------------------------- lifecycle

  /** Never fails because of the sounds folder: a missing drive or share is logged and tried again later. */
  async start(): Promise<void> {
    // buttons first: they live in the data folder, so a missing sounds folder never empties them
    await this.loadButtons();
    await mkdir(this.cacheDir, { recursive: true });
    await this.removeTempFiles();
    await this.openDir();
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    this.watcher?.close();
    this.watcher = null;
    for (const timer of [this.scanTimer, this.watchRetry, this.emitTimer]) if (timer) clearTimeout(timer);
    this.scanTimer = null;
    this.watchRetry = null;
    this.emitTimer = null;
    this.abort.abort();
    await Promise.allSettled([...this.jobs.values()].map((job) => job.done));
    await this.lock;
    await this.flushButtons();
  }

  /** Resolves when no scan, upload or conversion is running (tests, graceful shutdown). */
  async idle(): Promise<void> {
    await this.lock;
    while (this.jobs.size) await Promise.allSettled([...this.jobs.values()].map((job) => job.done));
  }

  /** Fires (throttled) after scans, conversions, uploads, deletes and button changes. */
  onChange(listener: (library: SfxLibrary) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Call after the settings change: when `normalize` flipped, every sound is converted again. */
  async settingsChanged(): Promise<void> {
    if (this.stopped || this.lastNormalize === null || this.settings().normalize === this.lastNormalize) return;
    try {
      await this.scan();
    } catch (err) {
      this.log.warn({ err: (err as Error).message }, 'sfx rescan after settings change failed');
    }
  }

  // ---------------------------------------------------------------------------------------- reading

  snapshot(): SfxLibrary {
    const sounds = [...this.sounds.values()].map((e) => this.toSound(e)).sort(compareSounds);
    return { dir: this.dir, sounds, buttons: this.buttons.map(shapeButton) };
  }

  get(id: string): SfxSound | null {
    const e = this.sounds.get(id);
    return e ? this.toSound(e) : null;
  }

  /** Converted WAV that can be played now, or null when the sound is unknown or not ready. */
  wavFor(id: string): { path: string; rev: string } | null {
    const e = this.sounds.get(id);
    return e?.ready && !e.error ? { path: e.ready.path, rev: e.ready.rev } : null;
  }

  /**
   * The WAV from `wavFor` could not be read. When it is really gone (e.g. the cache folder was cleared by
   * hand), the sound goes back to "converting" and is converted again, instead of staying "ready" for good.
   */
  async wavMissing(id: string): Promise<void> {
    const e = this.sounds.get(id);
    const ready = e?.ready;
    if (!e || !ready || this.stopped || (await pathExists(ready.path))) return;
    // a conversion may have finished (or the sound gone) during the check
    if (this.sounds.get(id) !== e || e.ready !== ready) return;
    e.ready = null;
    this.convert(e);
    this.changed();
  }

  /** What to play for a tap: the sound, its rev and the final volume (button x master). */
  resolvePlay(target: PlayTarget): PlayResolution {
    let soundId: string;
    let gain = 1;
    if ('buttonId' in target) {
      const button = this.buttons.find((b) => b.id === target.buttonId);
      if (!button) {
        return { ok: false, error: 'not_found', message: 'Erro: botão não encontrado — Solução: atualize o painel' };
      }
      if (!button.soundId) {
        return {
          ok: false,
          error: 'not_found',
          message: 'Erro: o botão está sem som — Solução: escolha um som para ele',
        };
      }
      soundId = button.soundId;
      gain = button.volume;
    } else {
      soundId = target.soundId;
    }
    const e = this.sounds.get(soundId);
    if (!e) return { ok: false, error: 'not_found', message: NO_SOUND };
    if (!e.ready || e.error) {
      return {
        ok: false,
        error: 'not_ready',
        message: e.error ?? 'Erro: o som ainda está sendo convertido — Solução: aguarde alguns segundos',
      };
    }
    const volume = Math.round(Math.min(1, Math.max(0, gain * this.settings().volume)) * 1000) / 1000;
    return { ok: true, sound: this.toSound(e), rev: e.ready.rev, volume };
  }

  // ---------------------------------------------------------------------------------------- sounds

  scan(opts: { retryErrors?: boolean } = {}): Promise<SfxLibrary> {
    return this.exclusive(async () => {
      if (!this.stopped) await this.scanOnce(opts.retryErrors === true);
      return this.snapshot();
    });
  }

  /**
   * Saves uploaded files into the library folder (optionally into a category subfolder) and
   * converts them. Waits a few seconds for the conversions, so short sounds come back ready.
   */
  async upload(files: UploadFile[], category?: string | null): Promise<SfxSound[]> {
    if (this.stopped) {
      throw new SfxError('io', 'Erro: o soundboard está desligando — Solução: tente de novo em instantes');
    }
    if (!files.length) {
      throw new SfxError('invalid', 'Erro: nenhum arquivo enviado — Solução: escolha ao menos um áudio');
    }
    // validate everything before writing anything
    const names = files.map((f) => sanitizeFileName(f.filename));
    const ids: string[] = [];
    try {
      await this.exclusive(async () => {
        const folderName = await this.uploadFolder(category);
        const targetDir = folderName ? path.join(this.dir, folderName) : this.dir;
        await mkdir(targetDir, { recursive: true }).catch((err: unknown) => {
          throw this.folderError(err);
        });
        const taken = new Set<string>();
        for (const [i, file] of files.entries()) {
          const name = await this.freeName(targetDir, folderName, names[i] ?? 'som.wav', taken);
          taken.add(name.toLowerCase());
          const abs = path.join(targetDir, name);
          // hidden temp name: the scanner and the watcher ignore it until the rename
          const tmp = path.join(targetDir, `.s95-${randomBytes(6).toString('hex')}.part`);
          try {
            await writeFile(tmp, file.data, { flag: 'wx' });
            await renameWithRetry(tmp, abs);
          } catch (err) {
            await rm(tmp, { force: true }).catch(() => {});
            throw new SfxError(
              'io',
              `Erro: não deu para salvar "${name}" (${errCode(err)}) — Solução: confira o espaço livre e a permissão da pasta de sons`,
            );
          }
          const entry = await this.register(abs, folderName ? `${folderName}/${name}` : name);
          if (entry) ids.push(entry.id);
        }
      });
    } finally {
      // files saved before a failure in the batch still show up in the deck
      if (ids.length) this.changed();
    }
    await this.settle(ids, UPLOAD_WAIT_MS);
    return ids.map((id) => this.get(id)).filter((s): s is SfxSound => s !== null);
  }

  /** Deletes the source file and its converted cache; buttons that used it keep existing without a sound. */
  deleteSound(id: string): Promise<boolean> {
    return this.exclusive(async () => {
      const e = this.sounds.get(id);
      if (!e) return false;
      // ffmpeg holds the source open while it converts, and Windows refuses to delete it meanwhile
      const cancelled = await this.cancelJobs(id);
      try {
        await removeFileWithRetry(e.abs);
      } catch (err) {
        // the sound stays: its conversion starts over instead of leaving it "converting" for good
        if (cancelled && e.ready?.rev !== e.rev) this.convert(e);
        throw new SfxError(
          'io',
          `Erro: não deu para apagar "${e.file}" (${errCode(err)}) — Solução: feche o programa que está usando o arquivo e tente de novo`,
        );
      }
      this.sounds.delete(id);
      await this.removeCache(id);
      let touched = false;
      for (const b of this.buttons) {
        if (b.soundId === id) {
          b.soundId = null;
          touched = true;
        }
      }
      if (touched) this.persistButtons();
      this.changed();
      return true;
    });
  }

  // ---------------------------------------------------------------------------------------- buttons

  createButton(input: ButtonInput): SfxButton {
    if (this.buttons.length >= MAX_BUTTONS) {
      throw new SfxError(
        'invalid',
        `Erro: o limite é de ${MAX_BUTTONS} botões — Solução: apague algum botão antes de criar outro`,
      );
    }
    const emoji = checkEmoji(input.emoji);
    const button = shapeButton({
      id: this.newButtonId(),
      label: checkLabel(input.label),
      soundId: this.checkSoundId(input.soundId ?? null),
      ...(emoji ? { emoji } : {}),
      color: input.color === undefined ? DEFAULT_COLOR : checkColor(input.color),
      volume: input.volume === undefined ? DEFAULT_BUTTON_VOLUME : checkVolume(input.volume),
    });
    this.buttons.push(button);
    this.buttonsChanged();
    return { ...button };
  }

  /** Returns null when the button does not exist. A bad field changes nothing. */
  updateButton(id: string, patch: ButtonPatch): SfxButton | null {
    const index = this.buttons.findIndex((b) => b.id === id);
    const current = this.buttons[index];
    if (!current) return null;
    const next: SfxButton = { ...current };
    if (patch.label !== undefined) next.label = checkLabel(patch.label);
    // keeping the same (maybe vanished) sound is fine; a new one must exist
    if (patch.soundId !== undefined && patch.soundId !== current.soundId) {
      next.soundId = this.checkSoundId(patch.soundId);
    }
    if (patch.emoji !== undefined) {
      const emoji = checkEmoji(patch.emoji);
      if (emoji) next.emoji = emoji;
      else delete next.emoji;
    }
    if (patch.color !== undefined) next.color = checkColor(patch.color);
    if (patch.volume !== undefined) next.volume = checkVolume(patch.volume);
    const shaped = shapeButton(next);
    this.buttons[index] = shaped;
    this.buttonsChanged();
    return { ...shaped };
  }

  deleteButton(id: string): boolean {
    const before = this.buttons.length;
    this.buttons = this.buttons.filter((b) => b.id !== id);
    if (this.buttons.length === before) return false;
    this.buttonsChanged();
    return true;
  }

  /** Listed ids first, in that order; unknown ids are ignored and unlisted buttons keep their order at the end. */
  reorder(ids: string[]): SfxButton[] {
    const byId = new Map(this.buttons.map((b) => [b.id, b]));
    const next: SfxButton[] = [];
    for (const id of ids) {
      const b = byId.get(id);
      if (!b) continue;
      next.push(b);
      byId.delete(id);
    }
    for (const b of this.buttons) if (byId.has(b.id)) next.push(b);
    this.buttons = next;
    this.buttonsChanged();
    return this.buttons.map(shapeButton);
  }

  // ---------------------------------------------------------------------------------------- internals

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn);
    this.lock = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  private toSound(e: Entry): SfxSound {
    const status: SfxSound['status'] = e.error ? 'error' : e.ready ? 'ready' : 'converting';
    return {
      id: e.id,
      name: e.name,
      category: e.category,
      file: e.file,
      status,
      ...(e.ready && !e.error ? { durationMs: e.ready.durationMs } : {}),
      rev: e.ready?.rev ?? e.rev,
      ...(e.error ? { error: e.error } : {}),
    };
  }

  private changed(): void {
    if (this.emitTimer || this.stopped) return;
    const wait = Math.max(0, this.lastEmitAt + EMIT_GAP_MS - Date.now());
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.lastEmitAt = Date.now();
      if (this.stopped || !this.listeners.size) return;
      const library = this.snapshot();
      for (const listener of this.listeners) {
        try {
          listener(library);
        } catch (err) {
          this.log.warn({ err: (err as Error).message }, 'sfx change listener failed');
        }
      }
    }, wait);
  }

  private async scanOnce(retryErrors: boolean): Promise<void> {
    const normalize = this.settings().normalize;
    this.lastNormalize = normalize;
    const cache = await this.readCacheIndex();
    const found = await this.statFiles(await this.walk(), normalize);
    const foundIds = new Set(found.map((f) => f.id));
    const removed = [...this.sounds.values()].filter((e) => !foundIds.has(e.id));
    await this.reuseMovedCache(removed, found, cache);
    for (const f of found) {
      let e = this.sounds.get(f.id);
      if (e) {
        Object.assign(e, describeFile(f.rel), { abs: f.abs, fileId: f.fileId });
        // a converted file deleted by hand (e.g. the cache folder was cleared) is converted again;
        // the identity check skips a conversion that finished during the await
        const ready = e.ready;
        const lost = ready && cache.get(e.id)?.get(ready.rev) !== ready.path && !(await pathExists(ready.path));
        if (lost && e.ready === ready) e.ready = null;
        const settled =
          e.ready?.rev === f.rev || this.jobs.has(jobKey(f.id, f.rev)) || (e.error !== null && !retryErrors);
        if (e.rev === f.rev && settled) continue;
        e.rev = f.rev;
        e.normalize = normalize;
        e.error = null;
      } else {
        e = {
          id: f.id,
          ...describeFile(f.rel),
          abs: f.abs,
          rev: f.rev,
          fileId: f.fileId,
          normalize,
          ready: null,
          error: null,
        };
        this.sounds.set(f.id, e);
      }
      await this.adoptCacheOrConvert(e, cache.get(f.id));
    }
    for (const e of removed) this.sounds.delete(e.id);
    this.followMovedSounds(removed);
    await this.collectGarbage(cache);
    this.changed();
  }

  private async statFiles(files: Array<{ abs: string; rel: string }>, normalize: boolean): Promise<Found[]> {
    const found: Found[] = [];
    const seen = new Set<string>();
    for (const f of files) {
      if (found.length >= MAX_SOUNDS) {
        this.log.warn({ max: MAX_SOUNDS }, 'sfx: too many sounds in the library folder, the rest is ignored');
        break;
      }
      const id = sfxSoundId(f.rel);
      // same path with a different case (case-sensitive file systems): first one wins
      if (seen.has(id)) continue;
      const source = await statSource(f.abs, normalize);
      if (!source) continue;
      seen.add(id);
      found.push({ id, rel: f.rel, abs: f.abs, ...source });
    }
    return found;
  }

  /**
   * A file renamed or moved to another folder in one go (the same file on disk, unchanged) keeps its
   * converted WAV under the new id instead of being converted again.
   */
  private async reuseMovedCache(removed: Entry[], found: Found[], cache: CacheIndex): Promise<void> {
    if (!removed.length) return;
    const fresh = found.filter((f) => !this.sounds.has(f.id));
    for (const gone of removed) {
      const matches = fresh.filter((f) => sameSource(f, gone));
      const match = matches.length === 1 ? matches[0] : undefined;
      const from = cache.get(gone.id)?.get(gone.rev);
      if (!match || !from || cache.get(match.id)?.has(match.rev)) continue;
      const to = path.join(this.cacheDir, `${jobKey(match.id, match.rev)}.wav`);
      try {
        await renameWithRetry(from, to);
      } catch {
        continue;
      }
      cache.get(gone.id)?.delete(gone.rev);
      const revs = cache.get(match.id) ?? new Map<string, string>();
      revs.set(match.rev, to);
      cache.set(match.id, revs);
    }
  }

  /** Buttons of a sound that vanished follow it when it was renamed or moved (the same file on disk, unchanged). */
  private followMovedSounds(removed: Entry[]): void {
    let touched = false;
    for (const gone of removed) {
      if (!this.buttons.some((b) => b.soundId === gone.id)) continue;
      const matches = [...this.sounds.values()].filter((e) => sameSource(e, gone));
      const target = matches.length === 1 ? matches[0]?.id : undefined;
      if (!target) continue;
      for (const b of this.buttons) {
        if (b.soundId !== gone.id) continue;
        b.soundId = target;
        touched = true;
      }
    }
    if (touched) this.persistButtons();
  }

  private async walk(): Promise<Array<{ abs: string; rel: string }>> {
    const found: Array<{ abs: string; rel: string }> = [];
    const visit = async (absDir: string, relDir: string, depth: number): Promise<void> => {
      let entries: Dirent[];
      try {
        entries = await readdir(absDir, { withFileTypes: true });
      } catch (err) {
        if (depth > 0) {
          this.log.warn({ dir: absDir, err: (err as Error).message }, 'sfx: could not read a folder');
          return;
        }
        // the sounds folder itself: create it again when it was deleted, otherwise say what is wrong
        if (errCode(err) !== 'ENOENT') throw this.folderError(err);
        await mkdir(absDir, { recursive: true }).catch((mkdirErr: unknown) => {
          throw this.folderError(mkdirErr);
        });
        return;
      }
      entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const d of entries) {
        if (isIgnoredName(d.name)) continue;
        const abs = path.join(absDir, d.name);
        const rel = relDir ? `${relDir}/${d.name}` : d.name;
        if (d.isDirectory()) {
          // symlinked folders are not followed (no loops); the cache folder is never scanned
          if (depth < MAX_DEPTH && path.relative(this.cacheDir, abs) !== '') await visit(abs, rel, depth + 1);
        } else if ((d.isFile() || d.isSymbolicLink()) && isAudioName(d.name)) {
          found.push({ abs, rel });
        }
      }
    };
    await visit(this.dir, '', 0);
    return found;
  }

  /** Cached WAV files by sound id, then by rev. */
  private async readCacheIndex(): Promise<CacheIndex> {
    const index: CacheIndex = new Map();
    let names: string[];
    try {
      names = await readdir(this.cacheDir);
    } catch {
      return index;
    }
    for (const name of names) {
      const m = CACHE_FILE.exec(name);
      const id = m?.[1];
      const rev = m?.[2];
      if (!id || !rev) continue;
      let revs = index.get(id);
      if (!revs) {
        revs = new Map();
        index.set(id, revs);
      }
      revs.set(rev, path.join(this.cacheDir, name));
    }
    return index;
  }

  private async adoptCacheOrConvert(e: Entry, revs: Map<string, string> | undefined): Promise<void> {
    const exact = revs?.get(e.rev);
    if (exact) {
      const ready = await this.readReady(e.rev, exact);
      if (ready) {
        e.ready = ready;
        e.error = null;
        return;
      }
    }
    if (!e.ready && revs) {
      // play an older conversion while the new one runs (e.g. normalize was toggled while offline)
      for (const [rev, file] of revs) {
        if (rev === e.rev) continue;
        const ready = await this.readReady(rev, file);
        if (ready) {
          e.ready = ready;
          break;
        }
      }
    }
    this.convert(e);
  }

  private async readReady(rev: string, file: string): Promise<Ready | null> {
    try {
      const info = await readWavInfo(file);
      return { rev, path: file, durationMs: Math.round(info.durationMs) };
    } catch {
      await rm(file, { force: true }).catch(() => {});
      return null;
    }
  }

  private convert(e: Entry): void {
    const key = jobKey(e.id, e.rev);
    if (this.stopped || this.jobs.has(key)) return;
    const { id, rev, normalize, abs } = e;
    const output = path.join(this.cacheDir, `${key}.wav`);
    const cancel = new AbortController();
    e.error = null;
    const done = convertToWav({
      input: abs,
      output,
      normalize,
      ffmpegPath: this.ffmpegPath,
      signal: AbortSignal.any([this.abort.signal, cancel.signal]),
    })
      .then(async ({ durationMs }) => {
        const current = this.sounds.get(id);
        if (!current || current.rev !== rev) {
          await rm(output, { force: true }).catch(() => {});
          return;
        }
        const previous = current.ready;
        current.ready = { rev, path: output, durationMs };
        current.error = null;
        // the stale cache of the same sound goes away once the new one is in place
        if (previous && previous.path !== output) await rm(previous.path, { force: true }).catch(() => {});
        this.changed();
      })
      .catch(async (err: unknown) => {
        // cancelled by stop() or deleteSound(): whoever cancelled it takes care of the sound
        if (this.stopped || (err instanceof ConvertError && err.code === 'aborted')) return;
        const current = this.sounds.get(id);
        if (!current || current.rev !== rev) return;
        this.log.warn(
          { file: current.file, err: err instanceof ConvertError ? (err.detail ?? err.code) : String(err) },
          'sfx conversion failed',
        );
        const stale = current.ready;
        current.ready = null;
        current.error =
          err instanceof ConvertError
            ? err.message
            : 'Erro: falha ao converter o som — Solução: veja o log do servidor e tente de novo';
        if (stale) await rm(stale.path, { force: true }).catch(() => {});
        this.changed();
      })
      .finally(() => {
        if (this.jobs.get(key) === job) this.jobs.delete(key);
      });
    const job: Job = { done, cancel };
    this.jobs.set(key, job);
  }

  /** Cancels the conversions of a sound and waits until ffmpeg has exited (and let go of the files). */
  private async cancelJobs(id: string): Promise<boolean> {
    const mine = [...this.jobs].filter(([key]) => key.startsWith(`${id}-`)).map(([, job]) => job);
    for (const job of mine) job.cancel.abort();
    await Promise.allSettled(mine.map((job) => job.done));
    return mine.length > 0;
  }

  /** Waits (up to `ms`) for the conversions of these sounds. */
  private async settle(ids: string[], ms: number): Promise<void> {
    const pending = ids.flatMap((id) => {
      const e = this.sounds.get(id);
      const job = e ? this.jobs.get(jobKey(e.id, e.rev)) : undefined;
      return job ? [job.done] : [];
    });
    if (!pending.length) return;
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.allSettled(pending),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ms);
      }),
    ]);
    clearTimeout(timer);
  }

  /** Deletes cached WAVs of sounds that are gone or of revs nobody plays anymore. */
  private async collectGarbage(cache: CacheIndex): Promise<void> {
    const doomed: string[] = [];
    for (const [id, revs] of cache) {
      const e = this.sounds.get(id);
      for (const [rev, file] of revs) {
        if (e && (rev === e.rev || rev === e.ready?.rev)) continue;
        doomed.push(file);
      }
    }
    await Promise.all(doomed.map((file) => rm(file, { force: true }).catch(() => {})));
  }

  private async removeCache(id: string): Promise<void> {
    let names: string[];
    try {
      names = await readdir(this.cacheDir);
    } catch {
      return;
    }
    const mine = names.filter((n) => n.startsWith(`${id}-`) && CACHE_FILE.test(n));
    await Promise.all(mine.map((n) => rm(path.join(this.cacheDir, n), { force: true }).catch(() => {})));
  }

  /** Leftovers of conversions interrupted by a crash. */
  private async removeTempFiles(): Promise<void> {
    let names: string[];
    try {
      names = await readdir(this.cacheDir);
    } catch {
      return;
    }
    const temps = names.filter((n) => n.endsWith('.tmp'));
    await Promise.all(temps.map((n) => rm(path.join(this.cacheDir, n), { force: true }).catch(() => {})));
  }

  private async register(abs: string, rel: string): Promise<Entry | null> {
    const normalize = this.settings().normalize;
    const source = await statSource(abs, normalize);
    if (!source) return null;
    const id = sfxSoundId(rel);
    const entry: Entry = { id, ...describeFile(rel), abs, ...source, normalize, ready: null, error: null };
    this.sounds.set(id, entry);
    this.convert(entry);
    return entry;
  }

  /**
   * Folder for an upload ('' = library root). A category that names an existing folder (in any case) goes
   * into it as it is, even with characters a new folder could not have ("Memes & Zoeira"); any other name
   * becomes a new folder with a safe name, or reuses one that already has that safe name.
   */
  private async uploadFolder(category: string | null | undefined): Promise<string> {
    const wanted = (category ?? '').normalize('NFC').trim();
    if (!wanted) return '';
    // readdir only returns single names, never "." or "..", so a match cannot leave the library folder
    const existing = /[\\/]/.test(wanted) ? undefined : await this.findFolder(wanted);
    if (existing) return existing;
    const clean = sanitizeCategory(wanted);
    return (await this.findFolder(clean)) ?? clean;
  }

  /** A category folder in the library root with this name, in any case (hidden folders and the cache do not count). */
  private async findFolder(name: string): Promise<string | undefined> {
    let entries: Dirent[];
    try {
      entries = await readdir(this.dir, { withFileTypes: true });
    } catch {
      return undefined;
    }
    const lower = name.normalize('NFC').toLowerCase();
    return entries.find(
      (d) =>
        d.isDirectory() &&
        !isIgnoredName(d.name) &&
        d.name.normalize('NFC').toLowerCase() === lower &&
        path.relative(this.cacheDir, path.join(this.dir, d.name)) !== '',
    )?.name;
  }

  /** "name.mp3", then "name (2).mp3", "name (3).mp3"... whatever is free on disk, in the library and in the batch. */
  private async freeName(dir: string, folder: string, name: string, taken: Set<string>): Promise<string> {
    const ext = path.extname(name);
    const base = name.slice(0, name.length - ext.length);
    for (let n = 1; n < 1000; n++) {
      const suffix = n === 1 ? '' : ` (${n})`;
      const stem =
        trimEdges(
          codePoints(base)
            .slice(0, MAX_FILE_NAME - ext.length - suffix.length)
            .join(''),
        ) || 'som';
      const candidate = `${stem}${suffix}${ext}`;
      if (taken.has(candidate.toLowerCase())) continue;
      if (this.sounds.has(sfxSoundId(folder ? `${folder}/${candidate}` : candidate))) continue;
      if (await pathExists(path.join(dir, candidate))) continue;
      return candidate;
    }
    throw new SfxError('io', 'Erro: nomes repetidos demais — Solução: renomeie o arquivo antes de enviar');
  }

  private checkSoundId(v: string | null): string | null {
    if (v === null) return null;
    if (typeof v !== 'string' || !this.sounds.has(v)) {
      throw new SfxError(
        'invalid',
        'Erro: som não encontrado — Solução: escolha um som da lista ou atualize a biblioteca',
      );
    }
    return v;
  }

  private newButtonId(): string {
    for (;;) {
      const id = `b${randomBytes(5).toString('hex')}`;
      if (!this.buttons.some((b) => b.id === id)) return id;
    }
  }

  private buttonsChanged(): void {
    this.persistButtons();
    this.changed();
  }

  private async loadButtons(): Promise<void> {
    let raw: unknown = null;
    try {
      raw = JSON.parse(await readFile(this.buttonsFile, 'utf8'));
    } catch (err) {
      if (errCode(err) !== 'ENOENT') {
        // keep the broken file instead of overwriting it on the next save
        const backup = `${this.buttonsFile}.corrupt-${Date.now()}`;
        await copyFile(this.buttonsFile, backup).catch(() => {});
        this.log.warn({ backup }, 'sfx: buttons file unreadable, starting empty (a copy was kept)');
      }
    }
    const list = isRecord(raw) && Array.isArray(raw.buttons) ? raw.buttons : [];
    const ids = new Set<string>();
    this.buttons = [];
    for (const item of list) {
      const b = coerceButton(item);
      if (!b || ids.has(b.id)) continue;
      ids.add(b.id);
      this.buttons.push(b);
    }
  }

  private persistButtons(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.writeButtons();
    }, SAVE_DEBOUNCE_MS);
  }

  /** Writes are chained, so two saves never race on the same temp file. */
  private writeButtons(): Promise<void> {
    const data: ButtonsFile = { version: 1, buttons: this.buttons.map(shapeButton) };
    this.saving = this.saving
      .then(() => this.store.writeNow(data))
      .catch((err: unknown) => this.log.warn({ err: (err as Error).message }, 'sfx: could not save the buttons'));
    return this.saving;
  }

  private async flushButtons(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      await this.writeButtons();
    } else {
      await this.saving;
    }
  }

  // ---------------------------------------------------------------------------------------- watching

  /**
   * Creates and scans the sounds folder, then watches it. A missing drive or network share, a blocked
   * folder or a file in its place does not stop the server: the error is logged once and the folder is
   * tried again every `retryMs` until it opens.
   */
  private async openDir(): Promise<void> {
    if (this.stopped) return;
    try {
      await mkdir(this.dir, { recursive: true }).catch((err: unknown) => {
        throw this.folderError(err);
      });
      await this.scan();
    } catch (err) {
      if (!this.dirDown) {
        this.dirDown = true;
        this.log.error({}, this.folderError(err).message);
      }
      this.retryOpen();
      return;
    }
    if (this.dirDown) {
      this.dirDown = false;
      this.log.info({ dir: this.dir }, 'sfx: a pasta de sons abriu de novo');
    }
    if (this.watchEnabled) this.watchDir();
  }

  /** "Erro: ... — Solução: ..." for a sounds folder that cannot be created or read. */
  private folderError(err: unknown): SfxError {
    if (err instanceof SfxError) return err;
    return new SfxError(
      'io',
      `Erro: a pasta de sons "${this.dir}" não abriu (${errCode(err)}) — Solução: conecte o disco ou ajuste SOUNDS_DIR no .env; o stream95 tenta de novo sozinho`,
    );
  }

  private watchDir(): void {
    if (this.stopped || this.watcher) return;
    try {
      const watcher = watchFs(this.dir, { recursive: true, persistent: false }, (_event, filename) =>
        this.onFsEvent(filename),
      );
      watcher.on('error', (err) => {
        this.log.warn({ err: err.message }, 'sfx: folder watch stopped, retrying');
        watcher.close();
        if (this.watcher === watcher) this.watcher = null;
        this.retryOpen();
      });
      this.watcher = watcher;
    } catch (err) {
      this.log.warn({ err: (err as Error).message }, 'sfx: could not watch the sounds folder, retrying');
      this.retryOpen();
    }
  }

  /** Opens the folder again (create, scan, watch) after `retryMs`. */
  private retryOpen(): void {
    if (this.stopped || this.watchRetry) return;
    this.watchRetry = setTimeout(() => {
      this.watchRetry = null;
      void this.openDir();
    }, this.retryMs);
  }

  private onFsEvent(filename: string | null): void {
    if (filename) {
      const rel = filename.replace(/\\/g, '/');
      if (isIgnoredName(rel.split('/').pop() ?? rel)) return;
      const cacheRel = path.relative(this.dir, this.cacheDir).replace(/\\/g, '/');
      const cacheInside = cacheRel !== '' && !cacheRel.startsWith('..') && !path.isAbsolute(cacheRel);
      if (cacheInside && (rel === cacheRel || rel.startsWith(`${cacheRel}/`))) return;
    }
    this.scheduleScan();
  }

  /** Debounced rescan (400 ms of quiet, but never more than 3 s after the first change). */
  private scheduleScan(): void {
    if (this.stopped) return;
    const now = Date.now();
    if (!this.scanTimer) this.firstEventAt = now;
    else clearTimeout(this.scanTimer);
    const wait = Math.min(WATCH_DEBOUNCE_MS, Math.max(0, this.firstEventAt + WATCH_MAX_WAIT_MS - now));
    this.scanTimer = setTimeout(() => {
      this.scanTimer = null;
      this.scan().catch((err: unknown) =>
        this.log.warn({ err: (err as Error).message }, 'sfx: rescan after a folder change failed'),
      );
    }, wait);
  }
}
