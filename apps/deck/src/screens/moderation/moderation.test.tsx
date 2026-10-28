import type { ModeratedMessage, ServiceStatus } from '@stream95/shared';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { MotionUIThemeProvider } from '@/components/motion-ui/ui-theme';
import { NotifyProvider } from '@/components/notify';
import { ApiError } from '@/lib/api';
import { type DeckState, initialState } from '@/lib/store';
import motionTheme from '../../../motion.theme';
import { AttentionSection } from './attention-section';
import { DecisionsSection } from './decisions-section';
import { QueueSection } from './queue-section';
import { scheduleReject } from './stores';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom's Web Animations reject `finished` when Motion cancels them; without `animate`, Motion
// runs its own JS animations and the test output stays clean.
vi.hoisted(() => Reflect.deleteProperty(Element.prototype, 'animate'));

type ApiFn = (method: string, path: string, body?: unknown) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  state: null as unknown as DeckState,
  api: null as unknown as Mock<ApiFn>,
}));

mocks.api = vi.fn<ApiFn>(async () => ({ ok: true }));

vi.mock('@/lib/store', async (original) => ({
  ...(await original<typeof import('@/lib/store')>()),
  useDeck: () => mocks.state,
  useDeckEvent: () => {},
  getClient: () => ({ getState: () => mocks.state, listen: () => () => {} }),
}));

vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  api: (method: string, path: string, body?: unknown) => mocks.api(method, path, body),
}));

vi.mock('./stores', async (original) => ({
  ...(await original<typeof import('./stores')>()),
  scheduleReject: vi.fn(),
}));

// A hold is a timed animation; here a click confirms it.
vi.mock('@/components/motion-ui/hold-to-confirm', () => ({
  HoldToConfirmButton: ({ children, onConfirm }: { children?: ReactNode; onConfirm?: () => void }) => (
    <button type="button" onClick={() => onConfirm?.()}>
      {children}
    </button>
  ),
}));

const message = (over: Partial<ModeratedMessage> = {}): ModeratedMessage => ({
  id: 'm1',
  channel: 'canal',
  userId: 'u1',
  login: 'fulano',
  displayName: 'Fulano',
  text: 'compra seguidores aqui',
  emotes: [],
  badges: [],
  isBroadcaster: false,
  isMod: false,
  isVip: false,
  isSub: false,
  isFirst: false,
  isHighlighted: false,
  timestamp: Date.now(),
  source: 'twitch',
  verdict: { decision: 'review', category: 'ok', reason: 'modo manual', by: 'rules' },
  status: 'held',
  decidedAt: Date.now(),
  ...over,
});

const status = (openrouter: ServiceStatus['openrouter']): ServiceStatus => ({
  chat: 'online',
  eventsub: 'off',
  openrouter,
  obs: 'online',
  github: 'off',
  spentUsd: 0,
  startedAt: 0,
});

let root: Root | null = null;
let host: HTMLElement;
const realRect = Element.prototype.getBoundingClientRect;
const realMatchMedia = window.matchMedia;

function mount(node: ReactNode) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <MotionUIThemeProvider theme={motionTheme}>
        <NotifyProvider>{node}</NotifyProvider>
      </MotionUIThemeProvider>,
    );
  });
}

const byLabel = (name: string, scope: ParentNode = document) => {
  const el = scope.querySelector<HTMLElement>(`[aria-label="${name}"]`);
  if (!el) throw new Error(`no element labelled "${name}"`);
  return el;
};

const byText = (text: string) => {
  const el = Array.from(document.querySelectorAll<HTMLElement>('*')).find(
    (e) => e.childElementCount === 0 && e.textContent === text,
  );
  if (!el) throw new Error(`no element with text "${text}"`);
  return el;
};

function pointer(target: EventTarget, type: string, clientX: number, pointerId: number) {
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY: 400,
        pointerId,
        pointerType: 'touch',
      }),
    );
  });
}

/** A full swipe to the left by one finger, from the right side of the card to the left edge. */
function fullSwipe(on: HTMLElement, pointerId: number) {
  pointer(on, 'pointerdown', 330, pointerId);
  pointer(on, 'pointermove', 200, pointerId);
  pointer(on, 'pointermove', 30, pointerId);
  pointer(on, 'pointerup', 30, pointerId);
}

