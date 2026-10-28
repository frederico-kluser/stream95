// Domain types shared by the server (producer) and the overlays/dock (consumers).

export type EmoteRange = { id: string; start: number; end: number };

export type ChatMessage = {
  /** Twitch message id (or a generated id for simulated messages). */
  id: string;
  channel: string;
  userId: string;
  login: string;
  displayName: string;
  /** Hex color chosen by the user on Twitch, if any. */
  color?: string;
  /** Original text as typed. */
  text: string;
  /** Emote positions inside `text` (inclusive indexes, like Twitch IRC tags). */
  emotes: EmoteRange[];
  badges: string[];
  isBroadcaster: boolean;
  isMod: boolean;
  isVip: boolean;
  isSub: boolean;
  /** First message ever in this channel (Twitch `first-msg` tag). */
  isFirst: boolean;
  /** Message highlighted with channel points. */
  isHighlighted: boolean;
  timestamp: number;
  source: 'twitch' | 'simulator' | 'dock';
};

export type ModerationDecision = 'allow' | 'review' | 'block';

export type ModerationCategory =
  | 'ok'
  | 'harassment'
  | 'hate'
  | 'sexual'
  | 'violence'
  | 'self_harm'
  | 'spam'
  | 'scam'
  | 'personal_data'
  | 'links'
  | 'caps'
  | 'flood'
  | 'blocklist'
  | 'length'
  | 'other';

/** Probabilities (0..1) from the Jev decision model that help the streamer in real time. */
export type ModerationSignals = {
  /** The message is a question waiting for an answer from the streamer or the chat. */
  question: number;
  /** The viewer reports a technical problem with the stream (audio, video, delay, chat). */
  techIssue: number;
};

export type ModerationVerdict = {
  decision: ModerationDecision;
  category: ModerationCategory;
  reason: string;
  /** Who decided: local rules, Jev, the LLM, a human in the dock, the fallback policy, or trust (mods/broadcaster). */
  by: 'rules' | 'jev' | 'llm' | 'human' | 'fallback' | 'trusted' | 'disabled';
  model?: string;
  latencyMs?: number;
  costUsd?: number;
  /** Jev's probability for each action, when Jev read the message. */
  probabilities?: { allow: number; review: number; block: number };
  /** How concentrated Jev's answer is (not a measure of correctness). */
  confidence?: number;
  signals?: ModerationSignals;
};

/** Colors a soundboard button can take (mapped to theme tokens in the deck). */
export const SFX_COLORS = ['slate', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'] as const;
export type SfxColor = (typeof SFX_COLORS)[number];

/**
 * A sound file in the library folder on the streaming PC. Playback always happens on the PC (the
 * OBS audio source), never on the phone. Every file is converted once to 48 kHz PCM WAV.
 */
export type SfxSound = {
  /** Stable id derived from the path relative to the library folder. */
  id: string;
  /** File name without extension. */
  name: string;
  /** Subfolder inside the library ('' for the root), used as a category. */
  category: string;
  /** Path relative to the library folder, with forward slashes. */
  file: string;
  status: 'ready' | 'converting' | 'error';
  durationMs?: number;
  /** Changes when the source file changes (cache-busting for the converted WAV). */
  rev?: string;
  error?: string;
};

/** A button on the deck mapped to a sound of the library. */
export type SfxButton = {
  id: string;
  label: string;
  soundId: string | null;
  emoji?: string;
  color: SfxColor;
  /** 0..1, multiplied by the master soundboard volume. */
  volume: number;
};

export type SfxLibrary = {
  /** Absolute path of the library folder on the PC (shown so the user knows where to drop files). */
  dir: string;
  sounds: SfxSound[];
  buttons: SfxButton[];
};

/** A phone, tablet or computer allowed to use the deck over the local network. */
export type PairedDevice = {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number | null;
};

/** Something the streamer should look at now: a question to answer or a reported technical problem. */
export type AttentionItem = {
  messageId: string;
  kind: keyof ModerationSignals;
  score: number;
  login: string;
  displayName: string;
  text: string;
  at: number;
};

export type MessageStatus = 'shown' | 'held' | 'rejected' | 'expired';

export type ModeratedMessage = ChatMessage & {
  verdict: ModerationVerdict;
  status: MessageStatus;
  decidedAt: number;
};

export type AlertKind = 'follow' | 'sub' | 'resub' | 'giftsub' | 'raid' | 'cheer' | 'redeem' | 'donation' | 'custom';

export type StreamAlert = {
  id: string;
  kind: AlertKind;
  user: string;
  /** Bits, viewers in a raid, gifted subs, donation value... depends on `kind`. */
  amount?: number;
  /** Optional message attached to the event (resub message, cheer message, redemption input). */
  message?: string;
  tier?: '1000' | '2000' | '3000' | 'prime';
  months?: number;
  reward?: string;
  timestamp: number;
  source: 'eventsub' | 'simulator' | 'dock';
};

export type TtsKind = 'chat' | 'assistant' | 'alert' | 'dock';

export type TtsItem = {
  id: string;
  kind: TtsKind;
  /** Text actually spoken (already sanitized). */
  text: string;
  voice: string;
  /** URL served by the local server (audio/mpeg). */
  url: string;
  user?: string;
  messageId?: string;
};

export type AssistantReply = {
  id: string;
  asker: string;
  question: string;
  answer: string;
  /** clippy.js animation to play while speaking. */
  animation: string;
  model?: string;
  latencyMs?: number;
};

export type PollOption = { label: string; votes: number };

export type PollState = {
  id: string;
  question: string;
  options: PollOption[];
  open: boolean;
  createdAt: number;
  endsAt?: number;
  totalVotes: number;
};

export type PomodoroMode = 'idle' | 'focus' | 'break';

export type PomodoroState = {
  mode: PomodoroMode;
  running: boolean;
  /** Epoch ms when the current period ends (only while running). */
  endsAt?: number;
  /** Remaining ms when paused. */
  remainingMs: number;
  durationMs: number;
  cycle: number;
};

export type GithubEvent = {
  id: string;
  type: 'push' | 'pull_request' | 'release' | 'create' | 'star' | 'fork' | 'issue' | 'other';
  repo: string;
  title: string;
  url?: string;
  createdAt: number;
};

export type Counter = { id: string; label: string; value: number };

export type ServiceState = 'off' | 'connecting' | 'online' | 'error' | 'unconfigured';

export type ServiceStatus = {
  chat: ServiceState;
  eventsub: ServiceState;
  openrouter: ServiceState;
  obs: ServiceState;
  github: ServiceState;
  /** Accumulated OpenRouter spend since the server started (USD). */
  spentUsd: number;
  startedAt: number;
};

export type ToastLevel = 'info' | 'warning' | 'error' | 'success';

export type Toast = { id: string; level: ToastLevel; title: string; body: string; icon?: string };
