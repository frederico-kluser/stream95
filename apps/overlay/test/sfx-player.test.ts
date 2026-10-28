import { defaultSettings, type ServerEvent, type SfxButton, type SfxLibrary, type SfxSound } from '@stream95/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bindSfxPlayer,
  revOf,
  type SfxAudio,
  type SfxOverlap,
  SfxPlayer,
  type SfxPlayerOptions,
  sfxKey,
  sfxWavUrl,
} from '../src/lib/sfx-player';
import { StreamClient } from '../src/lib/stream';

// ------------------------------------------------------------ fake Web Audio

type FakeBuffer = { duration: number; url: string };

class FakeNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeParam {
  value = 1;
  cancelScheduledValues = vi.fn();
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  onended: (() => void) | null = null;
  start(when = 0) {
    this.startedAt = when;
  }
  stop(when = 0) {
    this.stoppedAt = when;
  }
}

function fakeAudio() {
  const sources: FakeSource[] = [];
  const gains: FakeGain[] = [];
  const raw = {
    state: 'running' as AudioContextState,
    currentTime: 10,
    destination: new FakeNode(),
    resume: vi.fn(async () => undefined),
    createBufferSource() {
      const source = new FakeSource();
      sources.push(source);
      return source;
    },
    createGain() {
      const gain = new FakeGain();
      gains.push(gain);
      return gain;
    },
    // The "decoded" buffer remembers which URL it came from.
    decodeAudioData: vi.fn(
      async (data: ArrayBuffer): Promise<FakeBuffer> => ({
        duration: 1,
        url: new TextDecoder().decode(data),
      }),
    ),
  };
  return { raw, audio: raw as unknown as SfxAudio, sources, gains };
}

/**
 * fetch that echoes the URL as the body; `fail` answers 404 (or the status it returns); `hold` keeps
 * matching requests pending until `release()`.
 */
function fakeFetch(opts: { fail?: (url: string) => boolean | number; hold?: (url: string) => boolean } = {}) {
  const held: { url: string; respond: () => void }[] = [];
  const fetch = vi.fn(
    (url: string) =>
      new Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>((resolve) => {
        const fail = opts.fail?.(url) ?? false;
        const status = fail === true ? 404 : fail || 200;
        const respond = () =>
          resolve({
            ok: status < 400,
            status,
            arrayBuffer: async () => new TextEncoder().encode(url).buffer as ArrayBuffer,
          });
        if (opts.hold?.(url)) held.push({ url, respond });
        else respond();
      }),
  );
  /** Answers the held requests (only the ones whose URL matches, when given). */
  const release = (match: (url: string) => boolean = () => true) => {
    for (const request of [...held]) {
      if (!match(request.url)) continue;
      held.splice(held.indexOf(request), 1);
      request.respond();
    }
  };
  return { fetch, release };
}

