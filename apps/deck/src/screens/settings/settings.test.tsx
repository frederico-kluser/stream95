import { DEFAULT_PORT } from '@stream95/shared';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { MotionUIThemeProvider } from '@/components/motion-ui/ui-theme';
import { type DeckState, initialState } from '@/lib/store';
import motionTheme from '../../../motion.theme';
import { AboutSection, pcOrigin } from './about';
import { DevicesSection } from './devices';
import { OverlaySection } from './overlay';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom's Web Animations reject `finished` when Motion cancels them; without `animate`, Motion
// runs its own JS animations and the test output stays clean.
vi.hoisted(() => Reflect.deleteProperty(Element.prototype, 'animate'));

type ApiFn = (method: string, path: string, body?: unknown) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  state: null as unknown as DeckState,
  api: null as unknown as Mock<ApiFn>,
}));

vi.mock('@/lib/store', async (original) => ({
  ...(await original<typeof import('@/lib/store')>()),
  useDeck: () => mocks.state,
}));

vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: (method: string, path: string, body?: unknown) => mocks.api(method, path, body),
}));

let root: Root | null = null;
let host: HTMLElement | null = null;

function mount(node: ReactNode) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(<MotionUIThemeProvider theme={motionTheme}>{node}</MotionUIThemeProvider>);
  });
}

const text = () => host?.textContent ?? '';

beforeEach(() => {
  mocks.state = { ...initialState(), connection: 'online' };
  mocks.api = vi.fn<ApiFn>(async () => ({ ok: true }));
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

describe('Sobre: addresses on the PC', () => {
  it('uses the port the server served this panel from', () => {
    expect(pcOrigin({ protocol: 'http:', port: '8080' }, false)).toBe('http://localhost:8080');
    expect(pcOrigin({ protocol: 'http:', port: '1996' }, false)).toBe('http://localhost:1996');
  });

  it('leaves the port out when the server runs on port 80', () => {
    expect(pcOrigin({ protocol: 'http:', port: '' }, false)).toBe('http://localhost');
  });

  it('falls back to the default port under Vite dev or behind an HTTPS proxy', () => {
    expect(pcOrigin({ protocol: 'http:', port: '5174' }, true)).toBe(`http://localhost:${DEFAULT_PORT}`);
    expect(pcOrigin({ protocol: 'https:', port: '' }, false)).toBe(`http://localhost:${DEFAULT_PORT}`);
  });

  it('shows the server’s real port in both rows (PORT=8080, built deck)', () => {
    const page = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM;
    const before = location.href;
    vi.stubEnv('DEV', false);
    page.setURL('http://localhost:8080/dock/');
    try {
      mount(<AboutSection />);
      expect(text()).toContain('Cenas para o OBShttp://localhost:8080/');
      expect(text()).toContain('Este painelhttp://localhost:8080/dock/');
      expect(text()).not.toContain(`:${DEFAULT_PORT}`);
    } finally {
      vi.unstubAllEnvs();
      page.setURL(before);
    }
  });
});

describe('Aparelhos: empty list', () => {
  const pairInfo = (lan: boolean) => ({
    code: 'K7Q2M9XA',
    url: 'http://192.168.0.10:1995/dock/?pair=K7Q2M9XA',
    expiresAt: Date.now() + 5 * 60_000,
    lan,
    urls: lan ? ['http://192.168.0.10:1995/dock/?pair=K7Q2M9XA'] : [],
    hint: lan ? null : 'Erro: o acesso pela rede está desligado — Solução: use LAN=true no .env e reinicie o stream95',
  });

  async function mountDevices(pair: () => Promise<unknown>) {
    mocks.api.mockImplementation(async (method, path) => {
      if (method === 'GET' && path === '/api/devices') return [];
      if (method === 'GET' && path === '/api/devices/pair-info') return pair();
      return { ok: true };
    });
    mount(<DevicesSection />);
    // Let the first load (two requests) settle.
    await act(async () => {});
  }

  it('points to the network warning, not to a QR code, when LAN is off', async () => {
    await mountDevices(async () => pairInfo(false));
    expect(text()).toContain('Nenhum aparelho conectado');
    expect(text()).toContain('Libere o acesso pela rede para conectar o celular ou o tablet.');
    expect(text()).toContain('O acesso pela rede está desligado');
    expect(text()).not.toContain('QR code abaixo');
  });

  it('points to the QR code when phones can connect', async () => {
    await mountDevices(async () => pairInfo(true));
    expect(text()).toContain('Use o QR code abaixo para conectar o celular ou o tablet.');
    expect(text()).not.toContain('Libere o acesso pela rede');
  });

  it('points to nothing below when the pairing info did not load', async () => {
    await mountDevices(async () => {
      throw new Error('Erro: servidor ocupado — Solução: tente de novo');
    });
    expect(text()).toContain('Nenhum aparelho conectado');
    expect(text()).toContain('Servidor ocupado');
    expect(text()).not.toContain('QR code abaixo');
  });
});

describe('Overlay: copy', () => {
  it('names the “Volto já” screen and suggests a theme without Windows names', () => {
    mount(<OverlaySection />);
    expect(text()).toContain('Título da tela “Volto já”');
    expect(text()).toContain('Nome do tema do React95, ex.: modernDark.');
    expect(text()).not.toMatch(/win95|windows|microsoft/i);
  });
});
