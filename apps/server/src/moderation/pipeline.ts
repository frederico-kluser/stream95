import type { ChatMessage, ModeratedMessage, ModerationSettings, ModerationVerdict } from '@stream95/shared';
import type { Logger } from '../log.js';
import { type JevModerator, jevReason, routeJev } from './jev.js';
import type { LlmModerator } from './llm.js';
import { RuleEngine } from './rules.js';

/** What the pipeline needs from each AI step (the real classes and test fakes both fit). */
export type LlmClassifier = Pick<LlmModerator, 'available' | 'classify'>;
export type JevAnalyzer = Pick<JevModerator, 'available' | 'analyze'>;

export type PipelineEvents = {
  shown: (m: ModeratedMessage) => void;
  queue: (queue: ModeratedMessage[]) => void;
  decided: (m: ModeratedMessage) => void;
  removed: (ids: string[]) => void;
  /** Jev's signals (question / tech issue) for a message, as soon as they are known. */
  signals: (m: ModeratedMessage) => void;
};

type Listeners = { [K in keyof PipelineEvents]: Set<PipelineEvents[K]> };

/**
 * Every chat message goes through here BEFORE it can reach the overlay:
 * trust → local rules (instant) → Jev on every comment (≈0.4 s) → LLM second opinion only when
 * Jev is unsure (or when Jev is off/unavailable) → show / hold for review / reject.
 */
export class ModerationPipeline {
  private readonly rules = new RuleEngine();
  private readonly shown: ModeratedMessage[] = [];
  private readonly held = new Map<string, ModeratedMessage>();
  private readonly recentLog: ModeratedMessage[] = [];
  private readonly listeners: Listeners = {
    shown: new Set(),
    queue: new Set(),
    decided: new Set(),
    removed: new Set(),
    signals: new Set(),
  };
  private readonly sessionTrusted = new Set<string>();
  private readonly sessionBlocked = new Set<string>();
  private readonly jev: JevAnalyzer | null;
  private readonly keepShown: number;

  constructor(
    private readonly settings: () => ModerationSettings,
    private readonly llm: LlmClassifier | null,
    private readonly logger: Logger,
    opts: { jev?: JevAnalyzer | null; keepShown?: number } = {},
  ) {
    this.jev = opts.jev ?? null;
    this.keepShown = opts.keepShown ?? 50;
  }

  on<K extends keyof PipelineEvents>(event: K, listener: PipelineEvents[K]): () => void {
    (this.listeners[event] as Set<PipelineEvents[K]>).add(listener);
    return () => (this.listeners[event] as Set<PipelineEvents[K]>).delete(listener);
  }

  get chat(): ModeratedMessage[] {
    return [...this.shown];
  }

  get queue(): ModeratedMessage[] {
    return [...this.held.values()].sort((a, b) => a.timestamp - b.timestamp);
  }

  /** Last decisions (shown, held, rejected, expired) for the dock's audit view. */
  get history(): ModeratedMessage[] {
    return [...this.recentLog];
  }

  /** Decide what happens to a message. Resolves with the final (or pending) state. */
  async process(msg: ChatMessage): Promise<ModeratedMessage> {
    const verdict = await this.judge(msg);
    let status: ModeratedMessage['status'] =
      verdict.decision === 'allow' ? 'shown' : verdict.decision === 'review' ? 'held' : 'rejected';

    const s = this.settings();
    if (status === 'shown' && s.holdFirstTimeChatters && msg.isFirst && verdict.by !== 'trusted') {
      verdict.decision = 'review';
      verdict.reason = `primeira mensagem no canal${verdict.reason ? ` (${verdict.reason})` : ''}`;
      status = 'held';
    }
    const item: ModeratedMessage = { ...msg, verdict, status, decidedAt: Date.now() };
    this.record(item);
    if (status === 'shown') this.show(item);
    if (status === 'held') {
      this.held.set(item.id, item);
      this.emitQueue();
    }
    if (item.verdict.signals) this.emit('signals', item);
    else if (status !== 'rejected') this.enrich(item);
    return item;
  }

  /**
   * "Every comment": messages that skipped the AI (greetings, trusted users, rule decisions) are
   * still read by Jev in the background, only to flag questions and technical problems.
   */
  private enrich(item: ModeratedMessage): void {
    const s = this.settings();
    if (!s.analyzeAll || s.engine !== 'jev' || !s.llm || s.mode === 'off' || !this.jev?.available) return;
    this.jev
      .analyze(item.text, s.jevTimeoutMs)
      .then((a) => {
        item.verdict.signals = a.signals;
        this.emit('signals', item);
      })
      .catch((err) => this.logger.debug({ err: (err as Error).message }, 'jev background analysis failed'));
  }

