import { useCallback, useEffect, useRef, useState } from 'react';
import { useNotify } from '@/components/notify';
import { splitError } from '@/lib/api';

export type ActionState = 'idle' | 'busy' | 'done' | 'error';

export type ActionError = { title: string; fix?: string };

export const toActionError = (err: unknown): ActionError =>
  splitError(err instanceof Error ? err.message : String(err));

type RunOptions = {
  /** Show the error here instead of a toast (inside a sheet the toast sits behind the scrim). */
  onError?: (error: ActionError) => void;
  /** How long "done" / "error" stay before going back to idle. */
  settleMs?: number;
};

/**
 * One server action behind a button: the busy state shows on the same frame as the tap, repeated
 * taps are ignored until it settles, and failures become a toast with the server's fix.
 */
export function useAction() {
  const notify = useNotify();
  const [state, setState] = useState<ActionState>('idle');
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const run = useCallback(
    async <T>(fn: () => Promise<T>, options: RunOptions = {}): Promise<{ ok: true; value: T } | { ok: false }> => {
      if (running.current) return { ok: false };
      running.current = true;
      if (timer.current) clearTimeout(timer.current);
      setState('busy');
      let outcome: { ok: true; value: T } | { ok: false };
      try {
        outcome = { ok: true, value: await fn() };
        setState('done');
      } catch (err) {
        const error = toActionError(err);
        setState('error');
        if (options.onError) options.onError(error);
        else notify({ tone: 'error', title: error.title, description: error.fix });
        outcome = { ok: false };
      }
      running.current = false;
      timer.current = setTimeout(() => setState('idle'), options.settleMs ?? 1800);
      return outcome;
    },
    [notify],
  );

  return { state, run, busy: state === 'busy' };
}
