import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerEvent } from '@stream95/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/env.js';
import type { HubSocket } from '../src/hub.js';
import { silentLogger } from '../src/log.js';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const LOCAL = { host: 'localhost:1995' };
const WRITE = { ...LOCAL, 'x-stream95': '1', 'content-type': 'application/json' };
const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** 0.2 s, 44.1 kHz mono 16-bit sine: a valid WAV the server converts to 48 kHz stereo. */
function sineWav(): Buffer {
  const rate = 44_100;
  const samples = Math.round(rate * 0.2);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++)
    data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12_000), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function makeServer(opts: { deck?: boolean; overlay?: boolean; sounds?: boolean } = {}) {
  const dataDir = tempDir('stream95-deck-data-');
  const soundsDir = path.join(dataDir, 'sons');
  if (opts.sounds) {
    mkdirSync(path.join(soundsDir, 'efeitos'), { recursive: true });
    writeFileSync(path.join(soundsDir, 'efeitos', 'bip.wav'), sineWav());
  }
  const overlay = tempDir('stream95-overlay-dist-');
  if (opts.overlay !== false)
    writeFileSync(path.join(overlay, 'index.html'), '<!doctype html><div id="overlay"></div>');
  const deck = tempDir('stream95-deck-dist-');
  if (opts.deck) {
    mkdirSync(path.join(deck, 'assets'));
    writeFileSync(path.join(deck, 'index.html'), '<!doctype html><div id="deck"></div>');
    writeFileSync(path.join(deck, 'assets', 'deck.js'), 'export {};');
  }
  const env = {
    ...loadEnv(
      {
        DATA_DIR: dataDir,
        SOUNDS_DIR: soundsDir,
        PORT: '0',
        LAN: 'false',
        OPENROUTER_API_KEY: '',
      } as NodeJS.ProcessEnv,
      ROOT,
    ),
    dataDir,
    overlayDist: overlay,
    deckDist: deck,
  };
  const server = await createApp({ env, log: silentLogger, connectServices: false });
  await server.app.ready();
  cleanups.push(() => server.stop());
  return server;
}

/** In-memory WebSocket for the hub: records what the server sends and lets the test speak as the client. */
function fakeSocket() {
  const sent: ServerEvent[] = [];
  const handlers: Record<string, ((...args: never[]) => void)[]> = {};
  const socket: HubSocket = {
    readyState: 1,
    send: (data) => void sent.push(JSON.parse(data) as ServerEvent),
    on: (event, listener) => {
      handlers[event] = [...(handlers[event] ?? []), listener];
      return socket;
    },
  };
  const say = (event: unknown) => {
    for (const h of handlers.message ?? []) (h as (raw: string) => void)(JSON.stringify(event));
  };
  const close = () => {
    for (const h of handlers.close ?? []) (h as () => void)();
  };
  return { socket, sent, say, close };
}

describe('control deck under /dock/', () => {
  it('serves the deck, redirects /dock keeping the pairing code and falls back to the deck SPA', async () => {
    const server = await makeServer({ deck: true });
    const inject = (url: string) => server.app.inject({ method: 'GET', url, headers: LOCAL });

    const bare = await inject('/dock');
    expect(bare.statusCode).toBe(301);
    expect(bare.headers.location).toBe('/dock/');
    const paired = await inject('/dock?pair=ABCD2345');
    expect(paired.headers.location).toBe('/dock/?pair=ABCD2345');

    const home = await inject('/dock/');
    expect(home.statusCode).toBe(200);
    expect(home.body).toContain('id="deck"');
    const asset = await inject('/dock/assets/deck.js');
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['content-type']).toContain('javascript');
    const deepLink = await inject('/dock/qualquer/rota');
    expect(deepLink.statusCode).toBe(200);
    expect(deepLink.body).toContain('id="deck"');
    expect(deepLink.headers['cache-control']).toBe('no-cache');

    const overlay = await inject('/scene/main');
    expect(overlay.body).toContain('id="overlay"');
    const api = await inject('/api/nada');
    expect(api.statusCode).toBe(404);
    expect(api.json().error).toMatch(/^Erro: .+ — Solução: /);
  });

  it('falls back to the deck SPA when only the deck is built (no overlay build)', async () => {
    const server = await makeServer({ deck: true, overlay: false });
    expect(server.deckBuilt).toBe(true);
    const inject = (url: string) => server.app.inject({ method: 'GET', url, headers: LOCAL });

    for (const url of ['/dock/', '/dock/sons', '/dock/qualquer/rota']) {
      const res = await inject(url);
      expect(res.statusCode, url).toBe(200);
      expect(res.body, url).toContain('id="deck"');
    }
    expect((await inject('/dock/sons')).headers['cache-control']).toBe('no-cache');
    expect((await inject('/dock/assets/deck.js')).statusCode).toBe(200);

    // The overlay side still explains how to build it.
    const scene = await inject('/scene/main');
    expect(scene.statusCode).toBe(404);
    expect(scene.body).toContain('O overlay ainda não foi compilado');
    expect((await inject('/')).body).toContain('O overlay ainda não foi compilado');
    const api = await inject('/api/nada');
    expect(api.statusCode).toBe(404);
    expect(api.json().error).toMatch(/^Erro: .+ — Solução: /);
  });

  it('explains how to build the deck when it is missing, without sending a phone to localhost', async () => {
    const server = await makeServer({ deck: false });
    expect(server.deckBuilt).toBe(false);
    for (const url of ['/dock/', '/dock/sons', '/dock/?pair=ABCD2345']) {
      const res = await server.app.inject({ method: 'GET', url, headers: LOCAL });
      expect(res.statusCode, url).toBe(404);
      expect(res.headers['content-type'], url).toContain('text/html');
      expect(res.body, url).toContain('O painel ainda não foi compilado');
    }
    const res = await server.app.inject({ method: 'GET', url: '/dock/', headers: LOCAL });
    // Readable on a phone, says what to do on the PC and that the dev link only works there.
    expect(res.body).toContain('name="viewport"');
    expect(res.body).toContain('npm run build');
    expect(res.body).toContain('reinicie o stream95');
    expect(res.body).toContain('http://localhost:5173/dock/');
    expect(res.body).toMatch(/não abre no celular/);
  });
});

