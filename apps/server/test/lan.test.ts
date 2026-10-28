import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingHttpHeaders } from 'node:http';
import type { Socket } from 'node:net';
import { type NetworkInterfaceInfo, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PairedDevice } from '@stream95/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { loadEnv } from '../src/env.js';
import { cleanDeviceName, DEVICES_FILE, DeviceRegistry, LAST_SEEN_EVERY_MS } from '../src/lan/devices.js';
import { type AccessContext, type AccessRequest, decideAccess, NOT_PAIRED_ERROR } from '../src/lan/guard.js';
import { pairingBanner, sceneAccessNotice, WS_UNPAIRED_CODE } from '../src/lan/lan.js';
import { addressRank, hostnameOf, isLoopbackAddress, lanAddresses, pairingUrl } from '../src/lan/net.js';
import {
  FailureLimiter,
  generatePairCode,
  normalizePairCode,
  PAIR_ALPHABET,
  PAIR_CODE_TTL_MS,
  PairingCodes,
} from '../src/lan/pairing.js';
import { silentLogger } from '../src/log.js';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const PC_IP = '192.168.1.50';
const PHONE_IP = '192.168.1.77';
const LAN_HOST = `${PC_IP}:1995`;
const LAN_ORIGIN = `http://${LAN_HOST}`;

const nic = (address: string, internal = false): NetworkInterfaceInfo => ({
  address,
  netmask: '255.255.255.0',
  family: 'IPv4',
  mac: '00:00:00:00:00:00',
  internal,
  cidr: `${address}/24`,
});

const fakeInterfaces = () => ({
  'Loopback Pseudo-Interface 1': [nic('127.0.0.1', true)],
  'vEthernet (WSL)': [nic('172.20.0.1')],
  'Wi-Fi': [nic(PC_IP)],
});

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

const waitFor = async (check: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 10));
  }
};

type Method = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Call = { headers?: Record<string, string>; payload?: unknown; token?: string; ip?: string; host?: string };

/** A server with fake network interfaces and a static dist folder, on its own data folder. */
async function makeServer(vars: Record<string, string> = {}, now?: () => number) {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'stream95-lan-'));
  const dist = mkdtempSync(path.join(tmpdir(), 'stream95-lan-dist-'));
  mkdirSync(path.join(dist, 'assets'));
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><div id="root"></div>');
  writeFileSync(path.join(dist, 'assets', 'app.js'), 'export {};');
  const env = {
    ...loadEnv(
      {
        DATA_DIR: dataDir,
        SOUNDS_DIR: path.join(dataDir, 'sons'),
        PORT: '1995',
        OPENROUTER_API_KEY: '',
        ...vars,
      } as NodeJS.ProcessEnv,
      ROOT,
    ),
    dataDir,
    overlayDist: dist,
    deckDist: dist,
  };
  const server = await createApp({
    env,
    log: silentLogger,
    connectServices: false,
    lan: { interfaces: fakeInterfaces, ...(now ? { now } : {}) },
  });
  await server.app.ready();

  const lan = (method: Method, url: string, call: Call = {}) => {
    const write = method !== 'GET' && method !== 'HEAD';
    return server.app.inject({
      method,
      url,
      remoteAddress: call.ip ?? PHONE_IP,
      headers: {
        host: call.host ?? LAN_HOST,
        ...(write ? { 'x-stream95': '1', origin: LAN_ORIGIN, 'content-type': 'application/json' } : {}),
        ...(call.token ? { 'x-stream95-token': call.token } : {}),
        ...call.headers,
      },
      ...(call.payload !== undefined ? { payload: call.payload as object } : write ? { payload: {} } : {}),
    });
  };
  const local = (method: Method, url: string, payload?: object) => {
    // like the deck: GET and DELETE go without a body (and without a JSON content-type)
    const body = payload ?? (method === 'GET' || method === 'DELETE' ? undefined : {});
    return server.app.inject({
      method,
      url,
      headers: {
        host: 'localhost:1995',
        'x-stream95': '1',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { payload: body } : {}),
    });
  };
  const pair = async (name = 'iPhone · Safari', ip = PHONE_IP) => {
    const { code } = (await local('GET', '/api/devices/pair-info')).json() as { code: string };
    const res = await lan('POST', '/api/devices/pair', { payload: { code, name }, ip });
    expect(res.statusCode).toBe(200);
    return res.json() as { token: string; device: PairedDevice };
  };
  const ws = async (url: string, opts: { ip?: string; host?: string; origin?: string } = {}) => {
    const messages: { type: string; role?: string }[] = [];
    const socket = await server.app.injectWS(
      url,
      {
        headers: { host: opts.host ?? LAN_HOST, ...(opts.origin ? { origin: opts.origin } : {}) },
        socket: { remoteAddress: opts.ip ?? PHONE_IP } as Socket,
      },
      { onInit: (w) => w.on('message', (data) => messages.push(JSON.parse(String(data)))) },
    );
    return { socket, messages };
  };
  const cleanup = async () => {
    await server.stop();
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(dist, { recursive: true, force: true });
  };
  return { server, dataDir, lan, local, pair, ws, cleanup };
}

