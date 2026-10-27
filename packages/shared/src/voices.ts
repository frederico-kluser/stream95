/**
 * ElevenLabs premade voices accepted by OpenRouter's /audio/speech endpoint.
 * Verified one by one against the live API on 2026-10-27 (rachel, aria and
 * charlotte returned HTTP 400 and are intentionally absent).
 * All of them speak Portuguese with the multilingual models (flash v2.5, v3, v4).
 */
export const TTS_VOICES = [
  'george',
  'sarah',
  'adam',
  'bella',
  'roger',
  'laura',
  'charlie',
  'callum',
  'river',
  'liam',
  'alice',
  'matilda',
  'will',
  'jessica',
  'eric',
  'chris',
  'brian',
  'daniel',
  'lily',
  'bill',
] as const;

export type TtsVoice = (typeof TTS_VOICES)[number];

/** Stable voice for a viewer: the same login always gets the same voice. */
export function voiceForUser(login: string, pool: readonly TtsVoice[] = TTS_VOICES): TtsVoice {
  let hash = 2166136261;
  for (const ch of login.toLowerCase()) {
    hash ^= ch.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return pool[Math.abs(hash) % pool.length] as TtsVoice;
}
