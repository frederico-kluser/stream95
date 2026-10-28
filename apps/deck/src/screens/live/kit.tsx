import { Check, CircleAlert, LoaderCircle, Save, WifiOff } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { HoldToConfirmButton } from '@/components/motion-ui/hold-to-confirm';
import { MultiStateButton } from '@/components/motion-ui/multi-state-button';
import { type Notice, useNotify } from '@/components/notify';
import { Button } from '@/components/ui/button';
import { splitError } from '@/lib/api';
import { useDeck } from '@/lib/store';
import { cn } from '@/lib/utils';

// Building blocks shared by the Live and Config screens.

/** True while the deck is connected to the server on the PC. */
export function useOnline(): boolean {
  return useDeck().connection === 'online';
}

const upperFirst = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/** A server failure ("Erro: x — Solução: y") as a notice: what happened as title, the fix below. */
export function errorNotice(err: unknown): Notice {
  const { title, fix } = splitError(err instanceof Error ? err.message : String(err));
  return { tone: 'error', title: upperFirst(title), ...(fix ? { description: upperFirst(fix) } : {}) };
}

/**
 * One request at a time: `pending` flips on the tap itself (visible on the next frame), taps while
 * pending are ignored and failures become an error toast, or go to `onError` (inside a sheet the
 * toasts sit under the modal, so sheets show the error inline).
 */
export function useAction<K extends string = string>(onError?: (notice: Notice) => void) {
  const notify = useNotify();
  const report = onError ?? notify;
  const busy = useRef(false);
  const [pending, setPending] = useState<K | null>(null);
  const run = useCallback(
    async (key: K, fn: () => Promise<unknown>): Promise<boolean> => {
      if (busy.current) return false;
      busy.current = true;
      setPending(key);
      try {
        await fn();
        return true;
      } catch (err) {
        report(errorNotice(err));
        return false;
      } finally {
        busy.current = false;
        setPending(null);
      }
    },
    [report],
  );
  return { pending, busy: pending !== null, run };
}

/** Current time, refreshed every `intervalMs` while `active`. */
export function useNow(intervalMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);
  return now;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <LoaderCircle className={cn('size-4 shrink-0 animate-spin motion-reduce:animate-none', className)} aria-hidden />
  );
}

/** Visible reason for the disabled buttons while the deck has no connection to the PC. */
export function OfflineNote({ className }: { className?: string }) {
  if (useOnline()) return null;
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning',
        className,
      )}
    >
      <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>Sem conexão com o PC. Os botões voltam a funcionar quando o painel reconectar.</span>
    </p>
  );
}

/** Inline error, for places where a toast would be hidden (inside sheets). */
export function InlineError({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      <div className="min-w-0">
        <p className="font-medium text-destructive">{notice.title}</p>
        {notice.description && <p className="text-muted-foreground">{notice.description}</p>}
      </div>
    </div>
  );
}

/**
 * Hold-to-confirm for destructive actions. The Motion UI button confirms once, so it is re-armed
 * (remounted) after every hold; while the request runs it shows a disabled pending state.
 */
export function HoldButton({
  children,
  onConfirm,
  disabled = false,
  pending = false,
  pendingLabel = 'Aguarde…',
  holdSeconds = 1,
  className,
}: {
  children: ReactNode;
  onConfirm: () => unknown;
  disabled?: boolean;
  pending?: boolean;
  pendingLabel?: string;
  holdSeconds?: number;
  className?: string;
}) {
  const hintId = useId();
  const [round, setRound] = useState(0);
  const hint = (
    <span id={hintId} className="sr-only">
      Segure o botão, ou a barra de espaço, por {holdSeconds.toLocaleString('pt-BR')}{' '}
      {holdSeconds === 1 ? 'segundo' : 'segundos'} para confirmar.
    </span>
  );
  if (disabled || pending) {
    return (
      <Button
        type="button"
        variant="secondary"
        disabled
        aria-describedby={hintId}
        className={cn('h-[3.25rem] w-60 rounded-full', className)}
      >
        {pending ? <Spinner /> : null}
        {pending ? pendingLabel : children}
        {hint}
      </Button>
    );
  }
  return (
    <>
      <HoldToConfirmButton
        key={round}
        holdSeconds={holdSeconds}
        aria-describedby={hintId}
        onConfirm={() => {
          setRound((r) => r + 1);
          void onConfirm();
        }}
        className={className}
      >
        {children}
      </HoldToConfirmButton>
      {hint}
    </>
  );
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const SAVE_LABEL: Record<Exclude<SaveState, 'idle'>, string> = {
  saving: 'Salvando…',
  saved: 'Salvo',
  error: 'Não salvou',
};

/** Save flow for a form: saving → saved (or error) → back to idle after 2 s. */
export function useSaveState() {
  const notify = useNotify();
  const [state, setState] = useState<SaveState>('idle');
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const save = useCallback(
    async (fn: () => Promise<unknown>): Promise<boolean> => {
      if (busy.current) return false;
      busy.current = true;
      clearTimeout(timer.current);
      setState('saving');
      let ok = false;
      try {
        await fn();
        ok = true;
      } catch (err) {
        notify(errorNotice(err));
      } finally {
        busy.current = false;
      }
      setState(ok ? 'saved' : 'error');
      timer.current = setTimeout(() => setState('idle'), 2000);
      return ok;
    },
    [notify],
  );
  return { state, save };
}

/** Save button with the Motion UI state morph (idle → saving → saved / error). */
export function SaveButton({
  state,
  onClick,
  disabled = false,
  children = 'Salvar',
  className,
}: {
  state: SaveState;
  onClick?: () => void;
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const off = disabled || state === 'saving';
  const icon =
    state === 'saving' ? (
      <Spinner />
    ) : state === 'saved' ? (
      <Check className="size-4" />
    ) : state === 'error' ? (
      <CircleAlert className="size-4" />
    ) : (
      <Save className="size-4" />
    );
  return (
    <MultiStateButton
      state={state}
      icon={icon}
      onClick={onClick}
      disabled={off}
      feedback={state === 'saved' ? 'pop' : state === 'error' ? 'shake' : 'none'}
      announce={state === 'idle' ? '' : SAVE_LABEL[state]}
      className={className}
      pillClassName="h-12 justify-center rounded-xl px-5 text-sm font-medium"
      surfaceClassName={cn(
        state === 'saved'
          ? 'bg-success/15 text-success'
          : state === 'error'
            ? 'bg-destructive/15 text-destructive'
            : 'bg-primary text-primary-foreground',
        // Faded only at rest: "Salvo" and "Não salvou" must stay readable.
        off && state === 'idle' && 'opacity-50',
      )}
    >
      {state === 'idle' ? children : SAVE_LABEL[state]}
    </MultiStateButton>
  );
}
