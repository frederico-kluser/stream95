import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { type Notice, useNotify } from '@/components/notify';
import { ApiError, api } from '@/lib/api';
import { useDeckEvent } from '@/lib/store';
import { toActionError } from './use-action';

/** Taps closer than this are ignored; a soundboard is tapped fast, so re-triggering stays allowed. */
export const RETAP_MS = 150;
/** Time the PC has to confirm a play before the deck says it got no answer. */
const CONFIRM_MS = 3500;
const SHOW_PLAYED_MS = 2500;
const SHOW_PROBLEM_MS = 4500;
/** The same problem raises one notice in this window, however many tiles are tapped. */
const SAME_NOTICE_EVERY_MS = 30_000;

type OnPlayed = (latencyMs: number) => void;
type Expect = (playId: string, onPlayed: OnPlayed) => () => void;

const ExpectContext = createContext<Expect | null>(null);

/**
 * Matches the PC's 'sfx:played' confirmations to the plays started from this device. The
 * confirmation travels on the WebSocket and can arrive before the HTTP answer, so early ones wait
 * here for a moment.
 */
export function PlayFeedbackProvider({ children }: { children: ReactNode }) {
  const waiting = useRef(new Map<string, OnPlayed>());
  const early = useRef(new Map<string, number>());

  useDeckEvent((event) => {
    if (event.type !== 'sfx:played') return;
    const onPlayed = waiting.current.get(event.playId);
    if (onPlayed) {
      waiting.current.delete(event.playId);
      onPlayed(event.latencyMs);
      return;
    }
    early.current.set(event.playId, event.latencyMs);
    if (early.current.size > 32) {
      const oldest = early.current.keys().next().value;
      if (oldest !== undefined) early.current.delete(oldest);
    }
  });

  const expect = useCallback<Expect>((playId, onPlayed) => {
    const latencyMs = early.current.get(playId);
    if (latencyMs !== undefined) {
      early.current.delete(playId);
      onPlayed(latencyMs);
      return () => {};
    }
    waiting.current.set(playId, onPlayed);
    return () => {
      waiting.current.delete(playId);
    };
  }, []);

  return <ExpectContext.Provider value={expect}>{children}</ExpectContext.Provider>;
}

export type PlayResult =
  | { phase: 'idle' }
  /** The request is on its way to the server. */
  | { phase: 'pending' }
  /** The server took it; the PC has not confirmed the sound yet. */
  | { phase: 'waiting' }
  | { phase: 'played'; latencyMs: number }
  | { phase: 'silent' }
  /** The server refused it: `error` in full, `short` for one line of a tile. */
  | { phase: 'failed'; error: string; short: string };

const lastNotice = new Map<string, number>();

/** One notice per problem every 30 s: tapping five tiles with OBS closed gives one toast, not five. */
function noticeOnce(notify: (notice: Notice) => void, notice: Notice): void {
  const key = `${notice.title}\n${notice.description ?? ''}`;
  const now = Date.now();
  for (const [seen, at] of lastNotice) if (now - at >= SAME_NOTICE_EVERY_MS) lastNotice.delete(seen);
  if (lastNotice.has(key)) return;
  lastNotice.set(key, now);
  notify(notice);
}

const sentence = (s: string): string => s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);

/** "Som não encontrado" → "som não encontrado", like the other tile lines ("OBS …" stays as is). */
const tileCase = (s: string): string =>
  /^\p{Lu}\p{Ll}/u.test(s) ? s.charAt(0).toLocaleLowerCase('pt-BR') + s.slice(1) : s;

/** A play the server refused: the result lines and the notice with the server's fix. */
function refusal(err: unknown): { result: PlayResult; notice: Notice } {
  const { title, fix } = toActionError(err);
  const notice: Notice = { tone: 'error', title: sentence(title), ...(fix ? { description: sentence(fix) } : {}) };
  const error = tileCase(title);
  // the server refuses at once (409) when no OBS audio source is open: no need to wait for the PC
  const sourceClosed = err instanceof ApiError && /fonte de [aá]udio/iu.test(title);
  return { result: { phase: 'failed', error, short: sourceClosed ? 'fonte fechada' : error }, notice };
}

/**
 * Plays a button (or a library sound) on the PC and follows it until the PC confirms. The phone
 * never plays audio: the OBS audio source on the PC does.
 */
export function usePlayOnPc(kind: 'buttonId' | 'soundId', id: string | null) {
  const expect = useContext(ExpectContext);
  const notify = useNotify();
  const [result, setResult] = useState<PlayResult>({ phase: 'idle' });
  const lastTap = useRef(Number.NEGATIVE_INFINITY);
  const run = useRef(0);
  const stopWaiting = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      run.current += 1;
      stopWaiting.current?.();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const play = useCallback(async () => {
    if (!id) return;
    const now = performance.now();
    if (now - lastTap.current < RETAP_MS) return;
    lastTap.current = now;
    const mine = ++run.current;
    stopWaiting.current?.();
    stopWaiting.current = null;
    if (timer.current) clearTimeout(timer.current);

    const later = (ms: number, fn: () => void) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        if (run.current === mine) fn();
      }, ms);
    };
    const show = (next: PlayResult, ms: number) => {
      setResult(next);
      later(ms, () => setResult({ phase: 'idle' }));
    };

    setResult({ phase: 'pending' });
    try {
      const { playId } = await api<{ playId: string }>('POST', '/api/sfx/play', { [kind]: id });
      if (run.current !== mine) return;
      // the request arrived: from here on only the PC can answer
      setResult({ phase: 'waiting' });
      later(CONFIRM_MS, () => {
        stopWaiting.current?.();
        stopWaiting.current = null;
        show({ phase: 'silent' }, SHOW_PROBLEM_MS);
        noticeOnce(notify, {
          tone: 'warning',
          title: 'O PC não confirmou o som',
          description: 'Confira se a fonte de áudio /overlay/audio está ativa no OBS.',
        });
      });
      const stop =
        expect?.(playId, (latencyMs) => {
          if (run.current !== mine) return;
          stopWaiting.current = null;
          show({ phase: 'played', latencyMs }, SHOW_PLAYED_MS);
        }) ?? null;
      if (run.current === mine) stopWaiting.current = stop;
    } catch (err) {
      if (run.current !== mine) return;
      const { result: failed, notice } = refusal(err);
      show(failed, SHOW_PROBLEM_MS);
      noticeOnce(notify, notice);
    }
  }, [expect, id, kind, notify]);

  return { result, play };
}
