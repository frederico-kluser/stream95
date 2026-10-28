import {
  type AttentionItem,
  type ChatMessage,
  type Counter,
  defaultSettings,
  type ModeratedMessage,
  type PollState,
  type PomodoroState,
  type ServerEvent,
  type ServiceStatus,
  type Settings,
  type SfxLibrary,
} from '@stream95/shared';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { ApiError, api } from './api';
import { clearDeviceToken, currentToken } from './auth';

/** WebSocket close code the server uses when this device was removed in Config → Aparelhos. */
export const WS_UNPAIRED_CODE = 4401;

export type Connection = 'connecting' | 'online' | 'offline';

export type DeckState = {
  connection: Connection;
  settings: Settings;
  status: ServiceStatus | null;
  chat: ModeratedMessage[];
  /** Every message as it arrives, before moderation (the chat feed of the deck). */
  incoming: ChatMessage[];
  queue: ModeratedMessage[];
  log: ModeratedMessage[];
  attention: AttentionItem[];
  sfx: SfxLibrary;
  /** Tap-to-sound latency of the last plays, by sound id. */
  /** Last tap-to-sound latency per sound id (a Map: ids come from the network, never object keys). */
  sfxLatency: ReadonlyMap<string, number>;
  poll: PollState | null;
  pomodoro: PomodoroState;
  /**
   * When `pomodoro` arrived (Date.now(), 0 before the first). The server only sends the state on
   * start, pause, resume, stop and finish, so a running countdown is `remainingMs - (now - pomodoroAt)`.
   */
  pomodoroAt: number;
  counters: Counter[];
  scene: string | null;
  obsScenes: string[];
};

export const initialState = (): DeckState => ({
  connection: 'connecting',
  settings: defaultSettings(),
  status: null,
  chat: [],
  incoming: [],
  queue: [],
  log: [],
  attention: [],
  sfx: { dir: '', sounds: [], buttons: [] },
  sfxLatency: new Map(),
  poll: null,
  pomodoro: { mode: 'idle', running: false, remainingMs: 0, durationMs: 0, cycle: 0 },
  pomodoroAt: 0,
  counters: [],
  scene: null,
  obsScenes: [],
});

function withSignals(list: ModeratedMessage[], id: string, signals: ModeratedMessage['verdict']['signals']) {
  return list.some((m) => m.id === id)
    ? list.map((m) => (m.id === id ? { ...m, verdict: { ...m.verdict, signals } } : m))
    : list;
}

/** Pure reducer: everything the deck shows comes from server events (`now` stamps their arrival). */
export function reduce(state: DeckState, e: ServerEvent, now: number = Date.now()): DeckState {
  switch (e.type) {
    case 'hello':
      return {
        ...state,
        connection: 'online',
        settings: e.settings,
        status: e.snapshot.status,
        chat: e.snapshot.chat,
        queue: e.snapshot.queue,
        log: e.snapshot.log,
        attention: e.snapshot.attention ?? [],
        sfx: e.snapshot.sfx ?? state.sfx,
        poll: e.snapshot.poll,
        pomodoro: e.snapshot.pomodoro,
        pomodoroAt: now,
        counters: e.snapshot.counters,
        scene: e.snapshot.scene,
        obsScenes: e.snapshot.obsScenes,
      };
    case 'settings':
      return { ...state, settings: e.settings };
    case 'status':
      return { ...state, status: e.status };
    case 'chat:show':
      return { ...state, chat: [...state.chat.filter((m) => m.id !== e.message.id), e.message].slice(-100) };
    case 'chat:remove': {
      const gone = new Set(e.ids);
      return { ...state, chat: state.chat.filter((m) => !gone.has(m.id)) };
    }
    case 'chat:clear':
      return { ...state, chat: [] };
    case 'chat:incoming':
      return { ...state, incoming: [...state.incoming, e.message].slice(-200) };
    case 'mod:queue':
      return { ...state, queue: e.queue };
    case 'mod:log':
      return { ...state, log: [...state.log, e.item].slice(-200) };
    case 'mod:signals':
      // Jev's signals arrive after the verdict: held messages need them too (the "pergunta" and "técnico" tags).
      return {
        ...state,
        log: withSignals(state.log, e.id, e.signals),
        chat: withSignals(state.chat, e.id, e.signals),
        queue: withSignals(state.queue, e.id, e.signals),
      };
    case 'mod:attention':
      return { ...state, attention: [...state.attention, e.item].slice(-50) };
    case 'sfx:library':
      return { ...state, sfx: e.library };
    case 'sfx:played':
      return { ...state, sfxLatency: new Map(state.sfxLatency).set(e.soundId, e.latencyMs) };
    case 'poll':
      return { ...state, poll: e.poll };
    case 'pomodoro':
      return { ...state, pomodoro: e.state, pomodoroAt: now };
    case 'counters':
      return { ...state, counters: e.counters };
    case 'scene':
      return { ...state, scene: e.scene, obsScenes: e.obsScenes };
    default:
      return state;
  }
}