describe('soundboard wiring', () => {
  it('sends the library in hello, plays on the audio page and reports the latency to the deck', async () => {
    const server = await makeServer({ sounds: true });
    await server.services.sfx.idle();
    const audio = fakeSocket();
    const dock = fakeSocket();
    server.services.hub.add(audio.socket, 'audio');
    server.services.hub.add(dock.socket, 'dock');

    const hello = dock.sent[0];
    expect(hello?.type).toBe('hello');
    const sound = hello?.type === 'hello' ? hello.snapshot.sfx.sounds[0] : undefined;
    expect(sound).toMatchObject({ name: 'bip', category: 'efeitos', status: 'ready' });
    if (!sound) throw new Error('sound missing');

    const res = await server.app.inject({
      method: 'POST',
      url: '/api/sfx/play',
      headers: WRITE,
      payload: { soundId: sound.id },
    });
    expect(res.statusCode).toBe(200);
    const { playId } = res.json() as { playId: string };
    const play = audio.sent.find((e) => e.type === 'sfx:play');
    expect(play).toMatchObject({ type: 'sfx:play', playId, soundId: sound.id });
    expect(play?.type === 'sfx:play' && play.url).toBe(`/api/sfx/sounds/${sound.id}.wav?rev=${sound.rev}`);

    audio.say({ type: 'sfx:played', playId });
    const played = dock.sent.find((e) => e.type === 'sfx:played');
    expect(played).toMatchObject({ type: 'sfx:played', playId, soundId: sound.id });
    expect(played?.type === 'sfx:played' && played.latencyMs).toBeGreaterThanOrEqual(0);
    // The audio page does not need the latency echo, and a repeated report is ignored.
    expect(audio.sent.some((e) => e.type === 'sfx:played')).toBe(false);
    audio.say({ type: 'sfx:played', playId });
    expect(dock.sent.filter((e) => e.type === 'sfx:played')).toHaveLength(1);

    const wav = await server.app.inject({
      method: 'GET',
      url: play?.type === 'sfx:play' ? play.url : '',
      headers: LOCAL,
    });
    expect(wav.statusCode).toBe(200);
    expect(wav.headers['content-type']).toContain('audio/wav');
  });

  it('refuses a play right away while no audio page is open', async () => {
    const server = await makeServer({ sounds: true });
    await server.services.sfx.idle();
    const dock = fakeSocket();
    server.services.hub.add(dock.socket, 'dock');
    const hello = dock.sent[0];
    const sound = hello?.type === 'hello' ? hello.snapshot.sfx.sounds[0] : undefined;
    if (!sound) throw new Error('sound missing');
    const play = () =>
      server.app.inject({ method: 'POST', url: '/api/sfx/play', headers: WRITE, payload: { soundId: sound.id } });

    const refused = await play();
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toMatch(/^Erro: .+ — Solução: .*\/overlay\/audio/);
    expect(dock.sent.some((e) => e.type === 'sfx:play')).toBe(false);

    // the count is live: it follows the audio page connecting and closing
    const audio = fakeSocket();
    server.services.hub.add(audio.socket, 'audio');
    expect((await play()).statusCode).toBe(200);
    expect(audio.sent.some((e) => e.type === 'sfx:play')).toBe(true);
    audio.close();
    expect((await play()).statusCode).toBe(409);
  });

  it('delivers the blue screen to the audio page so its jingle plays', async () => {
    const server = await makeServer();
    const audio = fakeSocket();
    server.services.hub.add(audio.socket, 'audio');
    await server.app.inject({ method: 'POST', url: '/api/fx/bsod', headers: WRITE, payload: {} });
    expect(audio.sent.some((e) => e.type === 'bsod')).toBe(true);
  });
});
