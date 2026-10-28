import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { CopyButtonProps } from '@/components/motion-ui/copy-button';
import { type UITransition, useMotionUITheme, useMotionUITransition } from '@/components/motion-ui/ui-theme';
import { copyText } from '@/lib/clipboard';

export type { CopyButtonProps, CopyButtonVariant } from '@/components/motion-ui/copy-button';

// Same look and motion as the Motion UI CopyButton (same classes, so the `!` overrides of the screens
// still apply), but "Copiado" only shows after a copy that really happened. The vendor version
// confirms even where the clipboard API does not exist: the plain-HTTP address phones use.

const FOCUS_RING =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

type Phase = 'idle' | 'copied' | 'failed';

/** The failure hint stays longer than the confirmation: it has to be read. */
const FAILED_MIN_MS = 4000;

function failureHint(): string {
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return touch ? 'toque e segure o texto' : 'selecione o texto e copie';
}

function swapMotion(still: boolean, calm: boolean, ui: UITransition) {
  if (still) {
    return {
      initial: false as const,
      animate: { opacity: 1, filter: 'blur(0px)' },
      exit: { opacity: 0 },
      transition: { duration: 0 },
    };
  }
  if (calm) {
    const fade = { duration: ui.opacity.duration, ease: ui.opacity.ease };
    return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: fade };
  }
  return {
    initial: { opacity: 0, filter: 'blur(4px)' },
    animate: { opacity: 1, filter: 'blur(0px)' },
    exit: { opacity: 0, filter: 'blur(4px)' },
    transition: { ...ui },
  };
}

/** Copy-to-clipboard button: confirms only a real copy, otherwise says how to copy by hand. */
export function CopyButton({
  value,
  variant = 'label',
  children = 'Copiar',
  copiedText = 'Copiado',
  label = 'Copiar',
  copiedLabel = 'Copiado',
  resetMs = 2000,
  onCopy,
  disabled,
  className,
  ref,
}: CopyButtonProps) {
  const { motionMode } = useMotionUITheme();
  const still = motionMode === 'off';
  const calm = motionMode === 'calm';
  const motionAllowed = motionMode === 'full';
  const snap = useMotionUITransition('snap');
  const ui = useMotionUITransition('ui');
  const [phase, setPhase] = useState<Phase>('idle');
  const [hint, setHint] = useState('');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempt = useRef(0);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopy = async () => {
    const mine = ++attempt.current;
    // no await before this call: the legacy copy needs the tap that is still running
    const ok = await copyText(value);
    if (mine !== attempt.current) return; // a newer tap owns the label now
    if (resetTimer.current) clearTimeout(resetTimer.current);
    if (ok) {
      setPhase('copied');
      onCopy?.(value);
    } else {
      setHint(failureHint());
      setPhase('failed');
    }
    resetTimer.current = setTimeout(() => setPhase('idle'), ok ? resetMs : Math.max(resetMs, FAILED_MIN_MS));
  };

  const isIcon = variant === 'icon';
  const glyphSize = isIcon ? 15 : 13;
  const failedLabel = `Não copiou: ${hint}`;
  const ariaLabel = phase === 'copied' ? copiedLabel : phase === 'failed' ? failedLabel : label;

  let glyph: ReactNode = <ClipboardIcon size={glyphSize} />;
  if (phase === 'copied') glyph = <CheckIcon size={glyphSize} />;
  if (phase === 'failed') glyph = <AlertIcon size={glyphSize} />;

  let face: ReactNode = children;
  if (phase === 'copied') face = copiedText;
  if (phase === 'failed') {
    face = (
      <span className="flex flex-col items-start text-left leading-tight">
        <span>Não copiou</span>
        <span className="text-[11px] font-normal opacity-80">{hint}</span>
      </span>
    );
  }

  const buttonClassName = isIcon
    ? `relative inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition-colors duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)] hover:bg-muted hover:text-foreground focus-visible:text-foreground disabled:pointer-events-none disabled:opacity-60 ${FOCUS_RING}${className ? ` ${className}` : ''}`
    : `relative inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors duration-[var(--motion-ui-transition-snap-duration)] ease-[var(--motion-ui-transition-snap)] hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60 ${FOCUS_RING}${className ? ` ${className}` : ''}`;

  return (
    <motion.button
      ref={ref}
      type="button"
      className={buttonClassName}
      onClick={handleCopy}
      disabled={disabled}
      aria-label={ariaLabel}
      title={phase === 'failed' ? failedLabel : undefined}
      layout={!isIcon && motionAllowed ? true : undefined}
      whileTap={motionAllowed ? { scale: 0.94 } : undefined}
      transition={{ ...snap }}
    >
      {isIcon && (
        // a 48 px touch target around the 32 px circle
        <span
          className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
          aria-hidden="true"
        />
      )}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={phase}
          className={
            isIcon ? `flex items-center${phase === 'idle' ? '' : ' text-foreground'}` : 'flex items-center gap-1.5'
          }
          layout={!isIcon && motionAllowed ? 'position' : undefined}
          style={{ willChange: still ? undefined : calm ? 'opacity' : 'opacity, filter' }}
          {...swapMotion(still, calm, ui)}
        >
          {glyph}
          {!isIcon && face}
        </motion.span>
      </AnimatePresence>
      <span aria-live="polite" className="sr-only">
        {phase === 'idle' ? '' : ariaLabel}
      </span>
    </motion.button>
  );
}

function CheckIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

function ClipboardIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </svg>
  );
}

function AlertIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}