/** Lets every pending fetch/decode chain finish (they only use resolved promises). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// ------------------------------------------------------------------ library

const sound = (id: string, over: Partial<SfxSound> = {}): SfxSound => ({
  id,
  name: id,
  category: '',
  file: `${id}.mp3`,
  status: 'ready',
  durationMs: 1000,
  rev: '1',
  ...over,
});

const button = (id: string, soundId: string | null): SfxButton => ({
  id,
  label: id,
  soundId,
  color: 'slate',
  volume: 1,
});

const library = (sounds: SfxSound[], buttons: SfxButton[] = []): SfxLibrary => ({ dir: 'C:/sons', sounds, buttons });

const playOf = (soundId: string, playId: string, rev = '1', volume = 1) => ({
  playId,
  soundId,
  url: sfxWavUrl(soundId, rev),
  volume,
});

type SetupOptions = Pick<SfxPlayerOptions, 'budgetSeconds' | 'onBlocked'> & {
  overlap?: SfxOverlap;
  fetcher?: ReturnType<typeof fakeFetch>;
};

function setup(over: SetupOptions = {}) {
  const fake = fakeAudio();
  const fetcher = over.fetcher ?? fakeFetch();
  const played: string[] = [];
  const errors: string[] = [];
  let overlap: SfxOverlap = over.overlap ?? 'restart';
  const player = new SfxPlayer({
    audio: () => fake.audio,
    fetch: fetcher.fetch,
    onPlayed: (playId) => played.push(playId),
    onError: (soundId) => errors.push(soundId),
    overlap: () => overlap,
    ...(over.budgetSeconds ? { budgetSeconds: over.budgetSeconds } : {}),
    ...(over.onBlocked ? { onBlocked: over.onBlocked } : {}),
  });
  const urls = () => fetcher.fetch.mock.calls.map(([url]) => url);
  return {
    ...fake,
    ...fetcher,
    player,
    played,
    errors,
    urls,
    setOverlap: (next: SfxOverlap) => {
      overlap = next;
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('sfx helpers', () => {
  it('builds keys and URLs per version and reads the rev back', () => {
    expect(sfxKey('s1', 'abc')).toBe('s1:abc');
    expect(sfxKey('s1')).toBe('s1:');
    expect(sfxWavUrl('s1', 'a b')).toBe('/api/sfx/sounds/s1.wav?rev=a%20b');
    expect(revOf(sfxWavUrl('s1', 'a b'))).toBe('a b');
    expect(revOf('/api/sfx/sounds/s1.wav')).toBeNull();
  });
});

describe('SfxPlayer', () => {
  it('preloads every ready sound and skips the ones not ready', async () => {
    const t = setup();
    t.player.setLibrary(
      library([sound('a'), sound('b'), sound('c', { status: 'converting' }), sound('d', { status: 'error' })]),
    );
    await settle();
    expect(t.urls()).toEqual(['/api/sfx/sounds/a.wav?rev=1', '/api/sfx/sounds/b.wav?rev=1']);
    expect(t.raw.decodeAudioData).toHaveBeenCalledTimes(2);
    expect(t.player.status()).toEqual({ ready: 2, total: 2 });
  });

  it('starts a sound in memory synchronously and reports it right away', async () => {
    const t = setup();
    t.player.setLibrary(library([sound('a')]));
    await settle();

    t.player.play(playOf('a', 'p1', '1', 0.5));

    // No await between play() and these checks: the cached path never yields.
    const [source] = t.sources;
    const [gain] = t.gains;
    expect(source?.startedAt).toBe(0);
    expect(source?.buffer?.url).toBe('/api/sfx/sounds/a.wav?rev=1');
    expect(gain?.gain.value).toBe(0.5);
    expect(source?.connect).toHaveBeenCalledWith(gain);
    expect(gain?.connect).toHaveBeenCalledWith(t.raw.destination);
    expect(t.played).toEqual(['p1']);
    expect(t.fetch).toHaveBeenCalledTimes(1);
    expect(t.player.playing).toBe(1);

    source?.onended?.();
    expect(t.player.playing).toBe(0);
    expect(source?.disconnect).toHaveBeenCalled();
  });

  it('restart: the same sound starts over with a short fade, other sounds keep playing', async () => {
    const t = setup({ overlap: 'restart' });
    t.player.setLibrary(library([sound('a'), sound('b')]));
    await settle();
    t.player.play(playOf('a', 'p1'));
    t.player.play(playOf('b', 'p2'));
    t.player.play(playOf('a', 'p3'));

    const [a1, b, a2] = t.sources;
    expect(a1?.stoppedAt).toBeCloseTo(10.015, 6);
    expect(t.gains[0]?.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0, expect.closeTo(10.015, 6));
    expect(b?.stoppedAt).toBeNull();
    expect(a2?.stoppedAt).toBeNull();
    expect(t.player.playing).toBe(2);
    expect(t.played).toEqual(['p1', 'p2', 'p3']);
  });

  it('stack: sounds play on top of each other', async () => {
    const t = setup({ overlap: 'stack' });
    t.player.setLibrary(library([sound('a'), sound('b')]));
    await settle();
    t.player.play(playOf('a', 'p1'));
    t.player.play(playOf('a', 'p2'));
    t.player.play(playOf('b', 'p3'));
    expect(t.sources.map((s) => s.stoppedAt)).toEqual([null, null, null]);
    expect(t.player.playing).toBe(3);
  });

  it('single: a new sound stops every other one', async () => {
    const t = setup({ overlap: 'single' });
    t.player.setLibrary(library([sound('a'), sound('b')]));
    await settle();
    t.player.play(playOf('a', 'p1'));
    t.player.play(playOf('b', 'p2'));
    expect(t.sources[0]?.stoppedAt).not.toBeNull();
    expect(t.sources[1]?.stoppedAt).toBeNull();
    t.player.play(playOf('b', 'p3'));
    expect(t.sources[1]?.stoppedAt).not.toBeNull();
    expect(t.player.playing).toBe(1);
  });

  it('single: a sound still loading never cuts a newer one that already started', async () => {
    const t = setup({ overlap: 'single', fetcher: fakeFetch({ hold: (url) => url.includes('/z.wav') }) });
    t.player.setLibrary(library([sound('a')]));
    await settle();
    t.player.play(playOf('z', 'p1')); // not in memory: it loads first
    t.player.play(playOf('a', 'p2')); // in memory: it starts now
    t.release();
    await settle();
    expect(t.sources.map((s) => s.buffer?.url)).toEqual(['/api/sfx/sounds/a.wav?rev=1']);
    expect(t.sources[0]?.stoppedAt).toBeNull();
    // The older tap is handled too: the PC plays fine and the newer sound took its place.
    expect(t.played).toEqual(['p2', 'p1']);
  });

  it('single: the newest tap wins, whichever sound finishes loading first', async () => {
    const t = setup({ overlap: 'single', fetcher: fakeFetch({ hold: () => true }) });
    const started = () => t.sources.map((s) => s.buffer?.url);

    // The newer one loads first: the older one never starts.
    t.player.play(playOf('y', 'p1'));
    t.player.play(playOf('z', 'p2'));
    t.release((url) => url.includes('/z.wav'));
    await settle();
    t.release();
    await settle();
    expect(started()).toEqual(['/api/sfx/sounds/z.wav?rev=1']);

    // The older one loads first: it plays until the newer one cuts it.
    t.player.play(playOf('w', 'p3'));
    t.player.play(playOf('v', 'p4'));
    t.release((url) => url.includes('/w.wav'));
    await settle();
    t.release();
    await settle();
    expect(started()).toEqual([
      '/api/sfx/sounds/z.wav?rev=1',
      '/api/sfx/sounds/w.wav?rev=1',
      '/api/sfx/sounds/v.wav?rev=1',
    ]);
    expect(t.sources.map((s) => s.stoppedAt !== null)).toEqual([true, true, false]);
    expect(t.player.playing).toBe(1);
  });

  it('restart: a sound that finishes loading after a newer tap of another sound still plays', async () => {
    const t = setup({ overlap: 'restart', fetcher: fakeFetch({ hold: (url) => url.includes('/z.wav') }) });
    t.player.setLibrary(library([sound('a')]));
    await settle();
    t.player.play(playOf('z', 'p1'));
    t.player.play(playOf('a', 'p2'));
    t.release();
    await settle();
    expect(t.sources.map((s) => s.stoppedAt)).toEqual([null, null]);
    expect(t.played).toEqual(['p2', 'p1']);
  });

  it('reads the overlap policy on every play', async () => {
    const t = setup({ overlap: 'stack' });
    t.player.setLibrary(library([sound('a')]));
    await settle();
    t.player.play(playOf('a', 'p1'));
    t.setOverlap('restart');
    t.player.play(playOf('a', 'p2'));
    expect(t.sources[0]?.stoppedAt).not.toBeNull();
  });

  it('stop silences everything and cancels sounds still loading', async () => {
    const t = setup({ fetcher: fakeFetch({ hold: (url) => url.includes('/z.wav') }) });
    t.player.setLibrary(library([sound('a'), sound('b')]));
    await settle();
    t.player.play(playOf('a', 'p1'));
    t.player.play(playOf('b', 'p2'));
    t.player.play(playOf('z', 'p3'));

    t.player.stopAll();
    expect(t.sources.map((s) => s.stoppedAt !== null)).toEqual([true, true]);
    expect(t.player.playing).toBe(0);

    t.release();
    await settle();
    expect(t.sources).toHaveLength(2);
    expect(t.played).toEqual(['p1', 'p2']);

    // Later plays work again.
    t.player.play(playOf('a', 'p4'));
    expect(t.played).toEqual(['p1', 'p2', 'p4']);
  });

  it('loads a sound missing from memory and plays it once decoded', async () => {
    const t = setup();
    t.player.play(playOf('x', 'p1', '7'));
    expect(t.sources).toHaveLength(0);
    await settle();
    expect(t.urls()).toEqual(['/api/sfx/sounds/x.wav?rev=7']);
    expect(t.sources[0]?.startedAt).toBe(0);
    expect(t.played).toEqual(['p1']);
  });

  it('drops a version when its rev changes or it leaves the library', async () => {
    const t = setup();
    t.player.setLibrary(library([sound('a', { rev: '1' }), sound('b')]));
    await settle();
    t.player.setLibrary(library([sound('a', { rev: '2' }), sound('b')]));
    await settle();
    expect(t.urls()).toEqual([
      '/api/sfx/sounds/a.wav?rev=1',
      '/api/sfx/sounds/b.wav?rev=1',
      '/api/sfx/sounds/a.wav?rev=2',
    ]);
    expect(t.player.status()).toEqual({ ready: 2, total: 2 });

    t.player.play(playOf('a', 'p1', '2'));
    expect(t.sources[0]?.buffer?.url).toBe('/api/sfx/sounds/a.wav?rev=2');

    // The old version left memory: asking for it fetches it again.
    t.player.play(playOf('a', 'p2', '1'));
    expect(t.sources).toHaveLength(1);
    await settle();
    expect(t.urls().at(-1)).toBe('/api/sfx/sounds/a.wav?rev=1');

    t.player.setLibrary(library([sound('a', { rev: '2' })]));
    expect(t.player.status()).toEqual({ ready: 1, total: 1 });
  });

  it('plays the version in memory when the URL has no rev', async () => {
    const t = setup();
    t.player.setLibrary(library([sound('a', { rev: '9' })]));
    await settle();
    t.player.play({ playId: 'p1', soundId: 'a', url: '/api/sfx/sounds/a.wav', volume: 1 });
    expect(t.sources[0]?.buffer?.url).toBe('/api/sfx/sounds/a.wav?rev=9');
    expect(t.fetch).toHaveBeenCalledTimes(1);
  });

  it('preloads button sounds first and stops at the memory budget', async () => {
    const t = setup({ budgetSeconds: 10 });
    t.player.setLibrary(
      library(
        [sound('a', { durationMs: 6000 }), sound('b', { durationMs: 6000 }), sound('c', { durationMs: 3000 })],
        [button('k1', 'b'), button('k2', null)],
      ),
    );
    await settle();
    expect(t.urls()).toEqual(['/api/sfx/sounds/b.wav?rev=1', '/api/sfx/sounds/c.wav?rev=1']);
    expect(t.player.status()).toEqual({ ready: 2, total: 3 });

    // Out of the budget it still plays, loading on demand.
    t.player.play(playOf('a', 'p1'));
    await settle();
    expect(t.played).toEqual(['p1']);
  });

  it('reports a sound that fails to load and never plays it', async () => {
    const t = setup({ fetcher: fakeFetch({ fail: (url) => url.includes('/x.wav') }) });
    t.player.play(playOf('x', 'p1'));
    await settle();
    expect(t.errors).toEqual(['x']);
    expect(t.sources).toHaveLength(0);
    expect(t.played).toEqual([]);
  });

  it('preloads a failed sound again only when asked to retry', async () => {
    let down = true;
    const t = setup({ fetcher: fakeFetch({ fail: () => down }) });
    const lib = library([sound('a'), sound('b')]);
    t.player.setLibrary(lib);
    await settle();
    expect(t.errors).toEqual(['a', 'b']);
    expect(t.player.status()).toEqual({ ready: 0, total: 2 });

    down = false;
    t.player.setLibrary(lib); // a library update alone does not fetch a broken file again
    await settle();
    expect(t.fetch).toHaveBeenCalledTimes(2);

    t.player.retryFailed();
    t.player.setLibrary(lib);
    await settle();
    expect(t.fetch).toHaveBeenCalledTimes(4);
    expect(t.player.status()).toEqual({ ready: 2, total: 2 });
  });

  it('preloads again a sound the server was still converting (409) once the library lists it as ready', async () => {
    let converting = true;
    const t = setup({ fetcher: fakeFetch({ fail: () => (converting ? 409 : false) }) });
    const lib = library([sound('a')]);
    t.player.setLibrary(lib);
    await settle();
    expect(t.player.status()).toEqual({ ready: 0, total: 1 });

    // Its cached WAV was gone: the server converted it again (same rev). Batched updates may never
    // show it as converting to the page.
    converting = false;
    t.player.setLibrary(lib);
    await settle();
    expect(t.fetch).toHaveBeenCalledTimes(2);
    expect(t.player.status()).toEqual({ ready: 1, total: 1 });
  });

  it('forgets the failure of a version the library dropped while it was loading', async () => {
    let down = true;
    const t = setup({ fetcher: fakeFetch({ fail: () => down, hold: () => true }) });
    t.player.setLibrary(library([sound('a')]));
    t.player.setLibrary(library([sound('a', { status: 'converting' })])); // the update arrives first
    t.release();
    await settle();
    expect(t.errors).toEqual(['a']);

    down = false;
    t.player.setLibrary(library([sound('a')])); // ready again with the same rev
    t.release();
    await settle();
    expect(t.fetch).toHaveBeenCalledTimes(2);
    expect(t.player.status()).toEqual({ ready: 1, total: 1 });
  });

  it('clamps the volume and caps how many sounds play at once', async () => {
    const t = setup({ overlap: 'stack' });
    t.player.setLibrary(library([sound('a')]));
    await settle();
    t.player.play(playOf('a', 'loud', '1', 3));
    expect(t.gains[0]?.gain.value).toBe(1);
    for (let i = 0; i < 40; i++) t.player.play(playOf('a', `p${i}`));
    expect(t.player.playing).toBe(24);
    expect(t.sources[0]?.stoppedAt).not.toBeNull();
    expect(t.sources.at(-1)?.stoppedAt).toBeNull();
  });

  it('asks for a click when the browser keeps the audio suspended, and never reports those plays', async () => {
    const onBlocked = vi.fn();
    const t = setup({ onBlocked });
    t.player.setLibrary(library([sound('a')]));
    await settle();
    vi.useFakeTimers();
    // Without a click the browser never resumes the context (autoplay policy).
    const pending: (() => void)[] = [];
    t.raw.resume.mockImplementation(() => new Promise<undefined>((resolve) => pending.push(() => resolve(undefined))));
    t.raw.state = 'suspended';
    t.player.play(playOf('a', 'p1'));
    t.player.play(playOf('a', 'p2')); // restarts it: p1 is cut while still silent
    expect(t.raw.resume).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(t.played).toEqual([]); // the deck never shows a sound nobody heard
    // What was scheduled while suspended is dropped, so the unlock click does not burst it out.
    expect(t.player.playing).toBe(0);
    expect(t.sources[1]?.disconnect).toHaveBeenCalled();

    // The click starts the context: the old plays stay unreported, new ones count right away.
    t.raw.state = 'running';
    for (const resume of pending) resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.played).toEqual([]);
    t.player.play(playOf('a', 'p3'));
    expect(t.played).toEqual(['p3']);
  });

  it('keeps sounds scheduled while a new context is still starting and reports them once it runs', async () => {
    const onBlocked = vi.fn();
    const t = setup({ onBlocked });
    t.player.setLibrary(library([sound('a')]));
    await settle();
    vi.useFakeTimers();
    t.raw.state = 'suspended';
    t.player.play(playOf('a', 'p1'));
    t.player.play(playOf('a', 'p2')); // restarts it: a sound cut by a newer tap still counts
    expect(t.played).toEqual([]); // not yet: a suspended context makes no sound
    t.raw.state = 'running'; // OBS starts the context right away
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.played).toEqual(['p1', 'p2']);
    expect(onBlocked).not.toHaveBeenCalled();
    expect(t.player.playing).toBe(1);
  });
});

// ----------------------------------------------------------------- binding

const hello = (sfx: SfxLibrary): ServerEvent => ({
  type: 'hello',
  role: 'audio',
  settings: defaultSettings(),
  snapshot: {
    chat: [],
    queue: [],
    log: [],
    attention: [],
    sfx,
    poll: null,
    pomodoro: { mode: 'idle', running: false, remainingMs: 0, durationMs: 0, cycle: 0 },
    counters: [],
    github: [],
    status: { chat: 'off', eventsub: 'off', openrouter: 'off', obs: 'off', github: 'off', spentUsd: 0, startedAt: 0 },
    scene: null,
    obsScenes: [],
  },
});

function boundPlayer(client: StreamClient, fetcher = fakeFetch()) {
  const fake = fakeAudio();
  const player = new SfxPlayer({
    audio: () => fake.audio,
    fetch: fetcher.fetch,
    onPlayed: (playId) => client.send({ type: 'sfx:played', playId }),
    overlap: () => client.getSnapshot().settings.sfx.overlap,
  });
  return { ...fake, fetch: fetcher.fetch, player };
}

describe('bindSfxPlayer', () => {
  it('preloads on hello, plays on sfx:play, sends sfx:played and stops on sfx:stop', async () => {
    const client = new StreamClient('audio');
    const send = vi.spyOn(client, 'send').mockImplementation(() => undefined);
    const t = boundPlayer(client);
    const unbind = bindSfxPlayer(client, t.player);

    client.dispatch(hello(library([sound('a')])));
    await settle();
    expect(t.player.status()).toEqual({ ready: 1, total: 1 });

    client.dispatch({ type: 'sfx:play', playId: 'p1', soundId: 'a', url: sfxWavUrl('a', '1'), volume: 0.7 });
    expect(send).toHaveBeenCalledWith({ type: 'sfx:played', playId: 'p1' });
    expect(t.gains[0]?.gain.value).toBe(0.7);

    client.dispatch({ type: 'sfx:stop' });
    expect(t.sources[0]?.stoppedAt).not.toBeNull();

    client.dispatch({ type: 'sfx:library', library: library([sound('a', { rev: '2' })]) });
    await settle();
    expect(t.fetch).toHaveBeenLastCalledWith('/api/sfx/sounds/a.wav?rev=2');

    unbind();
    client.dispatch({ type: 'sfx:play', playId: 'p2', soundId: 'a', url: sfxWavUrl('a', '2'), volume: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retries the preloads that failed while the server was away when it says hello again', async () => {
    let down = true;
    const client = new StreamClient('audio');
    const t = boundPlayer(client, fakeFetch({ fail: () => down }));
    bindSfxPlayer(client, t.player);
    client.dispatch(hello(library([sound('a'), sound('b')])));
    await settle();
    expect(t.player.status()).toEqual({ ready: 0, total: 2 });

    down = false; // the WebSocket reconnects to the restarted server
    client.dispatch(hello(library([sound('a'), sound('b')])));
    await settle();
    expect(t.fetch).toHaveBeenCalledTimes(4);
    expect(t.player.status()).toEqual({ ready: 2, total: 2 });
  });

  it('uses a library that arrived before the player was bound', async () => {
    const client = new StreamClient('audio');
    client.dispatch(hello(library([sound('a'), sound('b')])));
    const t = boundPlayer(client);
    bindSfxPlayer(client, t.player);
    await settle();
    expect(t.player.status()).toEqual({ ready: 2, total: 2 });
  });
});
