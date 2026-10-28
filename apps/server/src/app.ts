import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import {
  type AlertKind,
  type AttentionItem,
  type ChatMessage,
  type Counter,
  type ModeratedMessage,
  mergeSettings,
  type ServerEvent,
  type ServiceStatus,
  type Settings,
  SettingsSchema,
  type Snapshot,
  type StreamAlert,
  type Toast,
  TTS_VOICES,
  voiceForUser,
} from '@stream95/shared';
import Fastify, { type FastifyInstance, type FastifyReply } from 'fastify';
import { z } from 'zod';
import { Assistant } from './assistant/assistant.js';
import { type CommandIntent, CommandRouter } from './commands/commands.js';
import type { Env } from './env.js';
import { CounterService } from './features/counters.js';
import { GithubFeed } from './features/github.js';
import { PollService } from './features/poll.js';
import { PomodoroService } from './features/pomodoro.js';
import { Hub, type HubSocket } from './hub.js';
import { type LanOverrides, setupLan } from './lan/lan.js';
import type { Logger } from './log.js';
import { attentionFor } from './moderation/attention.js';
import { JevModerator } from './moderation/jev.js';
import { LlmModerator } from './moderation/llm.js';
import { ModerationPipeline } from './moderation/pipeline.js';
import { ObsClient } from './obs/obs.js';
import { OpenRouter } from './openrouter.js';
import { registerSfxRoutes, SoundLibrary, sfxPaths } from './sfx/index.js';
import { appendJsonLine, JsonStore } from './store.js';
import { textForSpeech, withSpeaker } from './tts/sanitize.js';
import { TtsService } from './tts/service.js';
import { TwitchChat } from './twitch/chat.js';
import { EventSubClient } from './twitch/eventsub.js';
import { Helix } from './twitch/helix.js';
import { TwitchTokenManager } from './twitch/token.js';

export const PROJECT_URL = 'https://github.com/frederico-kluser/stream95';

export type AppOptions = {
  env: Env;
  log: Logger;
  fetchImpl?: typeof fetch;
  /** Connect to Twitch/GitHub/OBS on start (tests turn this off). */
  connectServices?: boolean;
  /** LAN pairing overrides (tests inject network interfaces and a clock). */
  lan?: LanOverrides;
};

/** Words spoken (and shown) when an alert fires. */
export function alertSpeech(a: StreamAlert): string {
  const n = a.amount ?? 0;
  switch (a.kind) {
    case 'follow':
      return `Valeu pelo follow, ${a.user}!`;
    case 'sub':
      return `${a.user} se inscreveu${a.tier === 'prime' ? ' com Prime' : ''}! Muito obrigado!`;
    case 'resub':
      return `${a.user} renovou a inscrição: ${a.months ?? 1} ${a.months === 1 ? 'mês' : 'meses'}!`;
    case 'giftsub':
      return `${a.user} presenteou ${n || 1} ${n > 1 ? 'inscrições' : 'inscrição'}!`;
    case 'raid':
      return `Raid de ${a.user} com ${n} ${n === 1 ? 'pessoa' : 'pessoas'}! Sejam bem-vindos!`;
    case 'cheer':
      return `${a.user} mandou ${n} bits! Valeu!`;
    case 'redeem':
      return `${a.user} resgatou ${a.reward ?? 'uma recompensa'}!`;
    case 'donation':
      return `${a.user} fez uma doação! Muito obrigado!`;
    default:
      return a.message ?? `${a.user}!`;
  }
}

const dayFile = (dir: string) => path.join(dir, 'moderation', `${new Date().toISOString().slice(0, 10)}.jsonl`);

/**
 * Page for an app that is not built yet. A phone can land here from the pairing QR code, so the
 * steps happen on the PC and the dev link (Vite listens on localhost only) is marked as PC-only.
 */
function notBuiltPage(what: 'O painel' | 'O overlay', devUrl: string): string {
  return [
    '<!doctype html><html lang="pt-BR"><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>stream95</title>',
    '<style>:root{color-scheme:light dark}body{font:16px/1.5 system-ui,sans-serif;max-width:36rem;',
    'margin:0 auto;padding:24px 16px}h1{font-size:1.5rem;line-height:1.25}</style>',
    `<h1>${what} ainda não foi compilado</h1>`,
    '<p>No PC, rode <code>npm run build</code> e reinicie o stream95. Depois, recarregue esta página.</p>',
    `<p>Em desenvolvimento (<code>npm run dev</code>), abra <a href="${devUrl}">${devUrl}</a> no mesmo PC.`,
    ' Esse endereço não abre no celular nem em outro PC.</p>',
  ].join('');
}

