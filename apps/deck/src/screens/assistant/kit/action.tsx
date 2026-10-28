import { Check, CircleAlert, LoaderCircle } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { HoldToConfirmButton } from '@/components/motion-ui/hold-to-confirm';
import { MultiStateButton } from '@/components/motion-ui/multi-state-button';
import { useNotify } from '@/components/notify';
import { cn } from '@/lib/utils';
import { notifyError } from './errors';
import { Reason } from './settings';

export type ActionPhase = 'idle' | 'pending' | 'done' | 'error';

/** How long "feito" / "erro" stays on the button before it returns to rest. */
const SETTLE_MS = 2200;

/**
 * Runs one request at a time for a button: taps while it is pending are ignored, failures become
 * an error notice, and the phase drives the button's label and color.
 */
export function useRunAction() {
  const notify = useNotify();
  const [phase, setPhase] = useState<ActionPhase>('idle');
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const run = useCallback(
    async (task: () => Promise<unknown>): Promise<boolean> => {
      if (busy.current) return false;
      busy.current = true;
      clearTimeout(timer.current);
      setPhase('pending');
      let ok = false;
      try {
        await task();
        ok = true;
      } catch (err) {
        notifyError(notify, err);
      }
      busy.current = false;
      setPhase(ok ? 'done' : 'error');
      timer.current = setTimeout(() => setPhase('idle'), SETTLE_MS);
      return ok;
    },
    [notify],
  );

  return { phase, pending: phase === 'pending', run };
}

type Size = 'primary' | 'regular';
type Tone = 'primary' | 'secondary';

const PILL: Record<Size, string> = {
  // 72 px on phones (the main action of a card), 48 px from tablets up.
  primary: 'h-18 rounded-full px-8 text-base font-medium shadow-sm sm:h-12 sm:px-6 sm:text-sm',
  regular: 'h-12 rounded-full px-6 text-sm font-medium shadow-sm',
};

const SURFACE: Record<Tone, string> = {
  primary: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground ring-1 ring-border',
};

// On phones the whole row is the button: stretch the vendor's inner wrapper and pill.
const FULL_ON_PHONES =
  'max-sm:w-full max-sm:[&>div]:w-full max-sm:[&>div>div]:w-full max-sm:[&>div>div]:justify-center';

/** MultiStateButton wired to `useRunAction`: label → pending → done/error, with the reason when blocked. */
export function ActionButton({
  phase,
  label,
  pendingLabel,
  doneLabel,
  errorLabel = 'Não deu certo',
  icon,
  onClick,
  type = 'button',
  blocked,
  disabled = false,
  size = 'primary',
  tone = 'primary',
  block = size === 'primary',
  className,
}: {
  phase: ActionPhase;
  label: string;
  pendingLabel: string;
  doneLabel: string;
  errorLabel?: string;
  icon?: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  /** Why the action cannot run now; the button is disabled and the text shows under it. */
  blocked?: string;
  /** Disabled without a message (nothing to do yet, e.g. an unchanged field). */
  disabled?: boolean;
  size?: Size;
  tone?: Tone;
  /** Full width on phones. */
  block?: boolean;
  className?: string;
}) {
  const text =
    phase === 'pending' ? pendingLabel : phase === 'done' ? doneLabel : phase === 'error' ? errorLabel : label;
  const glyph = size === 'primary' ? 'size-5' : 'size-4';
  const iconFor: Record<ActionPhase, ReactNode> = {
    idle: icon,
    pending: <LoaderCircle className={cn(glyph, 'animate-spin motion-reduce:animate-none')} />,
    done: <Check className={glyph} />,
    error: <CircleAlert className={glyph} />,
  };
  const surface =
    phase === 'done'
      ? 'bg-success text-background'
      : phase === 'error'
        ? 'bg-destructive text-background'
        : SURFACE[tone];

  return (
    <div className={cn('flex flex-col gap-2', block && 'max-sm:w-full', className)}>
      <MultiStateButton
        state={phase}
        icon={iconFor[phase]}
        type={type}
        disabled={Boolean(blocked) || disabled}
        onClick={onClick}
        surfaceClassName={surface}
        pillClassName={PILL[size]}
        feedback={phase === 'error' ? 'shake' : phase === 'done' ? 'pop' : 'none'}
        announce={phase === 'idle' ? '' : text}
        className={cn('disabled:opacity-50', block && FULL_ON_PHONES)}
      >
        {text}
      </MultiStateButton>
      {blocked && <Reason>{blocked}</Reason>}
    </div>
  );
}

const HOLD: Record<Size, string> = {
  primary: 'h-18! w-full! sm:h-12! sm:w-auto!',
  regular: 'h-12! w-full! sm:w-auto!',
};

/**
 * Press-and-hold for actions that show up on the live or cannot be undone. The vendor button locks
 * after one confirmation, so it is remounted (new key) once the request settles.
 */
export function HoldAction({
  label,
  icon,
  hint,
  onConfirm,
  success,
  blocked,
  size = 'primary',
  holdSeconds = 1.5,
}: {
  label: string;
  icon?: ReactNode;
  /** How to use it, under the button ("Segure por 1,5 s…"). */
  hint: string;
  onConfirm: () => Promise<unknown>;
  /** Notice shown when the request succeeds. */
  success?: string;
  blocked?: string;
  size?: Size;
  holdSeconds?: number;
}) {
  const notify = useNotify();
  const hintId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  const [round, setRound] = useState(0);
  const [pending, setPending] = useState(false);

  // A keyboard user keeps the focus on the fresh button after the remount.
  useEffect(() => {
    if (round === 0 || !refocus.current) return;
    refocus.current = false;
    wrap.current?.querySelector('button')?.focus();
  }, [round]);

  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
      if (success) notify({ tone: 'success', title: success });
    } catch (err) {
      notifyError(notify, err);
    } finally {
      setPending(false);
      refocus.current = wrap.current?.contains(document.activeElement) ?? false;
      setRound((r) => r + 1);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div ref={wrap} inert={Boolean(blocked)} className={cn('flex', blocked && 'opacity-50')}>
        <HoldToConfirmButton
          key={round}
          holdSeconds={holdSeconds}
          onConfirm={() => void confirm()}
          aria-describedby={hintId}
          className={HOLD[size]}
        >
          {/* Rendered twice by the vendor (rest and fill layers): the padding keeps both wraps equal, and
              the icon flows inline so it stays next to the first line when the label wraps. */}
          <span className="block px-5 text-center text-balance">
            <span className="mr-2 inline-flex align-[-0.2em]">
              {pending ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : icon}
            </span>
            {pending ? 'Enviando…' : label}
          </span>
        </HoldToConfirmButton>
      </div>
      <div id={hintId}>
        {blocked ? <Reason>{blocked}</Reason> : <p className="text-sm text-pretty text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
