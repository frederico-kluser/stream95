import { createHash, randomUUID } from 'node:crypto';
import type { TtsItem, TtsKind, TtsSettings } from '@stream95/shared';
import type { Logger } from '../log.js';
import type { OpenRouter } from '../openrouter.js';

export type SpeakRequest = {
  kind: TtsKind;
  text: string;
  voice: string;
  user?: string;
  messageId?: string;
  /** Bypass per-user cooldown and queue limits (dock / assistant). */
  priority?: boolean;
};

type Audio = { buffer: Buffer; createdAt: number };

/**
 * Text-to-speech through OpenRouter (ElevenLabs). Audio is synthesized here,
 * kept in memory for a few minutes and played by the single "audio" overlay,
 * which pulls it from /api/tts/:id.mp3 — so the API key never reaches the browser.
 */
export class TtsService {
  private readonly audio = new Map<string, Audio>();
  private readonly cache = new Map<string, Buffer>();
  private readonly lastByUser = new Map<string, number>();
  private pending = 0;

  constructor(
    private readonly client: OpenRouter,
    private readonly model: () => string,
    private readonly settings: () => TtsSettings,
    private readonly publish: (item: TtsItem) => void,
    private readonly log: Logger,
  ) {}

  get available(): boolean {
    return this.client.configured;
  }

  get queued(): number {
    return this.pending;
  }

  getAudio(id: string): Buffer | null {
    return this.audio.get(id)?.buffer ?? null;
  }

  /** Returns the published item, or a reason string when the request was skipped. */
  async speak(req: SpeakRequest): Promise<TtsItem | string> {
    const s = this.settings();
    if (!this.available) return 'sem OPENROUTER_API_KEY';
    const text = req.text.trim();
    if (!text) return 'texto vazio';
    if (!req.priority) {
      if (!s.enabled) return 'TTS desligado';
      if (this.pending >= s.maxQueue) return 'fila cheia';
      if (req.user) {
        const last = this.lastByUser.get(req.user) ?? 0;
        if (Date.now() - last < s.userCooldownSec * 1000) return 'cooldown do usuário';
        this.lastByUser.set(req.user, Date.now());
      }
    }

    this.pending++;
    try {
      const buffer = await this.synthesize(text, req.voice);
      const id = randomUUID();
      this.audio.set(id, { buffer, createdAt: Date.now() });
      this.gc();
      const item: TtsItem = {
        id,
        kind: req.kind,
        text,
        voice: req.voice,
        url: `/api/tts/${id}.mp3`,
        ...(req.user ? { user: req.user } : {}),
        ...(req.messageId ? { messageId: req.messageId } : {}),
      };
      this.publish(item);
      return item;
    } catch (err) {
      this.log.warn({ err: (err as Error).message }, 'tts failed');
      return `falha no TTS: ${(err as Error).message.slice(0, 120)}`;
    } finally {
      this.pending--;
    }
  }

  /** Free audio the player already finished. */
  done(id: string): void {
    this.audio.delete(id);
  }

  private async synthesize(text: string, voice: string): Promise<Buffer> {
    const model = this.model();
    const key = createHash('sha1').update(`${model}|${voice}|${text}`).digest('hex');
    const hit = this.cache.get(key);
    if (hit) return hit;
    const { audio } = await this.client.speech({ model, input: text, voice, languageCode: 'pt', timeoutMs: 20_000 });
    if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(key, audio);
    return audio;
  }

  private gc(): void {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [id, a] of this.audio) if (a.createdAt < cutoff) this.audio.delete(id);
  }
}
