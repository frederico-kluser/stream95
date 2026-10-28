import type { ModeratedMessage } from '@stream95/shared';

/** Reactions to new chat messages; each agent has its own set, so they are filtered at runtime. */
export const CHAT_REACTIONS = [
  'Wave',
  'GetAttention',
  'Explain',
  'Congratulate',
  'LookDown',
  'LookUp',
  'LookLeft',
  'LookRight',
  'Thinking',
  'CheckingSomething',
  'Searching',
  'GetTechy',
  'Writing',
  'Alert',
] as const;

/** Safety window: an animation we start never keeps the agent busy longer than this (lost callbacks). */
export const AGENT_BUSY_MAX_MS = 6_000;

/** Chat reactions are asked to end after this long (Writing and Searching loop until told to stop). */
export const REACTION_TIMEOUT_MS = 4_000;

/** Tracks the last animation we started: busy until its end callback runs or the safety window passes. */
export class AgentActivity {
  private token = 0;
  private until = 0;

  constructor(private readonly maxMs = AGENT_BUSY_MAX_MS) {}

  /** An animation started at `now`. Returns the token to pass to `end()`. */
  begin(now: number): number {
    this.token += 1;
    this.until = now + this.maxMs;
    return this.token;
  }

  /** The animation with this token ended. A newer animation keeps the agent busy. */
  end(token: number): void {
    if (token === this.token) this.until = 0;
  }

  isBusy(now: number): boolean {
    return now < this.until;
  }

  /**
   * True once when the last animation outlived the safety window without ending: a looping one
   * (Writing, Searching...) that started after its clippy.js timeout fired would never stop.
   */
  takeOverdue(now: number): boolean {
    if (this.until === 0 || now < this.until) return false;
    this.until = 0;
    return true;
  }
}

export type ChatLine = Pick<ModeratedMessage, 'text' | 'isBroadcaster' | 'source'>;

/** Commands and the streamer's own messages (broadcaster or sent from the deck) never get a reaction. */
export function reactsTo(message: ChatLine): boolean {
  return !message.isBroadcaster && message.source !== 'dock' && !message.text.trimStart().startsWith('!');
}

/**
 * Reaction for a new chat message, or null to stay still: never while busy (a reaction never
 * interrupts an animation), only animations this agent has, and not the same one twice in a row.
 */
export function chatReaction(opts: {
  message: ChatLine;
  busy: boolean;
  /** Animations of the loaded agent (`clippy.animations()`). */
  available: readonly string[];
  last?: string | null;
  random?: () => number;
}): string | null {
  if (opts.busy || !reactsTo(opts.message)) return null;
  const have = new Set(opts.available);
  const options: string[] = CHAT_REACTIONS.filter((name) => have.has(name));
  const fresh = options.length > 1 ? options.filter((name) => name !== opts.last) : options;
  if (fresh.length === 0) return null;
  const random = opts.random ?? Math.random;
  return fresh[Math.min(fresh.length - 1, Math.floor(random() * fresh.length))] ?? null;
}
