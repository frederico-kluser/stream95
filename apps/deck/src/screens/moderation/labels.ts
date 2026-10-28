import type {
  ChatMessage,
  MessageStatus,
  ModeratedMessage,
  ModerationCategory,
  ModerationSettings,
  ModerationVerdict,
} from '@stream95/shared';

/** Who decided, as the streamer reads it. */
export const BY_LABEL: Record<ModerationVerdict['by'], string> = {
  rules: 'regras',
  jev: 'Jev',
  llm: 'IA',
  human: 'streamer',
  fallback: 'sem IA',
  trusted: 'confiável',
  disabled: 'moderação desligada',
};

export const CATEGORY_LABEL: Record<ModerationCategory, string> = {
  ok: 'ok',
  harassment: 'assédio',
  hate: 'ódio',
  sexual: 'conteúdo sexual',
  violence: 'violência',
  self_harm: 'autolesão',
  spam: 'spam',
  scam: 'golpe',
  personal_data: 'dados pessoais',
  links: 'link',
  caps: 'caixa alta',
  flood: 'flood',
  blocklist: 'termo bloqueado',
  length: 'mensagem longa',
  other: 'outro',
};

const WORD_CHAR = /[\p{L}\p{N}]/u;
const WORDS = /[\p{L}\p{N}]+/gu;
const lower = (s: string): string => s.toLocaleLowerCase('pt-BR');

/**
 * Index of `phrase` in `text` as whole words, in the case the server writes it ("Jev" is not in
 * "Jevson", and "IA" is not the verb "ia" of an AI's reason); -1 if absent.
 */
function wordIndex(text: string, phrase: string): number {
  if (!phrase) return -1;
  for (let at = text.indexOf(phrase); at !== -1; at = text.indexOf(phrase, at + 1)) {
    if (!WORD_CHAR.test(text.charAt(at - 1)) && !WORD_CHAR.test(text.charAt(at + phrase.length))) return at;
  }
  return -1;
}

/** Lowercase singular, enough to match a category with a reason: "dados pessoais" ~ "dado pessoal". */
function singular(word: string): string {
  const w = lower(word);
  if (w.length <= 4) return w;
  if (/[ãõ]es$/u.test(w)) return `${w.slice(0, -3)}ão`;
  if (/[ae]is$/u.test(w)) return `${w.slice(0, -2)}l`;
  if (w.endsWith('ns')) return `${w.slice(0, -2)}m`;
  return w.endsWith('s') ? w.slice(0, -1) : w;
}

/**
 * Who decided, the category and the reason, without saying a word twice: "confiável" instead of
 * "confiável · confiável", "regras · link fora da lista: x.xyz" instead of "regras · link · link fora…",
 * "Jev · barrar 80% · assédio" instead of "Jev · assédio · Jev: barrar 80% · assédio". The category
 * "outro" says nothing, so it is left out.
 */
export function verdictParts(v: Pick<ModerationVerdict, 'by' | 'category' | 'reason'>): string[] {
  const by = BY_LABEL[v.by];
  let category: string | null = v.category === 'ok' || v.category === 'other' ? null : CATEGORY_LABEL[v.category];
  let reason = (v.reason ?? '').trim(); // older log entries may lack it
  // a reason that opens with who decided drops that part: "Jev: barrar 80%" → "barrar 80%"
  if (wordIndex(reason, by) === 0) reason = reason.slice(by.length).replace(/^[\s:·-]+/u, '');
  // "link fora da lista" already says "link", "possível dado pessoal" already says "dados pessoais"
  const said = new Set((reason.match(WORDS) ?? []).map(singular));
  if (category?.split(' ').some((word) => word.length >= 4 && said.has(singular(word)))) category = null;
  // a reason that names who decided ("termo sensível sem IA: x") goes first, alone
  const parts = wordIndex(reason, by) === -1 ? [by, category, reason] : [reason, category];
  return parts.filter((part): part is string => Boolean(part));
}

/** Where a message stands from the deck's point of view (server statuses plus a few local ones). */
export type RowStatus = MessageStatus | 'pending' | 'removed' | 'command' | 'unknown';

export const STATUS_LABEL: Record<RowStatus, string> = {
  shown: 'exibida',
  held: 'na fila',
  rejected: 'barrada',
  expired: 'expirou',
  pending: 'analisando',
  removed: 'removida',
  command: 'comando',
  unknown: 'sem registro',
};

export type ModerationMode = ModerationSettings['mode'];

export const MODE_LABEL: Record<ModerationMode, string> = {
  auto: 'Automático',
  manual: 'Manual',
  off: 'Só regras',
};

export const MODE_HELP: Record<ModerationMode, string> = {
  auto: 'Regras e IA decidem sozinhas. Só os casos duvidosos esperam você na fila.',
  manual: 'Toda mensagem espera sua aprovação na fila antes de aparecer na live.',
  off: 'Só as regras locais decidem: links, termos bloqueados, flood e caixa alta. A IA fica desligada.',
};

/** Jev's "barrar" chance from which approving needs a hold. */
export const RISKY_BLOCK = 0.25;

export const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Shortens long chat text for notices. */
export const clip = (text: string, max = 90): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** "14:05" */
export const clock = (at: number): string =>
  new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** "em 12 min" / "em menos de 1 min" */
export function inMinutes(ms: number): string {
  const m = Math.floor(ms / 60_000);
  return m < 1 ? 'em menos de 1 min' : `em ${m} min`;
}

/** Latest record of each message in the moderation log (a held message is logged again once decided). */
export function latestById(log: readonly ModeratedMessage[]): Map<string, ModeratedMessage> {
  const map = new Map<string, ModeratedMessage>();
  for (const m of log) map.set(m.id, m);
  return map;
}

/** Decisions newest first, one entry per message. */
export function latestDecisions(log: readonly ModeratedMessage[]): ModeratedMessage[] {
  return [...latestById(log).values()].sort((a, b) => b.decidedAt - a.decidedAt);
}

/** Moderation status of a raw chat message, looked up in what the server reported so far. */
export function statusOfIncoming(
  m: ChatMessage,
  ctx: {
    latest: ReadonlyMap<string, ModeratedMessage>;
    queueIds: ReadonlySet<string>;
    chatIds: ReadonlySet<string>;
    removed: ReadonlySet<string>;
    now: number;
  },
): RowStatus {
  if (ctx.removed.has(m.id)) return 'removed';
  const logged = ctx.latest.get(m.id);
  if (logged) return logged.status;
  if (ctx.queueIds.has(m.id)) return 'held';
  if (ctx.chatIds.has(m.id)) return 'shown';
  // chat commands may be answered without going through moderation
  if (m.text.trimStart().startsWith('!')) return 'command';
  return ctx.now - m.timestamp > 20_000 ? 'unknown' : 'pending';
}
