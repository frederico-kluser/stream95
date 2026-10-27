import { defaultSettings } from '@stream95/shared';
import { describe, expect, it } from 'vitest';
import { normalizeForMatch, stripEmotes } from '../src/moderation/normalize.js';
import { extractLinks, RuleEngine } from '../src/moderation/rules.js';
import { chatMsg } from './helpers.js';

const settings = defaultSettings().moderation;
const evaluate = (text: string, over = {}) => new RuleEngine().evaluate(chatMsg(text, over), settings);

describe('normalizeForMatch', () => {
  it('folds accents, leetspeak, joiners and repeated letters', () => {
    expect(normalizeForMatch('AÇÃO')).toBe('acao');
    expect(normalizeForMatch('b.o.i.o.l.a')).toBe('boiola');
    expect(normalizeForMatch('b01ola')).toBe('boiola');
    expect(normalizeForMatch('boiolaaaa')).toBe('boiolaa');
  });

  it('strips Twitch emote ranges by code point', () => {
    expect(
      stripEmotes('Kappa haha Kappa', [
        { id: '25', start: 0, end: 4 },
        { id: '25', start: 11, end: 15 },
      ]),
    ).toBe('haha');
  });
});

describe('links', () => {
  it('does not mistake code files for links', () => {
    expect(extractLinks('olha o readme.md e o node.js, main.py, lib.rs, install.sh')).toEqual([]);
  });

  it('finds real links, with or without scheme', () => {
    expect(extractLinks('vejam react.dev e https://bit.ly/x').map((l) => l.host)).toEqual(['react.dev', 'bit.ly']);
    expect(extractLinks('https://github.com/frederico-kluser/stream95')[0]?.host).toBe('github.com');
  });

  it('ignores e-mail domains as links', () => {
    expect(extractLinks('meu email é fulano@gmail.com')).toEqual([]);
  });
});

describe('RuleEngine', () => {
  it('blocks unambiguous slurs, even obfuscated', () => {
    expect(evaluate('seu boiola').kind).toBe('block');
    expect(evaluate('b.o.i.o.l.a').kind).toBe('block');
    expect(evaluate('boiolaaaa').kind).toBe('block');
    expect(evaluate('you are a f4gg0t').kind).toBe('block');
  });

  it('never treats the Portuguese word "negro" as a slur', () => {
    const r = evaluate('o buraco negro do código, tema preto e negro');
    expect(r.kind).toBe('pass');
  });

  it('lets mild profanity through to the LLM instead of blocking it', () => {
    expect(evaluate('porra, funcionou de primeira!').kind).toBe('pass');
  });

  it('flags ambiguous terms as suspicious for the LLM', () => {
    const r = evaluate('esse macaco hidráulico é top');
    expect(r.kind).toBe('pass');
    expect(r.kind === 'pass' && r.suspicious).toContain('macaco');
  });

  it('blocks scams with links and holds unknown links', () => {
    expect(evaluate('compre seguidores baratos em bit.ly/abc').kind).toBe('block');
    expect(evaluate('Best viewers on streamboo .com').kind).not.toBe('pass');
    const r = evaluate('olha esse site daora.xyz/promo');
    expect(r.kind === 'review' && r.category).toBe('links');
    expect(evaluate('repo: https://github.com/frederico-kluser/stream95').kind).toBe('pass');
  });

  it('holds personal data', () => {
    expect(evaluate('meu zap é (11) 98765-4321').kind).toBe('review');
    expect(evaluate('cpf 123.456.789-09').kind).toBe('review');
    expect(evaluate('me manda em fulano@gmail.com').kind).toBe('review');
  });

  it('holds long shouting but not short hype', () => {
    expect(evaluate('GGGG').kind).toBe('safe');
    expect(evaluate('ESSE CÓDIGO ESTÁ MUITO ERRADO MANO ARRUMA ISSO AGORA').kind).toBe('review');
  });

  it('drops duplicates from the same user and flags bursts', () => {
    const engine = new RuleEngine();
    const t0 = 1_000_000;
    expect(engine.evaluate(chatMsg('alguém aí?', { login: 'a' }), settings, t0).kind).toBe('pass');
    expect(engine.evaluate(chatMsg('alguém aí?', { login: 'a' }), settings, t0 + 1000).kind).toBe('block');
    expect(engine.evaluate(chatMsg('alguém aí?', { login: 'b' }), settings, t0 + 1000).kind).toBe('pass');
    for (let i = 0; i < 5; i++) engine.evaluate(chatMsg(`msg numero ${i}`, { login: 'c' }), settings, t0 + i);
    expect(engine.evaluate(chatMsg('mais uma', { login: 'c' }), settings, t0 + 10).kind).toBe('review');
  });

  it('marks greetings and laughter as trivially safe (no LLM call)', () => {
    for (const t of ['kkkkkkk', 'boa noite chat', 'salve', 'GG', 'hahaha', 'o/']) expect(evaluate(t).kind).toBe('safe');
  });

  it('honours custom blocked terms', () => {
    const custom = { ...settings, blockedTerms: ['spoiler do final'] };
    expect(new RuleEngine().evaluate(chatMsg('vou dar spoiler do final'), custom).kind).toBe('block');
  });
});
