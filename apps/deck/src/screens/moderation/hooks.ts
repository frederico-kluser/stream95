import type { ModerationSettings } from '@stream95/shared';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useMotionUITheme, useMotionUITransition } from '@/components/motion-ui/ui-theme';
import { useNotify } from '@/components/notify';
import { api } from '@/lib/api';
import { getClient, useDeck } from '@/lib/store';
import { errorNotice } from './stores';

/** Current time, refreshed every `everyMs` (relative times like "há 2 min"). */
export function useNow(everyMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

const COARSE = '(pointer: coarse)';

function subscribeCoarse(onChange: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => {};
  const mql = matchMedia(COARSE);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

const isCoarse = (): boolean => typeof matchMedia === 'function' && matchMedia(COARSE).matches;

/** True on touch-first devices (phones, tablets), where queue rows also swipe. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribeCoarse, isCoarse, () => false);
}

/** Enter/exit props for list items, on the theme's `ui` token and reduced-motion posture. */
export function useItemMotion() {
  const { motionMode, travel } = useMotionUITheme();
  const transition = useMotionUITransition('ui');
  return useMemo(() => {
    if (motionMode === 'off') {
      return {
        initial: false as const,
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0 },
        transition: { duration: 0 },
      };
    }
    const y = motionMode === 'full' ? travel.enter / 2 : 0;
    return { initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition };
  }, [motionMode, travel.enter, transition]);
}

const DRAFT_KEYS = ['mode', 'llm', 'engine', 'escalateToLlm', 'holdFirstTimeChatters'] as const;
export type DraftKey = (typeof DRAFT_KEYS)[number];
type Draft = Partial<Pick<ModerationSettings, DraftKey>>;

function without(draft: Draft, key: DraftKey): Draft {
  if (!(key in draft)) return draft;
  const next = { ...draft };
  delete next[key];
  return next;
}

/** Drops draft values the server already confirmed (skipping the ones still in flight). */
function settle(draft: Draft, server: ModerationSettings, busy: ReadonlySet<DraftKey>): Draft {
  let next = draft;
  for (const key of DRAFT_KEYS) {
    if (key in next && !busy.has(key) && next[key] === server[key]) next = without(next, key);
  }
  return next;
}

/**
 * Moderation settings with optimistic switches: the new value shows at once, repeated taps are
 * ignored while the request runs, and a failure puts the old value back with an error notice.
 */
export function useModerationSettings() {
  const { settings } = useDeck();
  const server = settings.moderation;
  const notify = useNotify();
  const [draft, setDraft] = useState<Draft>({});
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<DraftKey>>(() => new Set());
  const busy = useRef(new Set<DraftKey>());

  useEffect(() => {
    setDraft((d) => settle(d, server, busy.current));
  }, [server]);

  const markBusy = useCallback((key: DraftKey, on: boolean) => {
    if (on) busy.current.add(key);
    else busy.current.delete(key);
    setBusyKeys(new Set(busy.current));
  }, []);

  const patch = useCallback(
    async <K extends DraftKey>(key: K, value: ModerationSettings[K]) => {
      if (busy.current.has(key)) return;
      markBusy(key, true);
      setDraft((d) => ({ ...d, [key]: value }));
      try {
        await api('PATCH', '/api/settings', { moderation: { [key]: value } });
        markBusy(key, false);
        // the settings event may already be here; if not, the effect above settles it
        setDraft((d) => settle(d, getClient().getState().settings.moderation, busy.current));
        setTimeout(() => setDraft((d) => (busy.current.has(key) ? d : without(d, key))), 4000);
      } catch (err) {
        markBusy(key, false);
        setDraft((d) => without(d, key));
        notify(errorNotice(err));
      }
    },
    [markBusy, notify],
  );

  const values: ModerationSettings = useMemo(() => ({ ...server, ...draft }), [server, draft]);
  return { values, busy: busyKeys, patch };
}
