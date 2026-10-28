import { defaultSettings, type ServiceStatus } from '@stream95/shared';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckState } from '@/lib/store';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Without `animate`, Motion runs its own JS animations (happy-dom's Web Animations reject on cancel).
vi.hoisted(() => Reflect.deleteProperty(Element.prototype, 'animate'));

const mocks = vi.hoisted(() => ({ state: null as unknown as DeckState }));
vi.mock('@/lib/store', () => ({
  useDeck: () => mocks.state,
  getClient: () => ({ listen: () => () => {}, getState: () => mocks.state }),
}));

const { AppShell, SCREENS } = await import('@/components/app-shell');
const { NotifyProvider, TECH_ISSUE_TAG, useMuteNotices, useNotify } = await import('@/components/notify');
const { StatusStrip, stateText } = await import('@/components/status-strip');
type Notify = ReturnType<typeof useNotify>;
type ScreenId = (typeof SCREENS)[number];

const status = (patch: Partial<ServiceStatus> = {}): ServiceStatus => ({
  chat: 'online',
  eventsub: 'online',
  openrouter: 'online',
  obs: 'online',
  github: 'off',
  spentUsd: 0,
  startedAt: 0,
  ...patch,
});

function deckState(patch: Partial<DeckState> = {}): DeckState {
  return {
    connection: 'online',
    settings: defaultSettings(),
    status: status(),
    chat: [],
    incoming: [],
    queue: [],
    log: [],
    attention: [],
    sfx: { dir: '', sounds: [], buttons: [] },
    sfxLatency: {},
    poll: null,
    pomodoro: { mode: 'idle', running: false, remainingMs: 0, durationMs: 0, cycle: 0 },
    pomodoroAt: 0,
    counters: [],
    scene: null,
    obsScenes: [],
    ...patch,
  };
}

let root: Root | null = null;
let host: HTMLElement;

beforeEach(() => {
  mocks.state = deckState();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

const panels = Object.fromEntries(SCREENS.map((id) => [id, <p key={id}>tela {id}</p>])) as Record<ScreenId, ReactNode>;

function Muter({ on }: { on: boolean }) {
  useMuteNotices('x', on);
  return null;
}

let notify: Notify = () => {};
function Probe() {
  notify = useNotify();
  return null;
}

function renderShell(screen: ScreenId, onScreen: (s: ScreenId) => void = () => {}) {
  act(() =>
    root?.render(
      <NotifyProvider>
        <Probe />
        <AppShell screen={screen} onScreen={onScreen} panels={panels} />
      </NotifyProvider>,
    ),
  );
}

const techIssue = { tone: 'warning', title: 'Problema técnico no chat', durationMs: 0, tag: TECH_ISSUE_TAG } as const;
const shown = (text: string) => document.body.textContent?.includes(text) ?? false;

describe('notices', () => {
  it('drops technical-problem toasts while Moderação is open, and keeps the others', async () => {
    renderShell('moderacao');
    act(() => notify(techIssue));
    act(() => notify({ title: 'Mensagem rejeitada' }));
    expect(shown('Problema técnico no chat')).toBe(false);
    expect(shown('Mensagem rejeitada')).toBe(true);
  });

  it('shows them on the other tabs and closes them when Moderação opens', async () => {
    renderShell('sons');
    act(() => notify(techIssue));
    expect(shown('Problema técnico no chat')).toBe(true);
    renderShell('moderacao');
    await vi.waitFor(() => expect(shown('Problema técnico no chat')).toBe(false), { timeout: 3000 });
  });

  it('gives the action and the close button their own names', () => {
    renderShell('sons');
    act(() => notify({ title: 'Mensagem rejeitada', action: { label: 'Desfazer', onClick: () => {} } }));
    const buttons = [...document.body.querySelectorAll('button')].map(
      (b) => b.getAttribute('aria-label') ?? b.textContent,
    );
    expect(buttons).toContain('Desfazer');
    expect(buttons).toContain('Fechar aviso');
  });

  it('lets a screen lift phone toasts above what it floats at the bottom', () => {
    renderShell('sons');
    act(() => notify({ title: 'Mensagem rejeitada' }));
    const stack = [...document.body.querySelectorAll<HTMLElement>('.fixed')].find((el) =>
      el.textContent?.includes('Mensagem rejeitada'),
    );
    // Sons sets this variable while its round Stop button shows (screens/sounds/toolbar.tsx)
    expect(stack?.className).toContain('max-md:bottom-[var(--deck-toast-bottom,6rem)]!');
  });

  it('unmutes when the last place that muted a tag lets go', () => {
    const tree = (a: boolean, b: boolean) => (
      <NotifyProvider>
        <Probe />
        <Muter on={a} />
        <Muter on={b} />
      </NotifyProvider>
    );
    act(() => root?.render(tree(true, true)));
    act(() => root?.render(tree(false, true)));
    act(() => notify({ title: 'ainda mudo', tag: 'x' }));
    expect(shown('ainda mudo')).toBe(false);
    act(() => root?.render(tree(false, false)));
    act(() => notify({ title: 'de volta', tag: 'x' }));
    expect(shown('de volta')).toBe(true);
  });
});

describe('screen tabs', () => {
  it('lists every screen with its whole name', () => {
    renderShell('moderacao');
    const labels = [...host.querySelectorAll('[role=tab]')].map((t) => t.textContent);
    expect(labels).toEqual(['Moderação', 'Sons', 'Assistente', 'Alertas', 'Live', 'Config']);
  });

  it('opens the new screen at its top', () => {
    const onScreen = vi.fn();
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 1800 });
    try {
      renderShell('moderacao', onScreen);
      const sons = [...host.querySelectorAll<HTMLElement>('[role=tab]')].find((t) => t.textContent === 'Sons');
      act(() => sons?.click());
      expect(onScreen).toHaveBeenCalledWith('sons');
      expect(scrollTo).toHaveBeenCalledWith(0, 0);
    } finally {
      scrollTo.mockRestore();
      Reflect.deleteProperty(window, 'scrollY');
    }
  });

  it('publishes the sticky bar sizes on <html> while mounted', () => {
    const html = document.documentElement.style;
    renderShell('moderacao');
    expect(html.getPropertyValue('--deck-header-h')).toMatch(/^\d+(\.\d+)?px$/);
    expect(html.getPropertyValue('--deck-sticky-top')).toMatch(/^\d+(\.\d+)?px$/);
    // the pairing screen replaces the shell: nothing sticky is left to pad for
    act(() => root?.render(<NotifyProvider>{null}</NotifyProvider>));
    expect(html.getPropertyValue('--deck-header-h')).toBe('');
    expect(html.getPropertyValue('--deck-sticky-top')).toBe('');
  });
});

describe('status strip', () => {
  it('says in words what is not online (not only with the dot color)', () => {
    mocks.state = deckState({ status: status({ obs: 'off', openrouter: 'unconfigured', eventsub: 'error' }) });
    act(() => root?.render(<StatusStrip />));
    // every pill, whatever the breakpoint (happy-dom applies no CSS)
    const pills = [...host.querySelectorAll('section span.rounded-full.border')].map((p) => ({
      text: p.textContent,
      hidden: p.querySelector('.sr-only')?.textContent ?? null,
      phone: !p.closest('.max-md\\:hidden') && !p.className.includes('md:hidden'),
    }));
    expect(pills).toEqual([
      // online services: shown one by one from tablets up, folded into one pill on phones
      { text: 'Servidoronline', hidden: 'online', phone: false },
      { text: 'Chatonline', hidden: 'online', phone: false },
      { text: 'OBSdesligado', hidden: null, phone: true },
      { text: 'Twitchcom erro', hidden: null, phone: true },
      { text: '2 online: Servidor e Chat', hidden: ': Servidor e Chat', phone: false },
    ]);
    // "não configurada" is a setup state, not a live problem: it stays out of the sticky header
    expect(host.textContent).not.toContain('IA');
  });

  it('folds everything into "Tudo online" on phones when all services are up', () => {
    mocks.state = deckState({ status: status({}) });
    act(() => root?.render(<StatusStrip />));
    const summary = host.querySelector('section span.md\\:hidden');
    expect(summary?.textContent).toMatch(/^Tudo online/);
  });

  it('agrees with the gender of the service name', () => {
    expect(stateText('off')).toBe('desligado');
    expect(stateText('off', true)).toBe('desligada');
    expect(stateText('unconfigured', true)).toBe('não configurada');
    expect(stateText('offline')).toBe('sem conexão');
    expect(stateText('connecting', true)).toBe('conectando');
  });
});
