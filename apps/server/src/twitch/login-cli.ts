// npm run twitch:login — logs the streamer in with the Device Code Flow (no client secret needed).
import path from 'node:path';
import { loadEnv } from '../env.js';
import { TwitchTokenManager } from './token.js';

const env = loadEnv();
const log = {
  info: () => {},
  debug: () => {},
  warn: (o: unknown, m?: string) => console.warn(m ?? '', o),
  error: (o: unknown, m?: string) => console.error(m ?? '', o),
};

if (!env.TWITCH_CLIENT_ID) {
  console.error(
    'Erro: TWITCH_CLIENT_ID não definido — Solução: crie um app "Public" em https://dev.twitch.tv/console/apps (OAuth Redirect URL: http://localhost) e coloque o Client ID no .env',
  );
  process.exit(2);
}

const manager = new TwitchTokenManager(
  env.TWITCH_CLIENT_ID,
  path.join(env.dataDir, 'twitch-token.json'),
  log,
  () => {},
);
const flow = await manager.startDeviceFlow();
console.log('\n  ┌──────────────────────────── stream95 · login na Twitch ────────────────────────────┐');
console.log(`    1. Abra: ${flow.verificationUri}`);
console.log(`    2. Confirme o código: ${flow.userCode}`);
console.log(`    (expira em ${Math.round(flow.expiresIn / 60)} min — aguardando aprovação...)`);
console.log('  └────────────────────────────────────────────────────────────────────────────────────┘\n');
const token = await flow.done;
if (!token) {
  console.error('Erro: login não concluído (expirou ou foi negado) — Solução: rode "npm run twitch:login" de novo');
  process.exit(1);
}
console.log(`✔ Logado como ${token.login}. Escopos: ${token.scopes.join(', ')}`);
console.log('  Reinicie o servidor (npm run dev / npm start) para ativar follows, resgates e respostas no chat.');
