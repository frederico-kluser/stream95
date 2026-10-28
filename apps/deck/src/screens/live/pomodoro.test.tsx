import type { PomodoroState } from '@stream95/shared';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotionUIThemeProvider } from '@/components/motion-ui/ui-theme';
import { type DeckState, initialState, reduce } from '@/lib/store';
import motionTheme from '../../../motion.theme';
import { clock, PomodoroSection, usePomodoroRemaining } from './pomodoro';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom's Web Animations reject `finished` when Motion cancels them; without `animate`, Motion
// runs its own JS animations and the test output stays clean.
vi.hoisted(() => Reflect.deleteProperty(Element.prototype, 'animate'));

const mocks = vi.hoisted(() => ({ state: null as unknown as DeckState }));

vi.mock('@/lib/store', async (original) => ({
  ...(await original<typeof import('@/lib/store')>()),
  useDeck: () => mocks.state,
}));

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 27, 20, 0, 0);

const focus = (remainingMs: number, running = true): PomodoroState => ({
  mode: 'focus',
  running,
  remainingMs,
  durationMs: 25 * MIN,
  cycle: 1,
});

/** Fakes only the clock and the interval: React keeps its own scheduling. */
const fakeClock = (now: number) => vi.useFakeTimers({ now, toFake: ['Date', 'setInterval', 'clearInterval'] });

let root: Root | null = null;
let host: HTMLElement | null = null;

function mount(node: ReactNode) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root?.render(node);
  });
}

function rerender(node: ReactNode) {
  act(() => {
    root?.render(node);
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function Probe({ p, at }: { p: PomodoroState; at: number }) {
  return <output>{usePomodoroRemaining(p, at)}</output>;
}

const shown = () => Number(host?.querySelector('output')?.textContent);

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  vi.useRealTimers();
});

describe('clock', () => {
  it('rounds up, like any countdown', () => {
    expect(clock(1_499_000)).toBe('24:59');
    expect(clock(1_499_001)).toBe('25:00');
    expect(clock(0)).toBe('00:00');
    expect(clock(-1000)).toBe('00:00');
  });
});

describe('usePomodoroRemaining', () => {
  it('counts from when the event arrived, not from when the screen mounted', () => {
    // A 25-minute focus started 10 minutes before the Live tab was opened again.
    fakeClock(T0 + 10 * MIN);
    mount(<Probe p={focus(25 * MIN)} at={T0} />);
    expect(shown()).toBe(15 * MIN);
  });

  it('ticks down while running and stops at zero', () => {
    fakeClock(T0);
    mount(<Probe p={focus(2000)} at={T0} />);
    advance(1000);
    expect(shown()).toBe(1000);
    advance(5000);
    expect(shown()).toBe(0);
  });

  it('holds the time while paused', () => {
    fakeClock(T0 + 10 * MIN);
    mount(<Probe p={focus(7 * MIN, false)} at={T0} />);
    advance(5000);
    expect(shown()).toBe(7 * MIN);
  });

  it('starts over from each new event (pause, then resume)', () => {
    fakeClock(T0);
    mount(<Probe p={focus(25 * MIN)} at={T0} />);
    advance(5 * MIN);
    expect(shown()).toBe(20 * MIN);

    rerender(<Probe p={focus(20 * MIN, false)} at={T0 + 5 * MIN} />);
    advance(3 * MIN);
    expect(shown()).toBe(20 * MIN);

    rerender(<Probe p={focus(20 * MIN)} at={T0 + 8 * MIN} />);
    expect(shown()).toBe(20 * MIN);
    advance(2000);
    expect(shown()).toBe(20 * MIN - 2000);
  });
});

describe('Pomodoro section', () => {
  const section = (
    <MotionUIThemeProvider theme={motionTheme}>
      <PomodoroSection />
    </MotionUIThemeProvider>
  );
  const timer = () => host?.querySelector('[role="timer"]')?.textContent;
  const progress = () => host?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow');

  it('shows the real time left when Live opens again in the middle of a focus', () => {
    // The store gets the 'pomodoro' event at T0, while Live is open.
    fakeClock(T0);
    mocks.state = reduce({ ...initialState(), connection: 'online' }, { type: 'pomodoro', state: focus(25 * MIN) });
    mount(section);
    expect(timer()).toContain('25:00');

    // Another tab unmounts Live; the streamer comes back 10 minutes later.
    act(() => root?.unmount());
    host?.remove();
    vi.setSystemTime(T0 + 10 * MIN);
    mount(section);
    expect(timer()).toContain('15:00');
    expect(progress()).toBe('40');

    advance(60_000);
    expect(timer()).toContain('14:00');
  });
});
