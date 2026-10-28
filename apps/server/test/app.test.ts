import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { alertSpeech, createApp } from '../src/app.js';
import { loadEnv } from '../src/env.js';
import { silentLogger } from '../src/log.js';

const dataDir = mkdtempSync(path.join(tmpdir(), 'stream95-test-'));
const env = loadEnv(
  { DATA_DIR: dataDir, SOUNDS_DIR: path.join(dataDir, 'sons'), PORT: '0', OPENROUTER_API_KEY: '' } as NodeJS.ProcessEnv,
  fileURLToPath(new URL('../../..', import.meta.url)),
);
env.dataDir = dataDir;
// Never serve the real deck build from these tests (it may or may not exist).
env.deckDist = path.join(dataDir, 'no-deck');

let server: Awaited<ReturnType<typeof createApp>>;
const H = { host: 'localhost:1995', 'x-stream95': '1', 'content-type': 'application/json' };

beforeAll(async () => {
  server = await createApp({ env, log: silentLogger, connectServices: false });
  await server.app.ready();
});

afterAll(async () => {
  await server.stop();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('http api', () => {
  it('reports health', async () => {
    const res = await server.app.inject({ method: 'GET', url: '/api/health', headers: { host: 'localhost' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('blocks foreign Host headers (DNS rebinding)', async () => {
    const res = await server.app.inject({ method: 'GET', url: '/api/health', headers: { host: 'evil.example' } });
    expect(res.statusCode).toBe(403);
  });

  it('requires the x-stream95 header and same origin for writes (CSRF)', async () => {
    const noHeader = await server.app.inject({
      method: 'POST',
      url: '/api/chat/clear',
      headers: { host: 'localhost' },
    });
    expect(noHeader.statusCode).toBe(403);
    const crossOrigin = await server.app.inject({
      method: 'POST',
      url: '/api/chat/clear',
      headers: { ...H, origin: 'https://evil.example' },
    });
    expect(crossOrigin.statusCode).toBe(403);
    const ok = await server.app.inject({ method: 'POST', url: '/api/chat/clear', headers: H, payload: {} });
    expect(ok.statusCode).toBe(200);
  });

  it('moderates simulated chat without an LLM key (local rules only)', async () => {
    const shown = await server.app.inject({
      method: 'POST',
      url: '/api/chat/simulate',
      headers: H,
      payload: { user: 'ana', text: 'boa noite chat' },
    });
    expect(shown.json().status).toBe('shown');
    const blocked = await server.app.inject({
      method: 'POST',
      url: '/api/chat/simulate',
      headers: H,
      payload: { user: 'troll', text: 'seu boiola' },
    });
    expect(blocked.json().status).toBe('rejected');
    const held = await server.app.inject({
      method: 'POST',
      url: '/api/chat/simulate',
      headers: H,
      payload: { user: 'bia', text: 'veja daora.xyz/promo' },
    });
    expect(held.json().status).toBe('held');
    const approve = await server.app.inject({
      method: 'POST',
      url: `/api/mod/${held.json().id}/approve`,
      headers: H,
      payload: {},
    });
    expect(approve.json().status).toBe('shown');
  });

  it('hides poll votes and counts them', async () => {
    await server.app.inject({
      method: 'POST',
      url: '/api/poll',
      headers: H,
      payload: { question: 'Tabs ou espaços?', options: ['Tabs', 'Espaços'] },
    });
    const vote = await server.app.inject({
      method: 'POST',
      url: '/api/chat/simulate',
      headers: H,
      payload: { user: 'zé', text: '!2' },
    });
    expect(vote.json()).toEqual({ hidden: true });
    const state = await server.app.inject({ method: 'GET', url: '/api/state', headers: { host: 'localhost' } });
    expect(state.json().snapshot.poll.options[1].votes).toBe(1);
  });

  it('validates and persists settings', async () => {
    const bad = await server.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: H,
      payload: { tts: { voice: 'rachel' } },
    });
    expect(bad.statusCode).toBe(400);
    const good = await server.app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: H,
      payload: { moderation: { capsRatio: 0.9 } },
    });
    expect(good.json().moderation.capsRatio).toBe(0.9);
  });

  it('simulates alerts and explains assistant errors without a key', async () => {
    const alert = await server.app.inject({
      method: 'POST',
      url: '/api/alerts/simulate',
      headers: H,
      payload: { kind: 'raid', user: 'amigo', amount: 42 },
    });
    expect(alert.json()).toMatchObject({ kind: 'raid', user: 'amigo', amount: 42 });
    const ask = await server.app.inject({
      method: 'POST',
      url: '/api/assistant/ask',
      headers: H,
      payload: { question: 'oi?' },
    });
    expect(ask.statusCode).toBe(503);
    expect(ask.json().error).toMatch(/^Erro: .+ — Solução: /);
  });
});

describe('alertSpeech', () => {
  it('speaks every alert kind in Portuguese', () => {
    const base = { id: '1', timestamp: 0, source: 'simulator' as const };
    expect(alertSpeech({ ...base, kind: 'follow', user: 'Ana' })).toBe('Valeu pelo follow, Ana!');
    expect(alertSpeech({ ...base, kind: 'resub', user: 'Bia', months: 1 })).toContain('1 mês');
    expect(alertSpeech({ ...base, kind: 'giftsub', user: 'Caio', amount: 5 })).toContain('5 inscrições');
    expect(alertSpeech({ ...base, kind: 'raid', user: 'Duda', amount: 1 })).toContain('1 pessoa');
  });
});

describe('overlay static files', () => {
  it('serves assets created after startup (rebuild while running) and falls back to the SPA', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'stream95-dist-'));
    mkdirSync(path.join(root, 'assets'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html><div id="root"></div>');
    const staticEnv = { ...env, dataDir: mkdtempSync(path.join(tmpdir(), 'stream95-data-')), overlayDist: root };
    const srv = await createApp({ env: staticEnv, log: silentLogger, connectServices: false });
    await srv.app.ready();
    try {
      writeFileSync(path.join(root, 'assets', 'index-new.js'), 'export {};');
      const js = await srv.app.inject({ method: 'GET', url: '/assets/index-new.js', headers: { host: 'localhost' } });
      expect(js.statusCode).toBe(200);
      expect(js.headers['content-type']).toContain('javascript');
      const page = await srv.app.inject({ method: 'GET', url: '/scene/main', headers: { host: 'localhost' } });
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain('<div id="root">');
      const api = await srv.app.inject({ method: 'GET', url: '/api/nope', headers: { host: 'localhost' } });
      expect(api.statusCode).toBe(404);
    } finally {
      await srv.stop();
      rmSync(root, { recursive: true, force: true });
      rmSync(staticEnv.dataDir, { recursive: true, force: true });
    }
  });
});
