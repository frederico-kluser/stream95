import type { Logger } from './log.js';

const BASE_URL = 'https://openrouter.ai/api/v1';
/** Decision models (Jev & co.) answer here, outside the /api/v1 prefix. */
const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';

export type ChatMessageParam = { role: 'system' | 'user' | 'assistant'; content: string };

export type ChatRequest = {
  /** Primary model first; the rest are OpenRouter-side fallbacks (`models` array). */
  models: string[];
  messages: ChatMessageParam[];
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  /** Total budget for the call, including retries. */
  timeoutMs?: number;
  /** Prefer the provider with the lowest latency (disables price load balancing). */
  sortByLatency?: boolean;
};

export type ChatResult = { content: string; model: string; costUsd: number; latencyMs: number };

/** Typed question for a decision model: pick one option, a yes/no probability, or a level on a scale. */
export type DecisionQuestion =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'noul'; instructions: string; criteria?: { true: string; false: string } }
  | { type: 'score'; instructions: string; criteria: string[] };

export type DecisionAnswer =
  | { type: 'choice'; choice: string; probabilities?: Record<string, number>; confidence?: number }
  | { type: 'noul'; noul: number }
  | { type: 'score'; score: number; probabilities?: Record<string, number>; confidence?: number };

export type DecisionRequest = {
  model: string;
  /** What the model judges. Objects with named fields work best; keep unrelated detail out. */
  state: unknown;
  questions: Record<string, DecisionQuestion>;
  timeoutMs?: number;
};

export type DecisionResult = {
  answers: Record<string, DecisionAnswer>;
  /** Exact dated build that answered (log it: thresholds belong to a build). */
  model: string;
  costUsd: number;
  latencyMs: number;
};

export type SpeechRequest = {
  model: string;
  input: string;
  voice: string;
  languageCode?: string;
  timeoutMs?: number;
};

export type SpeechResult = { audio: Buffer; generationId: string | null; costUsd: number; latencyMs: number };

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'OpenRouterError';
  }
}

