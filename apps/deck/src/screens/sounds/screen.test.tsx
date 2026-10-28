import { defaultSettings, type ServerEvent, type SfxLibrary } from '@stream95/shared';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { MotionUIThemeProvider } from '@/components/motion-ui/ui-theme';
import { NotifyProvider } from '@/components/notify';
import { ApiError } from '@/lib/api';
import type { DeckState } from '@/lib/store';
import motionTheme from '../../../motion.theme';
import { RETAP_MS } from './play-feedback';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom's Web Animations reject `finished` when Motion cancels them; without `animate`, Motion
// runs its own JS animations and the test output stays clean.
vi.hoisted(() => Reflect.deleteProperty(Element.prototype, 'animate'));

const library: SfxLibrary = {
  dir: 'C:\\Users\\x\\Documents\\stream95\\sons',
  sounds: [
    { id: 's1', name: 'bruh', category: 'memes-en', file: 'memes-en/bruh.mp3', status: 'ready', durationMs: 900 },
    { id: 's2', name: 'ai-que-isso', category: 'memes-pt', file: 'memes-pt/ai-que-isso.mp3', status: 'converting' },
    { id: 's3', name: 'airhorn', category: '', file: 'airhorn.wav', status: 'ready', durationMs: 2100 },
  ],
  buttons: [
    { id: 'b1', label: 'Bruh', soundId: 's1', emoji: '💀', color: 'violet', volume: 0.8 },
    { id: 'b2', label: 'Ai que isso', soundId: 's2', color: 'pink', volume: 1 },
  ],
};

type ApiFn = (method: string, path: string, body?: unknown) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  state: null as unknown as DeckState,
  listeners: new Set<(e: ServerEvent) => void>(),
  api: null as unknown as Mock<ApiFn>,
}));

const defaultApi: ApiFn = async (method, path) => {
  if (method === 'POST' && path === '/api/sfx/play') return { playId: 'p1' };
  if (method === 'POST' && path === '/api/sfx/buttons') return { id: 'b3' };
  return { ok: true };
};

mocks.api = vi.fn<ApiFn>(defaultApi);

vi.mock('@/lib/store', () => ({
  useDeck: () => mocks.state,
  useDeckEvent: (fn: (e: ServerEvent) => void) => {
    mocks.listeners.add(fn);
  },
}));

vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: (method: string, path: string, body?: unknown) => mocks.api(method, path, body),
}));

const { SoundsScreen } = await import('../sounds');

let root: Root | null = null;
let host: HTMLElement;

function mount() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <MotionUIThemeProvider theme={motionTheme}>
        <NotifyProvider>
          <SoundsScreen />
        </NotifyProvider>
      </MotionUIThemeProvider>,
    );
  });
}

const byLabel = (name: string, scope: ParentNode = document) => {
  const el = scope.querySelector<HTMLElement>(`[aria-label="${name}"]`);
  if (!el) throw new Error(`no element labelled "${name}"`);
  return el;
};

const hasText = (text: string, scope: ParentNode = document) =>
  Array.from(scope.querySelectorAll('*')).some((el) => el.childElementCount === 0 && el.textContent === text);

const buttonWithText = (text: RegExp, scope: ParentNode = document) => {
  const el = Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
    text.test(b.textContent ?? ''),
  );
  if (!el) throw new Error(`no button with text ${text}`);
  return el;
};

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

