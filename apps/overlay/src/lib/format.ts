import type { EmoteRange } from '@stream95/shared';

export const mmss = (ms: number): string => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** `at` is the code-point offset of the part — a stable React key. */
export type TextPart =
  | { kind: 'text'; text: string; at: number }
  | { kind: 'emote'; id: string; name: string; at: number };

/** Split a chat message into text and Twitch emote parts (emote ranges are code-point indexes). */
export function splitEmotes(text: string, emotes: EmoteRange[]): TextPart[] {
  if (emotes.length === 0) return [{ kind: 'text', text, at: 0 }];
  const chars = Array.from(text);
  const parts: TextPart[] = [];
  let cursor = 0;
  for (const e of [...emotes].sort((a, b) => a.start - b.start)) {
    if (e.start < cursor || e.start >= chars.length) continue;
    if (e.start > cursor) parts.push({ kind: 'text', text: chars.slice(cursor, e.start).join(''), at: cursor });
    parts.push({ kind: 'emote', id: e.id, name: chars.slice(e.start, e.end + 1).join(''), at: e.start });
    cursor = e.end + 1;
  }
  if (cursor < chars.length) parts.push({ kind: 'text', text: chars.slice(cursor).join(''), at: cursor });
  return parts;
}

export const emoteUrl = (id: string, scale: '1.0' | '2.0' | '3.0' = '2.0') =>
  `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/${scale}`;

/** Twitch name colors can be unreadable on white; darken the brightest ones a bit. */
export function readableColor(hex: string | undefined, fallback = '#000080'): string {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return fallback;
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (lum < 170) return hex;
  const k = 170 / lum;
  const h = (v: number) =>
    Math.round(v * k)
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export const usd = (v: number) => `US$ ${v < 0.01 ? v.toFixed(4) : v.toFixed(2)}`;
