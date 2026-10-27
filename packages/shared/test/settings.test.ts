import { describe, expect, it } from 'vitest';
import { defaultSettings, mergeSettings, SettingsSchema, TTS_VOICES, voiceForUser } from '../src/index.js';

describe('settings', () => {
  it('fills every nested default from an empty object', () => {
    const s = defaultSettings();
    expect(s.moderation.mode).toBe('auto');
    expect(s.moderation.allowedLinkDomains).toContain('github.com');
    expect(s.tts.enabled).toBe(false);
    expect(s.tts.voice).toBe('george');
    expect(s.assistant.name).toBe('Clippy');
    expect(s.overlay.theme).toBe('win95');
    expect(s.socials.length).toBeGreaterThan(0);
  });

  it('deep-merges a partial patch without losing siblings', () => {
    const s = mergeSettings(defaultSettings(), { tts: { enabled: true }, moderation: { capsRatio: 0.9 } });
    expect(s.tts.enabled).toBe(true);
    expect(s.tts.voice).toBe('george');
    expect(s.moderation.capsRatio).toBe(0.9);
    expect(s.moderation.mode).toBe('auto');
  });

  it('rejects invalid values', () => {
    expect(() => mergeSettings(defaultSettings(), { tts: { voice: 'rachel' } })).toThrow();
    expect(() => SettingsSchema.parse({ moderation: { mode: 'yolo' } })).toThrow();
  });

  it('replaces arrays instead of merging them', () => {
    const s = mergeSettings(defaultSettings(), { moderation: { blockedTerms: ['foo'] } });
    expect(s.moderation.blockedTerms).toEqual(['foo']);
  });
});

describe('voiceForUser', () => {
  it('is stable and always returns a known voice', () => {
    const a = voiceForUser('LucasBR');
    expect(voiceForUser('lucasbr')).toBe(a);
    expect(TTS_VOICES).toContain(a);
  });

  it('spreads different users across voices', () => {
    const voices = new Set(['ana', 'bia', 'caio', 'duda', 'enzo', 'fabi', 'gabi', 'hugo'].map((u) => voiceForUser(u)));
    expect(voices.size).toBeGreaterThan(3);
  });
});
