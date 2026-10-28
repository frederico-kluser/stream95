import { execFile } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  defaultSettings,
  type ServerEvent,
  SFX_MAX_DURATION_MS,
  type SfxButton,
  type SfxLibrary,
  type SfxSound,
  sfxSoundId,
} from '@stream95/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Logger, silentLogger } from '../src/log.js';
import { ConvertError, convertToWav, DEFAULT_FFMPEG_PATH, readWavInfo } from '../src/sfx/convert.js';
import { documentsDir, expandWindowsVars, regExportValue, sfxPaths } from '../src/sfx/index.js';
import {
  SfxError,
  SoundLibrary,
  type SoundLibraryOptions,
  sanitizeCategory,
  sanitizeFileName,
} from '../src/sfx/library.js';
import { registerSfxRoutes, type SfxRoutes } from '../src/sfx/routes.js';

const execFileAsync = promisify(execFile);
const root = mkdtempSync(path.join(tmpdir(), 'stream95-sfx-'));
const inputs = path.join(root, 'inputs');
const input = (name: string) => path.join(inputs, name);
const libraries: SoundLibrary[] = [];
const ERROR_FORMAT = /^Erro: .+ — Solução: .+/;

const ffmpeg = (...args: string[]) =>
  execFileAsync(DEFAULT_FFMPEG_PATH, ['-hide_banner', '-v', 'error', '-y', ...args], { windowsHide: true });
/** 300 ms of silence, then a 400 ms tone. */
const delayedTone = [
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=440:duration=0.4',
  '-af',
  'adelay=300:all=1',
  '-ac',
  '1',
  '-ar',
  '44100',
];