describe('LAN access through the real server', () => {
  let t: Awaited<ReturnType<typeof makeServer>>;
  beforeAll(async () => {
    t = await makeServer();
  });
  afterAll(async () => {
    await t.cleanup();
  });

  it('blocks foreign Host headers from the LAN and from this PC (DNS rebinding)', async () => {
    expect((await t.lan('GET', '/api/health', { host: 'evil.example' })).statusCode).toBe(403);
    expect((await t.lan('GET', '/assets/app.js', { host: 'evil.example:1995' })).statusCode).toBe(403);
    const fromPc = await t.server.app.inject({ method: 'GET', url: '/api/health', headers: { host: 'evil.example' } });
    expect(fromPc.statusCode).toBe(403);
    expect(fromPc.json().error).toMatch(/^Erro: .+ — Solução: /);
    // this PC's own LAN address is a valid host (the phone just needs to pair)
    expect((await t.lan('GET', '/api/health')).statusCode).toBe(401);
  });

  it('keeps the local rules for this PC: no token, CSRF header and same Origin on writes', async () => {
    expect((await t.local('GET', '/api/health')).statusCode).toBe(200);
    const noHeader = await t.server.app.inject({
      method: 'POST',
      url: '/api/chat/clear',
      headers: { host: 'localhost' },
    });
    expect(noHeader.statusCode).toBe(403);
    const crossOrigin = await t.server.app.inject({
      method: 'POST',
      url: '/api/chat/clear',
      headers: { host: 'localhost:1995', 'x-stream95': '1', origin: 'https://evil.example' },
    });
    expect(crossOrigin.statusCode).toBe(403);
    // percent-encoded paths reach the same route, so they get the same rules
    const encoded = await t.server.app.inject({
      method: 'POST',
      url: '/%61pi/chat/clear',
      headers: { host: 'localhost' },
    });
    expect(encoded.statusCode).toBe(403);
    expect((await t.local('POST', '/api/chat/clear')).statusCode).toBe(200);
    const { messages } = await t.ws('/ws?role=dock', { ip: '127.0.0.1', host: 'localhost:1995' });
    await waitFor(() => messages.length > 0);
    expect(messages[0]).toMatchObject({ type: 'hello', role: 'dock' });
    await expect(
      t.ws('/ws?role=dock', { ip: '127.0.0.1', host: 'localhost:1995', origin: 'https://evil.example' }),
    ).rejects.toThrow(/403/);
  });

  it('serves static files to LAN clients without a token', async () => {
    const js = await t.lan('GET', '/assets/app.js');
    expect(js.statusCode).toBe(200);
    expect((await t.lan('HEAD', '/assets/app.js')).statusCode).toBe(200);
    const spa = await t.lan('GET', '/scene/main');
    expect(spa.statusCode).toBe(200);
    expect(spa.body).toContain('<div id="root">');
  });

  it('asks unpaired LAN clients to pair (API and WebSocket)', async () => {
    for (const url of ['/api/health', '/api/state', '/%61pi/state', '/api/nope', '/API/state']) {
      const res = await t.lan('GET', url);
      expect(res.statusCode, url).toBe(401);
      expect(res.json()).toEqual({ error: NOT_PAIRED_ERROR, pair: true });
    }
    expect((await t.lan('GET', '/api/state', { token: 'a'.repeat(43) })).statusCode).toBe(401);
    expect((await t.lan('POST', '/api/chat/clear')).statusCode).toBe(401);
    // a loopback socket with a LAN Host (a proxy) is not "this PC"
    expect((await t.lan('GET', '/api/state', { ip: '127.0.0.1' })).statusCode).toBe(401);
    await expect(t.ws('/ws?role=dock')).rejects.toThrow(/401/);
    await expect(t.ws(`/ws?role=dock&token=${'b'.repeat(43)}`)).rejects.toThrow(/401/);
  });

  it('pairs a phone and accepts its token in the header and in the /ws query', async () => {
    const { token, device } = await t.pair();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(device).toMatchObject({ name: 'iPhone · Safari' });
    expect(device).not.toHaveProperty('tokenHash');

    expect((await t.lan('GET', '/api/state', { token })).statusCode).toBe(200);
    expect((await t.lan('POST', '/api/chat/clear', { token })).statusCode).toBe(200);
    // LAN writes still need the CSRF header and the same Origin
    const noCsrf = await t.lan('POST', '/api/chat/clear', { token, headers: { 'x-stream95': '0' } });
    expect(noCsrf.statusCode).toBe(403);
    const cross = await t.lan('POST', '/api/chat/clear', { token, headers: { origin: 'http://evil.example' } });
    expect(cross.statusCode).toBe(403);

    const listed = (await t.lan('GET', '/api/devices', { token })).json() as PairedDevice[];
    expect(listed.map((d) => d.id)).toContain(device.id);

    const { socket, messages } = await t.ws(`/ws?role=dock&token=${encodeURIComponent(token)}`, {
      origin: LAN_ORIGIN,
    });
    await waitFor(() => messages.length > 0);
    expect(messages[0]).toMatchObject({ type: 'hello', role: 'dock' });
    socket.terminate();
    await expect(t.ws(`/ws?role=dock&token=${token}`, { origin: 'http://evil.example' })).rejects.toThrow(/403/);
  });

  it('stores only the sha256 of each token in devices.json', async () => {
    const { token, device } = await t.pair('Android · Chrome');
    await t.server.lan.devices.flush();
    const raw = readFileSync(path.join(t.dataDir, DEVICES_FILE), 'utf8');
    expect(raw).not.toContain(token);
    const file = JSON.parse(raw) as { version: number; devices: { id: string; tokenHash: string }[] };
    expect(file.version).toBe(1);
    expect(file.devices.find((d) => d.id === device.id)?.tokenHash).toBe(sha256(token));
  });

  it('rate limits wrong codes: 5 failures per minute per IP, then 429', async () => {
    const ip = '192.168.1.66';
    for (let i = 0; i < 5; i++) {
      const wrong = await t.lan('POST', '/api/devices/pair', { ip, payload: { code: 'AAAAAAAA', name: 'x' } });
      expect(wrong.statusCode).toBe(401);
      expect(wrong.json().error).toMatch(/^Erro: código de pareamento errado — Solução: /);
    }
    const { code } = (await t.local('GET', '/api/devices/pair-info')).json() as { code: string };
    const limited = await t.lan('POST', '/api/devices/pair', { ip, payload: { code, name: 'x' } });
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    // the limit is per IP: another phone can still pair with the same code
    expect((await t.lan('POST', '/api/devices/pair', { ip: '192.168.1.67', payload: { code } })).statusCode).toBe(200);
  });

  it('makes the code single use and rotates it on demand', async () => {
    const { code } = (await t.local('GET', '/api/devices/pair-info')).json() as { code: string };
    expect((await t.lan('POST', '/api/devices/pair', { payload: { code, name: 'a' } })).statusCode).toBe(200);
    const reused = await t.lan('POST', '/api/devices/pair', { payload: { code, name: 'b' } });
    expect(reused.statusCode).toBe(401);
    expect(reused.json().error).toMatch(/expirou ou já foi usado/);

    const before = (await t.local('GET', '/api/devices/pair-info')).json() as { code: string };
    const rotated = (await t.local('POST', '/api/devices/pair-code')).json() as { code: string; url: string };
    expect(rotated.code).not.toBe(before.code);
    expect(rotated.url).toBe(`http://${PC_IP}:1995/dock/?pair=${rotated.code}`);
    const old = await t.lan('POST', '/api/devices/pair', { payload: { code: before.code } });
    expect(old.statusCode).toBe(401);
    // typed by hand: lowercase with a dash still works
    const typed = `${rotated.code.slice(0, 4).toLowerCase()}-${rotated.code.slice(4).toLowerCase()}`;
    expect((await t.lan('POST', '/api/devices/pair', { payload: { code: typed } })).statusCode).toBe(200);
  });

  it('pairing needs the CSRF header and the same Origin too', async () => {
    const { code } = (await t.local('GET', '/api/devices/pair-info')).json() as { code: string };
    const noCsrf = await t.lan('POST', '/api/devices/pair', { payload: { code }, headers: { 'x-stream95': '' } });
    expect(noCsrf.statusCode).toBe(403);
    const cross = await t.lan('POST', '/api/devices/pair', {
      payload: { code },
      headers: { origin: 'http://evil.example' },
    });
    expect(cross.statusCode).toBe(403);
    const bad = await t.lan('POST', '/api/devices/pair', { payload: { code: 123 } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatch(/^Erro: corpo inválido — Solução: /);
  });

  it('revoking a device kills its token and closes its WebSockets', async () => {
    const { token, device } = await t.pair('iPad · Safari');
    const { socket, messages } = await t.ws(`/ws?role=dock&token=${token}`);
    await waitFor(() => messages.length > 0);
    const closed = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)));

    const res = await t.local('DELETE', `/api/devices/${device.id}`);
    expect(res.json()).toEqual({ ok: true });
    expect(await closed).toBe(WS_UNPAIRED_CODE);
    expect((await t.lan('GET', '/api/state', { token })).statusCode).toBe(401);
    await expect(t.ws(`/ws?role=dock&token=${token}`)).rejects.toThrow(/401/);
    const again = await t.local('DELETE', `/api/devices/${device.id}`);
    expect(again.statusCode).toBe(404);
    expect(again.json().error).toMatch(/^Erro: aparelho não encontrado — Solução: /);
  });

  it('describes the pairing URLs, best LAN address first, and serves the QR code', async () => {
    const info = (await t.local('GET', '/api/devices/pair-info')).json();
    expect(info).toMatchObject({ lan: true, hint: null });
    expect(info.code).toMatch(new RegExp(`^[${PAIR_ALPHABET}]{8}$`));
    expect(info.url).toBe(`http://${PC_IP}:1995/dock/?pair=${info.code}`);
    expect(info.urls).toEqual([info.url, `http://172.20.0.1:1995/dock/?pair=${info.code}`]);
    expect(info.expiresAt).toBeGreaterThan(Date.now());

    const qr = await t.local('GET', '/api/devices/pair-qr.svg');
    expect(qr.statusCode).toBe(200);
    expect(qr.headers['content-type']).toContain('image/svg+xml');
    expect(qr.headers['cache-control']).toBe('no-store');
    expect(qr.body).toMatch(/^<svg/);
  });

  it('prints a terminal banner with the QR code, the URL and the code', async () => {
    const { code } = t.server.lan.pairInfo();
    const banner = await pairingBanner(t.server.lan, { platform: 'win32' });
    expect(banner).toContain('Painel no celular');
    expect(banner).toContain(`http://${PC_IP}:1995/dock/?pair=${code}`);
    expect(banner).toContain(`Código: ${code} (vale 10 min)`);
    expect(banner).toContain("permita o Node.js em 'Redes privadas'");
    expect(banner).toMatch(/[▀▄█]/);
    expect(await pairingBanner(t.server.lan, { platform: 'linux', deckBuilt: true })).not.toContain('Firewall');
  });

  it('prints how to build the deck instead of a QR code that would open a "not built" page', async () => {
    const banner = await pairingBanner(t.server.lan, { platform: 'win32', deckBuilt: false });
    expect(banner).toBe(
      '  Painel no celular ...... o painel não foi compilado. Rode npm run build -w @stream95/deck e reinicie o stream95',
    );
    expect(banner).not.toMatch(/[▀▄█]/);
    expect(banner).not.toContain('?pair=');
  });

  it('asks the terminal for a fresh QR code when someone scans a stale one', async () => {
    const notice = vi.fn();
    t.server.lan.onStaleCode = notice;
    const { code } = (await t.local('GET', '/api/devices/pair-info')).json() as { code: string };
    await t.local('POST', '/api/devices/pair-code');
    await t.lan('POST', '/api/devices/pair', { payload: { code } });
    await t.lan('POST', '/api/devices/pair', { payload: { code } });
    expect(notice).toHaveBeenCalledTimes(1);
    t.server.lan.onStaleCode = null;
  });
});

