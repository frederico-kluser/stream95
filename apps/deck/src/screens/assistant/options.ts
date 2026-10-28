import type { AssistantSettings, TtsSettings } from '@stream95/shared';
import type { Option } from './kit/settings';

/** Animated characters available on the overlay, with what each one looks like. */
export const AGENTS: readonly Option<AssistantSettings['agent']>[] = [
  { value: 'Clippy', label: 'Clippy', detail: 'clipe de papel' },
  { value: 'Merlin', label: 'Merlin', detail: 'mago' },
  { value: 'Rover', label: 'Rover', detail: 'cachorro' },
  { value: 'Links', label: 'Links', detail: 'gato' },
  { value: 'Bonzi', label: 'Bonzi', detail: 'macaco' },
  { value: 'Peedy', label: 'Peedy', detail: 'papagaio' },
  { value: 'Genie', label: 'Genie', detail: 'gênio da lâmpada' },
  { value: 'Genius', label: 'Genius', detail: 'cientista' },
  { value: 'Rocky', label: 'Rocky', detail: 'cachorro' },
  { value: 'F1', label: 'F1', detail: 'robô' },
];

/** Animations every character has and that read well while talking (same list as the server). */
export const ANIMATIONS: readonly Option<string>[] = [
  { value: 'Explain', label: 'Explicando' },
  { value: 'Thinking', label: 'Pensando' },
  { value: 'GetTechy', label: 'Modo técnico' },
  { value: 'Writing', label: 'Escrevendo' },
  { value: 'CheckingSomething', label: 'Conferindo' },
  { value: 'Searching', label: 'Procurando' },
  { value: 'GetAttention', label: 'Chamando atenção' },
  { value: 'Congratulate', label: 'Comemorando' },
];

export type TtsMode = TtsSettings['mode'];

/** Who gets read aloud, in the order of the segmented control. */
export const TTS_MODES: readonly { value: TtsMode; label: string; detail: string }[] = [
  { value: 'command', label: '!tts', detail: 'Lê só quem escrever !tts e a mensagem.' },
  { value: 'all', label: 'Todas', detail: 'Lê toda mensagem aprovada, além do !tts.' },
  { value: 'subs', label: 'Inscritos', detail: 'Lê só inscritos, VIPs e moderadores.' },
  { value: 'highlight', label: 'Destaques', detail: 'Lê só mensagens destacadas com pontos do canal.' },
];

/** "george" → "George". */
export const voiceLabel = (voice: string): string => voice.charAt(0).toUpperCase() + voice.slice(1);
