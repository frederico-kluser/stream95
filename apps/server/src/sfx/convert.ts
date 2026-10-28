import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';
import { SFX_MAX_DURATION_MS } from '@stream95/shared';
import ffmpegStatic from 'ffmpeg-static';
import { removeFileWithRetry, renameWithRetry } from './fs.js';

// Every sound is converted once to WAV PCM 16-bit, 48 kHz, stereo:
// - OBS mixes at 48 kHz, so the audio source plays it without resampling;
// - MP3 (and AAC) start with encoder delay/padding, ~25-50 ms of silence; PCM starts on the first sample;
// - nothing to decode at play time, the player only copies samples into a buffer;
// - leading silence is trimmed (20 ms kept) so the sound starts on the tap, and trailing silence too
//   (100 ms of decay kept), so "playing" and the restart mode follow what is actually heard.

/** Bump when the ffmpeg recipe changes: every cached WAV gets a new rev and is converted again. */
export const CONVERTER_VERSION = 3;

/** ffmpeg from ffmpeg-static (the FFMPEG_BIN env var overrides it), or the one on PATH. */
export const DEFAULT_FFMPEG_PATH: string = ffmpegStatic ?? 'ffmpeg';

export const MAX_PARALLEL_CONVERSIONS = 2;

export const SFX_SAMPLE_RATE = 48_000;

/** Output is capped a bit above the limit, so a 3-hour file is not converted in full just to be rejected. */
const OUTPUT_CAP_SECONDS = SFX_MAX_DURATION_MS / 1000 + 1;
/**
 * Input is read up to here: room for any sound under the limit plus a long silent lead-in. It also bounds
 * memory, because the trailing-silence pass reverses (buffers) the whole input: about 60 MB at most.
 */
const INPUT_CAP_SECONDS = SFX_MAX_DURATION_MS / 1000 + 30;
const MAX_MINUTES = SFX_MAX_DURATION_MS / 60_000;

export type ConvertErrorCode = 'too_long' | 'empty' | 'unreadable' | 'no_ffmpeg' | 'timeout' | 'aborted';

/** Conversion failure with a user-facing message ("Erro: ... — Solução: ..."). */
export class ConvertError extends Error {
  constructor(
    readonly code: ConvertErrorCode,
    message: string,
    /** ffmpeg output, for the server log only. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'ConvertError';
  }
}

const MESSAGES: Record<Exclude<ConvertErrorCode, 'timeout'>, string> = {
  too_long: `Erro: o som passa de ${MAX_MINUTES} minutos — Solução: corte o áudio para no máximo ${MAX_MINUTES} minutos`,
  empty: 'Erro: o áudio está vazio ou só tem silêncio — Solução: confira o arquivo num player',
  unreadable:
    'Erro: o arquivo não é um áudio válido ou está corrompido — Solução: abra num player para conferir ou exporte de novo em MP3 ou WAV',
  no_ffmpeg:
    'Erro: ffmpeg não encontrado — Solução: rode npm install para baixar o ffmpeg-static ou instale o ffmpeg no PATH',
  aborted: 'Erro: conversão cancelada — Solução: nada a fazer, o servidor está desligando',
};

const fail = (code: Exclude<ConvertErrorCode, 'timeout'>, detail?: string) =>
  new ConvertError(code, MESSAGES[code], detail);

export type ConvertOptions = {
  input: string;
  output: string;
  /** Loudness-normalize (EBU R128, -16 LUFS) so every sound plays at the same volume. */
  normalize: boolean;
  ffmpegPath: string;
  timeoutMs?: number;
  signal?: AbortSignal;
};

/** ffmpeg arguments: decode anything, trim silence at both ends, optionally normalize, write 48 kHz s16 stereo WAV. */
export function ffmpegArgs(input: string, output: string, normalize: boolean): string[] {
  const filters = [
    'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02',
    // trailing silence: the same filter on the reversed audio
    'areverse',
    'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.1',
    'areverse',
  ];
  // loudnorm runs at 192 kHz; resampling right before it keeps the silence passes at the source rate.
  // Its last chunk can be 1-3 samples (e.g. a clip of a whole number of 100 ms with nothing to trim): the
  // 48 kHz resample after it turns that into 0 samples, and ffmpeg 6.1 then stalls until the timeout.
  // Fixed 960-sample frames (5 ms, the last one padded with silence) never come out empty.
  if (normalize) filters.push('aresample=192000', 'loudnorm=I=-16:TP=-1.5:LRA=11', 'asetnsamples=n=960');
  return [
    '-hide_banner',
    '-nostdin',
    '-y',
    '-v',
    'error',
    '-t',
    String(INPUT_CAP_SECONDS),
    // "file:" stops ffmpeg from reading a name like "concat:..." as a protocol
    '-i',
    `file:${input}`,
    '-vn',
    '-map_metadata',
    '-1',
    '-af',
    filters.join(','),
    '-t',
    String(OUTPUT_CAP_SECONDS),
    '-ac',
    '2',
    '-ar',
    String(SFX_SAMPLE_RATE),
    '-c:a',
    'pcm_s16le',
    '-f',
    'wav',
    `file:${output}`,
  ];
}

// ------------------------------------------------------------ concurrency limiter (shared by every library)
let running = 0;
const waiting: Array<() => void> = [];

function acquire(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(fail('aborted'));
  if (running < MAX_PARALLEL_CONVERSIONS) {
    running++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const i = waiting.indexOf(grant);
      if (i >= 0) waiting.splice(i, 1);
      reject(fail('aborted'));
    };
    // the slot is handed over by release(), so `running` stays the same
    const grant = () => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    waiting.push(grant);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function release(): void {
  const next = waiting.shift();
  if (next) next();
  else running--;
}

/**
 * Converts any audio file to a 48 kHz stereo PCM WAV at `output` (written to `<output>.tmp`, then
 * renamed). Rejects with a ConvertError when the result is longer than SFX_MAX_DURATION_MS or empty.
 */
export async function convertToWav(opts: ConvertOptions): Promise<{ durationMs: number }> {
  const { input, output, normalize, ffmpegPath, timeoutMs = 60_000, signal } = opts;
  await acquire(signal);
  const tmp = `${output}.tmp`;
  try {
    await runFfmpeg(ffmpegPath, ffmpegArgs(input, tmp, normalize), timeoutMs, signal);
    let info: WavInfo;
    try {
      info = await readWavInfo(tmp);
    } catch (err) {
      throw fail('unreadable', (err as Error).message);
    }
    if (info.durationMs > SFX_MAX_DURATION_MS) throw fail('too_long');
    if (info.dataBytes === 0) throw fail('empty');
    await renameWithRetry(tmp, output);
    return { durationMs: Math.round(info.durationMs) };
  } catch (err) {
    await removeFileWithRetry(tmp).catch(() => {});
    throw err;
  } finally {
    release();
  }
}

function runFfmpeg(bin: string, args: string[], timeoutMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    let pending: ConvertError | null = null;
    let settled = false;
    let killGrace: NodeJS.Timeout | undefined;
    const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    const settle = (err: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killGrace);
      signal?.removeEventListener('abort', onAbort);
      if (err) reject(err);
      else resolve();
    };
    // kill, then wait for "close" so the .tmp file is released before it is deleted
    const stop = (err: ConvertError) => {
      pending ??= err;
      child.kill('SIGKILL');
      killGrace ??= setTimeout(() => settle(pending), 2000);
    };
    const timer = setTimeout(
      () =>
        stop(
          new ConvertError(
            'timeout',
            `Erro: a conversão passou de ${Math.round(timeoutMs / 1000)} s — Solução: use um áudio menor ou tente de novo`,
          ),
        ),
      timeoutMs,
    );
    const onAbort = () => stop(fail('aborted'));
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.on('error', (err: NodeJS.ErrnoException) =>
      settle(err.code === 'ENOENT' ? fail('no_ffmpeg', err.message) : fail('unreadable', err.message)),
    );
    child.on('close', (code) => {
      if (pending) settle(pending);
      else if (code === 0) settle(null);
      else settle(fail('unreadable', stderr.trim().split(/\r?\n/).slice(-3).join(' | ')));
    });
  });
}

