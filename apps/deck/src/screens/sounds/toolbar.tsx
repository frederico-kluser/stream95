import { Check, CircleAlert, Pencil, SlidersHorizontal, Square, Volume1, Volume2, VolumeX } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo, type RefObject, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MultiStateButton } from '@/components/motion-ui/multi-state-button';
import { SegmentedToggle, SegmentedToggleOption } from '@/components/motion-ui/segmented-toggle';
import { useMotionUITransition } from '@/components/motion-ui/ui-theme';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { api } from '@/lib/api';
import { pct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { OVERLAP_HINT, type Overlap, sliderValue } from './lib';
import { FILL_PILL, SLIDER_TOUCH, Spinner } from './parts';
import { type ActionState, useAction } from './use-action';
import { useSettingDraft, useSettingsPatch } from './use-setting-draft';

const STOP: Record<ActionState, string> = { idle: 'Parar tudo', busy: 'Parando…', done: 'Parado', error: 'Falhou' };

function stopIcon(state: ActionState) {
  if (state === 'busy') return <Spinner className="size-4" />;
  if (state === 'done') return <Check className="size-4" />;
  if (state === 'error') return <CircleAlert className="size-4" />;
  return <Square className="size-4 fill-current" />;
}

/** False once the element scrolls under the sticky header or off screen. */
function useOnScreen(ref: RefObject<HTMLElement | null>): boolean {
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const sticky = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--deck-sticky-top'));
    const observer = new IntersectionObserver((entries) => setOnScreen(entries[0]?.isIntersecting ?? true), {
      rootMargin: `-${Number.isFinite(sticky) && sticky > 0 ? Math.round(sticky) : 120}px 0px 0px 0px`,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return onScreen;
}

/**
 * Bottom offset that keeps phone toasts above the floating stop: its own offset (safe area + 5rem),
 * its height (3.5rem) and a 0.5rem gap. The toast stack reads it (notify.tsx).
 */
const TOAST_BOTTOM_VAR = '--deck-toast-bottom';
const TOAST_BOTTOM = 'calc(max(0.75rem, env(safe-area-inset-bottom)) + 9rem)';

/**
 * Round "stop" button that follows the scroll once the toolbar is out of sight, so a loud sound can
 * be cut from anywhere in the grid. Rendered in <body>: the tab panel has a filter, which would
 * trap `position: fixed`. It never moves; on phones the toasts move above it while it shows.
 */
function FloatingStop({
  show,
  disabled,
  state,
  onStop,
}: {
  show: boolean;
  disabled: boolean;
  state: ActionState;
  onStop: () => void;
}) {
  const reduce = useReducedMotion();
  const snap = useMotionUITransition('snap');

  useEffect(() => {
    if (!show) return;
    const root = document.documentElement;
    root.style.setProperty(TOAST_BOTTOM_VAR, TOAST_BOTTOM);
    return () => {
      root.style.removeProperty(TOAST_BOTTOM_VAR);
    };
  }, [show]);

  return createPortal(
    <AnimatePresence>
      {show && (
        <motion.button
          key="floating-stop"
          type="button"
          aria-label="Parar todos os sons"
          disabled={disabled}
          onClick={onStop}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
          whileTap={reduce || disabled ? undefined : { scale: 0.92 }}
          transition={snap}
          className="fixed right-4 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))_+_5rem)] z-30 flex size-14 items-center justify-center rounded-full bg-destructive text-background shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:opacity-50 md:right-6 md:bottom-6"
        >
          {state === 'busy' ? <Spinner className="size-6" /> : <Square className="size-5 fill-current" aria-hidden />}
        </motion.button>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Stop all, master volume, overlap mode and the edit switch of the soundboard. */
export const Toolbar = memo(function Toolbar({
  offline,
  volume,
  overlap,
  editing,
  onToggleEdit,
}: {
  offline: boolean;
  volume: number;
  overlap: Overlap;
  editing: boolean;
  onToggleEdit: () => void;
}) {
  const patch = useSettingsPatch();
  const [vol, setVol] = useSettingDraft(volume, (value: number) => patch({ sfx: { volume: value } }), 250);
  const [mode, setMode] = useSettingDraft<Overlap>(overlap, (value) => patch({ sfx: { overlap: value } }));
  const stop = useAction();
  const stopRef = useRef<HTMLDivElement>(null);
  const stopOnScreen = useOnScreen(stopRef);
  const volumeLabel = useId();
  const settingsId = useId();
  // phones: the board is the point of this screen, so the volume and overlap settings start folded
  const [showSettings, setShowSettings] = useState(false);
  const VolumeIcon = vol <= 0 ? VolumeX : vol < 0.5 ? Volume1 : Volume2;

  const stopAll = () => {
    if (offline) return;
    void stop.run(() => api('POST', '/api/sfx/stop'), { settleMs: 1200 });
  };

  return (
    <section
      aria-label="Controles da mesa de som"
      className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-3 sm:p-4 lg:flex-row lg:items-start lg:gap-6"
    >
      <div ref={stopRef} className="flex gap-2 lg:w-72 lg:shrink-0">
        <MultiStateButton
          state={stop.state}
          icon={stopIcon(stop.state)}
          onClick={stopAll}
          disabled={offline}
          widthMorph={false}
          feedback={stop.state === 'error' ? 'shake' : 'none'}
          announce={stop.state === 'done' ? 'Todos os sons parados' : undefined}
          className={cn(FILL_PILL, 'flex-1 rounded-xl!')}
          pillClassName="min-h-12 rounded-xl px-4 text-sm font-semibold"
          surfaceClassName={cn(
            'bg-destructive/10 text-destructive hover:bg-destructive/20 dark:bg-destructive/20',
            offline && 'opacity-50',
          )}
        >
          {STOP[stop.state]}
        </MultiStateButton>
        <Button
          type="button"
          variant={editing ? 'default' : 'outline'}
          onClick={onToggleEdit}
          className="h-12 rounded-xl px-4"
          aria-label={editing ? 'Concluir a edição dos botões' : 'Editar os botões'}
        >
          {editing ? <Check aria-hidden /> : <Pencil aria-hidden />}
          {editing ? 'Concluir' : 'Editar'}
        </Button>
        <Button
          type="button"
          variant={showSettings ? 'secondary' : 'outline'}
          onClick={() => setShowSettings((v) => !v)}
          aria-expanded={showSettings}
          aria-controls={`${settingsId}-volume ${settingsId}-overlap`}
          aria-label={`Ajustes da mesa: volume geral ${pct(vol)} e sons ao mesmo tempo`}
          className="h-12 rounded-xl px-3 tabular-nums md:hidden"
        >
          <SlidersHorizontal aria-hidden />
          {pct(vol)}
        </Button>
      </div>

      <div
        id={`${settingsId}-volume`}
        className={cn('flex min-w-0 flex-1 flex-col gap-1', !showSettings && 'max-md:hidden')}
      >
        <div className="flex items-center justify-between gap-2">
          <span id={volumeLabel} className="text-xs font-medium text-muted-foreground">
            Volume geral
          </span>
          <span className="text-sm font-medium tabular-nums">{pct(vol)}</span>
        </div>
        <div className="flex items-center gap-3">
          <VolumeIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <Slider
            aria-labelledby={volumeLabel}
            disabled={offline}
            min={0}
            max={1}
            step={0.05}
            value={[vol]}
            format={{ style: 'percent' }}
            onValueChange={(value) => setVol(sliderValue(value))}
            className={cn('min-w-0 flex-1', SLIDER_TOUCH)}
          />
        </div>
      </div>

      <fieldset
        id={`${settingsId}-overlap`}
        disabled={offline}
        className={cn('min-w-0 disabled:opacity-60 lg:w-80 lg:shrink-0', !showSettings && 'max-md:hidden')}
      >
        <legend className="mb-1 text-xs font-medium text-muted-foreground">Sons ao mesmo tempo</legend>
        <SegmentedToggle<Overlap>
          value={mode}
          onChange={setMode}
          ariaLabel="Sons ao mesmo tempo"
          className="w-full gap-2!"
        >
          <SegmentedToggleOption value="stack" className="min-h-12 flex-1 justify-center px-2!">
            Sobrepor
          </SegmentedToggleOption>
          <SegmentedToggleOption value="restart" className="min-h-12 flex-1 justify-center px-2!">
            Reiniciar
          </SegmentedToggleOption>
          <SegmentedToggleOption value="single" className="min-h-12 flex-1 justify-center px-2!">
            Um por vez
          </SegmentedToggleOption>
        </SegmentedToggle>
        <p className="mt-1.5 text-xs text-muted-foreground">{OVERLAP_HINT[mode]}</p>
      </fieldset>

      <FloatingStop show={!stopOnScreen} disabled={offline} state={stop.state} onStop={stopAll} />
    </section>
  );
});
