import type { ModerationCategory, ModerationSignals } from '@stream95/shared';
import type { Logger } from '../log.js';
import type { DecisionAnswer, DecisionQuestion, OpenRouter } from '../openrouter.js';
import { normalizeForMatch } from './normalize.js';

/**
 * Jev (TypeSafe) is a "System One" decision model: it does not write text, it answers typed
 * questions about a state with probabilities. One request per chat message answers four
 * independent questions in parallel (~0.4 s, input tokens only).
 *
 * Limits we design around (docs.typesafe.ai model limits + docs/research.md):
 * - text that argues for its own classification can move the answer → rules run first and
 *   ambiguous answers go to the LLM or to a human;
 * - one judgment per question, criteria written as plain extensions of the instructions;
 * - the model id is pinned (never the ~latest alias), because thresholds belong to a build.
 */

/** Kept short on purpose: unrelated state lowers decision accuracy. */
const CONTEXT = 'Chat ao vivo de uma live de programação na Twitch, em português do Brasil.';

/** Validated live in docs/moderation-benchmark.md. Option keys are neutral PT-BR words. */
export const JEV_QUESTIONS: Record<string, DecisionQuestion> = {
  acao: {
    type: 'choice',
    instructions: 'O que o moderador deve fazer com esta mensagem do chat antes de ela aparecer na live?',
    criteria: {
      mostrar:
        'Mensagem normal de chat: conversa, pergunta, piada, elogio, crítica educada, gíria ou palavrão leve que não ataca ninguém.',
      revisar:
        'Caso duvidoso que um humano deve olhar antes: provocação ou ofensa velada, autopromoção ou link desconhecido, pedido de dinheiro, dado pessoal, menção a autolesão.',
      barrar:
        'Não pode aparecer: insulto ou xingamento contra uma pessoa, ódio ou preconceito contra um grupo, ameaça, assédio sexual, golpe ou spam de venda.',
    },
  },
  categoria: {
    type: 'choice',
    instructions: 'Qual é o principal tipo de conteúdo desta mensagem do chat?',
    criteria: {
      ok: 'Conteúdo normal, sem problema.',
      assedio: 'Insulto, xingamento ou humilhação contra uma pessoa.',
      odio: 'Ódio ou preconceito contra um grupo (raça, origem, gênero, orientação, religião, deficiência).',
      sexual: 'Conteúdo sexual explícito ou assédio sexual.',
      violencia: 'Ameaça ou incentivo à violência.',
      autolesao: 'Menção a suicídio ou autolesão.',
      spam: 'Propaganda, autopromoção, venda de seguidores ou repetição.',
      golpe: 'Golpe, phishing ou pedido de dinheiro suspeito.',
      dados_pessoais: 'Expõe dado pessoal como endereço, telefone, CPF ou e-mail.',
    },
  },
  pergunta: {
    type: 'noul',
    instructions: 'A mensagem é uma pergunta que espera resposta do streamer ou do chat?',
  },
  problema_tecnico: {
    type: 'noul',
    instructions: 'A mensagem avisa um problema técnico na transmissão, como áudio, vídeo, tela, atraso ou chat?',
  },
};

const CATEGORY: Record<string, ModerationCategory> = {
  ok: 'ok',
  assedio: 'harassment',
  odio: 'hate',
  sexual: 'sexual',
  violencia: 'violence',
  autolesao: 'self_harm',
  spam: 'spam',
  golpe: 'scam',
  dados_pessoais: 'personal_data',
};

const ACTION = { mostrar: 'allow', revisar: 'review', barrar: 'block' } as const;
type JevAction = (typeof ACTION)[keyof typeof ACTION];

export type JevAnalysis = {
  action: JevAction;
  probabilities: { allow: number; review: number; block: number };
  confidence: number;
  category: ModerationCategory;
  signals: ModerationSignals;
  model: string;
  latencyMs: number;
  costUsd: number;
};

const prob = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
};

function expectChoice(a: DecisionAnswer | undefined, name: string) {
  if (a?.type !== 'choice' || typeof a.choice !== 'string') {
    throw new Error(`Jev: resposta inesperada para "${name}"`);
  }
  return a;
}

function expectNoul(a: DecisionAnswer | undefined, name: string): number {
  if (a?.type !== 'noul' || typeof a.noul !== 'number') throw new Error(`Jev: resposta inesperada para "${name}"`);
  return prob(a.noul);
}

