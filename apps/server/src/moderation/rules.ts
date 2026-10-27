import type { ChatMessage, ModerationCategory, ModerationSettings } from '@stream95/shared';
import { DataSet, englishDataset, englishRecommendedTransformers, RegExpMatcher } from 'obscenity';
import {
  EXPLICIT_ENGLISH_WORDS,
  FILE_LIKE_TLDS,
  HARD_ENGLISH_WORDS,
  HARD_TERMS_PT,
  LINK_TLDS,
  SCAM_PATTERNS,
  SUSPICIOUS_HOSTS,
  SUSPICIOUS_TERMS_PT,
  TRIVIAL_SAFE,
} from './lists.js';
import { capsRatio, foldAccents, normalizeForMatch, squash, stripEmotes } from './normalize.js';

export type RuleOutcome =
  | { kind: 'block'; category: ModerationCategory; reason: string }
  | { kind: 'review'; category: ModerationCategory; reason: string }
  /** Obviously harmless: no need to ask the LLM. */
  | { kind: 'safe'; reason: string }
  /** Nothing conclusive: the LLM decides (or, without LLM, `suspicious` decides). */
  | { kind: 'pass'; suspicious: string[] };

// ---------------------------------------------------------------------------
// English slurs/explicit terms via `obscenity` (leet/confusable aware).
type Meta = { originalWord: string };
const englishSubset = new DataSet<Meta>().addAll(englishDataset).removePhrasesIf((p) => {
  const w = p.metadata?.originalWord ?? '';
  return !(HARD_ENGLISH_WORDS.has(w) || EXPLICIT_ENGLISH_WORDS.has(w));
});
const englishBuilt = englishSubset.build();
const englishMatcher = new RegExpMatcher({ ...englishBuilt, ...englishRecommendedTransformers });

function englishHits(text: string): string[] {
  return englishMatcher
    .getAllMatches(text)
    .map((m) => englishSubset.getPayloadWithPhraseMetadata(m).phraseMetadata?.originalWord ?? '')
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Portuguese term matching on the normalized text. Each letter may repeat
// ("boiolaaa"), an optional plural "s" is accepted, words are space-separated.
type CompiledTerm = { term: string; re: RegExp; squashed: string };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function compileTerms(terms: readonly string[]): CompiledTerm[] {
  return terms
    .map((t) => normalizeForMatch(t))
    .filter((t) => t.length >= 2)
    .map((t) => {
      const body = t
        .split(' ')
        .map((word) =>
          Array.from(word)
            .map((ch) => `${escapeRe(ch)}+`)
            .join(''),
        )
        .join('\\s+');
      return { term: t, re: new RegExp(`(?:^|\\s)${body}s?(?=\\s|$)`, 'u'), squashed: squash(t) };
    });
}

export function findTerms(normalized: string, compiled: readonly CompiledTerm[]): string[] {
  const sq = squash(normalized).replace(/(\p{L})\1+/gu, '$1');
  return compiled
    .filter(
      (c) => c.re.test(normalized) || (c.squashed.length >= 6 && sq.includes(c.squashed.replace(/(\p{L})\1+/gu, '$1'))),
    )
    .map((c) => c.term);
}

const HARD_PT = compileTerms(HARD_TERMS_PT);
const SUSPICIOUS_PT = compileTerms(SUSPICIOUS_TERMS_PT);

// ---------------------------------------------------------------------------
// Links, e-mails and personal data.
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const EMAIL_TEST = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const URL_RE = /(https?:\/\/)?((?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,24}))(\/[^\s]*)?/gi;
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
const PHONE_RE = /(?:\+?55\s?)?\(?\b\d{2}\)?\s?9\d{4}[-\s]?\d{4}\b/;

export type FoundLink = { host: string; explicit: boolean };

export function extractLinks(text: string): FoundLink[] {
  const withoutEmails = text.replace(EMAIL_RE, ' ');
  const links: FoundLink[] = [];
  for (const m of withoutEmails.matchAll(URL_RE)) {
    const scheme = Boolean(m[1]);
    const host = (m[2] ?? '').toLowerCase();
    const tld = (m[3] ?? '').toLowerCase();
    const hasPath = Boolean(m[4]);
    if (!LINK_TLDS.has(tld)) continue;
    const explicit = scheme || host.startsWith('www.') || hasPath;
    if (FILE_LIKE_TLDS.has(tld) && !explicit) continue;
    links.push({ host: host.replace(/^www\./, ''), explicit });
  }
  return links;
}

