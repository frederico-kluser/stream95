import type { SfxSound } from '@stream95/shared';
import { Check, CircleAlert, CircleCheck, LoaderCircle, TriangleAlert, Volume1, Volume2, VolumeX } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Notice } from '@/components/notify';
import { Badge } from '@/components/ui/badge';
import { pct } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PlayResult } from './play-feedback';

/** Stretches a MultiStateButton pill to the width of its button (it sizes to the label by default). */
export const FILL_PILL = 'w-full [&>div]:flex-1 [&>div>div]:flex-1 [&>div>div]:justify-center';

/** Slider with a 48 px tall touch strip and a bigger thumb (the base one is sized for a mouse). */
export const SLIDER_TOUCH = '*:min-h-12 **:data-[slot=slider-thumb]:size-5';

let lastHoldTip = 0;

/** A quick tap on a hold-to-confirm button explains the gesture (now and then, not on every tap). */
export function holdTip(notify: (notice: Notice) => void, title: string): void {
  const now = Date.now();
  if (now - lastHoldTip < 6000) return;
  lastHoldTip = now;
  notify({ tone: 'info', title, description: 'Mantenha pressionado até a barra encher.' });
}

export const Spinner = ({ className }: { className?: string }) => (
  <LoaderCircle className={cn('animate-spin motion-reduce:animate-none', className)} aria-hidden />
);

const STATUS: Record<SfxSound['status'], { text: string; className: string; icon: ReactNode }> = {
  ready: { text: 'pronto', className: 'border-success/30 text-success', icon: <CircleCheck aria-hidden /> },
  converting: { text: 'convertendo…', className: 'border-info/30 text-info', icon: <Spinner /> },
  error: { text: 'erro', className: 'border-destructive/30 text-destructive', icon: <CircleAlert aria-hidden /> },
};

/** Conversion status of a library file, in text and icon (never color alone). */
export function SoundStatusBadge({ status }: { status: SfxSound['status'] }) {
  const s = STATUS[status];
  return (
    <Badge variant="outline" className={s.className}>
      {s.icon}
      {s.text}
    </Badge>
  );
}

export type StatusLine = {
  icon: ReactNode;
  text: string;
  className: string;
  /** May take two lines on a tile: only for lines that do not change on a tap (no jumping grid). */
  wrap?: boolean;
};

/**
 * What a play button says after a tap: sending, waiting for the PC, played in n ms, no answer,
 * failed. `compact` is for a tile: one line of about 86 px in a 320 px OBS dock, so shorter words.
 */
export function playStatus(
  result: PlayResult,
  { latencyMs, compact = false }: { latencyMs?: number; compact?: boolean } = {},
): StatusLine | null {
  switch (result.phase) {
    case 'pending':
      return { icon: <Spinner className="size-3.5" />, text: 'enviando…', className: 'text-muted-foreground' };
    case 'waiting':
      return {
        icon: <Spinner className="size-3.5" />,
        text: compact ? 'aguardando…' : 'aguardando o PC…',
        className: 'text-muted-foreground',
      };
    case 'played':
      return {
        icon: <Check className="size-3.5" aria-hidden />,
        text: `tocou · ${Math.round(latencyMs ?? result.latencyMs)} ms`,
        className: 'text-success',
      };
    case 'silent':
      return {
        icon: <TriangleAlert className="size-3.5" aria-hidden />,
        text: compact ? 'sem retorno' : 'sem retorno do PC',
        className: 'text-warning',
      };
    case 'failed':
      return {
        icon: <CircleAlert className="size-3.5" aria-hidden />,
        text: compact ? result.short : result.error,
        className: 'text-destructive',
      };
    default:
      return null;
  }
}

/** Small volume marker of a button ("80%"), with the word for screen readers. */
export function VolumeMark({ volume, id, className }: { volume: number; id?: string; className?: string }) {
  const Icon = volume <= 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <span
      id={id}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full bg-background/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums',
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      <span className="sr-only">volume </span>
      {pct(volume)}
    </span>
  );
}
