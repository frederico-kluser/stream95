import type { SfxButton, SfxSound } from '@stream95/shared';
import { CircleAlert, CircleSlash, Music2, WifiOff } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo, useId } from 'react';
import { useMotionUITransition } from '@/components/motion-ui/ui-theme';
import { cn } from '@/lib/utils';
import { availability, durationText } from './lib';
import { playStatus, Spinner, type StatusLine, VolumeMark } from './parts';
import { usePlayOnPc } from './play-feedback';
import { toneOf } from './tones';

const TILE =
  'relative isolate flex h-full min-h-24 w-full select-none flex-col items-start justify-between gap-2 overflow-hidden rounded-2xl border p-3 text-left sm:min-h-28';

/** Inside of a tile: emoji (or a note icon), volume marker, label and one status line. */
export function TileFace({
  emoji,
  label,
  color,
  volume,
  status,
  statusId,
  volumeId,
}: {
  emoji?: string;
  label: string;
  color: string;
  volume: number;
  status: StatusLine | null;
  statusId?: string;
  volumeId?: string;
}) {
  const tone = toneOf(color);
  return (
    <>
      <span className="flex w-full items-start justify-between gap-2">
        {emoji ? (
          <span aria-hidden className="text-3xl leading-none">
            {emoji}
          </span>
        ) : (
          <Music2 aria-hidden className={cn('size-7', tone.icon)} />
        )}
        <VolumeMark volume={volume} id={volumeId} />
      </span>
      <span className="line-clamp-2 w-full text-sm leading-snug font-semibold break-words text-foreground">
        {label || 'Sem nome'}
      </span>
      <span
        id={statusId}
        className={cn('flex min-h-4 w-full items-start gap-1 text-xs leading-4 [&>svg]:mt-px', status?.className ?? '')}
      >
        {status?.icon}
        {/* a reason that stays (no file, converting) may wrap; a tap's feedback keeps one line */}
        <span className={status?.wrap ? 'line-clamp-2 break-words' : 'truncate'}>{status?.text}</span>
      </span>
    </>
  );
}

/** The same face, not interactive: the live preview in the button editor. */
export function TilePreview(props: { emoji?: string; label: string; color: string; volume: number }) {
  return (
    <div aria-hidden className={cn(TILE, toneOf(props.color).tile)}>
      <TileFace {...props} status={{ icon: null, text: 'prévia', className: 'text-muted-foreground' }} />
    </div>
  );
}

function blockedLine(offline: boolean, button: SfxButton, sound: SfxSound | undefined): StatusLine | null {
  if (offline) {
    return {
      icon: <WifiOff className="size-3.5" aria-hidden />,
      text: 'sem conexão',
      className: 'text-muted-foreground',
      wrap: true,
    };
  }
  const avail = availability(button, sound);
  if (avail.ok) return null;
  if (avail.kind === 'converting') {
    return { icon: <Spinner className="size-3.5" />, text: avail.text, className: 'text-info', wrap: true };
  }
  if (avail.kind === 'error') {
    return {
      icon: <CircleAlert className="size-3.5" aria-hidden />,
      text: avail.text,
      className: 'text-destructive',
      wrap: true,
    };
  }
  return {
    icon: <CircleSlash className="size-3.5" aria-hidden />,
    text: avail.text,
    className: 'text-muted-foreground',
    wrap: true,
  };
}

/**
 * One soundboard button. A tap asks the PC to play it; the tile looks pressed on the same frame,
 * then shows "tocou · n ms" when the OBS audio source confirms. Re-taps are allowed after 150 ms.
 */
export const SoundTile = memo(function SoundTile({
  button,
  sound,
  offline,
  latencyMs,
}: {
  button: SfxButton;
  sound: SfxSound | undefined;
  offline: boolean;
  /** Last tap-to-sound latency of this sound (state.sfxLatency). */
  latencyMs: number | undefined;
}) {
  const statusId = useId();
  const volumeId = useId();
  const reduce = useReducedMotion();
  const snap = useMotionUITransition('snap');
  const gentle = useMotionUITransition('gentle');
  const { result, play } = usePlayOnPc('buttonId', button.id);
  const tone = toneOf(button.color);
  const blocked = blockedLine(offline, button, sound);
  const idle: StatusLine | null = sound?.durationMs
    ? { icon: null, text: durationText(sound.durationMs), className: 'text-muted-foreground' }
    : null;
  const status = blocked ?? playStatus(result, { latencyMs, compact: true }) ?? idle;

  return (
    <motion.button
      type="button"
      aria-label={`Tocar ${button.label}`}
      aria-describedby={`${statusId} ${volumeId}`}
      aria-disabled={blocked ? true : undefined}
      onClick={() => {
        if (!blocked) void play();
      }}
      whileTap={blocked || reduce ? undefined : { scale: 0.95 }}
      transition={snap}
      className={cn(
        TILE,
        // Inset rings: the tab panel clips anything drawn outside the grid.
        'touch-manipulation outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-3 focus-visible:ring-ring/70 focus-visible:ring-inset',
        tone.tile,
        result.phase === 'pending' && cn(tone.pressed, 'ring-inset'),
        blocked && 'cursor-not-allowed opacity-60',
      )}
    >
      <AnimatePresence>
        {result.phase === 'played' && !reduce && (
          <motion.span
            key="flash"
            aria-hidden
            className={cn('pointer-events-none absolute inset-0 -z-10', tone.flash)}
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={gentle}
          />
        )}
      </AnimatePresence>
      <TileFace
        emoji={button.emoji}
        label={button.label}
        color={button.color}
        volume={button.volume}
        status={status}
        statusId={statusId}
        volumeId={volumeId}
      />
    </motion.button>
  );
});
