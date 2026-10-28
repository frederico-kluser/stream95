import os from 'node:os';
import path from 'node:path';
import type { ClientRole, PairedDevice } from '@stream95/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import QRCode from 'qrcode';
import { z } from 'zod';
import type { Env } from '../env.js';
import type { Logger } from '../log.js';
import { DEVICES_FILE, DeviceRegistry, MAX_DEVICES } from './devices.js';
import { type AccessContext, decideAccess, PAIR_ROUTE } from './guard.js';
import {
  type InterfacesProvider,
  isLoopbackHost,
  isWildcardHost,
  type LanAddress,
  LOCAL_HOSTNAMES,
  lanAddresses,
  pairingUrl,
  urlHost,
} from './net.js';
import { FailureLimiter, PairingCodes } from './pairing.js';

export type LanOverrides = {
  /** Network interfaces of this PC (tests inject fake ones). */
  interfaces?: InterfacesProvider;
  /** Clock for pairing codes, rate limits and lastSeenAt (tests). */
  now?: () => number;
};

export type LanOptions = LanOverrides & {
  env: Pick<Env, 'LAN' | 'HOST' | 'hostFromEnv' | 'PORT' | 'dataDir'>;
  log: Logger;
};

/** Answer of GET /api/devices/pair-info. `lan` = a phone can open `url`; `hint` says why not. */
export type PairInfo = {
  code: string;
  url: string;
  expiresAt: number;
  lan: boolean;
  urls: string[];
  hint: string | null;
};

/**
 * Why phones cannot reach the deck right now. 'disabled-loopback': LAN off and an explicit loopback HOST
 * (the old .env.example shipped HOST=127.0.0.1), so turning LAN on also needs that line gone.
 */
export type LanOffReason = 'disabled' | 'disabled-loopback' | 'loopback' | 'no-network';

export type PairOutcome =
  | { ok: true; token: string; device: PairedDevice }
  | { ok: false; reason: 'invalid' | 'stale' | 'full' };

/** What we need from a WebSocket to close it when its device is removed. */
type DeviceSocket = {
  close(code?: number, reason?: string): void;
  on(event: 'close', listener: () => void): unknown;
};

const ADDRESS_TTL_MS = 10_000;
const STALE_NOTICE_EVERY_MS = 30_000;
/** WebSocket close code sent to a device that was just removed (4000-4999 = application). */
export const WS_UNPAIRED_CODE = 4401;

const OFF_HINTS: Record<LanOffReason, (host: string) => string> = {
  disabled: () => 'Erro: o acesso pela rede está desligado — Solução: use LAN=true no .env e reinicie o stream95',
  'disabled-loopback': (host) =>
    `Erro: o acesso pela rede está desligado e HOST=${host} só aceita este PC — Solução: use LAN=true, apague a linha HOST do .env e reinicie o stream95`,
  loopback: (host) =>
    `Erro: o servidor só aceita este PC (HOST=${host}) — Solução: apague a linha HOST do .env ou use HOST=0.0.0.0 e reinicie`,
  'no-network': () => 'Erro: o PC não está em nenhuma rede local — Solução: conecte o PC ao Wi-Fi ou ao cabo de rede',
};

const OFF_LINES: Record<LanOffReason, (host: string) => string> = {
  disabled: () => 'desligado. Para ligar, use LAN=true no .env e reinicie',
  'disabled-loopback': (host) =>
    `desligado: HOST=${host} no .env só aceita este PC. Para ligar, use LAN=true, apague a linha HOST e reinicie`,
  loopback: (host) =>
    `desligado: HOST=${host} no .env só aceita este PC. Apague essa linha (ou use HOST=0.0.0.0) e reinicie`,
  'no-network': () => 'sem rede local. Conecte o PC ao Wi-Fi ou ao cabo e abra Config → Aparelhos no painel',
};

const PAIR_ERRORS: Record<'invalid' | 'stale' | 'full', string> = {
  invalid:
    'Erro: código de pareamento errado — Solução: confira os 8 caracteres no terminal do PC ou em Config → Aparelhos',
  stale:
    'Erro: este código expirou ou já foi usado — Solução: escaneie o QR code novo no terminal do PC ou em Config → Aparelhos',
  full: `Erro: limite de ${MAX_DEVICES} aparelhos atingido — Solução: remova aparelhos antigos em Config → Aparelhos`,
};
const TOO_MANY_ERROR =
  'Erro: muitas tentativas de pareamento — Solução: espere 1 minuto e confira o código no terminal do PC';
