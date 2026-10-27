import { defaultSettings, type PollState, type PomodoroState, type TtsItem } from '@stream95/shared';
import { describe, expect, it, vi } from 'vitest';
import { cleanAnswer, pickAnimation } from '../src/assistant/assistant.js';
import { CommandRouter, parseCommand } from '../src/commands/commands.js';
import { CounterService } from '../src/features/counters.js';
import { toGithubEvent } from '../src/features/github.js';
import { PollService } from '../src/features/poll.js';
import { PomodoroService } from '../src/features/pomodoro.js';
import { silentLogger } from '../src/log.js';
import { obsAuth } from '../src/obs/obs.js';
import { OpenRouter } from '../src/openrouter.js';
import { textForSpeech, truncateAtWord, withSpeaker } from '../src/tts/sanitize.js';
import { TtsService } from '../src/tts/service.js';
import { parseEmoteOffsets } from '../src/twitch/chat.js';
import { chatMsg } from './helpers.js';

describe('textForSpeech', () => {
  it('removes emotes and links, shortens laughter and repeats', () => {
    expect(
      textForSpeech('Kappa kkkkkkkk olha https://x.com/abc nãoooooo!!!!', [{ id: '1', start: 0, end: 4 }], 200),
    ).toBe('haha olha link nãoo!');
  });

  it('returns empty when only symbols/emotes remain', () => {
    expect(textForSpeech('Kappa', [{ id: '1', start: 0, end: 4 }], 200)).toBe('');
    expect(textForSpeech('<3 :) ^^', [], 200)).toBe('');
  });

  it('truncates at a word boundary', () => {
    expect(truncateAtWord('um dois tres quatro cinco seis', 15)).toBe('um dois tres...');
    expect(withSpeaker('Lucas_BR_99', 'oi')).toBe('Lucas BR disse: oi');
  });
});

