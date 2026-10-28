import type { AttentionItem, ModeratedMessage, ServerEvent } from '@stream95/shared';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { type Notice, TECH_ISSUE_TAG, useNotify } from '@/components/notify';
import { ApiError, api, splitError } from '@/lib/api';
import { getClient } from '@/lib/store';
import { capitalize, clip } from './labels';

// The deck only mounts the active tab, so state that must survive a tab switch (the undo window of a
// rejection, resolved alerts, removed messages) lives here, outside React.

export type Notify = (notice: Notice) => void;

type Store<T> = { get: () => T; set: (next: T) => void; subscribe: (fn: () => void) => () => void };

function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const subs = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      for (const fn of subs) fn();
    },
    subscribe(fn) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
  };
}

function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode or storage blocked: the value lives only in memory
  }
}

/** Error notice from a failed call ("Erro: x — Solução: y" becomes title + description). */
export function errorNotice(err: unknown): Notice {
  const { title, fix } = splitError(err instanceof Error ? err.message : String(err));
  return {
    tone: 'error',
    title: capitalize(title || 'algo deu errado'),
    ...(fix ? { description: capitalize(fix) } : {}),
  };
}

// ------------------------------------------------------------------ resolved attention items

const RESOLVED_KEY = 'stream95.moderation.resolved';

export const attentionKey = (a: Pick<AttentionItem, 'kind' | 'messageId'>): string => `${a.kind}:${a.messageId}`;

