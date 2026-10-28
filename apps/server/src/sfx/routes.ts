import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import multipart from '@fastify/multipart';
import { DEFAULT_PORT, type ServerEvent, type Settings, SFX_COLORS } from '@stream95/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Logger } from '../log.js';
import { SfxError, type SfxErrorCode, type SoundLibrary, type UploadFile } from './library.js';

export const SFX_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
export const SFX_UPLOAD_MAX_FILES = 20;

/** How long a play waits for the audio source to report it (tap-to-sound latency). */
const PLAY_TTL_MS = 30_000;
const MAX_TRACKED_PLAYS = 500;
const IMMUTABLE = 'public, max-age=31536000, immutable';

const STATUS: Record<SfxErrorCode, number> = { invalid: 400, not_found: 404, not_ready: 409, too_large: 413, io: 500 };

const NO_SOUND = 'Erro: som não encontrado — Solução: atualize a lista de sons';
const NOT_READY = 'Erro: o som ainda não está pronto — Solução: aguarde a conversão terminar';
const NO_BUTTON = 'Erro: botão não encontrado — Solução: atualize o painel';
const noAudioSource = (port: number) =>
  `Erro: a fonte de áudio do OBS não está aberta — Solução: abra o OBS na coleção stream95 (fonte /overlay/audio) ou abra http://localhost:${port}/overlay/audio no PC`;

// Portuguese messages: they reach the deck inside "Erro: corpo inválido — Solução: ..."
const codePoints = (s: string) => Array.from(s).length;
const SoundId = z.string({ error: 'informe o id do som' }).regex(/^s[0-9a-z]{1,24}$/, 'id de som inválido');
const ButtonId = z.string({ error: 'informe o id do botão' }).min(1, 'id de botão vazio').max(64, 'id longo demais');
const Label = z
  .string({ error: 'informe o nome do botão' })
  .trim()
  .refine((s) => codePoints(s) >= 1 && codePoints(s) <= 32, 'use de 1 a 32 caracteres');
const Emoji = z
  .string({ error: 'o emoji precisa ser texto' })
  .trim()
  .refine((s) => codePoints(s) <= 8, 'use até 8 caracteres');
const VOLUME_HINT = 'use um número de 0 a 1';
const Volume = z.number({ error: VOLUME_HINT }).min(0, VOLUME_HINT).max(1, VOLUME_HINT);
const Color = z.enum(SFX_COLORS, { error: `use uma destas cores: ${SFX_COLORS.join(', ')}` });

const ButtonCreateBody = z.object({
  label: Label,
  soundId: SoundId.nullable().default(null),
  emoji: Emoji.nullish(),
  color: Color.optional(),
  volume: Volume.optional(),
});
const ButtonPatchBody = z.object({
  label: Label.optional(),
  soundId: SoundId.nullable().optional(),
  emoji: Emoji.nullable().optional(),
  color: Color.optional(),
  volume: Volume.optional(),
});
const OrderBody = z.object({ ids: z.array(ButtonId, { error: 'envie a lista de ids dos botões' }).max(1000) });
const PlayBody = z.union([z.object({ buttonId: ButtonId }), z.object({ soundId: SoundId })], {
  error: 'envie buttonId ou soundId',
});
const IdParams = z.object({ id: z.string().min(1).max(64) });

export type SfxRouteDeps = {
  library: SoundLibrary;
  settings: () => Settings;
  broadcast: (event: ServerEvent) => void;
  log: Logger;
  /**
   * Open audio pages (the OBS source /overlay/audio). When given and 0, a play is refused with 409 right
   * away, instead of the deck waiting for a confirmation that never comes.
   */
  audioClients?: () => number;
};

export type SfxRoutes = {
  /**
   * The audio source reported that a play started. Returns the latency since the tap reached the
   * server (once per playId, within 30 s), or null. It does not broadcast: the caller sends `sfx:played`.
   */
  reportPlayed: (playId: string) => { soundId: string; latencyMs: number } | null;
};

/** Parses a single "bytes=a-b" range; null = no (or unsupported) range, so the whole file is sent. */
function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'invalid' | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (!m[1] && !m[2])) return null;
  let start: number;
  let end: number;
  if (!m[1]) {
    const suffix = Number(m[2]);
    if (suffix === 0) return 'invalid';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  return start > end || start >= size ? 'invalid' : { start, end };
}