/** Validates and maps Jev's answers. A missing key or an unexpected type is an error, never a default. */
export function parseJevAnswers(
  answers: Record<string, DecisionAnswer>,
): Omit<JevAnalysis, 'model' | 'latencyMs' | 'costUsd'> {
  const acao = expectChoice(answers.acao, 'acao');
  const action = ACTION[acao.choice as keyof typeof ACTION];
  if (!action) throw new Error(`Jev: ação desconhecida "${acao.choice}"`);
  const p = acao.probabilities;
  const probabilities = p
    ? { allow: prob(p.mostrar), review: prob(p.revisar), block: prob(p.barrar) }
    : // probabilities are optional in the schema: fall back to "all mass on the chosen option"
      { allow: action === 'allow' ? 1 : 0, review: action === 'review' ? 1 : 0, block: action === 'block' ? 1 : 0 };
  const categoria = expectChoice(answers.categoria, 'categoria');
  return {
    action,
    probabilities,
    confidence: prob(acao.confidence ?? 1),
    category: CATEGORY[categoria.choice] ?? 'other',
    signals: {
      question: expectNoul(answers.pergunta, 'pergunta'),
      techIssue: expectNoul(answers.problema_tecnico, 'problema_tecnico'),
    },
  };
}

export type JevRouting = 'allow' | 'block' | 'ambiguous';

/**
 * Jev decides alone only when it is sure. Everything else is ambiguous and goes to the LLM
 * (second opinion) or to the streamer's queue — see resolveAmbiguous in the pipeline.
 */
export function routeJev(
  a: JevAnalysis,
  t: { jevBlockAt: number; jevAllowAt: number },
  suspicious: boolean,
): JevRouting {
  if (a.action === 'block' && a.probabilities.block >= t.jevBlockAt) return 'block';
  if (a.action === 'allow' && a.probabilities.allow >= t.jevAllowAt && !suspicious) return 'allow';
  return 'ambiguous';
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

const CATEGORY_PT: Record<ModerationCategory, string> = {
  ok: 'ok',
  harassment: 'assédio',
  hate: 'ódio',
  sexual: 'sexual',
  violence: 'violência',
  self_harm: 'autolesão',
  spam: 'spam',
  scam: 'golpe',
  personal_data: 'dados pessoais',
  links: 'links',
  caps: 'caixa alta',
  flood: 'flood',
  blocklist: 'termo bloqueado',
  length: 'tamanho',
  other: 'outro',
};

/** Short human reason for the dock, e.g. "Jev: barrar 99% · assédio". */
export function jevReason(a: JevAnalysis): string {
  const label = a.action === 'allow' ? 'mostrar' : a.action === 'review' ? 'revisar' : 'barrar';
  const p =
    a.action === 'allow'
      ? a.probabilities.allow
      : a.action === 'review'
        ? a.probabilities.review
        : a.probabilities.block;
  return `Jev: ${label} ${pct(p)}${a.category !== 'ok' ? ` · ${CATEGORY_PT[a.category]}` : ''}`;
}

export class JevModerator {
  private readonly cache = new Map<string, JevAnalysis>();

  constructor(
    private readonly client: OpenRouter,
    private readonly model: () => string,
    private readonly log: Logger,
    private readonly cacheSize = 500,
  ) {}

  get available(): boolean {
    return this.client.configured;
  }

  async analyze(text: string, timeoutMs: number): Promise<JevAnalysis> {
    const key = normalizeForMatch(text);
    const cached = this.cache.get(key);
    if (cached) return { ...cached, latencyMs: 0, costUsd: 0 };

    const result = await this.client.decide({
      model: this.model(),
      state: { contexto: CONTEXT, mensagem: text.slice(0, 600) },
      questions: JEV_QUESTIONS,
      timeoutMs,
    });
    const analysis: JevAnalysis = {
      ...parseJevAnswers(result.answers),
      model: result.model,
      latencyMs: result.latencyMs,
      costUsd: result.costUsd,
    };
    if (this.cache.size >= this.cacheSize) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(key, analysis);
    this.log.debug({ model: result.model, ms: result.latencyMs, action: analysis.action }, 'jev moderation');
    return analysis;
  }
}
