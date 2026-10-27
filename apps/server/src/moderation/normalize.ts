import type { EmoteRange } from '@stream95/shared';

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'i',
};

/** Lowercase and remove accents ("Ação" → "acao"). */
export function foldAccents(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * Canonical form used to match blocklists: no accents, leetspeak undone,
 * joiners between letters removed ("b.o.i.o.l.a" → "boiola"), other symbols
 * turned into spaces and runs of 3+ equal letters collapsed to two.
 * Masked letters ("f*der") are left to the LLM, which reads context.
 */
export function normalizeForMatch(text: string): string {
  let s = foldAccents(text);
  s = s.replace(/[0134578@$!|]/g, (c) => LEET[c] ?? c);
  s = s.replace(/(\p{L})[*_.-]+(?=\p{L})/gu, '$1');
  s = s.replace(/[^\p{L}\s]/gu, ' ');
  s = s.replace(/(\p{L})\1{2,}/gu, '$1$1');
  return s.replace(/\s+/g, ' ').trim();
}

/** Letters only, no spaces — catches "v i a d o" style evasion for longer terms. */
export function squash(normalized: string): string {
  return normalized.replace(/\s+/g, '');
}

/** Remove Twitch emotes (ranges are code-point indexes, inclusive) from a message. */
export function stripEmotes(text: string, emotes: EmoteRange[]): string {
  if (emotes.length === 0) return text;
  const chars = Array.from(text);
  for (const e of emotes) {
    for (let i = e.start; i <= e.end && i < chars.length; i++) chars[i] = ' ';
  }
  return chars.join('').replace(/\s+/g, ' ').trim();
}

/** Ratio of uppercase among letters (ignores non-letters). */
export function capsRatio(text: string): { letters: number; ratio: number } {
  let letters = 0;
  let upper = 0;
  for (const ch of text) {
    if (/\p{L}/u.test(ch)) {
      letters++;
      if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) upper++;
    }
  }
  return { letters, ratio: letters === 0 ? 0 : upper / letters };
}