const BAD_BODY_ERROR =
  'Erro: corpo inválido — Solução: envie {"code": "<código de 8 caracteres>", "name": "<nome do aparelho>"}';
const UNKNOWN_DEVICE_ERROR = 'Erro: aparelho não encontrado — Solução: atualize a lista em Config → Aparelhos';

const PairBody = z.object({ code: z.string().max(64), name: z.string().max(200).optional() });
const DeviceParams = z.object({ id: z.string().min(1).max(100) });

/** Phones and tablets on the local network: access rules, pairing and paired devices. */
export class Lan {
  readonly codes: PairingCodes;
  readonly limiter: FailureLimiter;
  /** Called when someone tries an expired or used code (the terminal prints a fresh QR code). */
  onStaleCode: (() => void) | null = null;

  private readonly context: AccessContext;
  private readonly fixedHosts: ReadonlySet<string>;
  private readonly readInterfaces: InterfacesProvider;
  private readonly sockets = new Map<string, Set<DeviceSocket>>();
  private readonly deviceOfRequest = new WeakMap<object, string>();
  private cached: LanAddress[] = [];
  private cachedAt = Number.NEGATIVE_INFINITY;
  private staleNoticeAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly app: FastifyInstance,
    readonly devices: DeviceRegistry,
    private readonly opts: LanOptions,
  ) {
    const now = opts.now ?? Date.now;
    this.codes = new PairingCodes(now);
    this.limiter = new FailureLimiter(5, 60_000, now);
    this.readInterfaces = opts.interfaces ?? os.networkInterfaces;
    const host = opts.env.HOST.trim().toLowerCase();
    this.fixedHosts = new Set(host && !isWildcardHost(host) ? [host, urlHost(host)] : []);
    this.context = {
      lan: opts.env.LAN,
      bindHost: opts.env.HOST,
      isAllowedHost: (hostname) => this.isAllowedHost(hostname),
      verifyToken: (token) => this.devices.verify(token)?.id ?? null,
    };
  }

  /** onRequest hook: the gate for every HTTP request and WebSocket upgrade. */
  readonly guard = async (req: FastifyRequest, reply: FastifyReply) => {
    const decision = decideAccess(
      {
        method: req.method,
        url: req.url,
        route: req.routeOptions.url,
        remoteAddress: req.raw.socket?.remoteAddress,
        headers: req.headers,
      },
      this.context,
    );
    if (decision.ok) {
      if (decision.deviceId) this.deviceOfRequest.set(req.raw, decision.deviceId);
      return;
    }
    return reply
      .code(decision.status)
      .send(decision.pair ? { error: decision.error, pair: true } : { error: decision.error });
  };

  get bindHost(): string {
    return this.opts.env.HOST;
  }

  /** DNS-rebinding allowlist: local names, a specific HOST and every LAN IPv4 of this PC. */
  isAllowedHost(hostname: string): boolean {
    if (LOCAL_HOSTNAMES.has(hostname) || this.fixedHosts.has(hostname)) return true;
    if (this.addresses().some((a) => a.address === hostname)) return true;
    // maybe a new DHCP lease: read the interfaces again (at most once a second)
    return this.addresses(1_000).some((a) => a.address === hostname);
  }

  /** LAN IPv4s of this PC, best first. Re-read when older than `maxAgeMs`. */
  addresses(maxAgeMs = ADDRESS_TTL_MS): LanAddress[] {
    const t = Date.now();
    if (t - this.cachedAt > maxAgeMs) {
      this.cached = lanAddresses(this.readInterfaces);
      this.cachedAt = t;
    }
    return this.cached;
  }

  offReason(): LanOffReason | null {
    const { LAN, HOST, hostFromEnv } = this.opts.env;
    if (!LAN) return hostFromEnv && isLoopbackHost(HOST) ? 'disabled-loopback' : 'disabled';
    if (isLoopbackHost(HOST)) return 'loopback';
    return this.lanHosts().length ? null : 'no-network';
  }

  pairInfo(): PairInfo {
    const { code, expiresAt } = this.codes.current();
    const port = this.port();
    const urls = this.lanHosts().map((host) => pairingUrl(host, port, code));
    const reason = urls.length ? null : (this.offReason() ?? 'no-network');
    return {
      code,
      url: urls[0] ?? pairingUrl('localhost', port, code),
      expiresAt,
      lan: urls.length > 0,
      urls,
      hint: reason ? OFF_HINTS[reason](this.opts.env.HOST) : null,
    };
  }

  /** Replaces the pairing code (the old one stops working). */
  newCode(): Pick<PairInfo, 'code' | 'url' | 'expiresAt'> {
    this.codes.rotate();
    const { code, url, expiresAt } = this.pairInfo();
    return { code, url, expiresAt };
  }

  async pair(code: string, name: string | undefined): Promise<PairOutcome> {
    const attempt = this.codes.consume(code);
    if (attempt === 'stale') this.noticeStale();
    if (attempt !== 'ok') return { ok: false, reason: attempt };
    const added = await this.devices.add(name);
    if (!added) return { ok: false, reason: 'full' };
    this.opts.log.info({ aparelho: added.device.name }, 'novo aparelho pareado');
    return { ok: true, ...added };
  }

  /** Forgets a device and closes its open WebSockets. */
  async revoke(id: string): Promise<boolean> {
    const removed = await this.devices.revoke(id);
    const open = this.sockets.get(id);
    this.sockets.delete(id);
    for (const socket of open ?? []) socket.close(WS_UNPAIRED_CODE, 'aparelho removido');
    if (removed) this.opts.log.info({ id }, 'aparelho removido');
    return removed;
  }

  /** Role of a new WebSocket client. Sockets of a paired device are closed when it is removed. */
  attachSocket(socket: DeviceSocket, req: FastifyRequest): ClientRole {
    const deviceId = this.deviceOfRequest.get(req.raw);
    if (deviceId) {
      if (!this.devices.has(deviceId)) {
        // removed between the upgrade check and now
        socket.close(WS_UNPAIRED_CODE, 'aparelho removido');
      } else {
        const open = this.sockets.get(deviceId) ?? new Set<DeviceSocket>();
        open.add(socket);
        this.sockets.set(deviceId, open);
        socket.on('close', () => {
          open.delete(socket);
          if (open.size === 0 && this.sockets.get(deviceId) === open) this.sockets.delete(deviceId);
        });
      }
    }
    const role = (req.query as { role?: unknown } | undefined)?.role;
    return role === 'dock' || role === 'audio' ? role : 'overlay';
  }

  /** Hosts a phone can use to reach this server (empty when LAN is off). */
  private lanHosts(): string[] {
    const { LAN, HOST } = this.opts.env;
    if (!LAN || isLoopbackHost(HOST)) return [];
    if (!isWildcardHost(HOST)) return [HOST.trim()];
    return this.addresses().map((a) => a.address);
  }

  private port(): number {
    const address = this.app.server.address();
    return address && typeof address === 'object' ? address.port : this.opts.env.PORT;
  }

  private noticeStale(): void {
    const t = Date.now();
    if (!this.onStaleCode || t - this.staleNoticeAt < STALE_NOTICE_EVERY_MS) return;
    this.staleNoticeAt = t;
    this.onStaleCode();
  }
}

