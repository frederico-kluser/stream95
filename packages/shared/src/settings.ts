import { z } from 'zod';
import { DEFAULT_ASSISTANT_PERSONA } from './persona.js';
import { TTS_VOICES } from './voices.js';

// Zod 4: `.default()` returns the default value as-is; `.prefault()` parses it,
// which is what we want for nested objects so their inner defaults apply.

export const SocialSchema = z.object({
  label: z.string().min(1).max(24),
  value: z.string().min(1).max(64),
  url: z.string().url().optional(),
  /** Chat command that prints this social (without the "!"). */
  command: z
    .string()
    .regex(/^[a-z0-9_]+$/)
    .optional(),
});

export const ModerationSettingsSchema = z.object({
  /** auto = local rules + LLM decide; manual = everything waits for you; off = only hard local rules. */
  mode: z.enum(['auto', 'manual', 'off']).default('auto'),
  llm: z.boolean().default(true),
  trustBroadcaster: z.boolean().default(true),
  trustMods: z.boolean().default(true),
  trustVips: z.boolean().default(true),
  trustSubs: z.boolean().default(false),
  /** Off by default: on a small channel it would hold every new viewer's first "oi". */
  holdFirstTimeChatters: z.boolean().default(false),
  /** What to do when the LLM fails or times out. */
  onLlmError: z.enum(['review', 'allow']).default('review'),
  llmTimeoutMs: z.number().int().min(500).max(15000).default(3500),
  allowedLinkDomains: z
    .array(z.string())
    .default([
      'github.com',
      'gist.github.com',
      'frederico-kluser.com',
      'twitch.tv',
      'clips.twitch.tv',
      'youtube.com',
      'youtu.be',
      'developer.mozilla.org',
      'stackoverflow.com',
      'npmjs.com',
      'wikipedia.org',
    ]),
  /** Extra blocked terms (case/accent insensitive), on top of the built-in lists. */
  blockedTerms: z.array(z.string()).default([]),
  maxLength: z.number().int().min(20).max(500).default(400),
  /** Uppercase letters ratio above which a long message is held. */
  capsRatio: z.number().min(0.3).max(1).default(0.75),
  /** Same user, same text within this window counts as flood. */
  floodWindowSec: z.number().int().min(5).max(600).default(30),
  /** Held messages are dropped after this many minutes without a decision. */
  queueExpireMin: z.number().int().min(1).max(120).default(15),
});

export const TtsSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  /** all = every approved message; command = only !tts; subs = subscribers/VIPs/mods; highlight = channel-point highlights. */
  mode: z.enum(['all', 'command', 'subs', 'highlight']).default('command'),
  voice: z.enum(TTS_VOICES).default('george'),
  voicePerUser: z.boolean().default(true),
  readUsername: z.boolean().default(true),
  maxChars: z.number().int().min(20).max(400).default(180),
  volume: z.number().min(0).max(1).default(0.9),
  userCooldownSec: z.number().int().min(0).max(600).default(30),
  maxQueue: z.number().int().min(1).max(50).default(8),
});

export const AssistantSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  name: z.string().min(1).max(24).default('Clippy'),
  /** clippy.js agent shown in the overlay. */
  agent: z
    .enum(['Clippy', 'Merlin', 'Rover', 'Links', 'Bonzi', 'Peedy', 'Genie', 'Genius', 'Rocky', 'F1'])
    .default('Clippy'),
  persona: z.string().min(20).max(4000).default(DEFAULT_ASSISTANT_PERSONA),
  speak: z.boolean().default(true),
  voice: z.enum(TTS_VOICES).default('callum'),
  replyInChat: z.boolean().default(true),
  maxAnswerChars: z.number().int().min(60).max(500).default(260),
  userCooldownSec: z.number().int().min(0).max(600).default(30),
  globalCooldownSec: z.number().int().min(0).max(120).default(6),
});

export const AlertSettingsSchema = z.object({
  sound: z.boolean().default(true),
  durationMs: z.number().int().min(2000).max(30000).default(7000),
  /** Raids with at least this many viewers get the full-screen "blue screen" treatment. */
  bsodRaidThreshold: z.number().int().min(1).default(20),
  speak: z.boolean().default(true),
});

export const OverlaySettingsSchema = z.object({
  /** React95 theme used by every overlay (file name under @react95/core/themes). */
  theme: z.string().default('win95'),
  chatMaxMessages: z.number().int().min(3).max(50).default(14),
  /** Hide chat messages after N seconds (0 = keep). */
  chatFadeSec: z.number().int().min(0).max(600).default(0),
  startingTitle: z.string().max(80).default('A live já vai começar'),
  startingMinutes: z.number().int().min(1).max(60).default(5),
  brbTitle: z.string().max(80).default('Volto já!'),
  endingTitle: z.string().max(80).default('Valeu demais por assistir!'),
  timezone: z.string().default('America/Sao_Paulo'),
});

export const SettingsSchema = z.object({
  channel: z.string().min(2).max(40).default('frederico_kluser'),
  moderation: ModerationSettingsSchema.prefault({}),
  tts: TtsSettingsSchema.prefault({}),
  assistant: AssistantSettingsSchema.prefault({}),
  alerts: AlertSettingsSchema.prefault({}),
  overlay: OverlaySettingsSchema.prefault({}),
  socials: z
    .array(SocialSchema)
    .max(8)
    .default([
      { label: 'Discord', value: 'Ondokai', command: 'discord' },
      { label: 'LinkedIn', value: 'frederico-kluser', command: 'linkedin' },
      { label: 'Site', value: 'frederico-kluser.com', url: 'https://frederico-kluser.com', command: 'site' },
      { label: 'GitHub', value: 'frederico-kluser', url: 'https://github.com/frederico-kluser', command: 'github' },
    ]),
  pomodoro: z
    .object({
      focusMin: z.number().int().min(1).max(180).default(25),
      breakMin: z.number().int().min(1).max(60).default(5),
    })
    .prefault({}),
  github: z
    .object({
      enabled: z.boolean().default(true),
      user: z.string().default('frederico-kluser'),
      pollSec: z.number().int().min(60).max(3600).default(90),
    })
    .prefault({}),
});

export type Social = z.infer<typeof SocialSchema>;
export type ModerationSettings = z.infer<typeof ModerationSettingsSchema>;
export type TtsSettings = z.infer<typeof TtsSettingsSchema>;
export type AssistantSettings = z.infer<typeof AssistantSettingsSchema>;
export type AlertSettings = z.infer<typeof AlertSettingsSchema>;
export type OverlaySettings = z.infer<typeof OverlaySettingsSchema>;
export type Settings = z.infer<typeof SettingsSchema>;

/** Full defaults, useful for tests and first boot. */
export const defaultSettings = (): Settings => SettingsSchema.parse({});

/** Deep-merge a partial patch over the current settings and validate the result. */
export function mergeSettings(current: Settings, patch: unknown): Settings {
  const merged = deepMerge(JSON.parse(JSON.stringify(current)) as Record<string, unknown>, patch);
  return SettingsSchema.parse(merged);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge(target: Record<string, unknown>, patch: unknown): Record<string, unknown> {
  if (!isPlainObject(patch)) return target;
  for (const [key, value] of Object.entries(patch)) {
    const existing = target[key];
    target[key] = isPlainObject(existing) && isPlainObject(value) ? deepMerge(existing, value) : value;
  }
  return target;
}

/** Settings that are safe to send to overlays (everything here is non-secret by design). */
export type PublicSettings = Settings;
