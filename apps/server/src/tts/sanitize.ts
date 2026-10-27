import type { EmoteRange } from '@stream95/shared';
import { stripEmotes } from '../moderation/normalize.js';

const URL_RE =
  /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|gg|tv|me|br|ly|dev|app)(?:\/\S*)?/gi;

/** Turn a chat message into something pleasant to hear. Returns "" when nothing is left to say. */
export function textForSpeech(text: string, emotes: EmoteRange[], maxChars: number): string {
  let s = stripEmotes(text, emotes);
  s = s.replace(URL_RE, ' link ');
  s = s.replace(/@(\w+)/g, '$1');
  // Laughter: "kkkkkkk", "hahahaha", "rsrsrs", "huehuehue" → short, speakable laughter.
  s = s.replace(/\b(?:k{3,}|(?:ha){2,}h?|(?:he){3,}|(?:rs){2,}|(?:hue){2,})\b/gi, ' haha ');
  // Collapse any character repeated 4+ times ("nãooooo" → "nãoo", "!!!!" → "!").
  s = s.replace(/(\p{L})\1{3,}/gu, '$1$1');
  s = s.replace(/([!?.,])\1+/g, '$1');
  // Drop symbols that TTS reads literally; keep letters, numbers and basic punctuation.
  s = s.replace(/[^\p{L}\p{N}\s.,!?'"()\-:;]/gu, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (!/\p{L}/u.test(s)) return '';
  return truncateAtWord(s, maxChars);
}

export function truncateAtWord(s: string, maxChars: number): string {
  const chars = Array.from(s);
  if (chars.length <= maxChars) return s;
  const cut = chars.slice(0, maxChars).join('');
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,.;:!?-]+$/, '')}...`;
}

/** "Lucas_BR disse: ..." — usernames are spoken without underscores and digits soup. */
export function withSpeaker(displayName: string, body: string): string {
  const name =
    displayName
      .replace(/[_\d]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || displayName;
  return `${name} disse: ${body}`;
}
