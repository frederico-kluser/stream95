import type { Settings, SfxLibrary } from '@stream95/shared';
import type { StreamClient } from './stream';

export type SfxOverlap = Settings['sfx']['overlap'];

/** The part of the Web Audio API the player uses (`AudioContext` fits; tests pass a fake). */
export type SfxAudio = {
  readonly state: AudioContextState;
  readonly currentTime: number;
  readonly destination: AudioNode;
  resume(): Promise<void>;
  createBufferSource(): AudioBufferSourceNode;
  createGain(): GainNode;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer>;
};

type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

export type SfxPlayEvent = { playId: string; soundId: string; url: string; volume: number };

/** Sounds of the library already decoded in memory. */
export type SfxStatus = { ready: number; total: number };

export type SfxPlayerOptions = {
  /** Shared AudioContext of the page (created on first use). */
  audio: () => SfxAudio;
  /**
   * Runs once a play is carried out on a running AudioContext: the sound started, or (with 'single')
   * a newer tap already took its place. The server measures tap-to-sound latency with it. A play
   * the browser keeps suspended is never reported, so the deck never shows a sound nobody heard.
   */
  onPlayed: (playId: string) => void;
  /** Overlap policy, read on every play. */
  overlap?: () => SfxOverlap;
  /** The browser keeps the audio suspended (autoplay policy): ask for a click. */
  onBlocked?: () => void;
  onError?: (soundId: string, error: unknown) => void;
  onStatus?: (status: SfxStatus) => void;
  fetch?: FetchLike;
  /** Seconds of decoded audio kept in memory (48 kHz stereo float is ~375 KB per second). */
  budgetSeconds?: number;
  /** Sounds fetched and decoded at the same time while preloading. */
  concurrency?: number;
};

/** Fade applied when a sound is cut, so the cut never clicks. */
const FADE_S = 0.015;
/** Spam guard: the oldest sound stops when this many play at once. */
const MAX_VOICES = 24;
/** 10 minutes of audio, about 220 MB decoded. Sounds beyond it load when played. */
const DEFAULT_BUDGET_S = 600;
/** Length assumed for a sound whose duration the server did not report. */
const UNKNOWN_DURATION_S = 5;
const BLOCKED_CHECK_MS = 600;

/** Cache key of one version of a sound: a new rev (file changed) is a new key. */
export const sfxKey = (id: string, rev?: string | null): string => `${id}:${rev ?? ''}`;

/** Converted WAV the server serves for a sound (immutable while the rev matches). */
export const sfxWavUrl = (id: string, rev?: string): string =>
  `/api/sfx/sounds/${encodeURIComponent(id)}.wav${rev ? `?rev=${encodeURIComponent(rev)}` : ''}`;

