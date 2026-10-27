import type { PomodoroMode, PomodoroState } from '@stream95/shared';

type Durations = () => { focusMin: number; breakMin: number };

/** Pomodoro timer shown in the overlay taskbar; the server is the single source of truth. */
export class PomodoroService {
  private state: PomodoroState = { mode: 'idle', running: false, remainingMs: 0, durationMs: 0, cycle: 0 };
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly durations: Durations,
    private readonly publish: (state: PomodoroState) => void,
    private readonly onFinish: (finished: PomodoroMode, next: PomodoroMode) => void,
    private readonly now: () => number = Date.now,
  ) {}

  get current(): PomodoroState {
    return { ...this.state, remainingMs: this.remaining() };
  }

  start(mode: 'focus' | 'break' = 'focus', minutes?: number): PomodoroState {
    const d = this.durations();
    const durationMs = Math.round((minutes ?? (mode === 'focus' ? d.focusMin : d.breakMin)) * 60_000);
    this.state = {
      mode,
      running: true,
      durationMs,
      remainingMs: durationMs,
      endsAt: this.now() + durationMs,
      cycle: mode === 'focus' ? this.state.cycle + 1 : this.state.cycle,
    };
    this.schedule(durationMs);
    return this.emit();
  }

  pause(): PomodoroState {
    if (!this.state.running) return this.current;
    const remainingMs = this.remaining();
    this.clear();
    this.state = { ...this.state, running: false, remainingMs };
    delete this.state.endsAt;
    return this.emit();
  }

  resume(): PomodoroState {
    if (this.state.running || this.state.mode === 'idle' || this.state.remainingMs <= 0) return this.current;
    this.state = { ...this.state, running: true, endsAt: this.now() + this.state.remainingMs };
    this.schedule(this.state.remainingMs);
    return this.emit();
  }

  stop(): PomodoroState {
    this.clear();
    this.state = { mode: 'idle', running: false, remainingMs: 0, durationMs: 0, cycle: this.state.cycle };
    return this.emit();
  }

  /** Called when the timer fires; also usable by tests. */
  finish(): void {
    const finished = this.state.mode;
    if (finished === 'idle') return;
    const next: PomodoroMode = finished === 'focus' ? 'break' : 'focus';
    this.clear();
    this.state = { ...this.state, running: false, remainingMs: 0 };
    delete this.state.endsAt;
    this.emit();
    this.onFinish(finished, next);
  }

  private remaining(): number {
    if (!this.state.running || !this.state.endsAt) return this.state.remainingMs;
    return Math.max(0, this.state.endsAt - this.now());
  }

  private schedule(ms: number): void {
    this.clear();
    this.timer = setTimeout(() => this.finish(), ms);
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private emit(): PomodoroState {
    const snapshot = this.current;
    this.publish(snapshot);
    return snapshot;
  }
}