function loadResolved(): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(readStorage(RESOLVED_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

const resolvedStore = createStore<ReadonlySet<string>>(loadResolved());

/** Marks alerts as handled on this device (kept in localStorage). */
export function resolveAttention(keys: readonly string[]): void {
  if (keys.length === 0) return;
  const list = [...new Set([...resolvedStore.get(), ...keys])].slice(-400);
  resolvedStore.set(new Set(list));
  writeStorage(RESOLVED_KEY, JSON.stringify(list));
}

/** Keys of the alerts already marked as resolved on this device. */
export const useResolvedAttention = (): ReadonlySet<string> => useStore(resolvedStore);

// ------------------------------------------------------------------ messages removed from the overlay

const removedStore = createStore<ReadonlySet<string>>(new Set());

export function markRemoved(ids: readonly string[]): void {
  if (ids.length === 0) return;
  removedStore.set(new Set([...removedStore.get(), ...ids].slice(-1000)));
}

/** Ids deleted from the overlay (by this deck, another device or Twitch) since the deck opened this screen. */
export const useRemovedMessages = (): ReadonlySet<string> => useStore(removedStore);

// ------------------------------------------------------------------ rejection with undo

export const UNDO_MS = 5000;
const undoTimers = new Map<string, ReturnType<typeof setTimeout>>();
const hiddenStore = createStore<ReadonlySet<string>>(new Set());

function setHidden(id: string, hidden: boolean): void {
  const next = new Set(hiddenStore.get());
  if (hidden) next.add(id);
  else next.delete(id);
  hiddenStore.set(new Set([...next].slice(-500)));
}

/** Queue items waiting out the undo window (or already rejected) that the list must not show. */
export const useHiddenQueueItems = (): ReadonlySet<string> => useStore(hiddenStore);

/**
 * Hides the message right away and only tells the server after the undo window, so "Desfazer"
 * never has to bring a rejected message back.
 */
export function scheduleReject(m: ModeratedMessage, notify: Notify): void {
  if (undoTimers.has(m.id) || hiddenStore.get().has(m.id)) return;
  setHidden(m.id, true);
  undoTimers.set(
    m.id,
    setTimeout(() => void commitReject(m, notify), UNDO_MS),
  );
  notify({
    tone: 'info',
    title: 'Mensagem rejeitada',
    description: `${m.displayName}: ${clip(m.text)}`,
    durationMs: UNDO_MS,
    action: { label: 'Desfazer', onClick: () => undoReject(m.id) },
  });
}

export function undoReject(id: string): void {
  const timer = undoTimers.get(id);
  if (!timer) return; // too late: already sent
  clearTimeout(timer);
  undoTimers.delete(id);
  setHidden(id, false);
}

async function commitReject(m: ModeratedMessage, notify: Notify): Promise<void> {
  undoTimers.delete(m.id);
  // expired, deleted or banned meanwhile: nothing left to reject
  if (
    !getClient()
      .getState()
      .queue.some((q) => q.id === m.id)
  )
    return;
  try {
    await api('POST', `/api/mod/${encodeURIComponent(m.id)}/reject`, {});
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return;
    setHidden(m.id, false);
    notify(errorNotice(err));
  }
}

// ------------------------------------------------------------------ queue actions

export async function approveMessage(m: ModeratedMessage, trustUser: boolean, notify: Notify): Promise<void> {
  await api('POST', `/api/mod/${encodeURIComponent(m.id)}/approve`, trustUser ? { trustUser: true } : {});
  if (trustUser) {
    notify({
      tone: 'success',
      title: `Mensagens de ${m.displayName} liberadas nesta sessão`,
      description: 'As próximas aparecem direto, sem passar pela moderação.',
    });
  }
}

export async function banAuthor(m: ModeratedMessage, notify: Notify): Promise<void> {
  await api('POST', `/api/mod/${encodeURIComponent(m.id)}/reject`, { blockUser: true });
  notify({
    tone: 'success',
    title: `${m.displayName} não aparece mais nesta sessão`,
    description: 'As mensagens novas dessa pessoa ficam fora da live até o stream95 reiniciar.',
    durationMs: 8000,
    action: { label: 'Desbanir', onClick: () => void unban(m, notify) },
  });
}

async function unban(m: ModeratedMessage, notify: Notify): Promise<void> {
  try {
    await api('POST', `/api/mod/users/${encodeURIComponent(m.login)}/unblock`);
    notify({ tone: 'success', title: `${m.displayName} pode falar de novo` });
  } catch (err) {
    notify(errorNotice(err));
  }
}

// ------------------------------------------------------------------ watchers

let notifyRef: Notify | null = null;
let stopWatching: (() => void) | null = null;
const alerted = new Set<string>();

function alertTechIssue(item: AttentionItem): void {
  const key = attentionKey(item);
  if (alerted.has(key) || resolvedStore.get().has(key)) return;
  alerted.add(key);
  notifyRef?.({
    tone: 'warning',
    title: 'Problema técnico no chat',
    description: `${item.displayName}: ${item.text}`,
    durationMs: 0,
    tag: TECH_ISSUE_TAG,
    action: { label: 'Resolvido', onClick: () => resolveAttention([key]) },
  });
}

function onServerEvent(e: ServerEvent): void {
  if (e.type === 'chat:remove') markRemoved(e.ids);
  else if (e.type === 'chat:clear') {
    // the reducer already emptied `chat`: everything the log shows as displayed is gone now
    markRemoved(
      getClient()
        .getState()
        .log.filter((m) => m.status === 'shown')
        .map((m) => m.id),
    );
  } else if (e.type === 'mod:attention' && e.item.kind === 'techIssue') alertTechIssue(e.item);
}

/**
 * Starts the moderation listeners once, the first time the screen opens. Like `useDeckEvent`, but
 * it keeps running on the other tabs, so a technical problem still raises a notice there.
 */
export function useModerationWatchers(): void {
  const notify = useNotify();
  useEffect(() => {
    notifyRef = notify;
    if (!stopWatching) stopWatching = getClient().listen(onServerEvent);
  }, [notify]);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopWatching?.();
    stopWatching = null;
  });
}

// ------------------------------------------------------------------ small preferences

/** A boolean preference kept in localStorage (falls back to memory when storage is blocked). */
export function useStoredFlag(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(() => {
    const raw = readStorage(key);
    return raw === null ? fallback : raw === '1';
  });
  const update = useCallback(
    (next: boolean) => {
      setValue(next);
      writeStorage(key, next ? '1' : '0');
    },
    [key],
  );
  return [value, update];
}