/** USD per character for ElevenLabs via OpenRouter (list price per 1M chars). Used only to estimate spend. */
const TTS_PRICE_PER_CHAR: Record<string, number> = {
  'elevenlabs/eleven-flash-v2.5': 20e-6,
  'elevenlabs/eleven-turbo-v2.5': 20e-6,
  'elevenlabs/eleven-flash-v2': 20e-6,
  'elevenlabs/eleven-v4-turbo': 20e-6,
  'elevenlabs/eleven-v3-conversational': 20e-6,
  'elevenlabs/eleven-v4': 40e-6,
  'elevenlabs/eleven-v3': 40e-6,
  'elevenlabs/eleven-multilingual-v2': 40e-6,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type OpenRouterOptions = {
  apiKey?: string;
  title: string;
  referer: string;
  log: Logger;
  fetchImpl?: typeof fetch;
  onSpend?: (totalUsd: number) => void;
};

/** Thin OpenRouter client: chat completions + text-to-speech, with retries, deadlines and spend tracking. */
export class OpenRouter {
  private spent = 0;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: OpenRouterOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get configured(): boolean {
    return Boolean(this.opts.apiKey);
  }

  get spentUsd(): number {
    return this.spent;
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const [primary] = req.models;
    if (!primary) throw new OpenRouterError('nenhum modelo informado');
    const body: Record<string, unknown> = {
      model: primary,
      messages: req.messages,
      max_tokens: req.maxTokens ?? 300,
      temperature: req.temperature ?? 0,
    };
    if (req.models.length > 1) body.models = req.models;
    if (req.json) body.response_format = { type: 'json_object' };
    if (req.sortByLatency) body.provider = { sort: 'latency' };

    const started = Date.now();
    const { bytes } = await this.post('/chat/completions', body, req.timeoutMs ?? 15000);
    // biome-ignore lint/suspicious/noExplicitAny: provider payloads are loosely typed
    let data: any;
    try {
      data = JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new OpenRouterError('resposta não-JSON do OpenRouter', 502, true);
    }
    // Provider errors may arrive with HTTP 200 and an `error` object in the body.
    if (data?.error) throw new OpenRouterError(String(data.error.message ?? 'erro do provider'), data.error.code, true);
    const content = String(data?.choices?.[0]?.message?.content ?? '').trim();
    const costUsd = Number(data?.usage?.cost ?? 0) || 0;
    this.addSpend(costUsd);
    return { content, model: String(data?.model ?? primary), costUsd, latencyMs: Date.now() - started };
  }

  /** Decisions API: typed answers with probabilities, billed by input tokens only. */
  async decide(req: DecisionRequest): Promise<DecisionResult> {
    const started = Date.now();
    const { bytes } = await this.post(
      DECISIONS_URL,
      { model: req.model, state: req.state, questions: req.questions },
      req.timeoutMs ?? 5000,
    );
    // biome-ignore lint/suspicious/noExplicitAny: provider payloads are loosely typed
    let data: any;
    try {
      data = JSON.parse(bytes.toString('utf8'));
    } catch {
      throw new OpenRouterError('resposta não-JSON da API de decisões', 502, true);
    }
    if (data?.error) throw new OpenRouterError(String(data.error.message ?? 'erro do provider'), data.error.code, true);
    if (!data?.answers || typeof data.answers !== 'object') {
      throw new OpenRouterError('API de decisões respondeu sem "answers"', 502, true);
    }
    const costUsd = Number(data?.usage?.cost ?? 0) || 0;
    this.addSpend(costUsd);
    return {
      answers: data.answers as Record<string, DecisionAnswer>,
      model: String(data.model ?? req.model),
      costUsd,
      latencyMs: Date.now() - started,
    };
  }

  async speech(req: SpeechRequest): Promise<SpeechResult> {
    const body: Record<string, unknown> = {
      model: req.model,
      input: req.input,
      voice: req.voice,
      // The API default is raw PCM — always ask for mp3 explicitly.
      response_format: 'mp3',
    };
    if (req.languageCode) body.provider = { options: { elevenlabs: { language_code: req.languageCode } } };
    const started = Date.now();
    const { bytes, headers } = await this.post('/audio/speech', body, req.timeoutMs ?? 20000);
    const type = headers.get('content-type') ?? '';
    if (!type.startsWith('audio/')) {
      throw new OpenRouterError(
        `TTS devolveu ${type || 'sem content-type'}: ${bytes.toString('utf8').slice(0, 200)}`,
        502,
      );
    }
    const costUsd = (TTS_PRICE_PER_CHAR[req.model] ?? 20e-6) * req.input.length;
    this.addSpend(costUsd);
    return { audio: bytes, generationId: headers.get('x-generation-id'), costUsd, latencyMs: Date.now() - started };
  }

  private addSpend(usd: number): void {
    if (!usd) return;
    this.spent += usd;
    this.opts.onSpend?.(this.spent);
  }

  /** POST with a total deadline; retries 429/5xx honouring Retry-After (capped by the deadline). */
  private async post(path: string, body: unknown, timeoutMs: number): Promise<{ bytes: Buffer; headers: Headers }> {
    if (!this.opts.apiKey) throw new OpenRouterError('OPENROUTER_API_KEY não configurada', 401);
    const deadline = Date.now() + timeoutMs;
    for (let attempt = 0; ; attempt++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new OpenRouterError(`timeout após ${timeoutMs} ms`, 408, true);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), remaining);
      try {
        const url = path.startsWith('https://') ? path : `${BASE_URL}${path}`;
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.opts.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': this.opts.referer,
            'X-OpenRouter-Title': this.opts.title,
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        const bytes = Buffer.from(await res.arrayBuffer());
        if (res.ok) return { bytes, headers: res.headers };
        const retryable = res.status === 429 || res.status >= 500;
        const wait = retryAfterMs(res.headers) ?? 300 * 2 ** attempt;
        if (retryable && attempt < 2 && Date.now() + wait < deadline) {
          this.opts.log.warn({ status: res.status, wait }, 'openrouter: retrying');
          await sleep(wait);
          continue;
        }
        throw new OpenRouterError(`HTTP ${res.status}: ${bytes.toString('utf8').slice(0, 300)}`, res.status, retryable);
      } catch (err) {
        if (err instanceof OpenRouterError) throw err;
        if ((err as Error).name === 'AbortError') throw new OpenRouterError(`timeout após ${timeoutMs} ms`, 408, true);
        throw new OpenRouterError(`falha de rede: ${(err as Error).message}`, undefined, true);
      } finally {
        clearTimeout(timer);
      }
    }
  }
}

function retryAfterMs(headers: Headers): number | null {
  const v = headers.get('retry-after');
  if (!v) return null;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(v);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}
