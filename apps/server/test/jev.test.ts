import {
  defaultSettings,
  type ModeratedMessage,
  type ModerationSettings,
  type ModerationVerdict,
} from '@stream95/shared';
import { describe, expect, it } from 'vitest';
import { silentLogger } from '../src/log.js';
import { attentionFor } from '../src/moderation/attention.js';
import { type JevAnalysis, JevModerator, jevReason, parseJevAnswers, routeJev } from '../src/moderation/jev.js';
import { type JevAnalyzer, type LlmClassifier, ModerationPipeline } from '../src/moderation/pipeline.js';
import { type DecisionAnswer, OpenRouter } from '../src/openrouter.js';
import { chatMsg } from './helpers.js';

const answers = (
  acao: string,
  p: { mostrar: number; revisar: number; barrar: number },
  extra: { categoria?: string; pergunta?: number; problema_tecnico?: number } = {},
): Record<string, DecisionAnswer> => ({
  acao: { type: 'choice', choice: acao, probabilities: p, confidence: 0.9 },
  categoria: { type: 'choice', choice: extra.categoria ?? 'ok', probabilities: {}, confidence: 0.9 },
  pergunta: { type: 'noul', noul: extra.pergunta ?? 0.05 },
  problema_tecnico: { type: 'noul', noul: extra.problema_tecnico ?? 0.02 },
});

