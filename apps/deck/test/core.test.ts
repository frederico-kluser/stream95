import type { AttentionItem, ModeratedMessage, ServerEvent, SfxLibrary } from '@stream95/shared';
import { describe, expect, it } from 'vitest';
import { splitError } from '@/lib/api';
import { deviceName, isLocalHost } from '@/lib/auth';
import { ago, mmss } from '@/lib/format';
import { initialState, reduce } from '@/lib/store';

const library: SfxLibrary = {
  dir: 'C:/Users/x/Documents/stream95/sons',
  sounds: [{ id: 's1', name: 'Bruh', category: 'memes-en', file: 'memes-en/Bruh.mp3', status: 'ready', rev: 'abc' }],
  buttons: [{ id: 'b1', label: 'Bruh', soundId: 's1', color: 'violet', volume: 0.9 }],
};

const message = (id: string): ModeratedMessage =>
  ({
    id,
    login: 'ana',
    displayName: 'ana',
    text: 'sem áudio aqui',
    status: 'shown',
    decidedAt: 1,
    verdict: { decision: 'allow', category: 'ok', reason: '', by: 'jev' },
  }) as ModeratedMessage;

describe('deck reducer', () => {
  it('goes online on hello and keeps the soundboard from the snapshot', () => {
    const hello = {
      type: 'hello',
      role: 'dock',
      settings: initialState().settings,
      snapshot: {
        chat: [],
        queue: [],
        log: [],
        attention: [],
        sfx: library,
        poll: null,
        pomodoro: initialState().pomodoro,
        counters: [],
        github: [],
        status: null,
        scene: '2. Eu + Chat',
        obsScenes: ['2. Eu + Chat'],
      },
    } as unknown as ServerEvent;
    const s = reduce(initialState(), hello, 5000);
    expect(s.connection).toBe('online');
    expect(s.sfx.buttons[0]?.label).toBe('Bruh');
    expect(s.scene).toBe('2. Eu + Chat');
    expect(s.pomodoroAt).toBe(5000);
  });

  it('stamps when the pomodoro state arrived, so a remounted countdown does not restart', () => {
    expect(initialState().pomodoroAt).toBe(0);
    const running = {
      mode: 'focus',
      running: true,
      remainingMs: 25 * 60_000,
      durationMs: 25 * 60_000,
      cycle: 1,
    } as const;
    const s = reduce(initialState(), { type: 'pomodoro', state: running }, 1_000_000);
    expect(s.pomodoro).toEqual(running);
    expect(s.pomodoroAt).toBe(1_000_000);
    // other events keep the stamp
    expect(reduce(s, { type: 'chat:clear' }, 2_000_000).pomodoroAt).toBe(1_000_000);
  });

  it('gives late Jev signals to held messages too', () => {
    let s = reduce(initialState(), { type: 'mod:queue', queue: [message('q1'), message('q2')] });
    s = reduce(s, { type: 'mod:signals', id: 'q1', signals: { question: 0.97, techIssue: 0.02 } });
    expect(s.queue[0]?.verdict.signals?.question).toBe(0.97);
    expect(s.queue[1]?.verdict.signals).toBeUndefined();
    // an id that is nowhere keeps the same lists
    const same = reduce(s, { type: 'mod:signals', id: 'nope', signals: { question: 0.5, techIssue: 0 } });
    expect(same.queue).toBe(s.queue);
  });

  it('tracks library updates, play latency, attention and late Jev signals', () => {
    let s = reduce(initialState(), { type: 'sfx:library', library });
    s = reduce(s, { type: 'sfx:played', playId: 'p1', soundId: 's1', latencyMs: 14 });
    expect(s.sfxLatency.s1).toBe(14);
    const item: AttentionItem = {
      messageId: 'm1',
      kind: 'techIssue',
      score: 0.94,
      login: 'ana',
      displayName: 'ana',
      text: 'sem áudio aqui',
      at: 1,
    };
    s = reduce(s, { type: 'mod:attention', item });
    expect(s.attention).toHaveLength(1);
    s = reduce(s, { type: 'mod:log', item: message('m1') });
    s = reduce(s, { type: 'mod:signals', id: 'm1', signals: { question: 0.9, techIssue: 0.94 } });
    expect(s.log[0]?.verdict.signals?.techIssue).toBe(0.94);
  });

  it('ignores events it does not know', () => {
    const s0 = initialState();
    expect(reduce(s0, { type: 'tts:skip' })).toBe(s0);
  });
});

describe('helpers', () => {
  it('splits the server error format into problem and fix, both starting with a capital letter', () => {
    expect(splitError('Erro: aparelho não pareado — Solução: escaneie o QR code')).toEqual({
      title: 'Aparelho não pareado',
      fix: 'Escaneie o QR code',
    });
    expect(splitError('Erro: sem conexão com o servidor — Solução: confira se o stream95 está rodando no PC')).toEqual({
      title: 'Sem conexão com o servidor',
      fix: 'Confira se o stream95 está rodando no PC',
    });
    expect(splitError('Erro: o servidor respondeu 500')).toEqual({ title: 'O servidor respondeu 500' });
    expect(splitError('falhou')).toEqual({ title: 'Falhou' });
    expect(splitError('')).toEqual({ title: '' });
  });

  it('names devices from the user agent', () => {
    expect(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) Version/18.4 Mobile Safari/604.1')).toBe(
      'iPhone · Safari',
    );
    expect(deviceName('Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile Safari/537.36')).toBe('Android · Chrome');
  });

  it('knows when the deck runs on the PC itself', () => {
    expect(isLocalHost('localhost')).toBe(true);
    expect(isLocalHost('192.168.0.10')).toBe(false);
  });

  it('formats times', () => {
    expect(mmss(125_000)).toBe('2:05');
    expect(ago(1000, 1000)).toBe('agora');
    expect(ago(0, 180_000)).toBe('há 3 min');
  });
});