beforeEach(() => {
  mocks.api.mockClear();
  mocks.api.mockImplementation(defaultApi);
  mocks.listeners.clear();
  mocks.state = {
    connection: 'online',
    settings: defaultSettings(),
    status: null,
    chat: [],
    incoming: [],
    queue: [],
    log: [],
    attention: [],
    sfx: library,
    sfxLatency: new Map(),
    poll: null,
    pomodoro: { mode: 'idle', running: false, remainingMs: 0, durationMs: 0, cycle: 0 },
    pomodoroAt: 0,
    counters: [],
    scene: null,
    obsScenes: [],
  };
  // happy-dom may lack the modal dialog API used by the Sheet.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

describe('Sons screen', () => {
  it('plays a button on the PC and shows the confirmed latency', async () => {
    mount();
    const tile = byLabel('Tocar Bruh');
    await click(tile);
    expect(mocks.api).toHaveBeenCalledWith('POST', '/api/sfx/play', { buttonId: 'b1' });
    // the request arrived: now only the PC can answer (a tile is short of room in a 320 px dock)
    expect(hasText('aguardando…', tile)).toBe(true);
    act(() => {
      for (const fn of mocks.listeners) fn({ type: 'sfx:played', playId: 'p1', soundId: 's1', latencyMs: 42 });
    });
    expect(hasText('tocou · 42 ms', tile)).toBe(true);
    // a library row has room for the whole sentence
    await click(byLabel('Tocar no PC: airhorn'));
    expect(byLabel('Tocar no PC: airhorn').closest('li')?.textContent).toContain('aguardando o PC…');
  });

  it('says at once when the OBS audio source is closed, with one notice for many taps', async () => {
    const title = 'A fonte de áudio do OBS não está aberta';
    mocks.api.mockImplementation(async (method, path) => {
      if (method === 'POST' && path === '/api/sfx/play') {
        throw new ApiError(
          'Erro: a fonte de áudio do OBS não está aberta — Solução: abra o OBS e ative a fonte /overlay/audio',
          409,
        );
      }
      return { ok: true };
    });
    mount();
    const tile = byLabel('Tocar Bruh');
    await click(tile);
    expect(hasText('fonte fechada', tile)).toBe(true);
    expect(hasText(title)).toBe(true);
    expect(hasText('Abra o OBS e ative a fonte /overlay/audio')).toBe(true);

    await act(() => new Promise((resolve) => setTimeout(resolve, RETAP_MS + 50)));
    await click(tile);
    await click(byLabel('Tocar no PC: airhorn'));
    expect(mocks.api).toHaveBeenCalledTimes(3);
    const notices = Array.from(document.querySelectorAll('p')).filter((p) => p.textContent === title);
    expect(notices).toHaveLength(1);
  });

  it('moves phone toasts above the floating stop while it shows', () => {
    const real = globalThis.IntersectionObserver;
    // the toolbar scrolled out of sight: the round stop button appears
    globalThis.IntersectionObserver = class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe() {
        this.callback(
          [{ isIntersecting: false } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      disconnect() {}
      unobserve() {}
      takeRecords() {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
    try {
      mount();
      expect(byLabel('Parar todos os sons')).toBeTruthy();
      expect(document.documentElement.style.getPropertyValue('--deck-toast-bottom')).toContain('9rem');
      act(() => root?.unmount());
      root = null;
      expect(document.documentElement.style.getPropertyValue('--deck-toast-bottom')).toBe('');
    } finally {
      globalThis.IntersectionObserver = real;
    }
  });

  it('keeps a converting sound disabled with the reason', async () => {
    mount();
    const tile = byLabel('Tocar Ai que isso');
    expect(tile.getAttribute('aria-disabled')).toBe('true');
    expect(hasText('convertendo…', tile)).toBe(true);
    await click(tile);
    expect(mocks.api).not.toHaveBeenCalledWith('POST', '/api/sfx/play', { buttonId: 'b2' });
  });

  it('disables everything with a visible reason while offline', () => {
    mocks.state = { ...mocks.state, connection: 'offline' };
    mount();
    expect(hasText('Sem conexão com o PC')).toBe(true);
    expect(byLabel('Tocar Bruh').getAttribute('aria-disabled')).toBe('true');
  });

  it('edits: reorders, opens the editor and creates a button', async () => {
    mount();
    await click(byLabel('Editar os botões'));
    await click(byLabel('Mover Ai que isso para cima'));
    expect(mocks.api).toHaveBeenCalledWith('PUT', '/api/sfx/buttons/order', { ids: ['b2', 'b1'] });

    await click(buttonWithText(/Novo botão/));
    const dialog = document.querySelector('dialog');
    expect(dialog).toBeTruthy();
    const airhorn = dialog?.querySelector<HTMLInputElement>('input[type="radio"][value="s3"]');
    if (!airhorn || !dialog) throw new Error('sound option not found');
    await click(airhorn);
    const nameLabel = Array.from(dialog.querySelectorAll('label')).find((l) => l.textContent === 'Nome');
    const nameInput = dialog.querySelector<HTMLInputElement>(`#${CSS.escape(nameLabel?.htmlFor ?? '')}`);
    expect(nameInput?.value).toBe('Airhorn');
    await click(buttonWithText(/Salvar/, dialog));
    expect(mocks.api).toHaveBeenCalledWith('POST', '/api/sfx/buttons', {
      label: 'Airhorn',
      soundId: 's3',
      color: expect.any(String),
      volume: 1,
    });
  });

  it('shows the library folder, counts and the file list', () => {
    mount();
    expect(hasText(library.dir)).toBe(true);
    expect(document.body.textContent).toContain('2 prontos');
    expect(byLabel('Tocar no PC: airhorn')).toBeTruthy();
  });

  it('explains the starter pack when the library is empty', () => {
    mocks.state = { ...mocks.state, sfx: { dir: library.dir, sounds: [], buttons: [] } };
    mount();
    expect(hasText('Nenhum som ainda')).toBe(true);
    expect(hasText('npm run sfx:pack')).toBe(true);
  });
});
