import { defaultSettings, type ModeratedMessage, type ServerEvent, type Settings } from '@stream95/shared';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClippyStage } from '../src/components/ClippyStage';
import { REACTION_TIMEOUT_MS } from '../src/lib/agent-reactions';
import { StreamClient, setClient } from '../src/lib/stream';

// A fake clippy.js agent: records what the stage asks it to play.
const agent = vi.hoisted(() => ({
  _el: document.createElement('div'),
  // Its sound effects (`new Audio(...)` in clippy.js), refilled before each test.
  _animator: { _sounds: {} as Record<string, HTMLAudioElement> },
  play: vi.fn((..._args: unknown[]) => true),
  stop: vi.fn(),
  stopCurrent: vi.fn(),
  animations: vi.fn(() => ['Greeting', 'Wave', 'Explain', 'Thinking', 'Idle1_1']),
}));

// The agent the provider hands over after an agent switch (null: the one above).
const handed = vi.hoisted(() => ({ clippy: null as typeof agent | null }));

vi.mock('@react95/clippy', async () => {
  const { createElement } = await import('react');
  return {
    ClippyProvider: ({ children }: { children?: ReactNode }) => createElement('div', { 'data-agent': '' }, children),
    useClippy: () => ({ clippy: handed.clippy ?? agent }),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const settingsWith = (assistant: Partial<Settings['assistant']>): Settings => {
  const s = defaultSettings();
  return { ...s, assistant: { ...s.assistant, ...assistant } };
};

const chat = (id: string, over: Partial<ModeratedMessage> = {}): ModeratedMessage => ({
  id,
  channel: 'c',
  userId: 'u',
  login: 'ana',
  displayName: 'Ana',
  text: 'oi chat',
  emotes: [],
  badges: [],
  isBroadcaster: false,
  isMod: false,
  isVip: false,
  isSub: false,
  isFirst: false,
  isHighlighted: false,
  timestamp: 0,
  source: 'twitch',
  verdict: { decision: 'allow', category: 'ok', reason: '', by: 'rules' },
  status: 'shown',
  decidedAt: 0,
  ...over,
});

let client: StreamClient;
let container: HTMLDivElement;
let root: Root;

const emit = (event: ServerEvent) => act(() => client.dispatch(event));
const mount = () => act(() => root.render(<ClippyStage />));
const plays = () => agent.play.mock.calls.map(([name]) => name);
/** Runs the end callback clippy.js would call when the n-th animation finishes. */
const finish = (n: number) => {
  const done = agent.play.mock.calls[n]?.[2];
  if (typeof done !== 'function') throw new Error(`animation #${n} was not played`);
  act(() => done());
};

beforeEach(() => {
  client = new StreamClient('overlay');
  setClient(client);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  agent.play.mockClear();
  agent.stop.mockClear();
  agent.stopCurrent.mockClear();
  const shown = document.createElement('audio');
  void shown.play(); // the Show animation already started this one
  agent._animator._sounds = { '1': document.createElement('audio'), '2': shown };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  setClient(null);
  handed.clippy = null;
  vi.useRealTimers();
});

describe('ClippyStage', () => {
  it('mutes the agent sound effects before its first animation: only the audio page makes sound', () => {
    const sounds = Object.values(agent._animator._sounds);
    const mutedAtFirstPlay: boolean[] = [];
    agent.play.mockImplementationOnce(() => {
      mutedAtFirstPlay.push(...sounds.map((s) => s.muted));
      return true;
    });
    emit({ type: 'settings', settings: settingsWith({ showAgent: true, reactToChat: true }) });
    mount();
    expect(plays()).toEqual(['Greeting']);
    expect(mutedAtFirstPlay).toEqual([true, true]);
    expect(sounds.map((s) => s.paused)).toEqual([true, true]); // the one Show started stops too
  });

  it('mutes the new agent too after an agent switch', () => {
    emit({ type: 'settings', settings: settingsWith({ agent: 'Clippy', showAgent: true }) });
    mount();
    const sound = document.createElement('audio');
    const mutedAtGreeting: boolean[] = [];
    handed.clippy = {
      ...agent,
      _el: document.createElement('div'),
      _animator: { _sounds: { '1': sound } },
      play: vi.fn((..._args: unknown[]) => {
        mutedAtGreeting.push(sound.muted);
        return true;
      }),
    };
    emit({ type: 'settings', settings: settingsWith({ agent: 'Merlin', showAgent: true }) });
    expect(handed.clippy.play).toHaveBeenCalledWith('Greeting', undefined, expect.any(Function));
    expect(mutedAtGreeting).toEqual([true]);
  });

  it('keeps the agent running when a clippy.js update moves its sounds', () => {
    const animator = agent._animator;
    Reflect.deleteProperty(agent, '_animator');
    try {
      emit({ type: 'settings', settings: settingsWith({ showAgent: true }) });
      mount();
      expect(plays()).toEqual(['Greeting']);
    } finally {
      agent._animator = animator;
    }
  });

  it('hides the animated agent but keeps the answer balloons in its place', () => {
    emit({ type: 'settings', settings: settingsWith({ showAgent: false }) });
    mount();
    expect(container.querySelector('[data-agent]')).toBeNull();

    emit({ type: 'assistant:say', text: 'Valeu pelo follow!', animation: 'Wave' });
    const balloon = container.querySelector('.s95-clippy-balloon');
    expect(balloon?.textContent).toContain('Valeu pelo follow!');
    expect(balloon?.classList.contains('s95-clippy-balloon-solo')).toBe(true);
    expect(agent.play).not.toHaveBeenCalled();
  });

  it('reacts to chat only when free, never to commands or the streamer', () => {
    emit({ type: 'settings', settings: settingsWith({ showAgent: true, reactToChat: true }) });
    mount();
    expect(container.querySelector('[data-agent]')).not.toBeNull();
    expect(plays()).toEqual(['Greeting']);

    emit({ type: 'chat:show', message: chat('1') });
    expect(plays()).toEqual(['Greeting']); // still greeting: busy

    finish(0);
    emit({ type: 'chat:show', message: chat('2', { text: '!discord' }) });
    emit({ type: 'chat:show', message: chat('3', { isBroadcaster: true }) });
    expect(plays()).toEqual(['Greeting']);

    emit({ type: 'chat:show', message: chat('4') });
    expect(plays()).toHaveLength(2);
    expect(['Wave', 'Explain', 'Thinking']).toContain(plays()[1]);
    expect(agent.play.mock.calls[1]?.[1]).toBe(REACTION_TIMEOUT_MS);
    expect(agent.stopCurrent).toHaveBeenCalledTimes(1); // only the idle fidget is wrapped up

    emit({ type: 'chat:show', message: chat('5') });
    expect(plays()).toHaveLength(2); // a reaction never cuts another animation short
    expect(agent.stopCurrent).toHaveBeenCalledTimes(1);
    expect(agent.stop).not.toHaveBeenCalled();
  });

  it('ends an animation that outlives the safety window and frees the agent', () => {
    vi.useFakeTimers();
    emit({ type: 'settings', settings: settingsWith({ showAgent: true, reactToChat: true }) });
    mount();
    expect(plays()).toEqual(['Greeting']); // its end callback never comes

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(agent.stopCurrent).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(agent.stopCurrent).toHaveBeenCalledTimes(1);

    emit({ type: 'chat:show', message: chat('1') });
    expect(plays()).toHaveLength(2);
  });

  it('stays still on chat when reactions are off', () => {
    emit({ type: 'settings', settings: settingsWith({ reactToChat: false }) });
    mount();
    finish(0);
    emit({ type: 'chat:show', message: chat('1') });
    expect(plays()).toEqual(['Greeting']);
  });

  it('assistant answers interrupt the agent and keep it busy', () => {
    emit({ type: 'settings', settings: settingsWith({ showAgent: true, reactToChat: true }) });
    mount();
    finish(0);

    emit({ type: 'assistant:thinking', asker: 'ana', question: 'qual o editor?' });
    expect(agent.stop).toHaveBeenCalledTimes(1);
    expect(plays()).toEqual(['Greeting', 'Thinking']);
    expect(container.querySelector('.s95-clippy-balloon')?.classList.contains('s95-clippy-balloon-solo')).toBe(false);

    emit({ type: 'chat:show', message: chat('1') });
    expect(plays()).toHaveLength(2);

    emit({
      type: 'assistant:reply',
      reply: { id: 'r1', asker: 'ana', question: 'qual o editor?', answer: 'Neovim, claro.', animation: 'Nope' },
    });
    expect(plays()).toEqual(['Greeting', 'Thinking', 'Explain']); // unknown animation falls back to Explain
    expect(container.textContent).toContain('Neovim, claro.');

    finish(1); // the interrupted Thinking ends late: the reply still holds the agent
    emit({ type: 'chat:show', message: chat('2') });
    expect(plays()).toHaveLength(3);
  });
});