describe('pairing code expiry (injected clock)', () => {
  it('expires a code after 10 minutes and shows a fresh one', async () => {
    let clock = 1_700_000_000_000;
    const t = await makeServer({}, () => clock);
    try {
      const first = (await t.local('GET', '/api/devices/pair-info')).json() as { code: string; expiresAt: number };
      expect(first.expiresAt).toBe(clock + PAIR_CODE_TTL_MS);
      clock += PAIR_CODE_TTL_MS;
      const late = await t.lan('POST', '/api/devices/pair', { payload: { code: first.code } });
      expect(late.statusCode).toBe(401);
      expect(late.json().error).toMatch(/expirou/);
      const next = (await t.local('GET', '/api/devices/pair-info')).json() as { code: string };
      expect(next.code).not.toBe(first.code);
      clock += PAIR_CODE_TTL_MS - 1;
      expect((await t.lan('POST', '/api/devices/pair', { payload: { code: next.code } })).statusCode).toBe(200);
    } finally {
      await t.cleanup();
    }
  });
});

describe('LAN off', () => {
  const env = (vars: Record<string, string>) => loadEnv(vars as NodeJS.ProcessEnv, ROOT);

  it('binds to this PC only unless HOST says otherwise', () => {
    expect(env({})).toMatchObject({ LAN: true, HOST: '0.0.0.0', hostFromEnv: false });
    expect(env({ LAN: '' })).toMatchObject({ LAN: true, HOST: '0.0.0.0' });
    expect(env({ LAN: 'false' })).toMatchObject({ LAN: false, HOST: '127.0.0.1', hostFromEnv: false });
    expect(env({ LAN: '0' })).toMatchObject({ LAN: false, HOST: '127.0.0.1' });
    expect(env({ LAN: 'FALSE' })).toMatchObject({ LAN: false });
    expect(env({ LAN: 'true', HOST: '127.0.0.1' })).toMatchObject({ LAN: true, HOST: '127.0.0.1' });
    expect(env({ LAN: 'false', HOST: '0.0.0.0' })).toMatchObject({ LAN: false, HOST: '0.0.0.0' });
  });

  it('keeps an older .env with HOST and no LAN line in the old mode (explicit LAN always wins)', () => {
    expect(env({ HOST: '0.0.0.0' })).toMatchObject({ LAN: false, HOST: '0.0.0.0', hostFromEnv: true });
    expect(env({ HOST: '192.168.0.10', LAN: '' })).toMatchObject({ LAN: false, HOST: '192.168.0.10' });
    expect(env({ HOST: '127.0.0.1' })).toMatchObject({ LAN: false, HOST: '127.0.0.1', hostFromEnv: true });
    expect(env({ HOST: '0.0.0.0', LAN: 'true' })).toMatchObject({ LAN: true, HOST: '0.0.0.0', hostFromEnv: true });
    expect(env({ HOST: '0.0.0.0', LAN: 'sim' })).toMatchObject({ LAN: true });
    // an empty HOST line is no HOST at all
    expect(env({ HOST: '  ' })).toMatchObject({ LAN: true, HOST: '0.0.0.0', hostFromEnv: false });
  });

  it('answers only local host names and explains how to turn LAN on', async () => {
    const t = await makeServer({ LAN: 'false' });
    try {
      expect((await t.lan('GET', '/api/health')).statusCode).toBe(403);
      expect((await t.lan('GET', '/assets/app.js')).statusCode).toBe(403);
      expect((await t.local('GET', '/api/health')).statusCode).toBe(200);
      const info = (await t.local('GET', '/api/devices/pair-info')).json();
      expect(info).toMatchObject({ lan: false, urls: [] });
      expect(info.hint).toMatch(/^Erro: .+ — Solução: use LAN=true no \.env/);
      expect(await pairingBanner(t.server.lan)).toContain('LAN=true no .env');
    } finally {
      await t.cleanup();
    }
  });

  it('keeps an older .env with HOST=127.0.0.1 local-only and names both steps to turn LAN on', async () => {
    const t = await makeServer({ HOST: '127.0.0.1' });
    try {
      expect(t.server.lan.offReason()).toBe('disabled-loopback');
      expect((await t.local('GET', '/api/health')).statusCode).toBe(200);
      expect((await t.lan('GET', '/api/health')).statusCode).toBe(403);
      const info = (await t.local('GET', '/api/devices/pair-info')).json();
      expect(info).toMatchObject({ lan: false, urls: [] });
      expect(info.hint).toMatch(/^Erro: .+ — Solução: use LAN=true, apague a linha HOST do \.env e reinicie/);
      expect(await pairingBanner(t.server.lan)).toContain('use LAN=true, apague a linha HOST e reinicie');
    } finally {
      await t.cleanup();
    }
  });

  it('lets OBS on a second PC connect without a token for an older .env with HOST=0.0.0.0', async () => {
    const t = await makeServer({ HOST: '0.0.0.0' });
    const SECOND_PC = '192.168.1.20';
    try {
      expect(t.server.lan.offReason()).toBe('disabled');
      const scene = await t.lan('GET', '/scene/main', { ip: SECOND_PC });
      expect(scene.statusCode).toBe(200);
      expect((await t.lan('GET', '/api/state', { ip: SECOND_PC })).statusCode).toBe(200);
      // past the guard: the clip expired (404), it is not "aparelho não pareado" (401)
      expect((await t.lan('GET', '/api/tts/abc.mp3', { ip: SECOND_PC })).statusCode).toBe(404);
      expect([401, 403]).not.toContain((await t.lan('GET', '/api/sfx/sounds/s1.wav', { ip: SECOND_PC })).statusCode);
      for (const role of ['overlay', 'audio']) {
        const { socket, messages } = await t.ws(`/ws?role=${role}`, { ip: SECOND_PC, origin: LAN_ORIGIN });
        await waitFor(() => messages.length > 0);
        expect(messages[0]).toMatchObject({ type: 'hello', role });
        socket.terminate();
      }
    } finally {
      await t.cleanup();
    }
  });

  it('explains when HOST keeps phones out even with LAN on', async () => {
    const t = await makeServer({ LAN: 'true', HOST: '127.0.0.1' });
    try {
      const info = (await t.local('GET', '/api/devices/pair-info')).json();
      expect(info).toMatchObject({ lan: false, urls: [] });
      expect(info.hint).toContain('HOST=127.0.0.1');
      expect(await pairingBanner(t.server.lan)).toContain('HOST=127.0.0.1');
    } finally {
      await t.cleanup();
    }
  });
});