export const hostAllowed = (host: string, allowed: readonly string[]) =>
  allowed.some((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`));

// ---------------------------------------------------------------------------

type HistoryEntry = { text: string; at: number };

/** Stateful local rule engine (keeps a short per-user history for flood detection). */
export class RuleEngine {
  private readonly history = new Map<string, HistoryEntry[]>();
  private customKey = '';
  private custom: CompiledTerm[] = [];

  evaluate(msg: ChatMessage, settings: ModerationSettings, now = Date.now()): RuleOutcome {
    const visible = stripEmotes(msg.text, msg.emotes);
    const normalized = normalizeForMatch(visible);
    const floodHit = this.trackFlood(msg.userId || msg.login, normalized, settings.floodWindowSec, now);

    if (visible.trim().length === 0) return { kind: 'safe', reason: 'só emotes' };

    const hardPt = findTerms(normalized, HARD_PT);
    const custom = findTerms(normalized, this.customTerms(settings.blockedTerms));
    const english = englishHits(visible);
    if (hardPt.length || custom.length) {
      return {
        kind: 'block',
        category: custom.length ? 'blocklist' : 'hate',
        reason: `termo proibido: ${[...hardPt, ...custom][0]}`,
      };
    }
    if (english.length) {
      const explicit = english.some((w) => EXPLICIT_ENGLISH_WORDS.has(w));
      return { kind: 'block', category: explicit ? 'sexual' : 'hate', reason: `termo proibido: ${english[0]}` };
    }

    if (floodHit === 'duplicate') return { kind: 'block', category: 'flood', reason: 'mensagem repetida' };

    const links = extractLinks(visible);
    const folded = foldAccents(visible);
    const scam = SCAM_PATTERNS.some((re) => re.test(folded) || re.test(visible));
    const shady = links.find((l) => SUSPICIOUS_HOSTS.some((h) => l.host === h || l.host.endsWith(`.${h}`)));
    if (scam && (links.length > 0 || shady)) return { kind: 'block', category: 'scam', reason: 'golpe/spam com link' };
    if (scam) return { kind: 'review', category: 'spam', reason: 'parece propaganda' };
    if (shady) return { kind: 'review', category: 'links', reason: `link encurtado/convite: ${shady.host}` };
    const foreign = links.find((l) => !hostAllowed(l.host, settings.allowedLinkDomains));
    if (foreign) return { kind: 'review', category: 'links', reason: `link fora da lista: ${foreign.host}` };

    if (EMAIL_TEST.test(visible) || CPF_RE.test(visible) || PHONE_RE.test(visible)) {
      return { kind: 'review', category: 'personal_data', reason: 'possível dado pessoal (e-mail/telefone/CPF)' };
    }

    if (Array.from(visible).length > settings.maxLength) {
      return { kind: 'review', category: 'length', reason: `mensagem longa (>${settings.maxLength})` };
    }
    if (/(.)\1{39,}/u.test(visible)) return { kind: 'review', category: 'spam', reason: 'caractere repetido demais' };

    const caps = capsRatio(visible);
    if (caps.letters >= 25 && caps.ratio >= settings.capsRatio) {
      return { kind: 'review', category: 'caps', reason: 'muito CAPS LOCK' };
    }
    if (floodHit === 'burst') return { kind: 'review', category: 'flood', reason: 'muitas mensagens em sequência' };

    const trimmed = visible.trim();
    if (TRIVIAL_SAFE.some((re) => re.test(trimmed))) return { kind: 'safe', reason: 'saudação/reação' };

    return { kind: 'pass', suspicious: findTerms(normalized, SUSPICIOUS_PT) };
  }

  /** Forget a user's history (e.g. after a manual approval). */
  forget(userKey: string): void {
    this.history.delete(userKey);
  }

  private customTerms(terms: readonly string[]): CompiledTerm[] {
    const key = terms.join('\u0000');
    if (key !== this.customKey) {
      this.customKey = key;
      this.custom = compileTerms(terms);
    }
    return this.custom;
  }

  private trackFlood(user: string, normalized: string, windowSec: number, now: number): 'duplicate' | 'burst' | null {
    const windowMs = windowSec * 1000;
    const entries = (this.history.get(user) ?? []).filter((e) => now - e.at <= windowMs);
    const duplicate = normalized.length >= 4 && entries.some((e) => e.text === normalized);
    const burst = entries.filter((e) => now - e.at <= 10_000).length >= 5;
    entries.push({ text: normalized, at: now });
    this.history.set(user, entries.slice(-20));
    if (this.history.size > 5000) this.history.delete(this.history.keys().next().value as string);
    return duplicate ? 'duplicate' : burst ? 'burst' : null;
  }
}
