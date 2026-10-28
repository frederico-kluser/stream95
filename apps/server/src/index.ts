import { createApp } from './app.js';
import { loadEnv } from './env.js';
import { pairingBanner, sceneAccessNotice } from './lan/lan.js';
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
// LAN=true with an explicit HOST: scenes coming from the network cannot pair (one yellow line).
const sceneNotice = sceneAccessNotice(env);

console.log(`
\x1b[44m\x1b[97m  stream95  \x1b[0m  servidor local no ar em ${base}

  Painel (dock do OBS) ... ${base}/dock
  Painel neste PC ........ ${base}/dock/
  Overlays/cenas ......... ${base}/  (lista de URLs para o OBS)${sceneNotice ? `\n  \x1b[33m${sceneNotice}\x1b[0m` : ''}
  Canal .................. twitch.tv/${server.getSettings().channel}
  IA (OpenRouter) ........ ${env.OPENROUTER_API_KEY ? 'chave encontrada' : 'sem chave — moderação só local, sem voz/Clippy'}
  Twitch login ........... ${env.TWITCH_CLIENT_ID ? 'client id ok (npm run twitch:login para follows)' : 'opcional — veja docs/twitch.md'}
`);

// Phones and tablets: QR code that opens the deck already paired (or why it cannot: LAN off, no deck build).
const printPairing = async (title?: string) => {
  try {
    const banner = await pairingBanner(server.lan, { deckBuilt: server.deckBuilt });
    console.log(`${title ? `\n  ${title}\n` : ''}${banner}\n`);
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'não foi possível mostrar o QR code do celular');
  }
};
await printPairing();
// Someone scanned an expired or used code: print a fresh one right away. Phones reach the pairing
// screen only through the built deck, so without a build there is nothing to refresh.
if (server.deckBuilt) server.lan.onStaleCode = () => void printPairing('Código novo para o celular:');

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