  private async judge(msg: ChatMessage): Promise<ModerationVerdict> {
    const s = this.settings();
    const login = msg.login.toLowerCase();
    if (this.sessionBlocked.has(login)) {
      return { decision: 'block', category: 'other', reason: 'usuário bloqueado nesta sessão', by: 'human' };
    }
    if (
      (msg.isBroadcaster && s.trustBroadcaster) ||
      (msg.isMod && s.trustMods) ||
      this.sessionTrusted.has(login) ||
      msg.source === 'dock'
    ) {
      return { decision: 'allow', category: 'ok', reason: 'confiável', by: 'trusted' };
    }

    const rule = this.rules.evaluate(msg, s);
    if (rule.kind === 'block' || rule.kind === 'review') {
      return { decision: rule.kind, category: rule.category, reason: rule.reason, by: 'rules' };
    }
    if (s.mode === 'manual') {
      return { decision: 'review', category: 'ok', reason: 'modo manual', by: 'rules' };
    }
    if (rule.kind === 'safe') return { decision: 'allow', category: 'ok', reason: rule.reason, by: 'rules' };

    const trustedTier = (msg.isVip && s.trustVips) || (msg.isSub && s.trustSubs);
    const aiOn = s.mode === 'auto' && s.llm;
    const llmUsable = Boolean(aiOn && this.llm?.available);
    const jevUsable = Boolean(aiOn && s.engine === 'jev' && this.jev?.available);
    if (trustedTier || (!llmUsable && !jevUsable)) {
      if (rule.suspicious.length > 0 && !trustedTier) {
        return {
          decision: 'review',
          category: 'other',
          reason: `termo sensível sem IA: ${rule.suspicious[0]}`,
          by: s.mode === 'off' || !s.llm ? 'disabled' : 'fallback',
        };
      }
      return {
        decision: 'allow',
        category: 'ok',
        reason: trustedTier ? 'VIP/inscrito confiável' : 'regras ok',
        by: trustedTier ? 'trusted' : 'rules',
      };
    }

    if (jevUsable) {
      try {
        return await this.judgeWithJev(msg, rule.suspicious.length > 0, llmUsable);
      } catch (err) {
        this.logger.warn({ err: (err as Error).message }, 'jev moderation failed');
        if (!llmUsable) {
          const allow = s.onLlmError === 'allow' && rule.suspicious.length === 0;
          return {
            decision: allow ? 'allow' : 'review',
            category: 'other',
            reason: `Jev indisponível: ${(err as Error).message.slice(0, 80)}`,
            by: 'fallback',
          };
        }
        // otherwise the LLM below decides alone
      }
    }

    try {
      return await this.llm!.classify(msg.text, s.llmTimeoutMs);
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'llm moderation failed');
      const allow = s.onLlmError === 'allow' && rule.suspicious.length === 0;
      return {
        decision: allow ? 'allow' : 'review',
        category: 'other',
        reason: `IA indisponível: ${(err as Error).message.slice(0, 80)}`,
        by: 'fallback',
      };
    }
  }

  /**
   * Jev decides alone only when sure (see routeJev). When it is not:
   * - leaning harmful → the LLM may confirm a block, but never releases what Jev wanted a human to see;
   * - leaning "show" (low confidence or a sensitive term) → the LLM decides;
   * - no LLM → hold for review, unless Jev clearly leaned to "show".
   */
  private async judgeWithJev(msg: ChatMessage, suspicious: boolean, llmUsable: boolean): Promise<ModerationVerdict> {
    const s = this.settings();
    const a = await this.jev!.analyze(msg.text, s.jevTimeoutMs);
    const base = {
      by: 'jev' as const,
      model: a.model,
      latencyMs: a.latencyMs,
      costUsd: a.costUsd,
      probabilities: a.probabilities,
      confidence: a.confidence,
      signals: a.signals,
    };
    const route = routeJev(a, s, suspicious);
    if (route === 'block') return { ...base, decision: 'block', category: a.category, reason: jevReason(a) };
    if (route === 'allow') return { ...base, decision: 'allow', category: 'ok', reason: jevReason(a) };

    const leansHarmful = a.action !== 'allow';
    if (s.escalateToLlm && llmUsable) {
      try {
        const v = await this.llm!.classify(msg.text, s.llmTimeoutMs);
        const decision = leansHarmful ? (v.decision === 'block' ? 'block' : 'review') : v.decision;
        return {
          ...base,
          by: 'llm',
          model: v.model ?? a.model,
          latencyMs: a.latencyMs + (v.latencyMs ?? 0),
          costUsd: a.costUsd + (v.costUsd ?? 0),
          decision,
          category: decision === 'allow' ? 'ok' : v.category !== 'ok' ? v.category : a.category,
          reason: `${jevReason(a)} → IA: ${v.reason}`,
        };
      } catch (err) {
        this.logger.warn({ err: (err as Error).message }, 'llm second opinion failed');
      }
    }
    const allow = !leansHarmful && !suspicious && a.probabilities.block < 0.15;
    return {
      ...base,
      decision: allow ? 'allow' : 'review',
      category: allow ? 'ok' : a.category,
      reason: `${jevReason(a)} (incerto)`,
    };
  }

  /** Human approval from the dock (optionally trusting the user for the rest of the session). */
  approve(id: string, trustUser = false): ModeratedMessage | null {
    const item = this.held.get(id);
    if (!item) return null;
    this.held.delete(id);
    if (trustUser) this.sessionTrusted.add(item.login.toLowerCase());
    const approved: ModeratedMessage = {
      ...item,
      status: 'shown',
      decidedAt: Date.now(),
      verdict: {
        ...item.verdict,
        decision: 'allow',
        by: 'human',
        reason: `aprovada manualmente (${item.verdict.reason})`,
      },
    };
    this.record(approved);
    this.show(approved);
    this.emitQueue();
    return approved;
  }

  reject(id: string, blockUser = false): ModeratedMessage | null {
    const item = this.held.get(id);
    if (!item) return null;
    this.held.delete(id);
    if (blockUser) this.blockUser(item.login);
    const rejected: ModeratedMessage = {
      ...item,
      status: 'rejected',
      decidedAt: Date.now(),
      verdict: { ...item.verdict, decision: 'block', by: 'human' },
    };
    this.record(rejected);
    this.emitQueue();
    return rejected;
  }

  /** Session ban: hide everything from this user and drop their pending messages. */
  blockUser(login: string): void {
    const key = login.toLowerCase();
    this.sessionBlocked.add(key);
    this.sessionTrusted.delete(key);
    this.removeByUser(key);
    let changed = false;
    for (const [id, m] of this.held) {
      if (m.login.toLowerCase() === key) {
        this.held.delete(id);
        changed = true;
      }
    }
    if (changed) this.emitQueue();
  }

  unblockUser(login: string): void {
    this.sessionBlocked.delete(login.toLowerCase());
  }

  /** A message deleted on Twitch (or from the dock) disappears from the overlay and queue. */
  removeMessage(id: string): void {
    const idx = this.shown.findIndex((m) => m.id === id);
    if (idx >= 0) this.shown.splice(idx, 1);
    const wasHeld = this.held.delete(id);
    this.emit('removed', [id]);
    if (wasHeld) this.emitQueue();
  }

  /** Timeouts/bans on Twitch remove every message from that user. */
  removeByUser(login: string): void {
    const key = login.toLowerCase();
    const ids = this.shown.filter((m) => m.login.toLowerCase() === key).map((m) => m.id);
    for (const id of ids) {
      const idx = this.shown.findIndex((m) => m.id === id);
      if (idx >= 0) this.shown.splice(idx, 1);
    }
    let heldChanged = false;
    for (const [id, m] of this.held) {
      if (m.login.toLowerCase() === key) {
        this.held.delete(id);
        ids.push(id);
        heldChanged = true;
      }
    }
    if (ids.length) this.emit('removed', ids);
    if (heldChanged) this.emitQueue();
  }

  clearChat(): void {
    const ids = this.shown.map((m) => m.id);
    this.shown.length = 0;
    if (ids.length) this.emit('removed', ids);
  }

  /** Drop held messages nobody decided on in time. */
  expire(now = Date.now()): void {
    const ttl = this.settings().queueExpireMin * 60_000;
    let changed = false;
    for (const [id, m] of this.held) {
      if (now - m.decidedAt > ttl) {
        this.held.delete(id);
        this.record({ ...m, status: 'expired', decidedAt: now });
        changed = true;
      }
    }
    if (changed) this.emitQueue();
  }

  private show(item: ModeratedMessage): void {
    this.shown.push(item);
    if (this.shown.length > this.keepShown) this.shown.splice(0, this.shown.length - this.keepShown);
    this.emit('shown', item);
  }

  private record(item: ModeratedMessage): void {
    this.recentLog.push(item);
    if (this.recentLog.length > 200) this.recentLog.splice(0, this.recentLog.length - 200);
    this.emit('decided', item);
  }

  private emitQueue(): void {
    this.emit('queue', this.queue);
  }

  private emit<K extends keyof PipelineEvents>(event: K, ...args: Parameters<PipelineEvents[K]>): void {
    for (const l of this.listeners[event] as Set<(...a: Parameters<PipelineEvents[K]>) => void>) {
      try {
        l(...args);
      } catch (err) {
        this.logger.error({ err }, `pipeline listener ${event} failed`);
      }
    }
  }
}
