import type { AttentionItem, ModeratedMessage } from '@stream95/shared';

/**
 * Alerts for the dock / stream deck from Jev's signals: a reported technical problem first,
 * then an open question. The streamer's own messages are not alerts, and blocked or expired
 * messages reach no one.
 */
export function attentionFor(m: ModeratedMessage, threshold: number, now = Date.now()): AttentionItem[] {
  const s = m.verdict.signals;
  if (!s || m.isBroadcaster || m.status === 'rejected' || m.status === 'expired') return [];
  return (['techIssue', 'question'] as const)
    .filter((kind) => s[kind] >= threshold)
    .map((kind) => ({
      messageId: m.id,
      kind,
      score: s[kind],
      login: m.login,
      displayName: m.displayName,
      text: m.text,
      at: now,
    }));
}