describe('sceneAccessNotice', () => {
  const notice = (vars: Record<string, string>) => sceneAccessNotice(loadEnv(vars as NodeJS.ProcessEnv, ROOT));

  it('warns only when LAN=true meets an explicit network HOST', () => {
    expect(notice({})).toBeNull();
    expect(notice({ LAN: 'true' })).toBeNull();
    expect(notice({ HOST: '0.0.0.0' })).toBeNull();
    expect(notice({ LAN: 'false', HOST: '0.0.0.0' })).toBeNull();
    expect(notice({ LAN: 'true', HOST: '127.0.0.1' })).toBeNull();
    expect(notice({ LAN: 'true', HOST: 'localhost' })).toBeNull();
  });

  it('says what breaks and how to get the old mode back', () => {
    for (const host of ['0.0.0.0', '::']) {
      const line = notice({ LAN: 'true', HOST: host });
      expect(line, host).toMatch(/^Cenas em outro PC \.+ não conectam com LAN=true/);
      // with LAN=false only HOST=0.0.0.0 opens the network, so HOST=:: must change too
      expect(line, host).toContain('use LAN=false com HOST=0.0.0.0');
    }
    const ip = notice({ LAN: 'true', HOST: PC_IP });
    expect(ip).toMatch(/^Cenas do OBS \.+ não conectam com LAN=true e HOST=192\.168\.1\.50, nem neste PC/);
    expect(ip).toContain('Apague a linha HOST do .env');
  });
});