function registerDeviceRoutes(app: FastifyInstance, lan: Lan): void {
  // The only API route open to unpaired LAN clients (the guard still demands x-stream95 and same Origin).
  app.post(PAIR_ROUTE, async (req, reply) => {
    const ip = req.raw.socket?.remoteAddress ?? 'desconhecido';
    const waitMs = lan.limiter.retryAfterMs(ip);
    if (waitMs > 0) {
      return reply
        .code(429)
        .header('retry-after', String(Math.ceil(waitMs / 1000)))
        .send({ error: TOO_MANY_ERROR });
    }
    const body = PairBody.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: BAD_BODY_ERROR });
    const result = await lan.pair(body.data.code, body.data.name);
    reply.header('cache-control', 'no-store');
    if (result.ok) return { token: result.token, device: result.device };
    if (result.reason !== 'full') lan.limiter.fail(ip);
    return reply.code(result.reason === 'full' ? 409 : 401).send({ error: PAIR_ERRORS[result.reason] });
  });

  app.get('/api/devices', async () => lan.devices.list());

  app.delete('/api/devices/:id', async (req, reply) => {
    const params = DeviceParams.safeParse(req.params);
    if (!params.success || !(await lan.revoke(params.data.id))) {
      return reply.code(404).send({ error: UNKNOWN_DEVICE_ERROR });
    }
    return { ok: true };
  });

  app.post('/api/devices/pair-code', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return lan.newCode();
  });

  app.get('/api/devices/pair-info', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
    return lan.pairInfo();
  });

  app.get('/api/devices/pair-qr.svg', async (_req, reply) => {
    const svg = await QRCode.toString(lan.pairInfo().url, { type: 'svg', margin: 1 });
    return reply.type('image/svg+xml').header('cache-control', 'no-store').send(svg);
  });
}

