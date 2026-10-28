import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The phone opens the deck on the PC's LAN address, never on localhost.
const local = vi.hoisted(() => ({ value: false }));
vi.mock('@/lib/auth', async (original) => ({
  ...(await original<typeof import('@/lib/auth')>()),
  isLocalHost: () => local.value,
}));
vi.mock('@/lib/store', () => ({ getClient: () => ({ reconnect: () => {} }) }));

const { boot, STALE_QR_ERROR } = await import('@/lib/boot');
const { PairingScreen } = await import('@/components/pairing-screen');
const { clearDeviceToken, currentToken, setDeviceToken } = await import('@/lib/auth');

const STALE =
  'Erro: este código expirou ou já foi usado — Solução: escaneie o QR code novo no terminal do PC ou em Config → Aparelhos';
const WRONG =
  'Erro: código de pareamento errado — Solução: confira os 8 caracteres no terminal do PC ou em Config → Aparelhos';

type Reply = { status: number; body?: unknown } | 'network-down';

/** Answers the deck's requests by path (POST /api/devices/pair, GET /api/health). */
function serve(routes: Record<string, Reply>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      const reply = routes[path];
      if (!reply || reply === 'network-down') throw new TypeError('Failed to fetch');
      return new Response(reply.body === undefined ? '' : JSON.stringify(reply.body), { status: reply.status });
    }),
  );
  return calls;
}

beforeEach(() => {
  local.value = false;
  clearDeviceToken();
  history.replaceState(null, '', '/dock/');
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearDeviceToken();
});

describe('boot', () => {
  it('pairs with the code of a scanned QR code and opens the deck', async () => {
    history.replaceState(null, '', '/dock/?pair=K7M2Q9XA');
    const calls = serve({
      '/api/devices/pair': { status: 200, body: { token: 'tok-1' } },
      '/api/health': { status: 200 },
    });
    await expect(boot()).resolves.toEqual({ gate: 'ready', pairError: null });
    expect(currentToken()).toBe('tok-1');
    expect(calls).toEqual(['POST /api/devices/pair', 'GET /api/health']);
    // the used code leaves the address bar, so a reload does not try it again
    expect(location.search).toBe('');
  });

  it('explains an expired or used QR code and points to the fresh one in the terminal', async () => {
    history.replaceState(null, '', '/dock/?pair=K7M2Q9XA');
    serve({ '/api/devices/pair': { status: 401, body: { error: STALE } } });
    const result = await boot();
    expect(result).toEqual({ gate: 'pair', pairError: STALE_QR_ERROR });
    expect(result.pairError?.title).toBe('Esse QR code expirou ou já foi usado');
    expect(result.pairError?.fix).toMatch(/QR code mais recente no terminal do PC/);
  });

  it('says why when the QR code could not be checked at all', async () => {
    history.replaceState(null, '', '/dock/?pair=K7M2Q9XA');
    serve({ '/api/devices/pair': 'network-down' });
    await expect(boot()).resolves.toEqual({
      gate: 'pair',
      pairError: { title: 'Sem conexão com o servidor', fix: 'Confira se o stream95 está rodando no PC' },
    });
  });

  it('keeps an already paired device working when it scans an old QR code', async () => {
    setDeviceToken('tok-old');
    history.replaceState(null, '', '/dock/?pair=K7M2Q9XA');
    serve({ '/api/devices/pair': { status: 401, body: { error: STALE } }, '/api/health': { status: 200 } });
    await expect(boot()).resolves.toEqual({ gate: 'ready', pairError: null });
    expect(currentToken()).toBe('tok-old');
  });

  it('asks for pairing without an error when no code was scanned', async () => {
    const calls = serve({});
    await expect(boot()).resolves.toEqual({ gate: 'pair', pairError: null });
    expect(calls).toEqual([]);
  });

  it('forgets a token the server no longer accepts', async () => {
    setDeviceToken('tok-removed');
    serve({
      '/api/health': { status: 401, body: { error: 'Erro: aparelho não pareado — Solução: escaneie o QR code' } },
    });
    await expect(boot()).resolves.toEqual({ gate: 'pair', pairError: null });
    expect(currentToken()).toBeNull();
  });

  it('needs no pairing on the PC itself', async () => {
    local.value = true;
    serve({});
    await expect(boot()).resolves.toEqual({ gate: 'ready', pairError: null });
  });
});

describe('PairingScreen', () => {
  let root: Root | null = null;
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host.remove();
  });

  it('shows why the scanned QR code failed, with what to do', () => {
    root = createRoot(host);
    act(() => root?.render(<PairingScreen onPaired={() => {}} initialError={STALE_QR_ERROR} />));
    const alert = host.querySelector('[role=alert]');
    expect(alert?.textContent).toContain('Esse QR code expirou ou já foi usado');
    expect(alert?.textContent).toContain('Escaneie o QR code mais recente no terminal do PC');
  });

  it('shows the fix of a wrong typed code, not only the problem', async () => {
    serve({ '/api/devices/pair': { status: 401, body: { error: WRONG } } });
    const onPaired = vi.fn();
    root = createRoot(host);
    act(() => root?.render(<PairingScreen onPaired={onPaired} />));
    const input = host.querySelector<HTMLInputElement>('#pair-code');
    if (!input) throw new Error('no input');
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(input, 'ab3d-9x2q');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector('form')?.requestSubmit();
    });
    const alert = host.querySelector('[role=alert]');
    expect(alert?.textContent).toContain('Código de pareamento errado');
    expect(alert?.textContent).toContain('Confira os 8 caracteres no terminal do PC');
    expect(onPaired).not.toHaveBeenCalled();
  });
});
