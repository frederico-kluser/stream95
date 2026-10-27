import type { PublicSettings } from './settings.js';
import type {
  AssistantReply,
  ChatMessage,
  Counter,
  GithubEvent,
  ModeratedMessage,
  PollState,
  PomodoroState,
  ServiceStatus,
  StreamAlert,
  Toast,
  TtsItem,
} from './types.js';

/** Who is connected on the other side of the WebSocket. */
export type ClientRole = 'overlay' | 'dock' | 'audio';

/** Snapshot sent on connect so a freshly loaded browser source renders instantly. */
export type Snapshot = {
  chat: ModeratedMessage[];
  queue: ModeratedMessage[];
  log: ModeratedMessage[];
  poll: PollState | null;
  pomodoro: PomodoroState;
  counters: Counter[];
  github: GithubEvent[];
  status: ServiceStatus;
  scene: string | null;
  obsScenes: string[];
};

/** Server → client messages. Dock-only events are only sent to role "dock". */
export type ServerEvent =
  | { type: 'hello'; role: ClientRole; settings: PublicSettings; snapshot: Snapshot }
  | { type: 'settings'; settings: PublicSettings }
  | { type: 'status'; status: ServiceStatus }
  | { type: 'chat:show'; message: ModeratedMessage }
  | { type: 'chat:remove'; ids: string[] }
  | { type: 'chat:clear' }
  | { type: 'chat:incoming'; message: ChatMessage }
  | { type: 'mod:queue'; queue: ModeratedMessage[] }
  | { type: 'mod:log'; item: ModeratedMessage }
  | { type: 'alert'; alert: StreamAlert }
  | { type: 'tts:play'; item: TtsItem }
  | { type: 'tts:skip' }
  | { type: 'assistant:thinking'; asker: string; question: string }
  | { type: 'assistant:reply'; reply: AssistantReply }
  | { type: 'assistant:say'; text: string; animation: string }
  | { type: 'poll'; poll: PollState | null }
  | { type: 'pomodoro'; state: PomodoroState }
  | { type: 'counters'; counters: Counter[] }
  | { type: 'github'; event: GithubEvent }
  | { type: 'scene'; scene: string | null; obsScenes: string[] }
  | { type: 'toast'; toast: Toast }
  | { type: 'bsod'; title: string; message: string };

export type ServerEventType = ServerEvent['type'];

/** Events that only the control dock receives. */
export const DOCK_ONLY_EVENTS: ReadonlySet<ServerEventType> = new Set(['mod:queue', 'mod:log', 'chat:incoming']);

/** Events the audio player cares about (it ignores everything else). */
export const AUDIO_EVENTS: ReadonlySet<ServerEventType> = new Set([
  'hello',
  'settings',
  'tts:play',
  'tts:skip',
  'alert',
]);

/** Client → server message (only used for liveness; actions go through the REST API). */
export type ClientEvent = { type: 'ping'; t: number } | { type: 'tts:done'; id: string };

export function isServerEvent(value: unknown): value is ServerEvent {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}
