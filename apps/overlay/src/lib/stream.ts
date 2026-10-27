import {
  type AttentionItem,
  type ChatMessage,
  type ClientEvent,
  type ClientRole,
  type Counter,
  defaultSettings,
  type GithubEvent,
  type ModeratedMessage,
  type ModerationSignals,
  type PollState,
  type PomodoroState,
  type ServerEvent,
  type ServiceStatus,
  type Settings,
} from '@stream95/shared';
import { useEffect, useRef, useSyncExternalStore } from 'react';

export type StreamState = {
  connected: boolean;
  settings: Settings;
  chat: ModeratedMessage[];
  queue: ModeratedMessage[];
  log: ModeratedMessage[];
  /** Questions and technical problems flagged by Jev (dock only). */
  attention: AttentionItem[];
  incoming: ChatMessage[];
  poll: PollState | null;
  pomodoro: PomodoroState;
  counters: Counter[];
  github: GithubEvent[];
  status: ServiceStatus | null;
  scene: string | null;
  obsScenes: string[];
};

export const initialState = (): StreamState => ({
  connected: false,
  settings: defaultSettings(),
  chat: [],
  queue: [],
  log: [],
  attention: [],
  incoming: [],
  poll: null,
  pomodoro: { mode: 'idle', running: false, remainingMs: 0, durationMs: 0, cycle: 0 },
  counters: [],
  github: [],
  status: null,
  scene: null,
  obsScenes: [],
});

/** Jev's signals arrive after the message (background analysis): attach them where it is listed. */
function withSignals(list: ModeratedMessage[], id: string, signals: ModerationSignals): ModeratedMessage[] {
  return list.some((m) => m.id === id)
    ? list.map((m) => (m.id === id ? { ...m, verdict: { ...m.verdict, signals } } : m))
    : list;
}

/** Pure reducer: persistent state lives here; transient events (alerts, tts…) only go to listeners. */
export function reduce(state: StreamState, e: ServerEvent): StreamState {
  switch (e.type) {
    case 'hello':
      return {
        ...state,
        connected: true,
        settings: e.settings,
        chat: e.snapshot.chat,
        queue: e.snapshot.queue,
        log: e.snapshot.log,
        attention: e.snapshot.attention ?? [],
        poll: e.snapshot.poll,
        pomodoro: e.snapshot.pomodoro,
        counters: e.snapshot.counters,
        github: e.snapshot.github,
        status: e.snapshot.status,
        scene: e.snapshot.scene,
        obsScenes: e.snapshot.obsScenes,
      };
    case 'settings':
      return { ...state, settings: e.settings };
    case 'status':
      return { ...state, status: e.status };
    case 'chat:show':
      return { ...state, chat: [...state.chat.filter((m) => m.id !== e.message.id), e.message].slice(-60) };
    case 'chat:remove': {
      const gone = new Set(e.ids);
      return { ...state, chat: state.chat.filter((m) => !gone.has(m.id)) };
    }
    case 'chat:clear':
      return { ...state, chat: [] };
    case 'chat:incoming':
      return { ...state, incoming: [...state.incoming, e.message].slice(-120) };
    case 'mod:queue':
      return { ...state, queue: e.queue };
    case 'mod:log':
      return { ...state, log: [...state.log, e.item].slice(-150) };
    case 'mod:signals':
      return { ...state, log: withSignals(state.log, e.id, e.signals), chat: withSignals(state.chat, e.id, e.signals) };
    case 'mod:attention':
      return { ...state, attention: [...state.attention, e.item].slice(-30) };
    case 'poll':
      return { ...state, poll: e.poll };
    case 'pomodoro':
      return { ...state, pomodoro: e.state };
    case 'counters':
      return { ...state, counters: e.counters };
    case 'github':
      return { ...state, github: [...state.github, e.event].slice(-20) };
    case 'scene':
      return { ...state, scene: e.scene, obsScenes: e.obsScenes };
    default:
      return state;
  }
}

type Listener = (e: ServerEvent) => void;

/** One WebSocket per page, reconnecting with backoff; React reads it through useSyncExternalStore. */
export class StreamClient {
  private state: StreamState = initialState();
  private readonly subscribers = new Set<() => void>();
  private readonly listeners = new Set<Listener>();
  private ws: WebSocket | null = null;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly role: ClientRole) {}

  connect(): void {
    if (this.ws) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?role=${this.role}`);
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
      this.dispatch(event);
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.state.connected) this.setState({ ...this.state, connected: false });
      const wait = Math.min(10_000, 500 * 2 ** this.attempts++);
      this.timer = setTimeout(() => this.connect(), wait);
    };
    ws.onerror = () => ws.close();
  }

  close(): void {
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
  }

  send(event: ClientEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(event));
  }

  /** Feed an event as if it came from the server (used by tests and the dock's local echo). */
  dispatch(event: ServerEvent): void {
    const next = reduce(this.state, event);
    if (next !== this.state) this.setState(next);
    for (const l of this.listeners) l(event);
  }

  onEvent(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribe = (cb: () => void): (() => void) => {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  };

  getSnapshot = (): StreamState => this.state;

  private setState(next: StreamState): void {
    this.state = next;
    for (const cb of this.subscribers) cb();
  }
}

let client: StreamClient | null = null;

export function getClient(role: ClientRole = 'overlay'): StreamClient {
  if (!client) {
    client = new StreamClient(role);
    client.connect();
  }
  return client;
}

/** Use a pre-built client (tests). */
export function setClient(c: StreamClient | null): void {
  client = c;
}

export function useStream(): StreamState {
  const c = getClient();
  return useSyncExternalStore(c.subscribe, c.getSnapshot, c.getSnapshot);
}

/** Subscribe to transient server events (alerts, tts, assistant, toasts, bsod). */
export function useStreamEvent(handler: Listener): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => getClient().onEvent((e) => ref.current(e)), []);
}