/** Fake fetch answering the Decisions API. */
function decisionFetch(body: Record<string, DecisionAnswer> | string, status = 200) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
    if (typeof body === 'string') return new Response(body, { status });
    return new Response(
      JSON.stringify({
        id: 'gen-dec-1',
        model: 'typesafe/jev-1.14-20261014',
        provider: 'TypeSafe',
        answers: body,
        usage: { input_tokens: 808, output_tokens: 170, cost: 0.000034 },
      }),
      { status, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  return { impl, calls };
}

const analysis = (over: Partial<JevAnalysis> = {}): JevAnalysis => ({
  action: 'allow',
  probabilities: { allow: 0.98, review: 0.01, block: 0.01 },
  confidence: 0.97,
  category: 'ok',
  signals: { question: 0.05, techIssue: 0.02 },
  model: 'typesafe/jev-1.14-20261014',
  latencyMs: 350,
  costUsd: 0.000034,
  ...over,
});

function fakeJev(result: JevAnalysis | Error) {
  const calls: string[] = [];
  const jev: JevAnalyzer = {
    available: true,
    analyze: async (text) => {
      calls.push(text);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { jev, calls };
}

function fakeLlm(result: Partial<ModerationVerdict> | Error) {
  const calls: string[] = [];
  const llm: LlmClassifier = {
    available: true,
    classify: async (text) => {
      calls.push(text);
      if (result instanceof Error) throw result;
      return { decision: 'allow', category: 'ok', reason: 'ok', by: 'llm', ...result };
    },
  };
  return { llm, calls };
}

function pipelineWith(jev: JevAnalyzer | null, llm: LlmClassifier | null, over: Partial<ModerationSettings> = {}) {
  const settings = { ...defaultSettings().moderation, ...over };
  return new ModerationPipeline(() => settings, llm, silentLogger, { jev });
}

/** A message the local rules pass to the AI (not trivial, no links, no blocked terms). */
const NORMAL = 'qual tema você usa no editor de código?';

describe('parseJevAnswers', () => {
  it('maps actions, probabilities, categories and signals', () => {
    const a = parseJevAnswers(
      answers('barrar', { mostrar: 0, revisar: 0.01, barrar: 0.99 }, { categoria: 'assedio', pergunta: 0.03 }),
    );
    expect(a.action).toBe('block');
    expect(a.probabilities).toEqual({ allow: 0, review: 0.01, block: 0.99 });
    expect(a.category).toBe('harassment');
    expect(a.signals).toEqual({ question: 0.03, techIssue: 0.02 });
  });

  it('treats a missing answer, a wrong type or an unknown option as an error', () => {
    const ok = answers('mostrar', { mostrar: 1, revisar: 0, barrar: 0 });
    expect(() => parseJevAnswers({ ...ok, acao: undefined as unknown as DecisionAnswer })).toThrow(/acao/);
    expect(() => parseJevAnswers({ ...ok, pergunta: { type: 'choice', choice: 'x' } })).toThrow(/pergunta/);
    expect(() => parseJevAnswers({ ...ok, acao: { type: 'choice', choice: 'talvez' } })).toThrow(/talvez/);
  });

  it('puts all the mass on the chosen option when probabilities are absent', () => {
    const a = parseJevAnswers({
      ...answers('revisar', { mostrar: 0, revisar: 1, barrar: 0 }),
      acao: { type: 'choice', choice: 'revisar' },
    });
    expect(a.probabilities).toEqual({ allow: 0, review: 1, block: 0 });
  });
});

describe('routeJev', () => {
  const t = { jevBlockAt: 0.6, jevAllowAt: 0.7 };
  it('decides alone only when sure', () => {
    expect(
      routeJev(analysis({ action: 'block', probabilities: { allow: 0, review: 0.1, block: 0.9 } }), t, false),
    ).toBe('block');
    expect(routeJev(analysis(), t, false)).toBe('allow');
    expect(
      routeJev(analysis({ action: 'block', probabilities: { allow: 0.1, review: 0.4, block: 0.5 } }), t, false),
    ).toBe('ambiguous');
    expect(
      routeJev(analysis({ action: 'allow', probabilities: { allow: 0.6, review: 0.3, block: 0.1 } }), t, false),
    ).toBe('ambiguous');
  });

  it('never auto-allows a message with a sensitive term', () => {
    expect(routeJev(analysis(), t, true)).toBe('ambiguous');
  });

  it('explains the decision in Portuguese', () => {
    expect(
      jevReason(
        analysis({ action: 'block', category: 'harassment', probabilities: { allow: 0, review: 0, block: 0.99 } }),
      ),
    ).toBe('Jev: barrar 99% · assédio');
  });
});

describe('JevModerator', () => {
  it('calls the Decisions API with a pinned model and caches repeated messages', async () => {
    const { impl, calls } = decisionFetch(answers('mostrar', { mostrar: 1, revisar: 0, barrar: 0 }));
    const client = new OpenRouter({ apiKey: 'test', title: 't', referer: 'r', log: silentLogger, fetchImpl: impl });
    const jev = new JevModerator(client, () => 'typesafe/jev-1.14', silentLogger);
    const a = await jev.analyze('Qual tema você usa?', 2000);
    const first = calls[0]!;
    expect(first.url).toBe('https://openrouter.ai/api/alpha/decisions');
    expect(first.body.model).toBe('typesafe/jev-1.14');
    expect((first.body.state as { mensagem: string }).mensagem).toBe('Qual tema você usa?');
    expect(Object.keys(first.body.questions as object)).toEqual(['acao', 'categoria', 'pergunta', 'problema_tecnico']);
    expect(a.model).toBe('typesafe/jev-1.14-20261014');
    expect(client.spentUsd).toBeCloseTo(0.000034);
    const again = await jev.analyze('qual tema voce usa?', 2000);
    expect(calls).toHaveLength(1);
    expect(again.costUsd).toBe(0);
  });

  it('turns non-JSON and error bodies into errors', async () => {
    for (const body of ['<html>', '{"error":{"message":"overloaded","code":503}}']) {
      const { impl } = decisionFetch(body);
      const client = new OpenRouter({ apiKey: 'k', title: 't', referer: 'r', log: silentLogger, fetchImpl: impl });
      await expect(new JevModerator(client, () => 'm', silentLogger).analyze('oi', 2000)).rejects.toThrow();
    }
  });
});

describe('ModerationPipeline with Jev', () => {
  it('blocks and shows on its own when Jev is sure, without calling the LLM', async () => {
    const { llm, calls: llmCalls } = fakeLlm({ decision: 'allow' });
    const blocker = fakeJev(
      analysis({ action: 'block', category: 'harassment', probabilities: { allow: 0, review: 0, block: 1 } }),
    );
    const r1 = await pipelineWith(blocker.jev, llm).process(chatMsg(NORMAL));
    expect(r1.status).toBe('rejected');
    expect(r1.verdict.by).toBe('jev');
    expect(r1.verdict.probabilities?.block).toBe(1);
    const r2 = await pipelineWith(fakeJev(analysis()).jev, llm).process(chatMsg(NORMAL));
    expect(r2.status).toBe('shown');
    expect(llmCalls).toHaveLength(0);
  });

  it('lets the LLM confirm a block, but never release what Jev wanted reviewed', async () => {
    const unsure = analysis({
      action: 'review',
      category: 'hate',
      probabilities: { allow: 0.09, review: 0.51, block: 0.4 },
    });
    const confirmed = await pipelineWith(
      fakeJev(unsure).jev,
      fakeLlm({ decision: 'block', category: 'hate' }).llm,
    ).process(chatMsg(NORMAL));
    expect(confirmed.status).toBe('rejected');
    expect(confirmed.verdict.by).toBe('llm');
    expect(confirmed.verdict.reason).toContain('Jev: revisar 51%');
    const released = await pipelineWith(fakeJev(unsure).jev, fakeLlm({ decision: 'allow' }).llm).process(
      chatMsg(NORMAL),
    );
    expect(released.status).toBe('held');
  });

  it('lets the LLM decide when Jev leaned to show but was unsure', async () => {
    const leaning = analysis({ probabilities: { allow: 0.6, review: 0.3, block: 0.1 } });
    const r = await pipelineWith(fakeJev(leaning).jev, fakeLlm({ decision: 'allow' }).llm).process(chatMsg(NORMAL));
    expect(r.status).toBe('shown');
    expect(r.verdict.by).toBe('llm');
  });

  it('holds ambiguous messages when there is no second opinion', async () => {
    const unsure = analysis({ action: 'review', probabilities: { allow: 0.2, review: 0.6, block: 0.2 } });
    const r = await pipelineWith(fakeJev(unsure).jev, fakeLlm({}).llm, { escalateToLlm: false }).process(
      chatMsg(NORMAL),
    );
    expect(r.status).toBe('held');
    expect(r.verdict.reason).toContain('incerto');
  });

  it('falls back to the LLM when Jev fails, and to the queue when both are gone', async () => {
    const down = fakeJev(new Error('timeout após 2500 ms'));
    const viaLlm = await pipelineWith(down.jev, fakeLlm({ decision: 'allow', reason: 'ok' }).llm).process(
      chatMsg(NORMAL),
    );
    expect(viaLlm.verdict.by).toBe('llm');
    expect(viaLlm.status).toBe('shown');
    const queued = await pipelineWith(down.jev, null).process(chatMsg(NORMAL));
    expect(queued.status).toBe('held');
    expect(queued.verdict.reason).toContain('Jev indisponível');
  });

  it('skips Jev when the engine is the LLM', async () => {
    const j = fakeJev(analysis());
    await pipelineWith(j.jev, fakeLlm({}).llm, { engine: 'llm', analyzeAll: false }).process(chatMsg(NORMAL));
    expect(j.calls).toHaveLength(0);
  });

  it('reads every comment: trivial and trusted messages get signals in the background', async () => {
    const j = fakeJev(analysis({ signals: { question: 0.1, techIssue: 0.94 } }));
    const p = pipelineWith(j.jev, fakeLlm({}).llm);
    const seen: ModeratedMessage[] = [];
    const got = new Promise<void>((resolve) =>
      p.on('signals', (m) => {
        seen.push(m);
        if (seen.length === 2) resolve();
      }),
    );
    const trivial = await p.process(chatMsg('kkkkkkk'));
    const mod = await p.process(chatMsg('sem áudio aqui, alguém mais?', { isMod: true, login: 'mod1' }));
    expect(trivial.status).toBe('shown');
    expect(mod.verdict.by).toBe('trusted');
    await got;
    expect(seen.map((m) => m.verdict.signals?.techIssue)).toEqual([0.94, 0.94]);
    expect(j.calls).toEqual(['kkkkkkk', 'sem áudio aqui, alguém mais?']);
  });

  it('does not analyze in the background when analyzeAll is off', async () => {
    const j = fakeJev(analysis());
    await pipelineWith(j.jev, null, { analyzeAll: false }).process(chatMsg('kkkkkkk'));
    await new Promise((r) => setTimeout(r, 0));
    expect(j.calls).toHaveLength(0);
  });
});

describe('attentionFor', () => {
  const msg = (over: Partial<ModeratedMessage> = {}): ModeratedMessage => ({
    ...chatMsg('sem áudio aqui, alguém mais?'),
    status: 'shown',
    decidedAt: 1,
    verdict: { decision: 'allow', category: 'ok', reason: '', by: 'jev', signals: { question: 0.9, techIssue: 0.94 } },
    ...over,
  });

  it('raises a technical problem first, then the question', () => {
    expect(attentionFor(msg(), 0.8, 42).map((a) => [a.kind, a.score, a.at])).toEqual([
      ['techIssue', 0.94, 42],
      ['question', 0.9, 42],
    ]);
    expect(attentionFor(msg(), 0.95)).toEqual([]);
  });

  it('ignores the streamer and messages that never reached the chat', () => {
    expect(attentionFor(msg({ isBroadcaster: true }), 0.5)).toEqual([]);
    expect(attentionFor(msg({ status: 'rejected' }), 0.5)).toEqual([]);
  });
});