describe('decideAccess', () => {
  const GOOD = 'g'.repeat(43);
  const ctx = (over: Partial<AccessContext> = {}): AccessContext => ({
    lan: true,
    bindHost: '0.0.0.0',
    isAllowedHost: (h) => ['localhost', '127.0.0.1', '[::1]', '::1', PC_IP].includes(h),
    verifyToken: (token) => (token === GOOD ? 'device-1' : null),
    ...over,
  });
  const req = (over: Partial<AccessRequest> & { headers?: IncomingHttpHeaders } = {}): AccessRequest => ({
    method: 'GET',
    url: '/api/state',
    route: '/api/state',
    remoteAddress: PHONE_IP,
    headers: { host: LAN_HOST },
    ...over,
  });
  const local = (over: Partial<AccessRequest> = {}) =>
    req({ remoteAddress: '127.0.0.1', headers: { host: 'localhost:1995' }, ...over });

  it('LAN=false keeps the original local-only rules and never accepts device tokens', () => {
    const verifyToken = vi.fn(() => 'device-1');
    const off = ctx({ lan: false, bindHost: '127.0.0.1', verifyToken });
    expect(decideAccess(req({ headers: { host: LAN_HOST, 'x-stream95-token': GOOD } }), off)).toMatchObject({
      ok: false,
      status: 403,
    });
    expect(decideAccess(req({ url: '/ws?token=x', route: '/ws' }), off)).toMatchObject({ ok: false, status: 403 });
    expect(decideAccess(local(), off)).toEqual({ ok: true, deviceId: null });
    expect(
      decideAccess(local({ method: 'POST', url: '/api/chat/clear', route: '/api/chat/clear' }), off),
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      decideAccess(
        local({
          method: 'POST',
          url: '/api/chat/clear',
          route: '/api/chat/clear',
          headers: { host: 'localhost:1995', 'x-stream95': '1', origin: 'http://localhost:1995' },
        }),
        off,
      ),
    ).toEqual({ ok: true, deviceId: null });
    expect(verifyToken).not.toHaveBeenCalled();
    // HOST=0.0.0.0 with LAN=false is the old "trusted network" mode: any host, no token
    const legacy = ctx({ lan: false, bindHost: '0.0.0.0', verifyToken });
    expect(decideAccess(req({ headers: { host: 'anything.lan:1995' } }), legacy)).toEqual({
      ok: true,
      deviceId: null,
    });
    // HOST=:: never opened the network in the old mode, and still does not (no silent widening)
    const v6 = ctx({ lan: false, bindHost: '::', verifyToken });
    expect(decideAccess(req(), v6)).toMatchObject({ ok: false, status: 403 });
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('LAN=true: local requests keep the old rules, LAN requests need a token', () => {
    expect(decideAccess(req({ headers: { host: 'evil.example' } }), ctx())).toMatchObject({ status: 403 });
    expect(decideAccess(local(), ctx())).toEqual({ ok: true, deviceId: null });
    expect(decideAccess(local({ remoteAddress: '::ffff:127.0.0.1' }), ctx())).toEqual({ ok: true, deviceId: null });
    expect(decideAccess(req(), ctx())).toEqual({ ok: false, status: 401, error: NOT_PAIRED_ERROR, pair: true });
    expect(decideAccess(req({ remoteAddress: undefined }), ctx())).toMatchObject({ status: 401 });
    expect(decideAccess(req({ headers: { host: LAN_HOST, 'x-stream95-token': GOOD } }), ctx())).toEqual({
      ok: true,
      deviceId: 'device-1',
    });
    // the WebSocket takes the token from the query string
    expect(decideAccess(req({ url: `/ws?role=dock&token=${GOOD}`, route: '/ws' }), ctx())).toEqual({
      ok: true,
      deviceId: 'device-1',
    });
    expect(decideAccess(req({ url: '/ws?role=dock&token=bad', route: '/ws' }), ctx())).toMatchObject({
      status: 401,
    });
  });

  it('LAN=true: static files and pairing are open, everything else is not', () => {
    expect(decideAccess(req({ url: '/dock/', route: '/*' }), ctx())).toEqual({ ok: true, deviceId: null });
    expect(decideAccess(req({ method: 'HEAD', url: '/assets/x.js', route: '/*' }), ctx())).toMatchObject({
      ok: true,
    });
    expect(decideAccess(req({ method: 'POST', url: '/dock/', route: undefined }), ctx())).toMatchObject({
      ok: false,
    });
    const pairHeaders = { host: LAN_HOST, 'x-stream95': '1', origin: LAN_ORIGIN };
    const pairReq = { method: 'POST', url: '/api/devices/pair', route: '/api/devices/pair', headers: pairHeaders };
    expect(decideAccess(req(pairReq), ctx())).toEqual({ ok: true, deviceId: null });
    expect(decideAccess(req({ ...pairReq, method: 'GET' }), ctx())).toMatchObject({ status: 401 });
    expect(decideAccess(req({ ...pairReq, headers: { host: LAN_HOST } }), ctx())).toMatchObject({ status: 403 });
    expect(
      decideAccess(req({ ...pairReq, headers: { ...pairHeaders, origin: 'http://evil.example' } }), ctx()),
    ).toMatchObject({ status: 403 });
  });

  it('classifies requests by the matched route, not only by the raw URL', () => {
    // the router decodes "/%61pi" into "/api"; the static wildcard also catches unknown /api paths
    expect(decideAccess(req({ url: '/%61pi/state', route: '/api/state' }), ctx())).toMatchObject({ status: 401 });
    expect(decideAccess(req({ url: '/api/nope', route: '/*' }), ctx())).toMatchObject({ status: 401 });
    expect(decideAccess(req({ url: '/%E0%A4%A', route: undefined }), ctx())).toMatchObject({ status: 401 });
    expect(decideAccess(req({ url: '/%77s?role=dock', route: '/ws' }), ctx())).toMatchObject({ status: 401 });
  });
});

describe('pairing codes', () => {
  it('uses 8 unambiguous characters', () => {
    const codes = Array.from({ length: 200 }, generatePairCode);
    for (const code of codes) expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(new Set(codes).size).toBeGreaterThan(195);
    expect(normalizePairCode(' k7m2-q9xa ')).toBe('K7M2Q9XA');
  });

  it('is single use, expires after 10 minutes and tells stale codes from wrong ones', () => {
    let clock = 0;
    const codes = new PairingCodes(() => clock);
    const first = codes.current();
    expect(first.expiresAt).toBe(PAIR_CODE_TTL_MS);
    expect(codes.consume(first.code.toLowerCase())).toBe('ok');
    expect(codes.consume(first.code)).toBe('stale');
    expect(codes.consume('ZZZZZZZZ')).toBe('invalid');

    const second = codes.current();
    expect(second.code).not.toBe(first.code);
    clock = second.expiresAt;
    expect(codes.consume(second.code)).toBe('stale');
    const third = codes.current();
    clock += PAIR_CODE_TTL_MS;
    expect(codes.current().code).not.toBe(third.code);
  });

  it('limits failures per key in a sliding minute', () => {
    let clock = 0;
    const limiter = new FailureLimiter(5, 60_000, () => clock);
    for (let i = 0; i < 4; i++) limiter.fail('a');
    expect(limiter.retryAfterMs('a')).toBe(0);
    limiter.fail('a');
    expect(limiter.retryAfterMs('a')).toBe(60_000);
    expect(limiter.retryAfterMs('b')).toBe(0);
    clock = 59_999;
    expect(limiter.retryAfterMs('a')).toBe(1);
    clock = 60_000;
    expect(limiter.retryAfterMs('a')).toBe(0);
  });
});

describe('DeviceRegistry', () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'stream95-devices-'));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('refreshes lastSeenAt at most once a minute and survives a restart', async () => {
    let clock = 1_000;
    const file = path.join(dir, 'a.json');
    const reg = await DeviceRegistry.load(file, silentLogger, () => clock);
    const added = await reg.add('Pixel · Chrome');
    if (!added) throw new Error('not added');
    expect(added.device.lastSeenAt).toBe(1_000);
    clock += LAST_SEEN_EVERY_MS - 1;
    expect(reg.verify(added.token)?.lastSeenAt).toBe(1_000);
    clock += 1;
    expect(reg.verify(added.token)?.lastSeenAt).toBe(clock);
    expect(reg.verify(`${added.token}x`)).toBeNull();
    expect(reg.verify('short')).toBeNull();
    expect(reg.verify(undefined)).toBeNull();
    await reg.flush();

    const again = await DeviceRegistry.load(file, silentLogger, () => clock);
    expect(again.verify(added.token)?.id).toBe(added.device.id);
    expect(await again.revoke(added.device.id)).toBe(true);
    expect(again.verify(added.token)).toBeNull();
    expect(await again.revoke(added.device.id)).toBe(false);
  });

  it('ignores invalid entries in devices.json', async () => {
    const file = path.join(dir, 'b.json');
    const good = { id: 'd1', name: 'ok', tokenHash: sha256('t'), createdAt: 1, lastSeenAt: null };
    writeFileSync(file, JSON.stringify({ version: 1, devices: [good, { id: 'd2', tokenHash: 'plain-token' }] }));
    const reg = await DeviceRegistry.load(file, silentLogger);
    expect(reg.list()).toEqual([{ id: 'd1', name: 'ok', createdAt: 1, lastSeenAt: null }]);
  });

  it('cleans device names', () => {
    expect(cleanDeviceName('  iPhone\n ·\tSafari  ')).toBe('iPhone · Safari');
    expect(cleanDeviceName('x'.repeat(60))).toHaveLength(40);
    expect(cleanDeviceName('   ')).toBe('Aparelho');
    expect(cleanDeviceName(undefined)).toBe('Aparelho');
  });
});