beforeEach(() => {
  vi.mocked(scheduleReject).mockClear();
  mocks.api.mockReset();
  mocks.api.mockImplementation(async () => ({ ok: true }));
  mocks.state = { ...initialState(), connection: 'online' };
  // a phone: coarse pointer (swipe rows) and rows about 350 px wide
  window.matchMedia = ((query: string) => ({
    matches: query === '(pointer: coarse)',
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 350, bottom: 300, width: 350, height: 300, toJSON: () => ({}) }) as DOMRect;
  // happy-dom may lack the modal dialog API used by the Sheet.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  Element.prototype.getBoundingClientRect = realRect;
  window.matchMedia = realMatchMedia;
});

describe('approval queue on a phone (swipe rows)', () => {
  it('a full swipe still rejects the message', () => {
    const m = message();
    mocks.state = { ...mocks.state, queue: [m] };
    mount(<QueueSection />);
    fullSwipe(byText(m.text), 1);
    expect(scheduleReject).toHaveBeenCalledTimes(1);
    expect(vi.mocked(scheduleReject).mock.calls[0]?.[0]).toBe(m);
  });

  it.each([
    ['another finger', 2],
    ['the same pointer id', 1],
  ])('a scroll that started on the row (pointercancel) never rejects it later (%s)', (_, laterId) => {
    const m = message();
    mocks.state = { ...mocks.state, queue: [m] };
    mount(<QueueSection />);
    const text = byText(m.text);
    // the thumb lands on the right side of the card and scrolls: the browser takes the pan
    pointer(text, 'pointerdown', 330, 1);
    pointer(text, 'pointermove', 331, 1);
    pointer(text, 'pointercancel', 331, 1);
    // later, a touch far to the left (another card, the tab bar)
    pointer(document.body, 'pointerdown', 30, laterId);
    pointer(document.body, 'pointermove', 30, laterId);
    pointer(document.body, 'pointerup', 30, laterId);
    expect(scheduleReject).not.toHaveBeenCalled();
    // the row works again after it snapped back
    fullSwipe(byText(m.text), 3);
    expect(scheduleReject).toHaveBeenCalledTimes(1);
  });

  it('a scroll that started on the row lets go of it: it neither follows other fingers nor stays half open', async () => {
    const m = message();
    mocks.state = { ...mocks.state, queue: [m] };
    mount(<QueueSection />);
    const face = () => byText(m.text).closest('li')?.querySelector<HTMLElement>(':scope > div');
    const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    pointer(byText(m.text), 'pointerdown', 330, 1);
    pointer(byText(m.text), 'pointercancel', 330, 1);
    // another finger drags 180 px to the left somewhere else, then lifts (past the 25% that opens a row)
    pointer(document.body, 'pointerdown', 330, 2);
    pointer(document.body, 'pointermove', 150, 2);
    await settle();
    expect(face()?.style.transform ?? '').not.toMatch(/translateX\(-/);
    pointer(document.body, 'pointerup', 150, 2);
    await settle();
    expect(face()?.style.transform ?? '').not.toMatch(/translateX\(-/);
  });

  it('keeps a decision that is being sent when a scroll resets the row', async () => {
    const m = message();
    mocks.state = { ...mocks.state, queue: [m] };
    mocks.api.mockImplementation(() => new Promise(() => {})); // the approval is still on its way
    mount(<QueueSection />);
    const approve = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Aprovar');
    if (!approve) throw new Error('no Aprovar button');
    await act(async () => approve.click());
    const rowBefore = byText(m.text).closest('li');
    pointer(byText(m.text), 'pointerdown', 330, 1);
    pointer(byText(m.text), 'pointercancel', 330, 1);
    expect(byText(m.text).closest('li')).not.toBe(rowBefore);
    expect(document.body.textContent).toContain('Aprovando…');
    // still locked ("Aprovando…" and "Aprovar e confiar"): no second request
    const approvals = Array.from(document.querySelectorAll('button')).filter((b) =>
      b.textContent?.startsWith('Aprova'),
    );
    expect(approvals.length).toBeGreaterThanOrEqual(2);
    expect(approvals.every((b) => b.disabled)).toBe(true);
    expect(mocks.api).toHaveBeenCalledTimes(1);
  });

  it('a swipe ended by another finger does not commit', () => {
    const m = message();
    mocks.state = { ...mocks.state, queue: [m] };
    mount(<QueueSection />);
    const text = byText(m.text);
    pointer(text, 'pointerdown', 330, 1);
    pointer(text, 'pointermove', 30, 1);
    pointer(document.body, 'pointerdown', 200, 2);
    pointer(document.body, 'pointerup', 200, 2);
    expect(scheduleReject).not.toHaveBeenCalled();
  });

  it('a tap on the revealed Rejeitar button rejects', async () => {
    const m = message();
    mocks.state = { ...mocks.state, queue: [m] };
    mount(<QueueSection />);
    const button = byLabel(`Rejeitar a mensagem de ${m.displayName}`);
    pointer(button, 'pointerdown', 330, 4);
    pointer(button, 'pointerup', 330, 4);
    await act(async () => button.click());
    expect(scheduleReject).toHaveBeenCalledTimes(1);
  });

  it('shows a failed ban inside the sheet, where the streamer is looking', async () => {
    const m = message();
    mocks.state = { ...mocks.state, queue: [m] };
    mocks.api.mockImplementation(async (_method, path) => {
      if (path === `/api/mod/${m.id}/reject`) {
        throw new ApiError('Erro: sem conexão com o servidor — Solução: confira se o stream95 está rodando no PC', 0);
      }
      return { ok: true };
    });
    mount(<QueueSection />);
    await act(async () => byLabel(`Banir ${m.displayName} nesta sessão`).click());
    const dialog = document.querySelector('dialog');
    if (!dialog) throw new Error('ban sheet not open');
    const confirm = Array.from(dialog.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Banir na sessão'),
    );
    if (!confirm) throw new Error('no ban button in the sheet');
    await act(async () => confirm.click());

    const alert = dialog.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Sem conexão com o servidor');
    expect(alert?.textContent).toContain('Confira se o stream95 está rodando no PC');
    // no toast behind the scrim
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(1);
    // a fresh ban button to try again
    expect(Array.from(dialog.querySelectorAll('button')).some((b) => b.textContent?.includes('Banir na sessão'))).toBe(
      true,
    );
  });
});

describe('attention', () => {
  it('says the AI is not configured instead of promising alerts', () => {
    mocks.state = { ...mocks.state, status: status('unconfigured') };
    mount(<AttentionSection />);
    expect(document.body.textContent).toContain('A IA não está configurada no PC');
    expect(document.body.textContent).not.toContain('Quando alguém avisar');
  });

  it('promises alerts when Jev can run', () => {
    mocks.state = { ...mocks.state, status: status('online') };
    mount(<AttentionSection />);
    expect(document.body.textContent).toContain('Quando alguém avisar de som, vídeo ou atraso');
  });
});

describe('latest decisions', () => {
  it('says who held a waiting message and never repeats a word', () => {
    mocks.state = {
      ...mocks.state,
      log: [
        message({ id: 'a', decidedAt: 3 }),
        message({
          id: 'b',
          status: 'shown',
          decidedAt: 2,
          verdict: { decision: 'allow', category: 'ok', reason: 'confiável', by: 'trusted' },
        }),
        message({
          id: 'c',
          status: 'rejected',
          decidedAt: 1,
          verdict: {
            decision: 'review',
            category: 'links',
            reason: 'link fora da lista: free-followers-agora.xyz',
            by: 'rules',
          },
        }),
      ],
    };
    mount(<DecisionsSection />);
    const lines = Array.from(document.querySelectorAll('p'))
      .map((p) => p.textContent ?? '')
      .filter((t) => t.startsWith('Quem '));
    expect(lines).toEqual([
      'Quem segurou: regras · modo manual',
      'Quem decidiu: confiável',
      'Quem decidiu: regras · link fora da lista: free-followers-agora.xyz',
    ]);
  });
});