/**
 * Wires LAN access into the server: the security hook (every request and WebSocket upgrade),
 * the /api/devices routes and the devices.json persistence.
 */
export async function setupLan(app: FastifyInstance, opts: LanOptions): Promise<Lan> {
  const devices = await DeviceRegistry.load(path.join(opts.env.dataDir, DEVICES_FILE), opts.log, opts.now);
  const lan = new Lan(app, devices, opts);
  app.addHook('onRequest', lan.guard);
  app.addHook('onClose', async () => {
    await devices.flush();
  });
  registerDeviceRoutes(app, lan);
  return lan;
}

const DECK_MISSING_LINE = 'o painel não foi compilado. Rode npm run build -w @stream95/deck e reinicie o stream95';

export type BannerOptions = {
  platform?: NodeJS.Platform;
  /** False when apps/deck/dist has no build: the QR code would open a "not built" page on the phone. */
  deckBuilt?: boolean;
};

/** Terminal block that pairs a phone in one scan: QR code, URL and code (or why it is off). */
export async function pairingBanner(lan: Lan, opts: BannerOptions = {}): Promise<string> {
  const { platform = process.platform, deckBuilt = true } = opts;
  const info = lan.pairInfo();
  if (!info.lan) return `  Painel no celular ...... ${OFF_LINES[lan.offReason() ?? 'no-network'](lan.bindHost)}`;
  if (!deckBuilt) return `  Painel no celular ...... ${DECK_MISSING_LINE}`;
  const qr = (await QRCode.toString(info.url, { type: 'terminal', small: true })).split('\n');
  // the renderer ends with a row made only of color codes: drop rows without any block
  while (qr.length && !/[▀▄█]/.test(qr[qr.length - 1] ?? '')) qr.pop();
  const lines = [
    '  Painel no celular ...... aponte a câmera do celular (mesma rede Wi-Fi)',
    '',
    ...qr.map((line) => `  ${line}`),
    '',
    `  ${info.url}`,
    `  Código: ${info.code} (vale 10 min)`,
  ];
  if (platform === 'win32') {
    lines.push(
      "  Se o celular não abrir, permita o Node.js em 'Redes privadas' no aviso do Firewall do Windows (só na primeira vez)",
    );
  }
  return lines.join('\n');
}

/**
 * Terminal line for LAN=true with an explicit network HOST. Scenes and the audio page cannot pair, so
 * from the network they get 401: OBS on another PC stays disconnected (with a specific IP, even OBS on
 * this PC, which cannot use localhost). Null when it does not apply.
 */
export function sceneAccessNotice(env: Pick<Env, 'LAN' | 'HOST' | 'hostFromEnv'>): string | null {
  if (!env.LAN || !env.hostFromEnv || isLoopbackHost(env.HOST)) return null;
  if (isWildcardHost(env.HOST)) {
    // With LAN=false only HOST=0.0.0.0 opens the network (HOST=:: keeps answering this PC only).
    return [
      'Cenas em outro PC ...... não conectam com LAN=true (pela rede, só aparelhos pareados).',
      'Para elas, use LAN=false com HOST=0.0.0.0 numa rede de confiança e reinicie',
    ].join(' ');
  }
  return [
    `Cenas do OBS ........... não conectam com LAN=true e HOST=${env.HOST.trim()}, nem neste PC.`,
    'Apague a linha HOST do .env (ou use LAN=false) e reinicie',
  ].join(' ');
}
