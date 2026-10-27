import { createApp } from './app.js';
import { loadEnv } from './env.js';
import type { Logger } from './log.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;
const minLevel = LEVELS[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? LEVELS.info;
const colors: Record<Level, string> = { debug: '\x1b[90m', info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' };

function line(level: Level, obj: unknown, msg?: string): void {
  if (LEVELS[level] < minLevel) return;
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  const text = msg ?? (typeof obj === 'string' ? obj : '');
  const extra = typeof obj === 'object' && obj && Object.keys(obj).length ? ` ${JSON.stringify(obj)}` : '';
  const out = `${colors[level]}${time} ${level.toUpperCase().padEnd(5)}\x1b[0m ${text}${extra}`;
  (level === 'error' ? console.error : console.log)(out);
}

const log: Logger = {
  debug: (o, m) => line('debug', o, m),
  info: (o, m) => line('info', o, m),
  warn: (o, m) => line('warn', o, m),
  error: (o, m) => line('error', o, m),
};

const env = loadEnv();
const server = await createApp({ env, log });
const address = await server.start();
const base = address.replace('127.0.0.1', 'localhost');

console.log(`
\x1b[44m\x1b[97m  stream95  \x1b[0m  servidor local no ar em ${base}

  Painel (dock do OBS) ... ${base}/dock
  Overlays/cenas ......... ${base}/  (lista de URLs para o OBS)
  Canal .................. twitch.tv/${server.getSettings().channel}
  IA (OpenRouter) ........ ${env.OPENROUTER_API_KEY ? 'chave encontrada' : 'sem chave — moderação só local, sem voz/Clippy'}
  Twitch login ........... ${env.TWITCH_CLIENT_ID ? 'client id ok (npm run twitch:login para follows)' : 'opcional — veja docs/twitch.md'}
`);

let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  log.info({ signal }, 'encerrando...');
  await server.stop().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