beforeAll(async () => {
  mkdirSync(inputs, { recursive: true });
  await Promise.all([
    ffmpeg(...delayedTone, '-c:a', 'libmp3lame', '-b:a', '128k', input('tone.mp3')),
    ffmpeg(...delayedTone, '-c:a', 'libvorbis', input('tone.ogg')),
    // the same tone followed by 3 s of silence (like a clip exported with a long tail)
    ffmpeg(
      ...delayedTone.slice(0, 5),
      'adelay=300:all=1,apad=pad_dur=3',
      '-ac',
      '1',
      '-ar',
      '44100',
      input('tail.wav'),
    ),
    ffmpeg(
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=8000:duration=121',
      '-c:a',
      'pcm_s16le',
      input('long.wav'),
    ),
    ffmpeg('-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono', '-t', '1', '-c:a', 'pcm_s16le', input('silence.wav')),
    // ~190 KB, well above the server's 64 KB JSON body limit
    ffmpeg('-f', 'lavfi', '-i', 'sine=frequency=660:duration=1', '-ac', '2', '-ar', '48000', input('big.wav')),
    // 4 s of tone with no silence at either end (nothing for the silence passes to trim), also at
    // 192 kHz and at 96 kHz one sample short: lengths where loudnorm's last chunk is only 1-3 samples
    ffmpeg('-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', input('sine4.wav')),
    ffmpeg('-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=192000:duration=4', input('sine4-192k.wav')),
    ffmpeg(
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=96000:duration=5',
      '-af',
      'atrim=end_sample=383999',
      input('sine4-96k.wav'),
    ),
    // three different sounds with the very same size
    ...[220, 440, 880].map((hz) =>
      ffmpeg('-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=1`, '-c:a', 'pcm_s16le', input(`same-${hz}.wav`)),
    ),
  ]);
  writeFileSync(input('broken.mp3'), 'definitely not an mp3 file');
}, 30_000);

afterAll(async () => {
  await Promise.all(libraries.map((l) => l.stop()));
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

type Wav = { format: number; channels: number; sampleRate: number; bits: number; samples: Buffer };

/** Independent RIFF reader, so the checks do not trust readWavInfo. */
function parseWav(file: string): Wav {
  const b = readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV');
  let fmt: Omit<Wav, 'samples'> | null = null;
  for (let pos = 12; pos + 8 <= b.length; ) {
    const id = b.toString('ascii', pos, pos + 4);
    const len = b.readUInt32LE(pos + 4);
    if (id === 'fmt ') {
      fmt = {
        format: b.readUInt16LE(pos + 8),
        channels: b.readUInt16LE(pos + 10),
        sampleRate: b.readUInt32LE(pos + 12),
        bits: b.readUInt16LE(pos + 22),
      };
    }
    if (id === 'data' && fmt) return { ...fmt, samples: b.subarray(pos + 8, pos + 8 + len) };
    pos += 8 + len + (len % 2);
  }
  throw new Error('no data chunk');
}

/** Milliseconds until the first sample above ~-40 dBFS (48 kHz, stereo, 16-bit). */
function leadingSilenceMs(samples: Buffer): number {
  for (let i = 0; i + 1 < samples.length; i += 2) {
    if (Math.abs(samples.readInt16LE(i)) > 300) return Math.floor(i / 4) / 48;
  }
  return Number.POSITIVE_INFINITY;
}

function newLibrary(name: string, over: Partial<SoundLibraryOptions> = {}) {
  const base = path.join(root, name);
  const dir = path.join(base, 'sons');
  const cacheDir = path.join(base, 'cache');
  const settings = defaultSettings();
  const library = new SoundLibrary({
    dir,
    cacheDir,
    buttonsFile: path.join(base, 'sfx-buttons.json'),
    log: silentLogger,
    settings: () => settings.sfx,
    watch: false,
    ...over,
  });
  libraries.push(library);
  return { library, settings, base, dir, cacheDir };
}

function place(dir: string, rel: string, from: string): void {
  const target = path.join(dir, rel);
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(from, target);
}

const cacheFiles = (dir: string) =>
  readdirSync(dir)
    .filter((n) => n.endsWith('.wav'))
    .sort();

async function waitFor(check: () => boolean, ms = 5000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error('timed out waiting for a condition');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function multipart(files: { name: string; data: Buffer }[], category?: string) {
  const form = new FormData();
  if (category !== undefined) form.append('category', category);
  for (const f of files) form.append('file', new Blob([new Uint8Array(f.data)]), f.name);
  const request = new Request('http://localhost/api/sfx/upload', { method: 'POST', body: form });
  return {
    payload: Buffer.from(await request.arrayBuffer()),
    headers: { 'content-type': request.headers.get('content-type') ?? '' },
  };
}

describe('convertToWav', () => {
  it.each([
    { name: 'tone.mp3', normalize: true },
    { name: 'tone.ogg', normalize: false },
  ])('turns $name into 48 kHz stereo 16-bit PCM without the leading silence', async ({ name, normalize }) => {
    const output = path.join(root, `${name}.wav`);
    const { durationMs } = await convertToWav({
      input: input(name),
      output,
      normalize,
      ffmpegPath: DEFAULT_FFMPEG_PATH,
    });
    const wav = parseWav(output);
    expect({ format: wav.format, channels: wav.channels, sampleRate: wav.sampleRate, bits: wav.bits }).toEqual({
      format: 1,
      channels: 2,
      sampleRate: 48_000,
      bits: 16,
    });
    // 400 ms of tone plus the 20 ms of silence that is kept; the 300 ms lead-in is gone
    expect(durationMs).toBeGreaterThan(380);
    expect(durationMs).toBeLessThan(520);
    expect(Math.abs(wav.samples.length / 4 / 48 - durationMs)).toBeLessThan(2);
    const lead = leadingSilenceMs(wav.samples);
    expect(lead).toBeGreaterThan(5);
    expect(lead).toBeLessThan(60);
    expect((await readWavInfo(output)).durationMs).toBeCloseTo(durationMs, -1);
    expect(existsSync(`${output}.tmp`)).toBe(false);
  });

  it('trims the silence at the end too, keeping a short natural decay', async () => {
    const output = path.join(root, 'tail-out.wav');
    const { durationMs } = await convertToWav({
      input: input('tail.wav'),
      output,
      normalize: false,
      ffmpegPath: DEFAULT_FFMPEG_PATH,
    });
    // 400 ms of tone + ~20 ms kept before + up to ~100 ms kept after; the 3 s tail is gone
    expect(durationMs).toBeGreaterThan(380);
    expect(durationMs).toBeLessThan(600);
  });

  it.each(['sine4.wav', 'sine4-192k.wav', 'sine4-96k.wav'])(
    'normalizes %s, with no silence to trim at either end (ffmpeg 6.1 used to stall until the timeout)',
    async (name) => {
      const output = path.join(root, `${name}-normalized.wav`);
      const { durationMs } = await convertToWav({
        input: input(name),
        output,
        normalize: true,
        ffmpegPath: DEFAULT_FFMPEG_PATH,
        timeoutMs: 10_000,
      });
      expect(durationMs).toBeGreaterThan(3990);
      expect(durationMs).toBeLessThan(4010);
      expect(parseWav(output)).toMatchObject({ format: 1, channels: 2, sampleRate: 48_000, bits: 16 });
    },
    15_000,
  );

  it('rejects sounds longer than the limit and deletes the result', async () => {
    expect(SFX_MAX_DURATION_MS).toBe(120_000);
    const output = path.join(root, 'long-out.wav');
    const err = await convertToWav({
      input: input('long.wav'),
      output,
      normalize: false,
      ffmpegPath: DEFAULT_FFMPEG_PATH,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConvertError);
    expect((err as ConvertError).code).toBe('too_long');
    expect((err as Error).message).toMatch(ERROR_FORMAT);
    expect(existsSync(output)).toBe(false);
    expect(existsSync(`${output}.tmp`)).toBe(false);
  });

  it('explains files that are not audio, only silence, or a missing ffmpeg', async () => {
    const convert = (name: string, ffmpegPath = DEFAULT_FFMPEG_PATH) =>
      convertToWav({
        input: input(name),
        output: path.join(root, `${name}-out.wav`),
        normalize: false,
        ffmpegPath,
      }).then(
        () => {
          throw new Error(`${name} should not convert`);
        },
        (e: unknown) => e as ConvertError,
      );
    const broken = await convert('broken.mp3');
    expect(broken).toMatchObject({ code: 'unreadable' });
    expect(broken.message).toMatch(ERROR_FORMAT);
    expect(await convert('silence.wav')).toMatchObject({ code: 'empty' });
    expect(existsSync(path.join(root, 'silence.wav-out.wav'))).toBe(false);
    expect(await convert('tone.ogg', path.join(root, 'no-ffmpeg-here'))).toMatchObject({ code: 'no_ffmpeg' });
  });

  it('stops when aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const err = await convertToWav({
      input: input('tone.mp3'),
      output: path.join(root, 'aborted.wav'),
      normalize: false,
      ffmpegPath: DEFAULT_FFMPEG_PATH,
      signal: ctrl.signal,
    }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'aborted' });
    expect(existsSync(path.join(root, 'aborted.wav'))).toBe(false);
  });
});

describe('SoundLibrary', () => {
  it('scans categories, skips junk and keeps ids and cache across restarts', async () => {
    const { library, dir, cacheDir } = newLibrary('scan');
    place(dir, 'Bruh.mp3', input('tone.mp3'));
    place(dir, 'memes/Ai que delícia.ogg', input('tone.ogg'));
    place(dir, 'memes/fundo/eco.mp3', input('tone.mp3'));
    for (const junk of ['.oculto.mp3', '~$trava.mp3', 'baixando.mp3.crdownload', 'quase.part', 'notas.txt']) {
      place(dir, junk, input('tone.mp3'));
    }
    place(dir, '.git/x.mp3', input('tone.mp3'));
    await library.start();
    await library.idle();
    const first = library.snapshot();
    expect(first.dir).toBe(path.resolve(dir));
    expect(first.sounds.map((s) => [s.file, s.category, s.name])).toEqual([
      ['Bruh.mp3', '', 'Bruh'],
      ['memes/Ai que delícia.ogg', 'memes', 'Ai que delícia'],
      ['memes/fundo/eco.mp3', 'memes', 'eco'],
    ]);
    for (const s of first.sounds) {
      expect(s.id).toBe(sfxSoundId(s.file));
      expect(s.status).toBe('ready');
      expect(s.rev).toMatch(/^[0-9a-f]{10}$/);
      expect(s.durationMs).toBeGreaterThan(380);
      expect(library.wavFor(s.id)?.path).toBe(path.join(cacheDir, `${s.id}-${s.rev}.wav`));
    }
    expect(cacheFiles(cacheDir)).toHaveLength(3);
    await library.stop();

    // a server restart finds the same ids and reuses the converted files
    const again = newLibrary('scan').library;
    await again.start();
    expect(again.snapshot().sounds).toEqual(first.sounds);
    expect(cacheFiles(cacheDir)).toHaveLength(3);
  });

  it('converts again when normalize changes and drops the stale cache', async () => {
    const { library, settings, dir, cacheDir } = newLibrary('normalize');
    place(dir, 'a.mp3', input('tone.mp3'));
    place(dir, 'b.ogg', input('tone.ogg'));
    await library.start();
    await library.idle();
    const before = library.snapshot().sounds.map((s) => s.rev);
    settings.sfx.normalize = false;
    await library.settingsChanged();
    // the previous conversion keeps playing while the new one runs
    expect(library.snapshot().sounds.every((s) => s.status === 'ready')).toBe(true);
    await library.idle();
    const after = library.snapshot().sounds;
    expect(after.every((s) => s.status === 'ready' && !before.includes(s.rev))).toBe(true);
    expect(cacheFiles(cacheDir)).toEqual(after.map((s) => `${s.id}-${s.rev}.wav`).sort());
  });

  it('keeps the buttons across instances', async () => {
    const { library, dir, base } = newLibrary('buttons');
    place(dir, 'eita.mp3', input('tone.mp3'));
    await library.start();
    let changes = 0;
    library.onChange(() => changes++);
    const soundId = sfxSoundId('eita.mp3');
    const a = library.createButton({ label: '  Eita  ', soundId });
    expect(a).toEqual({ id: a.id, label: 'Eita', soundId, color: 'slate', volume: 0.9 });
    expect(a.id).toMatch(/^b[0-9a-f]{10}$/);
    const b = library.createButton({ label: 'Risada', soundId: null, emoji: '😂', color: 'amber', volume: 0.5 });
    const c = library.createButton({ label: 'Tchau', soundId });
    expect(library.updateButton(b.id, { soundId, emoji: '', color: 'pink' })).toEqual({
      id: b.id,
      label: 'Risada',
      soundId,
      color: 'pink',
      volume: 0.5,
    });
    expect(library.updateButton('bnada', { label: 'x' })).toBeNull();
    expect(library.reorder([c.id, 'bnada', a.id]).map((x) => x.id)).toEqual([c.id, a.id, b.id]);
    expect(library.deleteButton(a.id)).toBe(true);
    expect(library.deleteButton(a.id)).toBe(false);
    const expected = library.snapshot().buttons;
    await waitFor(() => changes > 0);
    await library.stop();

    expect(JSON.parse(readFileSync(path.join(base, 'sfx-buttons.json'), 'utf8'))).toEqual({
      version: 1,
      buttons: expected,
    });
    const again = newLibrary('buttons').library;
    await again.start();
    expect(again.snapshot().buttons).toEqual(expected);
  });

  it('validates buttons and survives a broken buttons file', async () => {
    const { library, base } = newLibrary('validation');
    mkdirSync(base, { recursive: true });
    writeFileSync(path.join(base, 'sfx-buttons.json'), '{ not json');
    await library.start();
    expect(library.snapshot().buttons).toEqual([]);
    expect(readdirSync(base).some((n) => n.startsWith('sfx-buttons.json.corrupt-'))).toBe(true);
    const bad: Parameters<SoundLibrary['createButton']>[0][] = [
      { label: '', soundId: null },
      { label: 'x'.repeat(33), soundId: null },
      { label: 'ok', soundId: 'snaoexiste' },
      { label: 'ok', soundId: null, emoji: '123456789' },
      { label: 'ok', soundId: null, color: 'purple' as never },
      { label: 'ok', soundId: null, volume: 1.5 },
    ];
    for (const item of bad) expect(() => library.createButton(item)).toThrow(SfxError);
    // labels and emoji count characters, not UTF-16 units
    const family = '👨‍👩‍👧‍👦';
    expect(library.createButton({ label: '🔥'.repeat(32), soundId: null, emoji: family }).emoji).toBe(family);
  });

  it('deleteSound removes the file and its cache and unmaps the buttons', async () => {
    const { library, dir, cacheDir } = newLibrary('delete');
    place(dir, 'memes/apagar.mp3', input('tone.mp3'));
    place(dir, 'fica.mp3', input('tone.mp3'));
    await library.start();
    await library.idle();
    const id = sfxSoundId('memes/apagar.mp3');
    const button = library.createButton({ label: 'Apagar', soundId: id });
    expect(await library.deleteSound(id)).toBe(true);
    expect(existsSync(path.join(dir, 'memes', 'apagar.mp3'))).toBe(false);
    expect(cacheFiles(cacheDir).some((n) => n.startsWith(`${id}-`))).toBe(false);
    expect(cacheFiles(cacheDir)).toHaveLength(1);
    expect(library.get(id)).toBeNull();
    expect(library.snapshot().buttons.find((b) => b.id === button.id)?.soundId).toBeNull();
    expect(await library.deleteSound(id)).toBe(false);
  });

  it('cancels a running conversion before deleting its sound', async () => {
    const { library, dir, cacheDir } = newLibrary('delete-converting');
    place(dir, 'longo.wav', input('long.wav'));
    await library.start();
    const id = sfxSoundId('longo.wav');
    // ffmpeg is running and holds the source open (Windows refuses to delete it meanwhile)
    await waitFor(() => readdirSync(cacheDir).some((n) => n.endsWith('.tmp')));
    expect(library.get(id)?.status).toBe('converting');
    expect(await library.deleteSound(id)).toBe(true);
    expect(existsSync(path.join(dir, 'longo.wav'))).toBe(false);
    await library.idle();
    expect(library.get(id)).toBeNull();
    expect(readdirSync(cacheDir)).toEqual([]);
  });

  it('converts again when the delete fails after cancelling the conversion', async () => {
    // both conversion slots busy, so the next sound waits in the queue
    const busy = newLibrary('delete-busy');
    place(busy.dir, 'a.wav', input('long.wav'));
    place(busy.dir, 'b.wav', input('long.wav'));
    await busy.library.start();
    await waitFor(() => readdirSync(busy.cacheDir).filter((n) => n.endsWith('.tmp')).length === 2);
    const { library, dir } = newLibrary('delete-fails');
    place(dir, 'preso.mp3', input('tone.mp3'));
    await library.start();
    const id = sfxSoundId('preso.mp3');
    expect(library.get(id)?.status).toBe('converting');
    // something the delete cannot remove (here a folder took the file's name)
    rmSync(path.join(dir, 'preso.mp3'));
    mkdirSync(path.join(dir, 'preso.mp3', 'dentro'), { recursive: true });
    const err = await library.deleteSound(id).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'io' });
    expect((err as Error).message).toMatch(ERROR_FORMAT);
    // the cancelled conversion starts over (and fails on the folder) instead of staying "converting" for good
    await busy.library.stop();
    await library.idle();
    expect(library.get(id)).toMatchObject({ status: 'error' });
  });

  it('keeps the buttons of a sound that vanished from the folder', async () => {
    const { library, dir } = newLibrary('vanish');
    place(dir, 'some.mp3', input('tone.mp3'));
    await library.start();
    await library.idle();
    const id = sfxSoundId('some.mp3');
    const button = library.createButton({ label: 'Some', soundId: id });
    rmSync(path.join(dir, 'some.mp3'));
    await library.scan();
    expect(library.get(id)).toBeNull();
    expect(library.snapshot().buttons[0]?.soundId).toBe(id);
    expect(library.resolvePlay({ buttonId: button.id })).toMatchObject({ ok: false, error: 'not_found' });
    // keeping the vanished sound while renaming is fine
    expect(library.updateButton(button.id, { label: 'Sumiu', soundId: id })?.soundId).toBe(id);
  });

  it('lets the buttons and the converted file follow a sound that was moved or renamed', async () => {
    const { library, dir, cacheDir } = newLibrary('move');
    place(dir, 'velho.mp3', input('tone.mp3'));
    place(dir, 'outro.ogg', input('tone.ogg'));
    await library.start();
    await library.idle();
    const oldId = sfxSoundId('velho.mp3');
    const button = library.createButton({ label: 'Velho', soundId: oldId });
    const other = library.createButton({ label: 'Outro', soundId: sfxSoundId('outro.ogg') });
    mkdirSync(path.join(dir, 'memes'));
    renameSync(path.join(dir, 'velho.mp3'), path.join(dir, 'memes', 'novo.mp3'));
    rmSync(path.join(dir, 'outro.ogg'));
    await library.scan();
    const newId = sfxSoundId('memes/novo.mp3');
    // ready right after the scan: the converted WAV moved with the file, nothing was converted again
    const moved = library.get(newId);
    expect(moved).toMatchObject({ status: 'ready', category: 'memes', name: 'novo' });
    expect(library.get(oldId)).toBeNull();
    expect(cacheFiles(cacheDir)).toEqual([`${newId}-${moved?.rev}.wav`]);
    const buttons = library.snapshot().buttons;
    expect(buttons.find((b) => b.id === button.id)?.soundId).toBe(newId);
    // a sound that really vanished keeps its button as it was
    expect(buttons.find((b) => b.id === other.id)?.soundId).toBe(sfxSoundId('outro.ogg'));
  });

  it('never takes a different file with the same size and date for a moved one', async () => {
    const { library, dir, cacheDir } = newLibrary('same-rev');
    const when = new Date('2024-05-01T12:00:00Z');
    const put = (rel: string, from: string) => {
      place(dir, rel, input(from));
      utimesSync(path.join(dir, rel), when, when);
    };
    put('grave.wav', 'same-220.wav');
    put('agudo.wav', 'same-440.wav');
    await library.start();
    await library.idle();
    const grave = sfxSoundId('grave.wav');
    const agudo = sfxSoundId('agudo.wav');
    // same size and mtime: the same rev, so only the file identity tells them apart
    expect(library.get(grave)?.rev).toBe(library.get(agudo)?.rev);
    const button = library.createButton({ label: 'Grave', soundId: grave });

    // deleting one does not hand its buttons to the other
    rmSync(path.join(dir, 'grave.wav'));
    await library.scan();
    expect(library.snapshot().buttons.find((b) => b.id === button.id)?.soundId).toBe(grave);

    // a new file that shows up while another goes away is converted, not given the other's WAV
    const agudoWav = readFileSync(library.wavFor(agudo)?.path ?? '');
    put('ruido.wav', 'same-880.wav');
    rmSync(path.join(dir, 'agudo.wav'));
    await library.scan();
    await library.idle();
    const ruido = library.wavFor(sfxSoundId('ruido.wav'));
    expect(ruido).not.toBeNull();
    expect(readFileSync(ruido?.path ?? '').equals(agudoWav)).toBe(false);
    expect(cacheFiles(cacheDir)).toEqual([path.basename(ruido?.path ?? '')]);
  });

  it('converts again a converted file deleted by hand', async () => {
    const { library, dir } = newLibrary('lost-cache');
    place(dir, 'some.mp3', input('tone.mp3'));
    await library.start();
    await library.idle();
    const id = sfxSoundId('some.mp3');
    const wav = library.wavFor(id);
    expect(wav).not.toBeNull();
    rmSync(wav?.path ?? '');
    await library.scan();
    await library.idle();
    expect(library.get(id)?.status).toBe('ready');
    expect(library.wavFor(id)).toEqual(wav);
    expect(existsSync(wav?.path ?? '')).toBe(true);
  });

  it('starts without its sounds folder, keeps the buttons and opens the folder once it is back', async () => {
    const errors: string[] = [];
    const log: Logger = {
      ...silentLogger,
      error: (_obj, msg) => {
        errors.push(msg ?? '');
      },
    };
    const { library, dir, base } = newLibrary('no-folder', { log, retryMs: 30 });
    const stored = { id: 'bfica', label: 'Fica', soundId: sfxSoundId('volta.mp3'), color: 'slate', volume: 0.9 };
    mkdirSync(base, { recursive: true });
    writeFileSync(path.join(base, 'sfx-buttons.json'), JSON.stringify({ version: 1, buttons: [stored] }));
    // a file where the folder should be: like an unplugged drive, the folder cannot be created
    writeFileSync(dir, 'não é uma pasta');
    await library.start();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(ERROR_FORMAT);
    expect(errors[0]).toContain(path.resolve(dir));
    expect(library.snapshot()).toMatchObject({ sounds: [], buttons: [stored] });
    const upload = library.upload([{ filename: 'x.mp3', data: readFileSync(input('tone.mp3')) }]);
    await expect(upload).rejects.toMatchObject({ code: 'io', message: expect.stringMatching(ERROR_FORMAT) });

    // the folder shows up: a retry scans it, without logging the error again
    rmSync(dir);
    place(dir, 'volta.mp3', input('tone.mp3'));
    await waitFor(() => library.get(stored.soundId)?.status === 'ready');
    expect(errors).toHaveLength(1);
    expect(library.resolvePlay({ buttonId: 'bfica' })).toMatchObject({ ok: true });
    await library.stop();
    expect(JSON.parse(readFileSync(path.join(base, 'sfx-buttons.json'), 'utf8')).buttons).toEqual([stored]);
  });

  it('resolves what to play and how loud', async () => {
    const { library, settings, dir } = newLibrary('play');
    place(dir, 'ok.mp3', input('tone.mp3'));
    place(dir, 'quebrado.mp3', input('broken.mp3'));
    await library.start();
    await library.idle();
    const ok = sfxSoundId('ok.mp3');
    const broken = library.get(sfxSoundId('quebrado.mp3'));
    expect(broken).toMatchObject({ status: 'error' });
    expect(broken?.error).toMatch(ERROR_FORMAT);
    const button = library.createButton({ label: 'Ok', soundId: ok, volume: 0.5 });
    settings.sfx.volume = 0.8;
    expect(library.resolvePlay({ buttonId: button.id })).toMatchObject({ ok: true, volume: 0.4, sound: { id: ok } });
    expect(library.resolvePlay({ soundId: ok })).toMatchObject({ ok: true, volume: 0.8 });
    expect(library.resolvePlay({ soundId: broken!.id })).toMatchObject({ ok: false, error: 'not_ready' });
    expect(library.resolvePlay({ soundId: 'snada' })).toMatchObject({ ok: false, error: 'not_found' });
    expect(library.resolvePlay({ buttonId: 'bnada' })).toMatchObject({ ok: false, error: 'not_found' });
    const empty = library.createButton({ label: 'Vazio', soundId: null });
    expect(library.resolvePlay({ buttonId: empty.id })).toMatchObject({ ok: false, error: 'not_found' });
  });

  it('sanitizes upload names and categories', () => {
    expect(sanitizeFileName('C:\\Users\\x\\Downloads\\Som <legal>?.WAV')).toBe('Som legal.wav');
    expect(sanitizeFileName('/tmp/../../etc/ação (1).Mp3')).toBe('ação (1).mp3');
    expect(sanitizeFileName('  .oculto.ogg')).toBe('oculto.ogg');
    expect(sanitizeFileName('con.mp3')).toBe('_con.mp3');
    expect(sanitizeFileName('!!!.flac')).toBe('som.flac');
    expect(sanitizeFileName(`${'a'.repeat(200)}.opus`)).toHaveLength(80);
    for (const bad of ['nota.txt', 'sem-extensao', '.mp3', 'virus.mp3.exe']) {
      expect(() => sanitizeFileName(bad)).toThrow(SfxError);
    }
    expect(sanitizeCategory(undefined)).toBe('');
    expect(sanitizeCategory('  Memes:BR  ')).toBe('Memes BR');
    for (const bad of ['../fora', 'a/b', 'a\\b', '..', '.', '***'])
      expect(() => sanitizeCategory(bad)).toThrow(SfxError);
  });

  it('uploads with safe, unique names and never outside the folder', async () => {
    const { library, dir, base } = newLibrary('upload');
    place(dir, 'Bruh.mp3', input('tone.mp3'));
    await library.start();
    await library.idle();
    const mp3 = readFileSync(input('tone.mp3'));
    const ogg = readFileSync(input('tone.ogg'));

    const [evil] = await library.upload([{ filename: '../../../evil name!!.MP3', data: mp3 }]);
    expect(evil).toMatchObject({ file: 'evil name.mp3', category: '', status: 'ready' });
    expect(existsSync(path.join(dir, 'evil name.mp3'))).toBe(true);

    const dupes = await library.upload([
      { filename: 'bruh.mp3', data: mp3 },
      { filename: 'BRUH.mp3', data: mp3 },
    ]);
    expect(dupes.map((s) => s.file)).toEqual(['bruh (2).mp3', 'BRUH (3).mp3']);

    const memes = await library.upload(
      [
        { filename: 'ação.ogg', data: ogg },
        { filename: 'ação.ogg', data: ogg },
      ],
      'Memes BR',
    );
    expect(memes.map((s) => [s.file, s.category, s.status])).toEqual([
      ['Memes BR/ação.ogg', 'Memes BR', 'ready'],
      ['Memes BR/ação (2).ogg', 'Memes BR', 'ready'],
    ]);
    // an existing folder in another case is reused
    expect((await library.upload([{ filename: 'x.ogg', data: ogg }], 'memes br'))[0]?.file).toBe('Memes BR/x.ogg');

    const count = library.snapshot().sounds.length;
    for (const category of ['../fora', 'a/b', '..']) {
      await expect(library.upload([{ filename: 'x.mp3', data: mp3 }], category)).rejects.toMatchObject({
        code: 'invalid',
      });
    }
    // one bad file rejects the whole batch before anything is written
    await expect(
      library.upload([
        { filename: 'ok.mp3', data: mp3 },
        { filename: 'virus.exe', data: mp3 },
      ]),
    ).rejects.toMatchObject({ code: 'invalid' });
    expect(library.snapshot().sounds).toHaveLength(count);
    expect(readdirSync(base).sort()).toEqual(['cache', 'sons']);
    expect(readdirSync(dir).some((n) => n.endsWith('.part'))).toBe(false);
  });

  it('uploads into an existing folder as it is, even with a name a new folder could not have', async () => {
    const { library, dir } = newLibrary('upload-folders');
    for (const folder of ['Memes & Zoeira', 'a..b', '.oculta']) mkdirSync(path.join(dir, folder), { recursive: true });
    await library.start();
    const ogg = readFileSync(input('tone.ogg'));
    const send = async (category: string) => (await library.upload([{ filename: 'x.ogg', data: ogg }], category))[0];
    // the deck sends the category name it got from the library (any case works)
    expect(await send('Memes & Zoeira')).toMatchObject({ file: 'Memes & Zoeira/x.ogg', category: 'Memes & Zoeira' });
    expect((await send('memes & zoeira'))?.file).toBe('Memes & Zoeira/x (2).ogg');
    expect((await send('a..b'))?.file).toBe('a..b/x.ogg');
    // a new folder still gets a safe name, and a hidden folder is not a category
    expect((await send('Novos & Bons'))?.file).toBe('Novos Bons/x.ogg');
    expect((await send('.oculta'))?.file).toBe('oculta/x.ogg');
    for (const category of ['../Memes & Zoeira', 'Memes & Zoeira/..', '..', '.']) {
      await expect(library.upload([{ filename: 'y.ogg', data: ogg }], category)).rejects.toMatchObject({
        code: 'invalid',
      });
    }
    expect(readdirSync(dir).sort()).toEqual(['.oculta', 'Memes & Zoeira', 'Novos Bons', 'a..b', 'oculta'].sort());
  });

  it('picks up files dropped in the folder', async () => {
    const { library, dir } = newLibrary('watch', { watch: true });
    await library.start();
    let latest: SfxLibrary | null = null;
    library.onChange((lib) => {
      latest = lib;
    });
    place(dir, 'novo/chegou.ogg', input('tone.ogg'));
    const id = sfxSoundId('novo/chegou.ogg');
    await waitFor(() => library.get(id)?.status === 'ready', 8000);
    expect(library.get(id)).toMatchObject({ category: 'novo', name: 'chegou' });
    await waitFor(
      () => (latest as SfxLibrary | null)?.sounds.some((s) => s.id === id && s.status === 'ready') ?? false,
    );
  }, 15_000);
});