export async function createApp(opts: AppOptions) {
  const { env, log } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;

  // ---------------------------------------------------------------- settings
  const settingsStore = new JsonStore<Settings>(path.join(env.dataDir, 'settings.json'));
  let settings: Settings = SettingsSchema.parse(await settingsStore.read({} as Settings));
  if (env.TWITCH_CHANNEL) settings = mergeSettings(settings, { channel: env.TWITCH_CHANNEL.toLowerCase() });
  if (env.GITHUB_USER) settings = mergeSettings(settings, { github: { user: env.GITHUB_USER } });

  // ------------------------------------------------------------------ status
  const status: ServiceStatus = {
    chat: 'off',
    eventsub: env.TWITCH_CLIENT_ID ? 'off' : 'unconfigured',
    openrouter: env.OPENROUTER_API_KEY ? 'connecting' : 'unconfigured',
    obs: 'off',
    github: 'off',
    spentUsd: 0,
    startedAt: Date.now(),
  };
  let currentScene: string | null = null;
  const recentAlerts: StreamAlert[] = [];

  // --------------------------------------------------------------- services
  let hub: Hub;
  const broadcast = (event: ServerEvent) => hub.broadcast(event);
  const setStatus = (patch: Partial<ServiceStatus>) => {
    const next = { ...status, ...patch };
    const changed = (Object.keys(patch) as (keyof ServiceStatus)[]).some((k) => status[k] !== next[k]);
    if (!changed) return;
    Object.assign(status, next);
    broadcast({ type: 'status', status: { ...status } });
  };

  const openrouter = new OpenRouter({
    ...(env.OPENROUTER_API_KEY ? { apiKey: env.OPENROUTER_API_KEY } : {}),
    title: 'stream95',
    referer: PROJECT_URL,
    log,
    fetchImpl,
    onSpend: (total) => setStatus({ spentUsd: Math.round(total * 1e6) / 1e6 }),
  });
  const llm = new LlmModerator(openrouter, () => [env.MODERATION_MODEL, env.MODERATION_FALLBACK_MODEL], log);
  const jev = new JevModerator(openrouter, () => env.JEV_MODEL, log);
  const pipeline = new ModerationPipeline(() => settings.moderation, llm, log, { jev });
  /** Questions and technical problems Jev flagged recently (dock / stream deck). */
  const attention: AttentionItem[] = [];
  const tts = new TtsService(
    openrouter,
    () => env.TTS_MODEL,
    () => settings.tts,
    (item) => broadcast({ type: 'tts:play', item }),
    log,
  );
  const assistant = new Assistant(
    openrouter,
    () => [env.ASSISTANT_MODEL, env.ASSISTANT_FALLBACK_MODEL],
    () => settings.assistant,
    () => {
      const p = pomodoro.current;
      return [
        `canal twitch.tv/${settings.channel}`,
        currentScene ? `cena atual: ${currentScene}` : '',
        p.mode !== 'idle' ? `pomodoro em ${p.mode === 'focus' ? 'foco' : 'pausa'}` : '',
        counters.all.map((c) => `${c.label}: ${c.value}`).join(', '),
      ]
        .filter(Boolean)
        .join(' | ');
    },
    log,
    (text) => llm.classify(text, 4000).then((v) => v.decision),
  );
  const poll = new PollService((p) => broadcast({ type: 'poll', poll: p }));
  const pomodoro = new PomodoroService(
    () => settings.pomodoro,
    (state) => broadcast({ type: 'pomodoro', state }),
    (finished) => {
      const text =
        finished === 'focus' ? 'Fim do foco! Hora de esticar as pernas.' : 'Pausa encerrada. De volta ao código!';
      toast({ level: 'info', title: 'Pomodoro', body: text, icon: 'Clock' });
      clippySay(text, finished === 'focus' ? 'Congratulate' : 'GetAttention', true);
    },
  );
  const countersStore = new JsonStore<Counter[]>(path.join(env.dataDir, 'counters.json'));
  const counters = new CounterService(await countersStore.read([]), (c) => {
    broadcast({ type: 'counters', counters: c });
    countersStore.save(c);
  });
  const github = new GithubFeed(
    () => settings.github,
    env.GITHUB_TOKEN,
    (event) => {
      broadcast({ type: 'github', event });
      toast({ level: 'success', title: event.repo, body: event.title, icon: 'Network' });
    },
    (s) => setStatus({ github: s }),
    log,
    fetchImpl,
  );

  const tokens = new TwitchTokenManager(
    env.TWITCH_CLIENT_ID,
    path.join(env.dataDir, 'twitch-token.json'),
    log,
    () => {
      if (started && opts.connectServices !== false) eventsub.start();
    },
    fetchImpl,
  );
  const helix = new Helix(tokens, fetchImpl);
  const pendingIntents = new Map<string, CommandIntent>();

  const chat = new TwitchChat(
    {
      message: (msg) => void onChatMessage(msg),
      alert: (a) => onAlert(a),
      removeMessage: (id) => pipeline.removeMessage(id),
      removeUser: (login) => pipeline.removeByUser(login),
      clear: () => pipeline.clearChat(),
      // while EventSub owns the chat, the (intentionally disconnected) IRC reader must not report "off"
      state: (s) => {
        if (!chatViaEventSub) setStatus({ chat: s });
      },
    },
    log,
  );
  const eventsub = new EventSubClient(
    helix,
    tokens,
    () => settings.channel,
    {
      alert: (a) => onAlert(a),
      state: (s) => setStatus({ eventsub: s }),
      redemptionsActive: (on) => chat.setRedemptionsFromEventSub(on),
      // Twitch prefers EventSub chat over IRC: when it is live, the anonymous IRC reader steps aside
      // (otherwise every message would arrive twice); when it drops, IRC takes over again.
      chatActive: (on) => {
        chatViaEventSub = on;
        if (opts.connectServices === false) return;
        if (on) {
          chat.disconnect();
          setStatus({ chat: 'online' });
        } else if (started) {
          chat.connect(settings.channel);
        }
      },
      message: (msg) => void onChatMessage(msg),
      removeMessage: (id) => pipeline.removeMessage(id),
      removeUser: (login) => pipeline.removeByUser(login),
      clear: () => pipeline.clearChat(),
    },
    log,
  );
  let chatViaEventSub = false;
  const obs = new ObsClient(
    env.OBS_WS_URL,
    env.OBS_WS_PASSWORD,
    {
      state: (s) => setStatus({ obs: s }),
      scenes: (current, all) => {
        currentScene = current;
        broadcast({ type: 'scene', scene: current, obsScenes: all });
      },
    },
    log,
  );

  const toast = (t: Omit<Toast, 'id'>) => broadcast({ type: 'toast', toast: { id: randomUUID(), ...t } });
  const clippySay = (text: string, animation = 'Explain', speak = false) => {
    broadcast({ type: 'assistant:say', text, animation });
    if (speak && settings.assistant.speak) {
      void tts.speak({ kind: 'assistant', text, voice: settings.assistant.voice, priority: true });
    }
  };
  const sayInChat = (text: string) => {
    if (!tokens.has('user:write:chat')) return;
    helix.say(settings.channel, text).catch((err) => log.warn({ err: (err as Error).message }, 'chat reply failed'));
  };

  const commands = new CommandRouter({
    settings: () => settings,
    poll,
    pomodoro,
    counters,
    effects: {
      bsod: (title, message) => broadcast({ type: 'bsod', title, message }),
      toast: (title, body) => toast({ level: 'info', title, body, icon: 'User' }),
    },
    projectUrl: PROJECT_URL,
  });

  // Soundboard: the user's folder of sounds, converted to WAV 48 kHz and played by the OBS audio page.
  const sfx = new SoundLibrary({
    ...sfxPaths({ dataDir: env.dataDir, root: env.root, soundsDir: env.SOUNDS_DIR }),
    log,
    settings: () => settings.sfx,
    watch: opts.connectServices !== false,
  });
  await sfx.start();

  hub = new Hub(hubSnapshot, () => settings, log);
  hub.onClientEvent((event) => {
    if (event.type === 'tts:done') tts.done(event.id);
  });
  sfx.onChange((library) => broadcast({ type: 'sfx:library', library }));

  // -------------------------------------------------------------- chat flow
  async function onChatMessage(msg: ChatMessage): Promise<ModeratedMessage | null> {
    broadcast({ type: 'chat:incoming', message: msg });
    const outcome = commands.handle(msg);
    if (outcome?.reply) {
      clippySay(outcome.reply);
      sayInChat(outcome.reply);
    }
    if (outcome?.hide) return null;
    if (outcome?.intent) pendingIntents.set(msg.id, outcome.intent);
    return pipeline.process(msg);
  }

  function speakChat(m: ModeratedMessage, text: string, emotes = m.emotes): void {
    const s = settings.tts;
    const body = textForSpeech(text, emotes, s.maxChars);
    if (!body) return;
    void tts.speak({
      kind: 'chat',
      text: s.readUsername ? withSpeaker(m.displayName, body) : body,
      voice: s.voicePerUser ? voiceForUser(m.login) : s.voice,
      user: m.login,
      messageId: m.id,
    });
  }

  async function askAssistant(asker: string, question: string): Promise<void> {
    if (!assistant.available) {
      clippySay('Estou sem cérebro hoje: falta a OPENROUTER_API_KEY no servidor.', 'GetAttention');
      return;
    }
    if (assistant.cooldownFor(asker) > 0) return;
    broadcast({ type: 'assistant:thinking', asker, question });
    try {
      const reply = await assistant.ask({ asker, question });
      broadcast({ type: 'assistant:reply', reply });
      if (settings.assistant.speak) {
        void tts.speak({ kind: 'assistant', text: reply.answer, voice: settings.assistant.voice, priority: true });
      }
      if (settings.assistant.replyInChat) sayInChat(`@${asker} ${reply.answer}`);
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'assistant failed');
      clippySay('Ops, meu modem caiu no meio da resposta. Tenta de novo daqui a pouco!', 'Alert');
    }
  }

  pipeline.on('shown', (m) => {
    broadcast({ type: 'chat:show', message: m });
    const intent = pendingIntents.get(m.id);
    pendingIntents.delete(m.id);
    if (intent?.kind === 'assistant') return void askAssistant(m.displayName, intent.question);
    if (intent?.kind === 'tts') return speakChat(m, intent.text, []);
    const s = settings.tts;
    if (!s.enabled || m.isBroadcaster || m.source === 'dock' || m.text.startsWith('!')) return;
    const wants =
      s.mode === 'all' ||
      (s.mode === 'subs' && (m.isSub || m.isVip || m.isMod)) ||
      (s.mode === 'highlight' && m.isHighlighted);
    if (wants) speakChat(m, m.text);
  });
  pipeline.on('queue', (queue) => broadcast({ type: 'mod:queue', queue }));
  pipeline.on('signals', (m) => {
    if (!m.verdict.signals) return;
    broadcast({ type: 'mod:signals', id: m.id, signals: m.verdict.signals });
    for (const item of attentionFor(m, settings.moderation.attentionAt)) {
      attention.push(item);
      if (attention.length > 30) attention.splice(0, attention.length - 30);
      broadcast({ type: 'mod:attention', item });
    }
  });
  pipeline.on('removed', (ids) => broadcast({ type: 'chat:remove', ids }));
  pipeline.on('decided', (m) => {
    broadcast({ type: 'mod:log', item: m });
    if (m.status === 'rejected' || m.status === 'expired') pendingIntents.delete(m.id);
    void appendJsonLine(dayFile(env.dataDir), {
      at: new Date(m.decidedAt).toISOString(),
      id: m.id,
      user: m.login,
      text: m.text,
      status: m.status,
      verdict: m.verdict,
    }).catch(() => {});
  });

  function onAlert(alert: StreamAlert): void {
    recentAlerts.push(alert);
    if (recentAlerts.length > 50) recentAlerts.shift();
    broadcast({ type: 'alert', alert });
    const speech = alertSpeech(alert);
    broadcast({ type: 'assistant:say', text: speech, animation: 'Congratulate' });
    if (settings.alerts.speak && openrouter.configured) {
      void tts.speak({ kind: 'alert', text: speech, voice: settings.assistant.voice, priority: true });
    }
  }

  // ------------------------------------------------------------------- http
  const app: FastifyInstance = Fastify({ logger: false, bodyLimit: 64 * 1024 });
  await app.register(fastifyWebsocket);

  // Security gate (DNS rebinding, CSRF, WebSocket Origin, LAN device tokens) + /api/devices routes.
  const lan = await setupLan(app, { env, log, ...opts.lan });

  const fail = (reply: FastifyReply, code: number, message: string) => reply.code(code).send({ error: message });
  const parse = <T>(schema: z.ZodType<T>, body: unknown, reply: FastifyReply): T | null => {
    const r = schema.safeParse(body ?? {});
    if (!r.success) {
      void fail(
        reply,
        400,
        `Erro: corpo inválido — Solução: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      );
      return null;
    }
    return r.data;
  };

  app.get('/ws', { websocket: true }, (socket, req) => {
    hub.add(socket as unknown as HubSocket, lan.attachSocket(socket, req));
  });

  app.get('/api/health', async () => ({ ok: true, name: 'stream95', status, clients: hub.countByRole() }));
  app.get('/api/state', async () => ({ settings, snapshot: hubSnapshot() }));
  app.get('/api/voices', async () => ({ voices: TTS_VOICES }));
  app.get('/api/models', async () => ({
    moderation: [env.MODERATION_MODEL, env.MODERATION_FALLBACK_MODEL],
    jev: env.JEV_MODEL,
    assistant: [env.ASSISTANT_MODEL, env.ASSISTANT_FALLBACK_MODEL],
    tts: env.TTS_MODEL,
  }));
  app.get('/api/commands', async () => ({ commands: commands.list() }));
  app.get('/api/alerts/recent', async () => ({ alerts: recentAlerts }));

  // settings
  app.get('/api/settings', async () => settings);
  app.patch('/api/settings', async (req, reply) => {
    try {
      const previous = settings;
      settings = mergeSettings(settings, req.body);
      settingsStore.save(settings);
      broadcast({ type: 'settings', settings });
      if (previous.channel !== settings.channel && opts.connectServices !== false) {
        if (chatViaEventSub) eventsub.start();
        else chat.connect(settings.channel);
      }
      if (JSON.stringify(previous.github) !== JSON.stringify(settings.github) && opts.connectServices !== false)
        github.start();
      // Turning volume normalization on or off converts every sound again (old files keep playing meanwhile).
      if (previous.sfx.normalize !== settings.sfx.normalize) void sfx.settingsChanged();
      return settings;
    } catch (err) {
      return fail(reply, 400, `Erro: configuração inválida — Solução: ${(err as Error).message.slice(0, 300)}`);
    }
  });

  // moderation
  const IdParams = z.object({ id: z.string().min(1) });
  app.post('/api/mod/:id/approve', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const body = parse(z.object({ trustUser: z.boolean().optional() }), req.body, reply);
    if (!body) return reply;
    return (
      pipeline.approve(id, body.trustUser) ??
      fail(reply, 404, 'Erro: mensagem não está na fila — Solução: atualize o painel')
    );
  });
  app.post('/api/mod/:id/reject', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const body = parse(z.object({ blockUser: z.boolean().optional() }), req.body, reply);
    if (!body) return reply;
    return (
      pipeline.reject(id, body.blockUser) ??
      fail(reply, 404, 'Erro: mensagem não está na fila — Solução: atualize o painel')
    );
  });
  app.post('/api/mod/users/:login/block', async (req) => {
    const { login } = z.object({ login: z.string().min(1) }).parse(req.params);
    pipeline.blockUser(login);
    return { ok: true };
  });
  app.post('/api/mod/users/:login/unblock', async (req) => {
    const { login } = z.object({ login: z.string().min(1) }).parse(req.params);
    pipeline.unblockUser(login);
    return { ok: true };
  });
  app.post('/api/mod/allow-domain', async (req, reply) => {
    const body = parse(z.object({ domain: z.string().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i) }), req.body, reply);
    if (!body) return reply;
    const domains = [...new Set([...settings.moderation.allowedLinkDomains, body.domain.toLowerCase()])];
    settings = mergeSettings(settings, { moderation: { allowedLinkDomains: domains } });
    settingsStore.save(settings);
    broadcast({ type: 'settings', settings });
    return { ok: true, domains };
  });
  app.delete('/api/chat/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    pipeline.removeMessage(id);
    if (tokens.has('moderator:manage:chat_messages')) {
      helix
        .deleteMessage(settings.channel, id)
        .catch((err) => log.warn({ err: (err as Error).message }, 'twitch delete failed'));
    }
    return { ok: true };
  });
  app.post('/api/chat/clear', async () => {
    pipeline.clearChat();
    broadcast({ type: 'chat:clear' });
    return { ok: true };
  });
  app.post('/api/chat/simulate', async (req, reply) => {
    const body = parse(
      z.object({
        user: z.string().min(1).max(25).default('visitante'),
        text: z.string().min(1).max(500),
        isSub: z.boolean().default(false),
        isMod: z.boolean().default(false),
        isVip: z.boolean().default(false),
        isFirst: z.boolean().default(false),
        color: z.string().optional(),
      }),
      req.body,
      reply,
    );
    if (!body) return reply;
    const msg: ChatMessage = {
      id: randomUUID(),
      channel: settings.channel,
      userId: `sim-${body.user.toLowerCase()}`,
      login: body.user.toLowerCase(),
      displayName: body.user,
      ...(body.color ? { color: body.color } : {}),
      text: body.text,
      emotes: [],
      badges: body.isMod ? ['moderator'] : body.isSub ? ['subscriber'] : [],
      isBroadcaster: false,
      isMod: body.isMod,
      isVip: body.isVip,
      isSub: body.isSub,
      isFirst: body.isFirst,
      isHighlighted: false,
      timestamp: Date.now(),
      source: 'simulator',
    };
    return (await onChatMessage(msg)) ?? { hidden: true };
  });

  // alerts
  const AlertKinds = [
    'follow',
    'sub',
    'resub',
    'giftsub',
    'raid',
    'cheer',
    'redeem',
    'donation',
    'custom',
  ] as const satisfies readonly AlertKind[];
  app.post('/api/alerts/simulate', async (req, reply) => {
    const body = parse(
      z.object({
        kind: z.enum(AlertKinds),
        user: z.string().min(1).max(40).default('visitante'),
        amount: z.number().int().min(0).max(1_000_000).optional(),
        message: z.string().max(300).optional(),
        months: z.number().int().min(1).max(240).optional(),
        reward: z.string().max(60).optional(),
      }),
      req.body,
      reply,
    );
    if (!body) return reply;
    const alert = { id: randomUUID(), timestamp: Date.now(), source: 'simulator', ...body } as StreamAlert;
    onAlert(alert);
    return alert;
  });

  // text-to-speech
  app.get('/api/tts/:file', async (req, reply) => {
    const { file } = z.object({ file: z.string() }).parse(req.params);
    const audio = tts.getAudio(file.replace(/\.mp3$/, ''));
    if (!audio) return fail(reply, 404, 'Erro: áudio expirou — Solução: nada a fazer, é temporário');
    return reply.type('audio/mpeg').header('Cache-Control', 'no-store').send(audio);
  });
  app.post('/api/tts/say', async (req, reply) => {
    const body = parse(
      z.object({ text: z.string().min(1).max(400), voice: z.enum(TTS_VOICES).optional() }),
      req.body,
      reply,
    );
    if (!body) return reply;
    const r = await tts.speak({
      kind: 'dock',
      text: body.text,
      voice: body.voice ?? settings.tts.voice,
      priority: true,
    });
    return typeof r === 'string' ? fail(reply, 409, `Erro: ${r} — Solução: confira o TTS no painel`) : r;
  });
  app.post('/api/tts/skip', async () => {
    broadcast({ type: 'tts:skip' });
    return { ok: true };
  });

  // assistant (the "local API" behind Clippy)
  app.post('/api/assistant/ask', async (req, reply) => {
    const body = parse(
      z.object({ question: z.string().min(1).max(300), asker: z.string().min(1).max(40).default('streamer') }),
      req.body,
      reply,
    );
    if (!body) return reply;
    try {
      broadcast({ type: 'assistant:thinking', asker: body.asker, question: body.question });
      const r = await assistant.ask({ asker: body.asker, question: body.question, bypassCooldown: true });
      broadcast({ type: 'assistant:reply', reply: r });
      if (settings.assistant.speak)
        void tts.speak({ kind: 'assistant', text: r.answer, voice: settings.assistant.voice, priority: true });
      return r;
    } catch (err) {
      return fail(
        reply,
        503,
        `Erro: ${(err as Error).message} — Solução: confira a OPENROUTER_API_KEY e o status no painel`,
      );
    }
  });
  app.post('/api/assistant/say', async (req, reply) => {
    const body = parse(
      z.object({
        text: z.string().min(1).max(300),
        animation: z.string().max(40).default('Explain'),
        speak: z.boolean().default(false),
      }),
      req.body,
      reply,
    );
    if (!body) return reply;
    clippySay(body.text, body.animation, body.speak);
    return { ok: true };
  });

  // poll
  app.post('/api/poll', async (req, reply) => {
    const body = parse(
      z.object({
        question: z.string().min(1).max(120),
        options: z.array(z.string().min(1).max(60)).min(2).max(9),
        durationSec: z.number().int().min(0).max(3600).default(0),
      }),
      req.body,
      reply,
    );
    if (!body) return reply;
    const p = poll.start(body.question, body.options, body.durationSec);
    clippySay(`Enquete: ${p.question} Votem com ${p.options.map((_, i) => `!${i + 1}`).join(' ')}`, 'GetAttention');
    return p;
  });
  app.post('/api/poll/close', async () => poll.close() ?? { ok: true });
  app.delete('/api/poll', async () => {
    poll.dismiss();
    return { ok: true };
  });

  // pomodoro
  app.post('/api/pomodoro/:action', async (req, reply) => {
    const { action } = z.object({ action: z.enum(['start', 'pause', 'resume', 'stop']) }).parse(req.params);
    if (action === 'start') {
      const body = parse(
        z.object({ mode: z.enum(['focus', 'break']).default('focus'), minutes: z.number().min(1).max(180).optional() }),
        req.body,
        reply,
      );
      if (!body) return reply;
      return pomodoro.start(body.mode, body.minutes);
    }
    return action === 'pause' ? pomodoro.pause() : action === 'resume' ? pomodoro.resume() : pomodoro.stop();
  });

  // counters
  app.post('/api/counters', async (req, reply) => {
    const body = parse(z.object({ id: z.string().min(1).max(20), label: z.string().min(1).max(24) }), req.body, reply);
    if (!body) return reply;
    return counters.upsert(body.id, body.label);
  });
  app.post('/api/counters/:id/add', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const body = parse(z.object({ delta: z.number().int().min(-1000).max(1000).default(1) }), req.body, reply);
    if (!body) return reply;
    return counters.add(id, body.delta) ?? fail(reply, 404, 'Erro: contador inexistente — Solução: crie-o no painel');
  });
  app.put('/api/counters/:id', async (req, reply) => {
    const { id } = IdParams.parse(req.params);
    const body = parse(z.object({ value: z.number().int().min(0).max(1_000_000) }), req.body, reply);
    if (!body) return reply;
    return counters.set(id, body.value) ?? fail(reply, 404, 'Erro: contador inexistente — Solução: crie-o no painel');
  });
  app.delete('/api/counters/:id', async (req) => {
    const { id } = IdParams.parse(req.params);
    counters.remove(id);
    return { ok: true };
  });

  // OBS + scene hints
  app.get('/api/obs/scenes', async () => ({ status: status.obs, current: currentScene, scenes: obs.scenes }));
  app.post('/api/obs/scene', async (req, reply) => {
    const body = parse(z.object({ name: z.string().min(1).max(120) }), req.body, reply);
    if (!body) return reply;
    try {
      await obs.setScene(body.name);
      return { ok: true };
    } catch (err) {
      return fail(
        reply,
        409,
        `Erro: ${(err as Error).message} — Solução: ative o servidor WebSocket do OBS e configure OBS_WS_PASSWORD`,
      );
    }
  });

  // Twitch login from the dock (Device Code Flow)
  app.get('/api/twitch/status', async () => ({
    configured: tokens.configured,
    login: tokens.current?.login ?? null,
    scopes: tokens.current?.scopes ?? [],
    chat: status.chat,
    chatSource: chatViaEventSub ? 'eventsub' : 'irc',
    eventsub: status.eventsub,
  }));
  app.post('/api/twitch/login', async (_req, reply) => {
    try {
      const flow = await tokens.startDeviceFlow();
      void flow.done.then(
        (t) => t && toast({ level: 'success', title: 'Twitch', body: `Logado como ${t.login}`, icon: 'User' }),
      );
      return { userCode: flow.userCode, verificationUri: flow.verificationUri, expiresIn: flow.expiresIn };
    } catch (err) {
      return fail(reply, 409, `Erro: ${(err as Error).message} — Solução: veja docs/twitch.md`);
    }
  });
  app.post('/api/twitch/logout', async () => {
    eventsub.stop();
    await tokens.logout();
    return { ok: true };
  });

  // fun effects
  app.post('/api/fx/bsod', async (req, reply) => {
    const body = parse(
      z.object({
        title: z.string().max(40).default('stream95'),
        message: z.string().max(300).default('Um erro fatal 0E ocorreu. Pressione qualquer tecla para continuar.'),
      }),
      req.body,
      reply,
    );
    if (!body) return reply;
    broadcast({ type: 'bsod', title: body.title, message: body.message });
    return { ok: true };
  });
  app.post('/api/fx/toast', async (req, reply) => {
    const body = parse(
      z.object({
        title: z.string().min(1).max(60),
        body: z.string().max(200).default(''),
        level: z.enum(['info', 'warning', 'error', 'success']).default('info'),
      }),
      req.body,
      reply,
    );
    if (!body) return reply;
    toast({ level: body.level, title: body.title, body: body.body });
    return { ok: true };
  });
  app.post('/api/scene', async (req, reply) => {
    const body = parse(z.object({ scene: z.string().max(120).nullable() }), req.body, reply);
    if (!body) return reply;
    currentScene = body.scene;
    broadcast({ type: 'scene', scene: currentScene, obsScenes: obs.scenes });
    return { ok: true };
  });

  // soundboard
  const sfxRoutes = registerSfxRoutes(app, {
    library: sfx,
    settings: () => settings,
    broadcast,
    log,
    audioClients: () => hub.countByRole().audio,
  });
  hub.onClientEvent((event) => {
    if (event.type !== 'sfx:played') return;
    const played = sfxRoutes.reportPlayed(event.playId);
    if (played) broadcast({ type: 'sfx:played', playId: event.playId, ...played });
  });

  // Built SPAs: the control deck under /dock/ and the overlays everywhere else — or a hint to build them.
  const deckBuilt = existsSync(path.join(env.deckDist, 'index.html'));
  const overlayBuilt = existsSync(path.join(env.overlayDist, 'index.html'));
  const deckMissing = notBuiltPage('O painel', 'http://localhost:5173/dock/');
  const overlayMissing = notBuiltPage('O overlay', 'http://localhost:5173/');
  // The OBS dock and old links use /dock without the slash; keep the query (?pair=CODE).
  app.get('/dock', async (req, reply) => {
    const query = req.url.indexOf('?');
    return reply.redirect(`/dock/${query >= 0 ? req.url.slice(query) : ''}`, 301);
  });
  if (deckBuilt) {
    // wildcard (the default) resolves files per request, so a rebuild while the server runs
    // serves the new hashed assets instead of falling back to index.html.
    // Exactly one static instance adds reply.sendFile: the overlay one, or this one when the overlay
    // is not built (the deck SPA fallback below needs it either way).
    await app.register(fastifyStatic, { root: env.deckDist, prefix: '/dock/', decorateReply: !overlayBuilt });
  }
  if (overlayBuilt) await app.register(fastifyStatic, { root: env.overlayDist });
  else app.get('/', async (_req, reply) => reply.type('text/html; charset=utf-8').send(overlayMissing));
  app.setNotFoundHandler((req, reply) => {
    const url = req.url;
    if (url.startsWith('/api/') || url.startsWith('/ws'))
      return fail(reply, 404, 'Erro: rota inexistente — Solução: veja docs/api.md');
    if (url.startsWith('/dock/')) {
      if (!deckBuilt) return reply.code(404).type('text/html; charset=utf-8').send(deckMissing);
      // SPA fallback with no-cache, so a rebuilt deck is picked up on the next open.
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html', env.deckDist, { cacheControl: false });
    }
    if (!overlayBuilt) return reply.code(404).type('text/html; charset=utf-8').send(overlayMissing);
    // explicit root: it must not depend on which static instance added sendFile
    return reply.sendFile('index.html', env.overlayDist);
  });

  function hubSnapshot(): Snapshot {
    return {
      chat: pipeline.chat,
      queue: pipeline.queue,
      log: pipeline.history.slice(-60),
      attention: [...attention],
      sfx: sfx.snapshot(),
      poll: poll.current,
      pomodoro: pomodoro.current,
      counters: counters.all,
      github: github.recent,
      status: { ...status },
      scene: currentScene,
      obsScenes: obs.scenes,
    };
  }

  // -------------------------------------------------------------- lifecycle
  let started = false;
  const timers: NodeJS.Timeout[] = [];

  async function checkOpenRouter(): Promise<void> {
    if (!env.OPENROUTER_API_KEY) return setStatus({ openrouter: 'unconfigured' });
    try {
      const res = await fetchImpl('https://openrouter.ai/api/v1/key', {
        headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      });
      setStatus({ openrouter: res.ok ? 'online' : 'error' });
    } catch {
      setStatus({ openrouter: 'error' });
    }
  }

  async function start(): Promise<string> {
    started = true;
    timers.push(setInterval(() => pipeline.expire(), 30_000));
    if (opts.connectServices !== false) {
      chat.connect(settings.channel);
      github.start();
      obs.start();
      void checkOpenRouter();
      await tokens.load();
      eventsub.start();
    }
    return app.listen({ port: env.PORT, host: env.HOST });
  }

  async function stop(): Promise<void> {
    for (const t of timers) clearInterval(t);
    chat.disconnect();
    eventsub.stop();
    github.stop();
    obs.stop();
    pomodoro.stop();
    await Promise.allSettled([settingsStore.flush(), countersStore.flush(), sfx.stop()]);
    await app.close();
  }

  return {
    app,
    start,
    stop,
    services: { pipeline, tts, assistant, poll, pomodoro, counters, hub, openrouter, tokens, obs, chat, github, sfx },
    simulateChat: onChatMessage,
    getSettings: () => settings,
    lan,
    /** apps/deck/dist had an index.html at startup (a later build needs a restart). */
    deckBuilt,
  };
}
