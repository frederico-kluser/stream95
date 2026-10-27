import { defaultSettings, type ModerationSettings } from '@stream95/shared';
import { describe, expect, it } from 'vitest';
import { silentLogger } from '../src/log.js';
import { LlmModerator, parseVerdict } from '../src/moderation/llm.js';
import { ModerationPipeline } from '../src/moderation/pipeline.js';
import { OpenRouter } from '../src/openrouter.js';
import { chatMsg, fakeOpenRouterFetch } from './helpers.js';

function build(content: string | ((b: unknown) => string), over: Partial<ModerationSettings> = {}, fetchOpts = {}) {
  const { impl, calls } = fakeOpenRouterFetch(content, fetchOpts);
  const client = new OpenRouter({ apiKey: 'test', title: 't', referer: 'r', log: silentLogger, fetchImpl: impl });
  const llm = new LlmModerator(client, () => ['m/primary', 'm/fallback'], silentLogger);
  const settings = { ...defaultSettings().moderation, ...over };
  const pipeline = new ModerationPipeline(() => settings, llm, silentLogger);
  return { pipeline, calls, client };
}

describe('parseVerdict', () => {
  it('accepts fenced JSON and normalizes unknown categories', () => {
    expect(parseVerdict('```json\n{"decision":"block","category":"hate","reason":"x"}\n```').decision).toBe('block');
    expect(parseVerdict('{"decision":"allow","category":"banana"}').category).toBe('ok');
    expect(parseVerdict('{"decision":"review","category":"banana"}').category).toBe('other');
    expect(() => parseVerdict('sem json')).toThrow();
  });
});

describe('ModerationPipeline', () => {
  it('shows a message the LLM allows and sends both models as fallback', async () => {
    const { pipeline, calls } = build('{"decision":"allow","category":"ok","reason":"ok"}');
    const r = await pipeline.process(chatMsg('alguém sabe usar o git rebase?'));
    expect(r.status).toBe('shown');
    expect(r.verdict.by).toBe('llm');
    expect(pipeline.chat).toHaveLength(1);
    expect((calls[0] as { models: string[] }).models).toEqual(['m/primary', 'm/fallback']);
  });

  it('holds and rejects according to the LLM', async () => {
    const { pipeline } = build((b) =>
      JSON.stringify(b).includes('lixo') ? '{"decision":"block","category":"harassment"}' : '{"decision":"review"}',
    );
    expect((await pipeline.process(chatMsg('seu lixo humano'))).status).toBe('rejected');
    expect((await pipeline.process(chatMsg('hmm sei não hein'))).status).toBe('held');
    expect(pipeline.queue).toHaveLength(1);
  });

  it('skips the LLM for trivial messages and trusted users', async () => {
    const { pipeline, calls } = build('{"decision":"block"}');
    expect((await pipeline.process(chatMsg('boa noite chat'))).status).toBe('shown');
    expect((await pipeline.process(chatMsg('qualquer coisa', { isMod: true }))).verdict.by).toBe('trusted');
    expect(calls).toHaveLength(0);
  });

  it('falls back to review when the LLM fails or times out', async () => {
    const failing = build('{}', {}, { status: 500 });
    const r1 = await failing.pipeline.process(chatMsg('pergunta normal sobre rust'));
    expect(r1.status).toBe('held');
    expect(r1.verdict.by).toBe('fallback');

    const slow = build('{"decision":"allow"}', { llmTimeoutMs: 500 }, { delayMs: 2000 });
    const r2 = await slow.pipeline.process(chatMsg('outra pergunta normal'));
    expect(r2.status).toBe('held');
  });

  it('can allow on LLM failure when configured (unless suspicious)', async () => {
    const { pipeline } = build('{}', { onLlmError: 'allow' }, { status: 503 });
    expect((await pipeline.process(chatMsg('pergunta normal sobre go'))).status).toBe('shown');
    expect((await pipeline.process(chatMsg('vai te catar seu otario'))).status).toBe('held');
  });

  it('holds suspicious terms when the LLM is off', async () => {
    const { pipeline } = build('{"decision":"allow"}', { llm: false });
    expect((await pipeline.process(chatMsg('isso é coisa de corno'))).status).toBe('held');
    expect((await pipeline.process(chatMsg('código limpo é vida'))).status).toBe('shown');
  });

  it('manual mode holds everything except trusted users', async () => {
    const { pipeline } = build('{"decision":"allow"}', { mode: 'manual' });
    expect((await pipeline.process(chatMsg('oi'))).status).toBe('held');
    expect((await pipeline.process(chatMsg('oi', { isBroadcaster: true }))).status).toBe('shown');
  });

  it('holds first-time chatters when enabled', async () => {
    const { pipeline } = build('{"decision":"allow"}', { holdFirstTimeChatters: true });
    const r = await pipeline.process(chatMsg('primeira vez aqui!', { isFirst: true }));
    expect(r.status).toBe('held');
    expect(r.verdict.reason).toContain('primeira mensagem');
  });

  it('approves and rejects from the queue, with session trust/block', async () => {
    const { pipeline } = build('{"decision":"review"}');
    const a = await pipeline.process(chatMsg('mensagem ambígua um', { login: 'joao' }));
    const b = await pipeline.process(chatMsg('mensagem ambígua dois', { login: 'zeca' }));
    const shown: string[] = [];
    pipeline.on('shown', (m) => shown.push(m.id));
    expect(pipeline.approve(a.id, true)?.status).toBe('shown');
    expect(shown).toEqual([a.id]);
    expect((await pipeline.process(chatMsg('agora sou confiável', { login: 'joao' }))).verdict.by).toBe('trusted');
    expect(pipeline.reject(b.id, true)?.status).toBe('rejected');
    expect((await pipeline.process(chatMsg('voltei', { login: 'zeca' }))).status).toBe('rejected');
    expect(pipeline.approve('nope')).toBeNull();
  });

  it('removes messages deleted on Twitch and everything from timed-out users', async () => {
    const { pipeline } = build('{"decision":"allow"}');
    const removed: string[][] = [];
    pipeline.on('removed', (ids) => removed.push(ids));
    const m1 = await pipeline.process(chatMsg('mensagem número um', { login: 'x' }));
    await pipeline.process(chatMsg('mensagem número dois', { login: 'x' }));
    pipeline.removeMessage(m1.id);
    expect(pipeline.chat).toHaveLength(1);
    pipeline.removeByUser('X');
    expect(pipeline.chat).toHaveLength(0);
    expect(removed.flat()).toHaveLength(2);
  });

  it('expires held messages after the configured time', async () => {
    const { pipeline } = build('{"decision":"review"}', { queueExpireMin: 1 });
    await pipeline.process(chatMsg('fica na fila'));
    pipeline.expire(Date.now() + 2 * 60_000);
    expect(pipeline.queue).toHaveLength(0);
    expect(pipeline.history.at(-1)?.status).toBe('expired');
  });

  it('caches identical verdicts', async () => {
    const { pipeline, calls } = build('{"decision":"allow"}');
    await pipeline.process(chatMsg('mesma pergunta sobre docker', { login: 'a' }));
    await pipeline.process(chatMsg('mesma pergunta sobre docker', { login: 'b' }));
    expect(calls).toHaveLength(1);
  });
});
