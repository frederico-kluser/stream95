import { describe, expect, it } from 'vitest';
import {
  AGENT_BUSY_MAX_MS,
  AgentActivity,
  CHAT_REACTIONS,
  type ChatLine,
  chatReaction,
  reactsTo,
} from '../src/lib/agent-reactions';

const line = (text: string, over: Partial<ChatLine> = {}): ChatLine => ({
  text,
  isBroadcaster: false,
  source: 'twitch',
  ...over,
});

/** Everything Clippy can play: the curated reactions plus idles and greetings that are never picked. */
const ALL = [...CHAT_REACTIONS, 'Greeting', 'Idle1_1', 'Show', 'Hide'];

describe('chat reactions', () => {
  it('skips commands and the streamer own messages', () => {
    expect(reactsTo(line('oi chat'))).toBe(true);
    expect(reactsTo(line('!discord'))).toBe(false);
    expect(reactsTo(line('  !tts olá'))).toBe(false);
    expect(reactsTo(line('bora codar', { isBroadcaster: true }))).toBe(false);
    expect(reactsTo(line('mensagem do painel', { source: 'dock' }))).toBe(false);
    expect(reactsTo(line('teste', { source: 'simulator' }))).toBe(true);
    expect(chatReaction({ message: line('!sr musica'), busy: false, available: ALL })).toBeNull();
    expect(chatReaction({ message: line('oi', { isBroadcaster: true }), busy: false, available: ALL })).toBeNull();
  });

  it('never reacts while the agent is busy', () => {
    const activity = new AgentActivity();
    activity.begin(1_000);
    expect(activity.isBusy(1_500)).toBe(true);
    expect(chatReaction({ message: line('oi'), busy: activity.isBusy(1_500), available: ALL })).toBeNull();
  });

  it('frees the agent when the animation ends, unless a newer one took over', () => {
    const activity = new AgentActivity();
    const first = activity.begin(0);
    const second = activity.begin(100);
    activity.end(first);
    expect(activity.isBusy(200)).toBe(true);
    activity.end(second);
    expect(activity.isBusy(200)).toBe(false);
    expect(chatReaction({ message: line('oi'), busy: activity.isBusy(200), available: ALL })).not.toBeNull();
  });

  it('releases the agent after the safety timeout when the end callback never comes', () => {
    const activity = new AgentActivity();
    activity.begin(0);
    expect(activity.isBusy(AGENT_BUSY_MAX_MS - 1)).toBe(true);
    expect(activity.isBusy(AGENT_BUSY_MAX_MS)).toBe(false);
    expect(
      chatReaction({ message: line('oi'), busy: activity.isBusy(AGENT_BUSY_MAX_MS), available: ALL }),
    ).not.toBeNull();
  });

  it('flags once an animation that outlived the safety window, never one that ended', () => {
    const activity = new AgentActivity();
    const token = activity.begin(0);
    expect(activity.takeOverdue(AGENT_BUSY_MAX_MS - 1)).toBe(false);
    expect(activity.takeOverdue(AGENT_BUSY_MAX_MS)).toBe(true);
    expect(activity.takeOverdue(AGENT_BUSY_MAX_MS + 1_000)).toBe(false);

    activity.end(token);
    const next = activity.begin(10_000);
    activity.end(next);
    expect(activity.takeOverdue(10_000 + AGENT_BUSY_MAX_MS)).toBe(false);
  });

  it('only picks animations the agent has and avoids repeating the last one', () => {
    expect(
      chatReaction({ message: line('oi'), busy: false, available: ['Greeting', 'Wave'], random: () => 0.99 }),
    ).toBe('Wave');
    expect(chatReaction({ message: line('oi'), busy: false, available: ['Greeting', 'Idle1_1'] })).toBeNull();
    expect(
      chatReaction({ message: line('oi'), busy: false, available: ['Wave', 'Alert'], last: 'Wave', random: () => 0 }),
    ).toBe('Alert');
    expect(chatReaction({ message: line('oi'), busy: false, available: ['Wave'], last: 'Wave' })).toBe('Wave');

    const picked = new Set(
      Array.from({ length: 50 }, (_, i) =>
        chatReaction({ message: line('oi'), busy: false, available: ALL, random: () => i / 50 }),
      ),
    );
    expect([...picked].sort()).toEqual([...CHAT_REACTIONS].sort());
  });
});