type Listener = (e: ServerEvent) => void;

/** One WebSocket for the whole deck, reconnecting with backoff (1 s → 10 s). */
export class DeckClient {
  private state = initialState();
  private readonly subscribers = new Set<() => void>();
  private readonly listeners = new Set<Listener>();
  private ws: WebSocket | null = null;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private readonly unpairedListeners = new Set<() => void>();

  getState = (): DeckState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  };

  listen(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Called when the server no longer accepts this device (removed on the PC): show the pairing screen. */
  onUnpaired(fn: () => void): () => void {
    this.unpairedListeners.add(fn);
    return () => this.unpairedListeners.delete(fn);
  }

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
  }

  /** Reconnect now (after pairing, or when the user taps "reconectar"). */
  reconnect(): void {
    this.stopped = false;
    this.attempts = 0;
    this.ws?.close();
    if (this.timer) clearTimeout(this.timer);
    this.open();
  }

  private set(next: DeckState): void {
    if (next === this.state) return;
    this.state = next;
    for (const fn of this.subscribers) fn();
  }

  private open(): void {
    if (this.stopped) return;
    const token = currentToken();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/ws?role=dock${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    this.set({ ...this.state, connection: 'connecting' });
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.retry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempts = 0;
    };
    ws.onmessage = (msg) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(String(msg.data)) as ServerEvent;
      } catch {
        return;
      }
      this.set(reduce(this.state, event));
      for (const fn of this.listeners) fn(event);
    };
    // Some runtimes fire `error` without `close` for refused connections: retry from both.
    const lost = (code?: number) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.set({ ...this.state, connection: 'offline' });
      if (code === WS_UNPAIRED_CODE) return this.unpaired();
      this.retry();
      // A refused upgrade (HTTP 401) looks like any other drop: ask the API whether the token still works.
      if (currentToken() && this.attempts >= 2) void this.checkPairing();
    };
    ws.onclose = (ev) => lost(ev.code);
    ws.onerror = () => lost();
  }

  private async checkPairing(): Promise<void> {
    try {
      await api('GET', '/api/health');
    } catch (err) {
      if (err instanceof ApiError && err.needsPairing) this.unpaired();
    }
  }

  private unpaired(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    clearDeviceToken();
    for (const fn of this.unpairedListeners) fn();
  }

  private retry(): void {
    if (this.stopped || this.timer) return;
    const delay = Math.min(10_000, 1000 * 2 ** this.attempts);
    this.attempts++;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.open();
    }, delay);
  }
}

let client: DeckClient | null = null;

export function getClient(): DeckClient {
  if (!client) {
    client = new DeckClient();
    client.start();
  }
  return client;
}

export function useDeck(): DeckState {
  const c = getClient();
  return useSyncExternalStore(c.subscribe, c.getState, c.getState);
}

/** Runs `fn` for every server event (alerts, plays…) without re-rendering on each one. */
export function useDeckEvent(fn: Listener): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => getClient().listen((e) => ref.current(e)), []);
}
