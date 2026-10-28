import { useCallback, useEffect, useRef, useState } from 'react';
import { useNotify } from '@/components/notify';
import { api } from '@/lib/api';
import { toActionError } from './use-action';

/** PATCH /api/settings with a partial object; shows the server error and tells whether it worked. */
export function useSettingsPatch(): (patch: object) => Promise<boolean> {
  const notify = useNotify();
  return useCallback(
    async (patch: object) => {
      try {
        await api('PATCH', '/api/settings', patch);
        return true;
      } catch (err) {
        const { title, fix } = toActionError(err);
        notify({ tone: 'error', title, description: fix });
        return false;
      }
    },
    [notify],
  );
}

const same = (a: unknown, b: unknown): boolean =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.001 : Object.is(a, b);

/** Gives control back to the server value if its broadcast never matches (rounding, lost event). */
const RELEASE_MS = 1500;

/**
 * A setting edited on the deck: the new value shows at once, is sent (debounced when `delayMs` > 0)
 * and the server value takes over again once it matches, or right away when the send fails.
 */
export function useSettingDraft<T>(server: T, send: (value: T) => Promise<boolean>, delayMs = 0) {
  const [draft, setDraft] = useState<{ value: T } | null>(null);
  const queued = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);
  const alive = useRef(true);
  const sendRef = useRef(send);
  sendRef.current = send;

  const flush = useCallback(async () => {
    timer.current = null;
    const next = queued.current;
    queued.current = null;
    if (!next) return;
    const mine = ++seq.current;
    const ok = await sendRef.current(next.value);
    if (!alive.current || mine !== seq.current || queued.current) return;
    if (!ok) {
      setDraft(null);
      return;
    }
    if (release.current) clearTimeout(release.current);
    release.current = setTimeout(() => {
      if (alive.current && mine === seq.current && !queued.current) setDraft(null);
    }, RELEASE_MS);
  }, []);

  const set = useCallback(
    (value: T) => {
      setDraft({ value });
      queued.current = { value };
      if (timer.current) clearTimeout(timer.current);
      if (delayMs > 0) timer.current = setTimeout(() => void flush(), delayMs);
      else void flush();
    },
    [delayMs, flush],
  );

  // Leaving the screen right after a change still saves it.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (release.current) clearTimeout(release.current);
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        const pending = queued.current;
        queued.current = null;
        if (pending) void sendRef.current(pending.value);
      }
    };
  }, []);

  // The server broadcast caught up: drop the draft.
  useEffect(() => {
    if (draft && !queued.current && same(server, draft.value)) setDraft(null);
  }, [server, draft]);

  return [draft ? draft.value : server, set] as const;
}
