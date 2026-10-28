import type { PomodoroState } from '@stream95/shared';
import { Brain, Coffee, Pause, Play, Square, Timer } from 'lucide-react';
import type { ReactNode } from 'react';
import { MultiStateButton } from '@/components/motion-ui/multi-state-button';
import { ProgressBar } from '@/components/motion-ui/progress-bar';
import { Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useDeck } from '@/lib/store';
import { cn } from '@/lib/utils';
import { HoldButton, OfflineNote, Spinner, useAction, useNow, useOnline } from './kit';

type Period = 'focus' | 'break';
type PomodoroAction = Period | 'toggle' | 'stop';

/**
 * Remaining time, counted down here between server events. `at` is when the last event arrived on
 * this device (stamped by the store), so the count survives a remount of the screen, and a phone
 * with a skewed clock still shows the right time (the server clock is never used).
 */
export function usePomodoroRemaining(p: PomodoroState, at: number): number {
  const now = useNow(250, p.running);
  if (!p.running) return p.remainingMs;
  // `now` can lag behind a fresh event by one tick: never count negative time.
  return Math.max(0, p.remainingMs - Math.max(0, now - at));
}

/** 1_499_000 → "24:59" (rounded up, like any countdown). */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const PERIOD: Record<Period, { label: string; icon: ReactNode }> = {
  focus: { label: 'Foco', icon: <Brain className="size-5" aria-hidden /> },
  break: { label: 'Pausa', icon: <Coffee className="size-5" aria-hidden /> },
};

export function PomodoroSection({ className }: { className?: string }) {
  const { pomodoro: p, pomodoroAt, settings } = useDeck();
  const online = useOnline();
  const remaining = usePomodoroRemaining(p, pomodoroAt);
  const { pending, run } = useAction<PomodoroAction>();
  const { focusMin, breakMin } = settings.pomodoro;

  const idle = p.mode === 'idle';
  const finished = !idle && !p.running && remaining <= 0;
  const paused = !idle && !p.running && remaining > 0;
  const progress = !idle && p.durationMs > 0 ? 1 - remaining / p.durationMs : 0;
  // The period worth suggesting: focus when idle, the other one when a period just ended.
  const suggested: Period | null = idle ? 'focus' : finished ? (p.mode === 'focus' ? 'break' : 'focus') : null;

  const start = (mode: Period) => run(mode, () => api('POST', '/api/pomodoro/start', { mode }));
  const toggle = () => run('toggle', () => api('POST', `/api/pomodoro/${p.running ? 'pause' : 'resume'}`));
  const stop = () => run('stop', () => api('POST', '/api/pomodoro/stop'));

  const status = idle ? 'parado' : p.running ? 'rodando' : paused ? 'pausado' : 'acabou';
  const toggleState = pending === 'toggle' ? 'pending' : p.running ? 'running' : 'paused';

  return (
    <Section className={className} title="Pomodoro" description="O timer aparece na barra de tarefas do overlay.">
      <OfflineNote />
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={idle ? 'secondary' : 'outline'} className="h-6 gap-1.5 px-2.5 text-sm">
            {idle ? <Timer className="size-3.5" aria-hidden /> : PERIOD[p.mode as Period].icon}
            {idle ? 'Pomodoro' : PERIOD[p.mode as Period].label}
          </Badge>
          <span
            className={cn(
              'font-medium',
              p.running ? 'text-success' : finished ? 'text-warning' : 'text-muted-foreground',
            )}
          >
            {status}
          </span>
          {p.cycle > 0 && <span className="text-muted-foreground tabular-nums">· ciclo {p.cycle}</span>}
        </div>
        <p
          role="timer"
          className={cn(
            'font-mono text-6xl font-semibold tracking-tight tabular-nums sm:text-7xl',
            p.running ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          <span className="sr-only">Tempo restante: </span>
          {clock(idle ? focusMin * 60_000 : remaining)}
        </p>
      </div>

      <ProgressBar
        value={progress}
        progressbar
        aria-label="Quanto do período já passou"
        tone={p.mode === 'break' ? 'var(--success)' : 'var(--brand)'}
        label={
          <span className="text-sm text-muted-foreground">
            {idle
              ? `Foco de ${focusMin} min, pausa de ${breakMin} min`
              : `${PERIOD[p.mode as Period].label} de ${Math.round(p.durationMs / 60_000)} min`}
          </span>
        }
        valueLabel={<span className="text-sm text-muted-foreground tabular-nums">{Math.round(progress * 100)}%</span>}
      />

      <div className="grid grid-cols-2 gap-3">
        {(['focus', 'break'] as const).map((mode) => {
          const current = p.mode === mode && !finished;
          return (
            <Button
              key={mode}
              type="button"
              variant={suggested === mode ? 'default' : 'secondary'}
              disabled={!online}
              aria-busy={pending === mode || undefined}
              onClick={() => start(mode)}
              className="h-auto min-h-16 flex-col gap-0.5 rounded-xl px-3 py-2"
            >
              <span className="flex items-center gap-2 text-base font-medium">
                {pending === mode ? <Spinner className="size-5" /> : PERIOD[mode].icon}
                {PERIOD[mode].label}
              </span>
              <span className="text-xs font-normal opacity-80">
                {current ? 'recomeça do zero' : `${mode === 'focus' ? focusMin : breakMin} min`}
              </span>
            </Button>
          );
        })}

        {!idle && (
          <>
            <MultiStateButton
              state={toggleState}
              onClick={toggle}
              disabled={!online || finished || pending !== null}
              widthMorph={false}
              icon={
                toggleState === 'pending' ? (
                  <Spinner className="size-5" />
                ) : p.running ? (
                  <Pause className="size-5" />
                ) : (
                  <Play className="size-5" />
                )
              }
              announce={p.running ? 'Timer rodando' : paused ? 'Timer pausado' : ''}
              className="flex w-full *:w-full"
              pillClassName="h-14 w-full justify-center rounded-xl px-4 text-base font-medium"
              surfaceClassName={cn('bg-primary text-primary-foreground', (!online || finished) && 'opacity-50')}
            >
              {toggleState === 'pending' ? (p.running ? 'Pausando…' : 'Retomando…') : p.running ? 'Pausar' : 'Retomar'}
            </MultiStateButton>
            <HoldButton
              onConfirm={stop}
              disabled={!online}
              pending={pending === 'stop'}
              pendingLabel="Parando…"
              className="h-14! w-full! rounded-xl!"
            >
              <Square className="size-4" aria-hidden />
              Segure para parar
            </HoldButton>
          </>
        )}
      </div>
      {finished && (
        <p className="text-sm text-muted-foreground">
          O tempo acabou. Comece {p.mode === 'focus' ? 'a pausa' : 'outro foco'} ou segure Parar para zerar.
        </p>
      )}
    </Section>
  );
}