describe('sfx routes', () => {
  let app: FastifyInstance;
  let routes: SfxRoutes;
  let library: SoundLibrary;
  let settings: ReturnType<typeof defaultSettings>;
  const events: ServerEvent[] = [];
  const H = { 'content-type': 'application/json' };
  const bruh = sfxSoundId('bruh.mp3');
  const ruim = sfxSoundId('ruim.mp3');

  beforeAll(async () => {
    const lib = newLibrary('routes');
    library = lib.library;
    settings = lib.settings;
    place(lib.dir, 'bruh.mp3', input('tone.mp3'));
    place(lib.dir, 'ruim.mp3', input('broken.mp3'));
    await library.start();
    await library.idle();
    // same JSON body limit as the real server: uploads must not depend on it
    app = Fastify({ logger: false, bodyLimit: 64 * 1024 });
    routes = registerSfxRoutes(app, {
      library,
      settings: () => settings,
      broadcast: (e) => events.push(e),
      log: silentLogger,
    });
    await app.ready();
  }, 20_000);

  afterAll(async () => {
    await app?.close();
  });

  it('lists the library', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/sfx' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as SfxLibrary;
    expect(body.sounds.map((s) => [s.file, s.status])).toEqual([
      ['bruh.mp3', 'ready'],
      ['ruim.mp3', 'error'],
    ]);
  });

  it('creates, edits, orders and deletes buttons', async () => {
    const post = (payload: object) => app.inject({ method: 'POST', url: '/api/sfx/buttons', headers: H, payload });
    const created = await post({ label: 'Bruh', soundId: bruh, emoji: '💀', color: 'violet', volume: 0.5 });
    expect(created.statusCode).toBe(200);
    const a = created.json() as SfxButton;
    expect(a).toMatchObject({ label: 'Bruh', soundId: bruh, emoji: '💀', color: 'violet', volume: 0.5 });
    const b = (await post({ label: 'Vazio' })).json() as SfxButton;
    expect(b).toMatchObject({ soundId: null, color: 'slate', volume: 0.9 });

    const invalid = await post({ label: '', color: 'gold' });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error).toMatch(/^Erro: corpo inválido — Solução: /);
    expect(invalid.json().error).toContain('label: use de 1 a 32 caracteres');
    expect(invalid.json().error).toContain('color: use uma destas cores');
    const unknownSound = await post({ label: 'X', soundId: 'snada' });
    expect(unknownSound.statusCode).toBe(400);
    expect(unknownSound.json().error).toMatch(ERROR_FORMAT);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/sfx/buttons/${b.id}`,
      headers: H,
      payload: { label: 'Renomeado', emoji: null, volume: 0.3 },
    });
    expect(patched.json()).toEqual({ id: b.id, label: 'Renomeado', soundId: null, color: 'slate', volume: 0.3 });
    const missing = await app.inject({ method: 'PATCH', url: '/api/sfx/buttons/bnada', headers: H, payload: {} });
    expect(missing.statusCode).toBe(404);

    const ordered = await app.inject({
      method: 'PUT',
      url: '/api/sfx/buttons/order',
      headers: H,
      payload: { ids: [b.id, a.id] },
    });
    expect((ordered.json() as SfxButton[]).map((x) => x.id)).toEqual([b.id, a.id]);

    expect((await app.inject({ method: 'DELETE', url: `/api/sfx/buttons/${b.id}` })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'DELETE', url: `/api/sfx/buttons/${b.id}` })).statusCode).toBe(404);
  });

  it('plays on the PC with the right url and volume and measures the latency', async () => {
    const button = library.createButton({ label: 'Play', soundId: bruh, volume: 0.5 });
    const rev = library.wavFor(bruh)?.rev;
    const play = (payload: object) => app.inject({ method: 'POST', url: '/api/sfx/play', headers: H, payload });
    const res = await play({ buttonId: button.id });
    expect(res.statusCode).toBe(200);
    const { playId } = res.json() as { playId: string };
    expect(events.at(-1)).toEqual({
      type: 'sfx:play',
      playId,
      soundId: bruh,
      url: `/api/sfx/sounds/${bruh}.wav?rev=${rev}`,
      volume: 0.4,
    });
    const direct = await play({ soundId: bruh });
    expect(events.at(-1)).toMatchObject({ type: 'sfx:play', playId: direct.json().playId, volume: 0.8 });

    const played = routes.reportPlayed(playId);
    expect(played?.soundId).toBe(bruh);
    expect(played?.latencyMs).toBeGreaterThanOrEqual(0);
    expect(played?.latencyMs).toBeLessThan(5000);
    expect(routes.reportPlayed(playId)).toBeNull();
    expect(routes.reportPlayed('nada')).toBeNull();

    const stop = await app.inject({ method: 'POST', url: '/api/sfx/stop', headers: H, payload: {} });
    expect(stop.json()).toEqual({ ok: true });
    expect(events.at(-1)).toEqual({ type: 'sfx:stop' });
  });

  it('answers 409 for a sound that is not ready and 404 for unknown ones', async () => {
    const count = events.length;
    const play = (payload: object) => app.inject({ method: 'POST', url: '/api/sfx/play', headers: H, payload });
    const notReady = await play({ soundId: ruim });
    expect(notReady.statusCode).toBe(409);
    expect(notReady.json().error).toMatch(ERROR_FORMAT);
    expect((await play({ soundId: 'snada' })).statusCode).toBe(404);
    expect((await play({ buttonId: 'bnada' })).statusCode).toBe(404);
    const empty = await play({});
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error).toContain('envie buttonId ou soundId');
    expect(events).toHaveLength(count);
  });

  it('refuses to play while no audio page is open, without broadcasting', async () => {
    let audioPages = 0;
    const sent: ServerEvent[] = [];
    const other = Fastify({ logger: false });
    registerSfxRoutes(other, {
      library,
      settings: () => settings,
      broadcast: (e) => sent.push(e),
      log: silentLogger,
      audioClients: () => audioPages,
    });
    await other.ready();
    try {
      const play = () => other.inject({ method: 'POST', url: '/api/sfx/play', headers: H, payload: { soundId: bruh } });
      const refused = await play();
      expect(refused.statusCode).toBe(409);
      expect(refused.json().error).toBe(
        'Erro: a fonte de áudio do OBS não está aberta — Solução: abra o OBS na coleção stream95 (fonte /overlay/audio) ou abra http://localhost:1995/overlay/audio no PC',
      );
      expect(sent).toEqual([]);
      audioPages = 1;
      expect((await play()).statusCode).toBe(200);
      expect(sent.map((e) => e.type)).toEqual(['sfx:play']);
    } finally {
      await other.close();
    }
  });

  it('serves the converted WAV by id only', async () => {
    const wav = library.wavFor(bruh)!;
    const get = (url: string, headers: Record<string, string> = {}) => app.inject({ method: 'GET', url, headers });
    const res = await get(`/api/sfx/sounds/${bruh}.wav?rev=${wav.rev}`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('audio/wav');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.rawPayload.equals(readFileSync(wav.path))).toBe(true);
    expect((await get(`/api/sfx/sounds/${bruh}.wav?rev=antigo`)).headers['cache-control']).toBe('no-cache');
    const ranged = await get(`/api/sfx/sounds/${bruh}.wav`, { range: 'bytes=0-11' });
    expect(ranged.statusCode).toBe(206);
    expect(ranged.rawPayload.toString('ascii')).toMatch(/^RIFF.{4}WAVE$/s);
    expect((await get(`/api/sfx/sounds/${bruh}.wav`, { 'if-none-match': `"${wav.rev}"` })).statusCode).toBe(304);
    expect((await get(`/api/sfx/sounds/${ruim}.wav`)).statusCode).toBe(409);
    for (const url of [
      '/api/sfx/sounds/snada.wav',
      `/api/sfx/sounds/${bruh}.mp3`,
      '/api/sfx/sounds/..%2F..%2Fsfx-buttons.json',
      '/api/sfx/sounds/..%5C..%5Csfx-buttons.json',
    ]) {
      expect((await get(url)).statusCode).toBe(404);
    }
  });

  it('converts a sound again when its WAV vanished from the cache', async () => {
    const wav = library.wavFor(bruh);
    expect(wav).not.toBeNull();
    rmSync(wav?.path ?? '');
    const res = await app.inject({ method: 'GET', url: `/api/sfx/sounds/${bruh}.wav?rev=${wav?.rev}` });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(ERROR_FORMAT);
    await library.idle();
    expect(library.wavFor(bruh)).toEqual(wav);
    expect(existsSync(wav?.path ?? '')).toBe(true);
  });

  it('uploads files bigger than the JSON body limit into a category', async () => {
    const body = await multipart([{ name: 'açaí!.wav', data: readFileSync(input('big.wav')) }], 'Uploads');
    expect(body.payload.length).toBeGreaterThan(64 * 1024);
    const res = await app.inject({ method: 'POST', url: '/api/sfx/upload', ...body });
    expect(res.statusCode).toBe(200);
    const { sounds } = res.json() as { sounds: SfxSound[] };
    expect(sounds).toHaveLength(1);
    expect(sounds[0]).toMatchObject({ file: 'Uploads/açaí.wav', category: 'Uploads', name: 'açaí', status: 'ready' });
    expect(sounds[0]?.durationMs).toBeGreaterThan(900);
  });

  it('rejects bad uploads with clear errors', async () => {
    const upload = async (files: { name: string; data: Buffer }[], category?: string) =>
      app.inject({ method: 'POST', url: '/api/sfx/upload', ...(await multipart(files, category)) });
    const exe = await upload([{ name: 'virus.exe', data: Buffer.from('x') }]);
    expect(exe.statusCode).toBe(400);
    expect(exe.json().error).toMatch(ERROR_FORMAT);
    const traversal = await upload([{ name: 'x.mp3', data: readFileSync(input('tone.mp3')) }], '../fora');
    expect(traversal.statusCode).toBe(400);
    expect((await upload([], 'Uploads')).statusCode).toBe(400);
    const tooMany = await upload(Array.from({ length: 21 }, (_, i) => ({ name: `s${i}.mp3`, data: Buffer.from('x') })));
    expect(tooMany.statusCode).toBe(413);
    expect(tooMany.json().error).toMatch(ERROR_FORMAT);
    const json = await app.inject({ method: 'POST', url: '/api/sfx/upload', headers: H, payload: { file: 'x' } });
    expect(json.statusCode).toBe(415);
    expect(json.json().error).toMatch(ERROR_FORMAT);
    // multipart parsing stays scoped to the upload route
    expect(app.hasContentTypeParser('multipart/form-data')).toBe(false);
    const elsewhere = await app.inject({ method: 'POST', url: '/api/sfx/buttons', ...(await multipart([], 'x')) });
    expect(elsewhere.statusCode).toBe(415);
  });

  it('deletes a sound by id and rescans', async () => {
    const id = sfxSoundId('Uploads/açaí.wav');
    expect((await app.inject({ method: 'DELETE', url: `/api/sfx/sounds/${id}` })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'DELETE', url: `/api/sfx/sounds/${id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: '/api/sfx/sounds/..%2Fx' })).statusCode).toBe(404);
    const rescan = await app.inject({ method: 'POST', url: '/api/sfx/rescan', headers: H, payload: {} });
    expect(rescan.statusCode).toBe(200);
    expect((rescan.json() as SfxLibrary).sounds.map((s) => s.file)).toEqual(['bruh.mp3', 'ruim.mp3']);
  });
});