/** `rev` query parameter of a sound URL, or null when it has none. */
export function revOf(url: string): string | null {
  const match = /[?&]rev=([^&#]*)/.exec(url);
  if (!match) return null;
  const raw = match[1] ?? '';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const clampVolume = (v: number): number => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1));

/** The server answered a sound request with an error status. */
class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

/** 409: the server is still converting that version and announces it in the library once it is ready. */
const notReadyYet = (error: unknown): boolean => error instanceof HttpError && error.status === 409;

type Voice = { soundId: string; source: AudioBufferSourceNode; gain: GainNode };
type Job = { key: string; soundId: string; url: string };

/**
 * Soundboard of the OBS audio page. Every ready sound of the library is fetched and decoded ahead
 * of time, so a play is a synchronous BufferSource start: no network, no decoding, no awaits.
 */
export class SfxPlayer {
  private readonly cache = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  /** Versions that failed to load: preloading skips them until retryFailed(). */
  private readonly failed = new Set<string>();
  private readonly voices = new Set<Voice>();
  /** soundId -> key of the version in the library. */
  private current = new Map<string, string>();
  private wanted = new Set<string>();
  /** Keys picked for preloading (they fit the memory budget). */
  private planned = new Set<string>();
  private queue: Job[] = [];
  private preloading = 0;
  /** Bumped by stopAll(): sounds still loading when it changes never start. */
  private epoch = 0;
  /** Plays are numbered as they arrive; `newestStarted` is the number of the newest one that started. */
  private taps = 0;
  private newestStarted = 0;
  /** Plays started on a suspended context: they count once it runs, unless the blocked check gives up first. */
  private readonly unconfirmed = new Set<string>();
  private blockedTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly fetcher: FetchLike;
  private readonly budget: number;
  private readonly concurrency: number;

  constructor(private readonly opts: SfxPlayerOptions) {
    this.fetcher = opts.fetch ?? ((url) => fetch(url));
    this.budget = opts.budgetSeconds ?? DEFAULT_BUDGET_S;
    this.concurrency = Math.max(1, opts.concurrency ?? 3);
  }

  /** Sounds playing now. */
  get playing(): number {
    return this.voices.size;
  }

  status(): SfxStatus {
    let ready = 0;
    for (const key of this.wanted) if (this.cache.has(key)) ready += 1;
    return { ready, total: this.wanted.size };
  }

  /** New library: drop versions that changed or left, then preload what is missing (button sounds first). */
  setLibrary(library: SfxLibrary): void {
    if (this.disposed) return;
    const ready = library.sounds.filter((s) => s.status === 'ready');
    this.current = new Map(ready.map((s) => [s.id, sfxKey(s.id, s.rev)]));
    this.wanted = new Set(this.current.values());
    for (const key of [...this.cache.keys()]) if (!this.wanted.has(key)) this.cache.delete(key);
    for (const key of [...this.failed]) if (!this.wanted.has(key)) this.failed.delete(key);

    const onButtons = new Set(library.buttons.map((b) => b.soundId));
    const ordered = [...ready].sort((a, b) => Number(onButtons.has(b.id)) - Number(onButtons.has(a.id)));
    let seconds = this.cachedSeconds();
    this.planned = new Set();
    this.queue = [];
    for (const sound of ordered) {
      const key = sfxKey(sound.id, sound.rev);
      if (this.cache.has(key) || this.failed.has(key)) continue;
      const need = sound.durationMs ? sound.durationMs / 1000 : UNKNOWN_DURATION_S;
      if (seconds + need > this.budget) continue;
      seconds += need;
      this.planned.add(key);
      if (!this.loading.has(key)) this.queue.push({ key, soundId: sound.id, url: sfxWavUrl(sound.id, sound.rev) });
    }
    this.pump();
    this.emitStatus();
  }

  /**
   * Forgets the sounds that failed to load, so the next setLibrary preloads them again. A library
   * update alone never retries them (a broken file would be fetched on every change).
   */
  retryFailed(): void {
    this.failed.clear();
  }

  /**
   * Starts a sound: right now when it is in memory, otherwise after loading it. stopAll cancels a
   * sound still loading; so does a newer play that started first, with 'single' (the newest tap wins).
   */
  play(event: SfxPlayEvent): void {
    if (this.disposed) return;
    const tap = ++this.taps;
    const key = this.keyFor(event);
    const buffer = this.cache.get(key);
    if (buffer) {
      this.start(event, buffer, tap);
      return;
    }
    const epoch = this.epoch;
    void this.load(key, event.soundId, event.url).then((loaded) => {
      if (!loaded || epoch !== this.epoch || this.disposed) return;
      if (this.overlapMode() !== 'single' || this.newestStarted < tap) {
        this.start(event, loaded, tap);
        return;
      }
      // A newer tap already started: this one counts as replaced by it, like a sound cut at once.
      if (this.opts.audio().state === 'running') this.opts.onPlayed(event.playId);
    });
  }

  /** Stops every sound with a short fade and cancels the ones still loading. */
  stopAll(): void {
    this.epoch += 1;
    if (this.voices.size === 0) return;
    const ac = this.opts.audio();
    for (const voice of [...this.voices]) this.release(voice, ac);
  }

  dispose(): void {
    this.stopAll();
    this.disposed = true;
    this.queue = [];
    this.cache.clear();
    this.unconfirmed.clear();
    if (this.blockedTimer) clearTimeout(this.blockedTimer);
    this.blockedTimer = null;
  }

  /** The URL's rev names the exact version to play; without one, the library's current version. */
  private keyFor(event: SfxPlayEvent): string {
    const rev = revOf(event.url);
    if (rev !== null) return sfxKey(event.soundId, rev);
    return this.current.get(event.soundId) ?? sfxKey(event.soundId);
  }

  private overlapMode(): SfxOverlap {
    return this.opts.overlap?.() ?? 'restart';
  }

  private start(event: SfxPlayEvent, buffer: AudioBuffer, tap: number): void {
    const ac = this.opts.audio();
    // A suspended context makes no sound yet: the play only counts once it runs.
    const resumed = ac.state === 'running' ? null : this.wake(ac);
    const overlap = this.overlapMode();
    for (const voice of [...this.voices]) {
      if (overlap === 'single' || (overlap === 'restart' && voice.soundId === event.soundId)) this.release(voice, ac);
    }
    const excess = this.voices.size - MAX_VOICES + 1;
    if (excess > 0) for (const voice of [...this.voices].slice(0, excess)) this.release(voice, ac);

    const source = ac.createBufferSource();
    source.buffer = buffer;
    const gain = ac.createGain();
    gain.gain.value = clampVolume(event.volume);
    source.connect(gain);
    gain.connect(ac.destination);
    const voice: Voice = { soundId: event.soundId, source, gain };
    source.onended = () => {
      this.voices.delete(voice);
      source.disconnect();
      gain.disconnect();
    };
    this.voices.add(voice);
    source.start(0);
    this.newestStarted = Math.max(this.newestStarted, tap);
    if (!resumed) {
      this.opts.onPlayed(event.playId);
      return;
    }
    this.unconfirmed.add(event.playId);
    void resumed.then(() => {
      if (this.unconfirmed.delete(event.playId) && ac.state === 'running') this.opts.onPlayed(event.playId);
    });
  }

  /** Fades a sound out and stops it (a hard cut clicks). */
  private release(voice: Voice, ac: SfxAudio): void {
    this.voices.delete(voice);
    const t = ac.currentTime;
    const level = voice.gain.gain;
    try {
      level.cancelScheduledValues(t);
      level.setValueAtTime(level.value, t);
      level.linearRampToValueAtTime(0, t + FADE_S);
      voice.source.stop(t + FADE_S);
    } catch {
      // already stopped
    }
  }

  /**
   * Resumes a suspended context (a new one starts suspended for a moment, even in OBS). If it stays
   * suspended (browser autoplay policy), report it and drop what was scheduled: nobody heard those
   * sounds, so they never count, and they would all burst out together on the unlock click.
   * Settles once the resume attempt ends.
   */
  private wake(ac: SfxAudio): Promise<void> {
    const resumed = ac.resume().catch(() => undefined);
    if (!this.blockedTimer) {
      this.blockedTimer = setTimeout(() => {
        this.blockedTimer = null;
        if (this.disposed || this.opts.audio().state === 'running') return;
        this.unconfirmed.clear();
        for (const voice of [...this.voices]) this.drop(voice);
        this.opts.onBlocked?.();
      }, BLOCKED_CHECK_MS);
    }
    return resumed;
  }

  private drop(voice: Voice): void {
    this.voices.delete(voice);
    try {
      voice.source.stop();
    } catch {
      // already stopped
    }
    voice.source.disconnect();
    voice.gain.disconnect();
  }

  private pump(): void {
    while (!this.disposed && this.preloading < this.concurrency) {
      const job = this.queue.shift();
      if (!job) return;
      if (this.cache.has(job.key) || this.loading.has(job.key)) continue;
      this.preloading += 1;
      void this.load(job.key, job.soundId, job.url).then(() => {
        this.preloading -= 1;
        this.pump();
      });
    }
  }

  /** Fetches and decodes one version once, however many plays and preloads ask for it. */
  private load(key: string, soundId: string, url: string): Promise<AudioBuffer | null> {
    const pending = this.loading.get(key);
    if (pending) return pending;
    const job = this.decode(url).then(
      (buffer) => {
        this.loading.delete(key);
        if (this.disposed) return null;
        this.failed.delete(key);
        if (this.keeps(key, buffer)) this.cache.set(key, buffer);
        this.emitStatus();
        return buffer;
      },
      (error: unknown) => {
        this.loading.delete(key);
        if (this.disposed) return null;
        // Only for the library that asked for it: a version dropped meanwhile (or still converting)
        // is preloaded again when the library lists it as ready.
        if (this.wanted.has(key) && !notReadyYet(error)) this.failed.add(key);
        this.opts.onError?.(soundId, error);
        this.emitStatus();
        return null;
      },
    );
    this.loading.set(key, job);
    return job;
  }

  private async decode(url: string): Promise<AudioBuffer> {
    const res = await this.fetcher(url);
    if (!res.ok) throw new HttpError(res.status);
    return this.opts.audio().decodeAudioData(await res.arrayBuffer());
  }

  /** Keep a decoded sound when it is the library's current version and fits the memory budget. */
  private keeps(key: string, buffer: AudioBuffer): boolean {
    if (!this.wanted.has(key)) return false;
    return this.planned.has(key) || this.cachedSeconds() + buffer.duration <= this.budget;
  }

  private cachedSeconds(): number {
    let total = 0;
    for (const buffer of this.cache.values()) total += buffer.duration;
    return total;
  }

  private emitStatus(): void {
    this.opts.onStatus?.(this.status());
  }
}

/** Wires a player to the server events (library, play, stop). Returns the unsubscribe function. */
export function bindSfxPlayer(client: Pick<StreamClient, 'onEvent' | 'getSnapshot'>, player: SfxPlayer): () => void {
  const library = client.getSnapshot().sfx;
  if (library) player.setLibrary(library);
  return client.onEvent((e) => {
    if (e.type === 'hello' && e.snapshot.sfx) {
      // A new connection: the server may be back from a restart, so retry what failed while it was away.
      player.retryFailed();
      player.setLibrary(e.snapshot.sfx);
    } else if (e.type === 'sfx:library') player.setLibrary(e.library);
    else if (e.type === 'sfx:play') player.play(e);
    else if (e.type === 'sfx:stop') player.stopAll();
  });
}
