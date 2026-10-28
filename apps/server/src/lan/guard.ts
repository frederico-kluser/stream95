import type { IncomingHttpHeaders } from 'node:http';
import { hostnameOf, isLoopbackAddress, LOCAL_HOSTNAMES } from './net.js';

/** The only API route a LAN client may call before it is paired. */
export const PAIR_ROUTE = '/api/devices/pair';

export const NOT_PAIRED_ERROR =
  'Erro: aparelho não pareado — Solução: escaneie o QR code do terminal ou use Config → Aparelhos no painel do PC';
const HOST_ERROR_LOCAL = 'Erro: host não permitido — Solução: acesse por http://localhost';
const HOST_ERROR_LAN = 'Erro: host não permitido — Solução: acesse por http://localhost ou pelo IP deste PC na rede';
const WS_ORIGIN_ERROR =
  'Erro: origem cruzada bloqueada no WebSocket — Solução: abra o painel pelo endereço do próprio stream95';
const CSRF_ERROR = 'Erro: requisição sem cabeçalho x-stream95 — Solução: use o painel ou envie "x-stream95: 1"';
const ORIGIN_ERROR_LOCAL = 'Erro: origem cruzada bloqueada — Solução: use o painel em http://localhost';
const ORIGIN_ERROR_LAN = 'Erro: origem cruzada bloqueada — Solução: abra o painel pelo endereço do QR code';

export type AccessRequest = {
  method: string;
  /** Raw request target (path + query). */
  url: string;
  /** Route pattern the router matched (Fastify `routeOptions.url`); undefined when none matched. */
  route?: string | undefined;
  /** Socket peer address; undefined when unknown (treated as a LAN client). */
  remoteAddress?: string | undefined;
  headers: IncomingHttpHeaders;
};

export type AccessContext = {
  /** LAN=true: phones and tablets may connect once paired. */
  lan: boolean;
  /** The HOST the server binds to. */
  bindHost: string;
  /** DNS-rebinding allowlist used in LAN mode (local names, this PC's IPv4s, a specific HOST). */
  isAllowedHost: (hostname: string) => boolean;
  /** Paired device id that owns this token, or null. */
  verifyToken: (token: string) => string | null;
};

export type AccessDecision =
  | { ok: true; deviceId: string | null }
  | { ok: false; status: 401 | 403; error: string; pair?: true };

type Area = 'api' | 'ws' | 'static';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALLOW: AccessDecision = { ok: true, deviceId: null };
const deny = (status: 401 | 403, error: string): AccessDecision => ({ ok: false, status, error });

const header = (value: string | string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

/** Path without the query, percent-decoded the way the router decodes it (null when malformed). */
function pathOf(url: string): string | null {
  const cut = url.search(/[?#]/);
  const raw = cut === -1 ? url : url.slice(0, cut);
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

function areaOf(path: string): Area {
  const p = path.toLowerCase();
  if (p.startsWith('/ws')) return 'ws';
  if (p === '/api' || p.startsWith('/api/')) return 'api';
  return 'static';
}

/**
 * Which part of the server a request reaches. The matched route wins over the raw URL (the
 * router decodes "/%61pi/x" into "/api/x"); either one saying api/ws is enough.
 */
function areaFor(route: string | undefined, url: string): Area {
  const path = pathOf(url);
  const areas = [route ? areaOf(route) : 'static', path === null ? 'api' : areaOf(path)];
  if (areas.includes('ws')) return 'ws';
  if (areas.includes('api')) return 'api';
  return 'static';
}

function sameOrigin(origin: string, hostHeader: string): boolean {
  try {
    return new URL(origin).host === hostHeader.toLowerCase();
  } catch {
    return false;
  }
}

function queryToken(url: string): string | null {
  const q = url.indexOf('?');
  return q === -1 ? null : new URLSearchParams(url.slice(q + 1)).get('token');
}

/** Rules for this PC: no token; writes need the CSRF header and, when sent, a same-site Origin. */
function localRules(area: Area, write: boolean, origin: string | undefined, host: string, csrf: string | undefined) {
  if (area === 'ws' && origin && !sameOrigin(origin, host)) return deny(403, WS_ORIGIN_ERROR);
  if (area === 'api' && write) {
    if (csrf !== '1') return deny(403, CSRF_ERROR);
    if (origin && !sameOrigin(origin, host)) return deny(403, ORIGIN_ERROR_LOCAL);
  }
  return ALLOW;
}

function withDevice(token: string | null | undefined, ctx: AccessContext): AccessDecision {
  const deviceId = token ? ctx.verifyToken(token) : null;
  return deviceId ? { ok: true, deviceId } : { ok: false, status: 401, error: NOT_PAIRED_ERROR, pair: true };
}

/**
 * Who may use the server. LAN off: the original local-only rules. LAN on: requests from this PC
 * (loopback socket + local Host) keep those rules; anyone else may load static files and pair,
 * and needs a device token for the API (`x-stream95-token`) and the WebSocket (`?token=`).
 */
export function decideAccess(req: AccessRequest, ctx: AccessContext): AccessDecision {
  const host = header(req.headers.host) ?? '';
  const hostname = hostnameOf(host);
  const origin = header(req.headers.origin);
  const csrf = header(req.headers['x-stream95']);
  const method = req.method.toUpperCase();
  const write = !SAFE_METHODS.has(method);
  const area = areaFor(req.route, req.url);

  if (!ctx.lan) {
    // DNS-rebinding guard: only local host names (or HOST itself, or any host with HOST=0.0.0.0).
    const bind = ctx.bindHost.trim().toLowerCase();
    if (bind !== '0.0.0.0' && !LOCAL_HOSTNAMES.has(hostname) && hostname !== bind) {
      return deny(403, HOST_ERROR_LOCAL);
    }
    return localRules(area, write, origin, host, csrf);
  }

  if (!ctx.isAllowedHost(hostname)) return deny(403, HOST_ERROR_LAN);
  if (isLoopbackAddress(req.remoteAddress) && LOCAL_HOSTNAMES.has(hostname)) {
    return localRules(area, write, origin, host, csrf);
  }

  // LAN client: phone, tablet or another PC
  if (area === 'static' && (method === 'GET' || method === 'HEAD')) return ALLOW;
  const token = header(req.headers['x-stream95-token']);
  if (area === 'ws') {
    if (origin && !sameOrigin(origin, host)) return deny(403, WS_ORIGIN_ERROR);
    return withDevice(queryToken(req.url) ?? token, ctx);
  }
  if (write) {
    if (csrf !== '1') return deny(403, CSRF_ERROR);
    if (origin && !sameOrigin(origin, host)) return deny(403, ORIGIN_ERROR_LAN);
    if (method === 'POST' && (req.route ?? pathOf(req.url)) === PAIR_ROUTE) return ALLOW;
  }
  return withDevice(token, ctx);
}