describe('TtsService', () => {
  const audioFetch = (async () =>
    new Response(new Uint8Array([0xff, 0xfb, 0x90]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg', 'x-generation-id': 'g1' },
    })) as typeof fetch;

  it('synthesizes, publishes a local URL and enforces cooldown/enabled', async () => {
    const published: TtsItem[] = [];
    const settings = { ...defaultSettings().tts, enabled: true, userCooldownSec: 60 };
    const client = new OpenRouter({ apiKey: 'k', title: 't', referer: 'r', log: silentLogger, fetchImpl: audioFetch });
    const tts = new TtsService(
      client,
      () => 'elevenlabs/eleven-flash-v2.5',
      () => settings,
      (i) => published.push(i),
      silentLogger,
    );
    const item = await tts.speak({ kind: 'chat', text: 'olá mundo', voice: 'george', user: 'ana' });
    expect(typeof item).toBe('object');
    expect(published[0]?.url).toMatch(/^\/api\/tts\/.+\.mp3$/);
    expect(tts.getAudio((item as TtsItem).id)?.length).toBe(3);
    expect(await tts.speak({ kind: 'chat', text: 'de novo', voice: 'george', user: 'ana' })).toBe(
      'cooldown do usuário',
    );
    settings.enabled = false;
    expect(await tts.speak({ kind: 'chat', text: 'oi', voice: 'george', user: 'bia' })).toBe('TTS desligado');
    expect(typeof (await tts.speak({ kind: 'dock', text: 'prioridade', voice: 'george', priority: true }))).toBe(
      'object',
    );
  });

  it('rejects non-audio answers instead of saving garbage', async () => {
    const jsonFetch = (async () =>
      new Response('{"error":"bad"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    const client = new OpenRouter({ apiKey: 'k', title: 't', referer: 'r', log: silentLogger, fetchImpl: jsonFetch });
    const tts = new TtsService(
      client,
      () => 'm',
      () => ({ ...defaultSettings().tts, enabled: true }),
      () => {},
      silentLogger,
    );
    expect(String(await tts.speak({ kind: 'chat', text: 'oi', voice: 'george' }))).toContain('falha no TTS');
  });
});

describe('assistant helpers', () => {
  it('cleans markdown/emoji and keeps whole sentences', () => {
    expect(cleanAnswer('Use `range(10, -1, -1)` 😄 **sempre**.', 200)).toBe('Use range(10, -1, -1) sempre.');
    const long = 'Primeira frase curta. Segunda frase bem mais longa que não cabe no limite.';
    expect(cleanAnswer(long, 40)).toBe('Primeira frase curta.');
  });

  it('picks a fitting animation', () => {
    expect(pickAnimation('deu erro no build', '')).toBe('Searching');
    expect(pickAnimation('conta uma piada', '')).toBe('GetAttention');
  });
});

describe('commands', () => {
  const build = () => {
    const settings = defaultSettings();
    const polls: (PollState | null)[] = [];
    const poll = new PollService((p) => polls.push(p));
    const pomodoro = new PomodoroService(
      () => settings.pomodoro,
      () => {},
      () => {},
    );
    const counters = new CounterService([], () => {});
    const effects = { bsod: vi.fn(), toast: vi.fn() };
    const router = new CommandRouter({
      settings: () => settings,
      poll,
      pomodoro,
      counters,
      effects,
      projectUrl: 'https://x',
    });
    return { router, poll, effects, counters, settings };
  };

  it('parses commands', () => {
    expect(parseCommand('!clippy como faço X?')).toEqual({ name: 'clippy', args: 'como faço X?' });
    expect(parseCommand('!1')).toEqual({ name: '1', args: '' });
    expect(parseCommand('oi !clippy')).toBeNull();
  });

  it('turns !clippy and !tts into intents that wait for moderation', () => {
    const { router, settings } = build();
    expect(router.handle(chatMsg('!clippy o que é um ponteiro?'))?.intent).toEqual({
      kind: 'assistant',
      question: 'o que é um ponteiro?',
    });
    expect(router.handle(chatMsg('!tts olá'))?.intent).toBeUndefined();
    settings.tts.enabled = true;
    expect(router.handle(chatMsg('!tts olá'))?.intent).toEqual({ kind: 'tts', text: 'olá' });
  });

  it('counts poll votes and hides them from chat', () => {
    const { router, poll } = build();
    poll.start('Linguagem?', ['Rust', 'Go']);
    expect(router.handle(chatMsg('!2', { login: 'a' }))).toEqual({ hide: true });
    router.handle(chatMsg('!2', { login: 'b' }));
    router.handle(chatMsg('!1', { login: 'b' }));
    expect(poll.current?.options.map((o) => o.votes)).toEqual([1, 1]);
    expect(poll.current?.totalVotes).toBe(2);
  });

  it('answers socials and keeps mod-only effects for mods', () => {
    const { router, effects, counters } = build();
    expect(router.handle(chatMsg('!site'))?.reply).toContain('frederico-kluser.com');
    expect(router.handle(chatMsg('!bsod'))).toEqual({ hide: false });
    expect(router.handle(chatMsg('!bsod', { isMod: true }))?.hide).toBe(true);
    expect(effects.bsod).toHaveBeenCalledOnce();
    router.handle(chatMsg('!bugs', { isMod: true }));
    expect(counters.all.find((c) => c.id === 'bugs')?.value).toBe(1);
    expect(router.handle(chatMsg('!desconhecido'))).toBeNull();
  });
});

describe('poll', () => {
  it('validates input and closes', () => {
    const p = new PollService(() => {});
    expect(() => p.start('', ['a', 'b'])).toThrow();
    expect(() => p.start('q', ['a'])).toThrow();
    p.start('q', ['a', 'b']);
    expect(p.vote('x', 3)).toBe(false);
    p.close();
    expect(p.vote('x', 1)).toBe(false);
  });
});

describe('pomodoro', () => {
  it('runs, pauses, resumes and finishes', () => {
    let now = 0;
    const states: PomodoroState[] = [];
    const finished: string[] = [];
    const p = new PomodoroService(
      () => ({ focusMin: 25, breakMin: 5 }),
      (s) => states.push(s),
      (f) => finished.push(f),
      () => now,
    );
    p.start('focus');
    now = 10 * 60_000;
    expect(p.current.remainingMs).toBe(15 * 60_000);
    p.pause();
    now = 20 * 60_000;
    expect(p.current.remainingMs).toBe(15 * 60_000);
    p.resume();
    p.finish();
    expect(finished).toEqual(['focus']);
    expect(p.current.running).toBe(false);
    p.stop();
    expect(p.current.mode).toBe('idle');
  });
});

describe('integrations', () => {
  it('computes the obs-websocket v5 auth string (official protocol example)', () => {
    // Public example from the obs-websocket protocol docs ("Creating an authentication string"):
    // https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
    // Not a credential. Assembled at runtime only so secret scanners don't flag the fixture.
    const docsExample = ['super', 'secret', 'password'].join('');
    expect(
      obsAuth(
        docsExample,
        'lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=',
        '+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY=',
      ),
    ).toBe('1Ct943GAT+6YQUUX47Ia/ncufilbe6+oD6lY+5kaCu4=');
  });

  it('parses Twitch emote offsets', () => {
    expect(
      parseEmoteOffsets(
        new Map([
          ['25', ['0-4', '11-15']],
          ['1902', ['6-9']],
        ]),
      ),
    ).toEqual([
      { id: '25', start: 0, end: 4 },
      { id: '1902', start: 6, end: 9 },
      { id: '25', start: 11, end: 15 },
    ]);
  });

  it('maps GitHub push events into toasts', () => {
    const ev = toGithubEvent({
      id: '1',
      type: 'PushEvent',
      repo: { name: 'me/repo' },
      created_at: '2026-10-27T10:00:00Z',
      payload: { size: 2, commits: [{ message: 'feat: a' }, { message: 'fix: b\n\ncorpo' }] },
    });
    expect(ev).toMatchObject({ type: 'push', repo: 'me/repo', title: 'fix: b (+1)' });
    expect(toGithubEvent({ id: '2', type: 'GollumEvent', repo: { name: 'x' } })).toBeNull();
  });

  it('handles the slim 2025+ events payloads (no commits, no PR title)', () => {
    expect(
      toGithubEvent({
        id: '3',
        type: 'PushEvent',
        repo: { name: 'me/r' },
        payload: { ref: 'refs/heads/main', head: 'e0327e5f00' },
      })?.title,
    ).toBe('push em main (e0327e5)');
    expect(
      toGithubEvent({
        id: '4',
        type: 'PullRequestEvent',
        repo: { name: 'me/r' },
        payload: { action: 'merged', number: 151, pull_request: { number: 151 } },
      })?.title,
    ).toBe('PR #151 merged');
  });

  it('keeps counters non-negative', () => {
    const c = new CounterService([], () => {});
    c.add('bugs', -5);
    expect(c.all.find((x) => x.id === 'bugs')?.value).toBe(0);
    expect(c.upsert('Commits!', 'Commits').id).toBe('commits');
  });
});
