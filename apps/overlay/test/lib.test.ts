import type { ModeratedMessage } from '@stream95/shared';
import { describe, expect, it } from 'vitest';
import { holesClipPath } from '../src/components/Widgets';
import { holeClipPath } from '../src/components/Win';
import { mmss, readableColor, splitEmotes } from '../src/lib/format';
import { initialState, reduce } from '../src/lib/stream';

const msg = (id: string, over: Partial<ModeratedMessage> = {}): ModeratedMessage => ({
  id,
  channel: 'c',
  userId: 'u',
  login: 'ana',
  displayName: 'Ana',
  text: 'oi',
  emotes: [],
  badges: [],
  isBroadcaster: false,
  isMod: false,
  isVip: false,
  isSub: false,
  isFirst: false,
  isHighlighted: false,
  timestamp: 0,
  source: 'twitch',
  verdict: { decision: 'allow', category: 'ok', reason: '', by: 'rules' },
  status: 'shown',
  decidedAt: 0,
  ...over,
});

describe('stream reducer', () => {
  it('appends, de-duplicates and removes chat lines', () => {
    let s = initialState();
    s = reduce(s, { type: 'chat:show', message: msg('a') });
    s = reduce(s, { type: 'chat:show', message: msg('b') });
    s = reduce(s, { type: 'chat:show', message: msg('a', { text: 'editado' }) });
    expect(s.chat.map((m) => m.id)).toEqual(['b', 'a']);
    s = reduce(s, { type: 'chat:remove', ids: ['b'] });
    expect(s.chat.map((m) => m.id)).toEqual(['a']);
    s = reduce(s, { type: 'chat:clear' });
    expect(s.chat).toEqual([]);
  });

  it('keeps state identity for transient events', () => {
    const s = initialState();
    expect(reduce(s, { type: 'bsod', title: 't', message: 'm' })).toBe(s);
  });
});

describe('format helpers', () => {
  it('splits Twitch emotes by code point', () => {
    expect(splitEmotes('olá Kappa mundo', [{ id: '25', start: 4, end: 8 }])).toEqual([
      { kind: 'text', text: 'olá ', at: 0 },
      { kind: 'emote', id: '25', name: 'Kappa', at: 4 },
      { kind: 'text', text: ' mundo', at: 9 },
    ]);
  });

  it('darkens unreadable bright name colors and keeps dark ones', () => {
    expect(readableColor('#FFFF00')).not.toBe('#FFFF00');
    expect(readableColor('#000080')).toBe('#000080');
    expect(readableColor(undefined)).toBe('#000080');
  });

  it('formats countdowns', () => {
    expect(mmss(61_000)).toBe('01:01');
    expect(mmss(-5)).toBe('00:00');
  });
});

describe('transparent holes', () => {
  it('cuts the hole relative to the window', () => {
    const clip = holeClipPath({ x: 10, y: 10, w: 100, h: 80 }, { x: 20, y: 40, w: 50, h: 30 });
    expect(clip).toContain('polygon(evenodd');
    expect(clip).toContain('10px 30px, 10px 60px, 60px 60px, 60px 30px');
  });

  it('cuts every OBS source out of the desktop', () => {
    const clip = holesClipPath([
      { x: 20, y: 36, w: 576, h: 324 },
      { x: 700, y: 30, w: 200, h: 100 },
    ]);
    expect(clip.match(/0 0/g)?.length).toBeGreaterThanOrEqual(3);
    expect(clip).toContain('20px 36px, 20px 360px, 596px 360px, 596px 36px');
  });
});