export type WavInfo = {
  /** 1 = PCM, 0xfffe = extensible. */
  format: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataOffset: number;
  dataBytes: number;
  durationMs: number;
};

/** Reads the format and the duration of a WAV file from its RIFF chunks (no ffprobe). */
export async function readWavInfo(file: string): Promise<WavInfo> {
  const fh = await open(file, 'r');
  try {
    const { size } = await fh.stat();
    const head = Buffer.alloc(12);
    await fh.read(head, 0, 12, 0);
    if (head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') {
      throw new Error('not a RIFF/WAVE file');
    }
    const chunk = Buffer.alloc(8);
    const fmt = Buffer.alloc(16);
    let hasFmt = false;
    let pos = 12;
    while (pos + 8 <= size) {
      await fh.read(chunk, 0, 8, pos);
      const id = chunk.toString('ascii', 0, 4);
      const len = chunk.readUInt32LE(4);
      const body = pos + 8;
      if (id === 'fmt ') {
        await fh.read(fmt, 0, 16, body);
        hasFmt = true;
      } else if (id === 'data') {
        if (!hasFmt) throw new Error('data chunk before fmt chunk');
        const format = fmt.readUInt16LE(0);
        const channels = fmt.readUInt16LE(2);
        const sampleRate = fmt.readUInt32LE(4);
        const bitsPerSample = fmt.readUInt16LE(14);
        const blockAlign = fmt.readUInt16LE(12) || (channels * bitsPerSample) / 8;
        if (!sampleRate || !blockAlign) throw new Error('invalid fmt chunk');
        const available = size - body;
        // 0 or 0xffffffff means "unknown size" (streamed WAV): use what is on disk
        const dataBytes = len === 0 || len === 0xffffffff || len > available ? available : len;
        const frames = Math.floor(dataBytes / blockAlign);
        return {
          format,
          channels,
          sampleRate,
          bitsPerSample,
          dataOffset: body,
          dataBytes,
          durationMs: (frames / sampleRate) * 1000,
        };
      }
      pos = body + len + (len % 2);
    }
    throw new Error('no data chunk');
  } finally {
    await fh.close();
  }
}