describe('network helpers', () => {
  it('reads host names and loopback addresses', () => {
    expect(hostnameOf('LocalHost:1995')).toBe('localhost');
    expect(hostnameOf('[::1]:1995')).toBe('[::1]');
    expect(hostnameOf('192.168.1.50')).toBe('192.168.1.50');
    expect(hostnameOf('::1')).toBe('::1');
    expect(hostnameOf(undefined)).toBe('');
    for (const a of ['127.0.0.1', '127.8.9.10', '::1', '::ffff:127.0.0.1']) expect(isLoopbackAddress(a), a).toBe(true);
    for (const a of ['192.168.1.5', '::ffff:192.168.1.5', '', undefined]) expect(isLoopbackAddress(a)).toBe(false);
  });

  it('ranks LAN addresses: real adapters, then 192.168 > 10 > 172.16-31 > others', () => {
    const v6 = { ...nic('fe80::1'), family: 'IPv6' as const, scopeid: 1 };
    const list = lanAddresses(() => ({
      'VirtualBox Host-Only Network': [nic('192.168.56.1')],
      'Ethernet 2': [nic('172.16.5.5')],
      APIPA: [nic('169.254.3.3')],
      CGNAT: [nic('100.64.1.1')],
      'Wi-Fi': [nic('10.0.0.8'), v6],
      Ethernet: [nic('192.168.0.10')],
      Loopback: [nic('127.0.0.1', true)],
    }));
    expect(list.map((a) => a.address)).toEqual([
      '192.168.0.10',
      '10.0.0.8',
      '172.16.5.5',
      '100.64.1.1',
      '169.254.3.3',
      '192.168.56.1',
    ]);
    expect(addressRank('172.15.0.1')).toBe(3);
    expect(addressRank('172.32.0.1')).toBe(3);
    expect(pairingUrl('192.168.1.50', 1995, 'ABCD2345')).toBe('http://192.168.1.50:1995/dock/?pair=ABCD2345');
    expect(pairingUrl('fe80::1', 1995, 'ABCD2345')).toBe('http://[fe80::1]:1995/dock/?pair=ABCD2345');
  });
});