function multipartFailure(err: unknown): [number, string] {
  switch ((err as { code?: string })?.code) {
    case 'FST_REQ_FILE_TOO_LARGE':
      return [413, 'Erro: arquivo maior que 50 MB — Solução: envie um áudio menor'];
    case 'FST_FILES_LIMIT':
      return [413, 'Erro: mais de 20 arquivos de uma vez — Solução: envie até 20 por vez'];
    case 'FST_PARTS_LIMIT':
    case 'FST_FIELDS_LIMIT':
      return [413, 'Erro: formulário com campos demais — Solução: envie só os campos "file" e "category"'];
    case 'FST_INVALID_MULTIPART_CONTENT_TYPE':
      return [415, 'Erro: envio sem arquivo — Solução: mande os áudios como multipart/form-data no campo "file"'];
    default:
      return [400, 'Erro: envio incompleto ou corrompido — Solução: tente enviar de novo'];
  }
}

/** Soundboard REST API (see docs/api.md). Library changes are broadcast by the caller via `library.onChange`. */
export function registerSfxRoutes(app: FastifyInstance, deps: SfxRouteDeps): SfxRoutes {
  const { library, broadcast, log, audioClients } = deps;
  /** playId -> sound and when the tap reached the server (insertion order = age). */
  const plays = new Map<string, { soundId: string; at: number }>();

  const fail = (reply: FastifyReply, code: number, message: string) => reply.code(code).send({ error: message });
  const parse = <T>(schema: z.ZodType<T>, body: unknown, reply: FastifyReply): T | null => {
    const r = schema.safeParse(body ?? {});
    if (!r.success) {
      void fail(
        reply,
        400,
        `Erro: corpo inválido — Solução: ${r.error.issues.map((i) => `${i.path.join('.') || 'corpo'}: ${i.message}`).join('; ')}`,
      );
      return null;
    }
    return r.data;
  };
  const failWith = (reply: FastifyReply, err: unknown) => {
    if (err instanceof SfxError) return fail(reply, STATUS[err.code], err.message);
    log.error({ err: (err as Error)?.message ?? String(err) }, 'sfx request failed');
    return fail(reply, 500, 'Erro: falha inesperada no soundboard — Solução: veja o log do servidor e tente de novo');
  };
  const prunePlays = (now: number) => {
    for (const [id, p] of plays) {
      if (now - p.at <= PLAY_TTL_MS && plays.size <= MAX_TRACKED_PLAYS) break;
      plays.delete(id);
    }
  };

  // ------------------------------------------------------------------------------------------ library
  app.get('/api/sfx', async () => library.snapshot());

  app.post('/api/sfx/rescan', async (_req, reply) => {
    try {
      return await library.scan({ retryErrors: true });
    } catch (err) {
      return failWith(reply, err);
    }
  });

  // multipart lives in its own scope, so only the upload route parses multipart/form-data
  void app.register(async (scope) => {
    await scope.register(multipart, {
      limits: {
        fileSize: SFX_UPLOAD_MAX_BYTES,
        files: SFX_UPLOAD_MAX_FILES,
        fields: 10,
        parts: SFX_UPLOAD_MAX_FILES + 10,
      },
    });
    scope.post('/api/sfx/upload', async (req, reply) => {
      if (!req.isMultipart()) {
        return fail(
          reply,
          415,
          'Erro: envio sem arquivo — Solução: mande os áudios como multipart/form-data no campo "file"',
        );
      }
      const files: UploadFile[] = [];
      let category: string | undefined;
      try {
        for await (const part of req.parts()) {
          if (part.type === 'file') {
            // always drain the stream, even for an unexpected field
            const data = await part.toBuffer();
            if (part.fieldname === 'file') files.push({ filename: part.filename, data });
          } else if (part.fieldname === 'category' && typeof part.value === 'string') {
            category = part.value;
          }
        }
      } catch (err) {
        const [code, message] = multipartFailure(err);
        return fail(reply, code, message);
      }
      if (!files.length) {
        return fail(reply, 400, 'Erro: nenhum arquivo no envio — Solução: escolha ao menos um áudio no campo "file"');
      }
      try {
        return { sounds: await library.upload(files, category) };
      } catch (err) {
        return failWith(reply, err);
      }
    });
  });

  app.delete('/api/sfx/sounds/:id', async (req, reply) => {
    const id = SoundId.safeParse((req.params as { id?: unknown }).id);
    if (!id.success) return fail(reply, 404, NO_SOUND);
    try {
      return (await library.deleteSound(id.data)) ? { ok: true } : fail(reply, 404, NO_SOUND);
    } catch (err) {
      return failWith(reply, err);
    }
  });

  // ids only: the file path always comes from the library, never from the request
  app.get('/api/sfx/sounds/:id', async (req, reply) => {
    const match = /^(s[0-9a-z]{1,24})\.wav$/.exec(String((req.params as { id?: unknown }).id ?? ''));
    const id = match?.[1];
    if (!id) return fail(reply, 404, NO_SOUND);
    const wav = library.wavFor(id);
    if (!wav) return library.get(id) ? fail(reply, 409, NOT_READY) : fail(reply, 404, NO_SOUND);
    let size: number;
    try {
      size = (await stat(wav.path)).size;
    } catch {
      // gone from the cache: the library converts it again
      await library.wavMissing(id);
      return fail(reply, 409, NOT_READY);
    }
    const etag = `"${wav.rev}"`;
    const { rev } = req.query as { rev?: unknown };
    reply
      .header('Cache-Control', rev === wav.rev ? IMMUTABLE : 'no-cache')
      .header('ETag', etag)
      .header('Accept-Ranges', 'bytes');
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    const range = parseRange(req.headers.range, size);
    if (range === 'invalid') return reply.code(416).header('Content-Range', `bytes */${size}`).send();
    reply.type('audio/wav');
    if (range) {
      return reply
        .code(206)
        .header('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
        .header('Content-Length', range.end - range.start + 1)
        .send(createReadStream(wav.path, range));
    }
    return reply.header('Content-Length', size).send(createReadStream(wav.path));
  });

  // ------------------------------------------------------------------------------------------ buttons
  app.post('/api/sfx/buttons', async (req, reply) => {
    const body = parse(ButtonCreateBody, req.body, reply);
    if (!body) return reply;
    try {
      return library.createButton(body);
    } catch (err) {
      return failWith(reply, err);
    }
  });

  app.put('/api/sfx/buttons/order', async (req, reply) => {
    const body = parse(OrderBody, req.body, reply);
    if (!body) return reply;
    return library.reorder(body.ids);
  });

  app.patch('/api/sfx/buttons/:id', async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    if (!params.success) return fail(reply, 404, NO_BUTTON);
    const body = parse(ButtonPatchBody, req.body, reply);
    if (!body) return reply;
    try {
      return library.updateButton(params.data.id, body) ?? fail(reply, 404, NO_BUTTON);
    } catch (err) {
      return failWith(reply, err);
    }
  });

  app.delete('/api/sfx/buttons/:id', async (req, reply) => {
    const params = IdParams.safeParse(req.params);
    if (!params.success || !library.deleteButton(params.data.id)) return fail(reply, 404, NO_BUTTON);
    return { ok: true };
  });

  // ------------------------------------------------------------------------------------------ playback
  app.post('/api/sfx/play', async (req, reply) => {
    const body = parse(PlayBody, req.body, reply);
    if (!body) return reply;
    const r = library.resolvePlay(body);
    if (!r.ok) return fail(reply, r.error === 'not_ready' ? 409 : 404, r.message);
    // nothing on the PC would play it: say so now, and broadcast nothing
    if (audioClients && audioClients() === 0) {
      return fail(reply, 409, noAudioSource(req.socket?.localPort || DEFAULT_PORT));
    }
    const playId = randomUUID();
    const now = performance.now();
    plays.set(playId, { soundId: r.sound.id, at: now });
    prunePlays(now);
    broadcast({
      type: 'sfx:play',
      playId,
      soundId: r.sound.id,
      url: `/api/sfx/sounds/${r.sound.id}.wav?rev=${r.rev}`,
      volume: r.volume,
    });
    return { playId };
  });

  app.post('/api/sfx/stop', async () => {
    broadcast({ type: 'sfx:stop' });
    return { ok: true };
  });

  return {
    reportPlayed(playId) {
      const p = plays.get(playId);
      if (!p) return null;
      plays.delete(playId);
      const latencyMs = Math.max(0, Math.round(performance.now() - p.at));
      return latencyMs > PLAY_TTL_MS ? null : { soundId: p.soundId, latencyMs };
    },
  };
}