describe('sfx paths', () => {
  /** A REG_EXPAND_SZ value as `reg export` writes it: UTF-16LE bytes in hex, wrapped in ",\" lines. */
  const hexValue = (value: string) =>
    [...Buffer.from(`${value}\0`, 'utf16le')]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(',')
      .replace(/((?:[0-9a-f]{2},){24})/g, '$1\\\r\n  ');

  it('reads the Documents folder from a reg export, also when OneDrive moved it', () => {
    const text = [
      '\uFEFFWindows Registry Editor Version 5.00',
      '',
      String.raw`[HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders]`,
      `"AppData"=hex(2):${hexValue(String.raw`%USERPROFILE%\AppData\Roaming`)}`,
      `"Personal"=hex(2):${hexValue(String.raw`C:\Users\João\OneDrive\Documentos`)}`,
      String.raw`"Desktop"="C:\\Users\\João\\Área de Trabalho"`,
      '"Count"=dword:00000001',
      '',
    ].join('\r\n');
    expect(regExportValue(text, 'Personal')).toBe(String.raw`C:\Users\João\OneDrive\Documentos`);
    expect(regExportValue(text, 'appdata')).toBe(String.raw`%USERPROFILE%\AppData\Roaming`);
    expect(regExportValue(text, 'Desktop')).toBe(String.raw`C:\Users\João\Área de Trabalho`);
    expect(regExportValue(text, 'Count')).toBeNull();
    expect(regExportValue(text, 'Music')).toBeNull();
    const env = { UserProfile: String.raw`C:\Users\João` };
    expect(expandWindowsVars(String.raw`%USERPROFILE%\AppData\Roaming`, env)).toBe(
      String.raw`C:\Users\João\AppData\Roaming`,
    );
    expect(expandWindowsVars(String.raw`%NADA%\Documentos`, env)).toBeNull();
  });

  it('keeps the default sounds folder in Documents and resolves SOUNDS_DIR against the repo', () => {
    const docs = documentsDir();
    expect(path.isAbsolute(docs)).toBe(true);
    if (process.platform !== 'win32') expect(docs).toBe(path.join(homedir(), 'Documents'));
    // on Windows a folder from the registry is only used when it exists
    else if (docs !== path.join(homedir(), 'Documents')) expect(statSync(docs).isDirectory()).toBe(true);
    const repo = path.resolve('repo');
    expect(sfxPaths({ dataDir: 'data', root: repo }).dir).toBe(path.join(docs, 'stream95', 'sons'));
    expect(sfxPaths({ dataDir: 'data', root: repo, soundsDir: '  sons  ' }).dir).toBe(path.join(repo, 'sons'));
  });
});
