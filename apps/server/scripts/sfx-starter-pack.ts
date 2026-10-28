/**
 * Soundboard starter pack: legally clean sound effects (CC0, public domain, CC BY) plus meme voice
 * lines in Portuguese and English synthesized with ElevenLabs through OpenRouter, mapped to deck buttons.
 *
 *   npm run sfx:pack
 *
 * Idempotent: files already in the library are kept, buttons are only added (never changed or
 * removed) and a pack button the streamer deleted is not created again (data/sfx-pack.json).
 * Library: the server's folder (SOUNDS_DIR, or stream95/sons in the Documents folder, also when OneDrive
 * moved it). The server converts every file to WAV itself.
 * Sources, licenses and the copyright caveat: docs/sons.md
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  SFX_BUTTONS_FILE,
  SFX_MAX_DURATION_MS,
  type SfxButton,
  type SfxColor,
  type SfxLibrary,
  sfxSoundId,
  type TtsVoice,
} from '@stream95/shared';
import ffmpegStatic from 'ffmpeg-static';
import { loadEnv } from '../src/env.js';
import { silentLogger } from '../src/log.js';
import { OpenRouter, OpenRouterError } from '../src/openrouter.js';
import { sfxPaths } from '../src/sfx/index.js';

/** Bot-style UA with a contact URL, as Wikimedia asks (a bare script UA got HTTP 403 from Kenney). */
const USER_AGENT = 'Mozilla/5.0 (compatible; stream95-sfx-pack/1.0; +https://github.com/frederico-kluser/stream95)';
const REPO_URL = 'https://github.com/frederico-kluser/stream95';
/** Same cap as the deck's "create buttons" action: the grid stays usable on a phone. */
const MAX_BUTTONS = 24;
const BUTTON_VOLUME = 0.9;
/** Expressive model first (audio tags such as [laughs]); the fallback gets the text without tags. */
const TTS_MODELS = ['elevenlabs/eleven-v3', 'elevenlabs/eleven-flash-v2.5'] as const;
const TTS_CONCURRENCY = 3;
/** Pack files that already got a default button, so a deleted button is not created again. */
const STATE_FILE = 'sfx-pack.json';
const CREDITS_FILE = 'CREDITOS.txt';
const RERUN = 'rode npm run sfx:pack de novo daqui a pouco';

const CATEGORIES = ['memes-pt', 'memes-en', 'efeitos'] as const;
type Category = (typeof CATEGORIES)[number];
const COLORS: Record<Category, SfxColor> = { 'memes-pt': 'green', 'memes-en': 'violet', efeitos: 'amber' };

type License = { name: string; url: string };
const CC0: License = { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' };
const PUBLIC_DOMAIN: License = { name: 'Domínio público', url: 'https://creativecommons.org/publicdomain/mark/1.0/' };
const CC_BY_3: License = { name: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/' };
const AI_VOICE: License = { name: 'Voz gerada por IA', url: 'https://openrouter.ai/terms' };

type KenneyPack = { title: string; page: string; zip: string };
/** Kenney.nl audio packs (all CC0). The zip URL carries a hash: when it changes, the asset page has the new one. */
const KENNEY = {
  voiceover: {
    title: 'Voiceover Pack',
    page: 'https://kenney.nl/assets/voiceover-pack',
    zip: 'https://kenney.nl/media/pages/assets/voiceover-pack/3f7f168698-1677589897/kenney_voiceover-pack.zip',
  },
  interface: {
    title: 'Interface Sounds',
    page: 'https://kenney.nl/assets/interface-sounds',
    zip: 'https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip',
  },
  impact: {
    title: 'Impact Sounds',
    page: 'https://kenney.nl/assets/impact-sounds',
    zip: 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip',
  },
  digital: {
    title: 'Digital Audio',
    page: 'https://kenney.nl/assets/digital-audio',
    zip: 'https://kenney.nl/media/pages/assets/digital-audio/216eac4753-1677590265/kenney_digital-audio.zip',
  },
  scifi: {
    title: 'Sci-fi Sounds',
    page: 'https://kenney.nl/assets/sci-fi-sounds',
    zip: 'https://kenney.nl/media/pages/assets/sci-fi-sounds/6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip',
  },
  rpg: {
    title: 'RPG Audio',
    page: 'https://kenney.nl/assets/rpg-audio',
    zip: 'https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip',
  },
} as const satisfies Record<string, KenneyPack>;
type KenneyId = keyof typeof KENNEY;

type UrlSource = { kind: 'url'; url: string; page: string };
type ZipSource = { kind: 'zip'; pack: KenneyId; member: string };
type TtsSource = { kind: 'tts'; text: string; voice: TtsVoice; lang: 'pt' | 'en' };

type PackSound = {
  /** Path inside the library, with forward slashes. */
  file: `${Category}/${string}`;
  /** Button label (max 32 chars). */
  label: string;
  emoji: string;
  author: string;
  license: License;
  source: UrlSource | ZipSource | TtsSource;
  /** Ready-to-paste credit line, for licenses that require attribution. */
  credit?: string;
};

const KENNEY_MALE = 'Kenney (kenney.nl), voz de Jeffrey M. Smith';
const KENNEY_FEMALE = 'Kenney (kenney.nl), voz de Giselle';

function say(file: PackSound['file'], label: string, emoji: string, voice: TtsVoice, text: string): PackSound {
  const lang = file.startsWith('memes-pt/') ? 'pt' : 'en';
  return {
    file,
    label,
    emoji,
    author: `Voz "${voice}" da ElevenLabs, gerada pelo OpenRouter`,
    license: AI_VOICE,
    source: { kind: 'tts', text, voice, lang },
  };
}

function kenney(
  file: PackSound['file'],
  label: string,
  emoji: string,
  pack: KenneyId,
  member: string,
  author = 'Kenney (kenney.nl)',
): PackSound {
  return { file, label, emoji, author, license: CC0, source: { kind: 'zip', pack, member } };
}

/** `upload` is the path after /wikipedia/commons/ (as Commons serves it, already URL-encoded). */
function commons(
  file: PackSound['file'],
  label: string,
  emoji: string,
  author: string,
  license: License,
  upload: string,
  credit?: string,
): PackSound {
  const name = upload.slice(upload.lastIndexOf('/') + 1);
  return {
    file,
    label,
    emoji,
    author,
    license,
    ...(credit ? { credit } : {}),
    source: {
      kind: 'url',
      url: `https://upload.wikimedia.org/wikipedia/commons/${upload}`,
      page: `https://commons.wikimedia.org/wiki/File:${name}`,
    },
  };
}

/** OpenGameArt: `page` is the slug after /content/, `upload` the file name under /sites/default/files/. */
function oga(
  file: PackSound['file'],
  label: string,
  emoji: string,
  author: string,
  page: string,
  upload: string,
): PackSound {
  const source: UrlSource = {
    kind: 'url',
    url: `https://opengameart.org/sites/default/files/${upload}`,
    page: `https://opengameart.org/content/${page}`,
  };
  return { file, label, emoji, author, license: CC0, source };
}

/** Every sound of the pack. Voice lines are generic catchphrases: no impersonation of real people. */
const PACK: readonly PackSound[] = [
  say('memes-pt/que-isso-meu-filho.mp3', 'Que isso, meu filho?!', '😳', 'bill', '[laughs] Que isso, meu filho?!'),
  say('memes-pt/calma-calma-calma.mp3', 'Calma, calma, calma!', '😰', 'jessica', '[excited] Calma, calma... CALMA!'),
  say('memes-pt/deu-ruim.mp3', 'Deu ruim!', '💀', 'liam', '[sighs] Ih... deu ruim!'),
  say('memes-pt/brabo-demais.mp3', 'Brabo demais!', '💪', 'charlie', '[excited] Brabo demais!'),
  say('memes-pt/oloco.mp3', 'Oloco!', '🤯', 'eric', '[excited] Ô loco!'),
  say('memes-pt/rapaz.mp3', 'Rapaz…', '🤔', 'brian', '[sighs] Rapaz...'),
  say(
    'memes-pt/errou-feio-errou-rude.mp3',
    'Errou feio, errou rude!',
    '❌',
    'chris',
    '[mischievously] Errou feio... errou rude!',
  ),
  say('memes-pt/ta-pegando-fogo.mp3', 'Tá pegando fogo!', '🔥', 'laura', '[excited] Tá pegando fogo!'),
  say('memes-pt/bora-codar.mp3', 'Bora codar!', '💻', 'will', '[excited] Bora codar!'),
  say('memes-pt/ai-papai.mp3', 'Ai, papai!', '😏', 'will', '[laughs] Ai, papai!'),
  say(
    'memes-pt/compilou-de-primeira.mp3',
    'Compilou de primeira!',
    '🎉',
    'river',
    '[curious] Compilou... de primeira?!',
  ),
  say(
    'memes-pt/funciona-na-minha-maquina.mp3',
    'Funciona na minha máquina!',
    '🤷',
    'adam',
    '[sarcastic] Ué... funciona na minha máquina!',
  ),

  say('memes-en/bruh.mp3', 'Bruh', '😐', 'daniel', '[sighs] Bruh.'),
  say('memes-en/oh-no.mp3', 'Oh no!', '😱', 'sarah', 'Oh NO!'),
  say('memes-en/lets-go.mp3', "Let's go!", '🚀', 'liam', "[excited] Let's goooo!"),
  say('memes-en/emotional-damage.mp3', 'Emotional damage!', '💔', 'george', '[excited] EMOTIONAL DAMAGE!'),
  say(
    'memes-en/works-on-my-machine.mp3',
    'It works on my machine!',
    '🐛',
    'chris',
    '[sarcastic] Well... it works on my machine.',
  ),
  say(
    'memes-en/mission-failed.mp3',
    'Mission failed',
    '🎮',
    'roger',
    "[sighs] Mission failed. We'll get 'em next time.",
  ),
  say('memes-en/nice.mp3', 'Nice!', '👌', 'lily', '[mischievously] Nice.'),
  say('memes-en/wait-what.mp3', 'Wait, what?', '❓', 'alice', '[curious] Wait... what?'),
  say('memes-en/ship-it.mp3', 'Ship it!', '📦', 'matilda', '[excited] Ship it!'),
  say('memes-en/big-brain.mp3', 'Big brain move!', '🧠', 'callum', '[mischievously] Big brain move.'),
  kenney('memes-en/game-over.ogg', 'Game over', '👾', 'voiceover', 'Male/game_over.ogg', KENNEY_MALE),
  kenney('memes-en/you-win.ogg', 'You win!', '🏆', 'voiceover', 'Female/you_win.ogg', KENNEY_FEMALE),
  kenney('memes-en/you-lose.ogg', 'You lose', '😵', 'voiceover', 'Male/you_lose.ogg', KENNEY_MALE),
  kenney(
    'memes-en/congratulations.ogg',
    'Congratulations!',
    '🎊',
    'voiceover',
    'Female/congratulations.ogg',
    KENNEY_FEMALE,
  ),
  kenney('memes-en/new-highscore.ogg', 'New highscore!', '📈', 'voiceover', 'Female/new_highscore.ogg', KENNEY_FEMALE),
  kenney('memes-en/level-up.ogg', 'Level up!', '🆙', 'voiceover', 'Male/level_up.ogg', KENNEY_MALE),
  kenney(
    'memes-en/mission-completed.ogg',
    'Mission completed',
    '🎯',
    'voiceover',
    'Female/mission_completed.ogg',
    KENNEY_FEMALE,
  ),
  kenney(
    'memes-en/fire-in-the-hole.ogg',
    'Fire in the hole!',
    '💣',
    'voiceover',
    'Male/war_fire_in_the_hole.ogg',
    KENNEY_MALE,
  ),
  kenney('memes-en/go-go-go.ogg', 'Go, go, go!', '🏃', 'voiceover', 'Male/war_go_go_go.ogg', KENNEY_MALE),

  commons(
    'efeitos/aplausos.wav',
    'Aplausos',
    '👏',
    'Sandermotions (Freesound)',
    CC0,
    '6/6d/277021_sandermotions_applause-2.wav',
  ),
  commons(
    'efeitos/risadas.wav',
    'Risadas',
    '😂',
    'lonemonk (Freesound)',
    CC_BY_3,
    'e/e5/72844_lonemonk_approx-800-laughter-and-clapter-1.wav',
    '"Approx 800 laughter and clapter" por lonemonk (freesound.org), CC BY 3.0',
  ),
  commons(
    'efeitos/ba-dum-tss.wav',
    'Ba dum tss',
    '🥁',
    'Kevin MacLeod (incompetech.com)',
    CC_BY_3,
    '0/0c/Kevin_MacLeod_assorted_rimshots_-_Kdum-keesh.wav',
    '"Kdum-keesh" (Assorted Rimshots) por Kevin MacLeod (incompetech.com), CC BY 3.0',
  ),
  commons(
    'efeitos/trombone-triste.ogg',
    'Trombone triste',
    '🎺',
    'Joe Lamb (SoundBible)',
    CC_BY_3,
    '3/35/Sad_Trombone-Joe_Lamb-665429450.ogg',
    '"Sad Trombone" por Joe Lamb (soundbible.com), CC BY 3.0',
  ),
  oga(
    'efeitos/grilos.mp3',
    'Grilos',
    '🦗',
    'Wolfgang_ (OpenGameArt)',
    'crickets-ambient-noise-loopable',
    'crickets_1.mp3',
  ),
  commons(
    'efeitos/rufar-de-tambores.wav',
    'Rufar de tambores',
    '🪘',
    'Kevin MacLeod (incompetech.com)',
    CC_BY_3,
    '7/70/Kevin_MacLeod_assorted_rimshots_-_4-second_roll.wav',
    '"4-second roll" (Assorted Rimshots) por Kevin MacLeod (incompetech.com), CC BY 3.0',
  ),
  oga('efeitos/buzina.wav', 'Buzina', '📯', 'AntumDeluge (OpenGameArt)', 'bicycle-horn', 'bicycle-horn-1.wav'),
  oga(
    'efeitos/braaam.ogg',
    'Braaam',
    '🎬',
    'StumpyStrust (OpenGameArt)',
    'their-coming-generic-horn-sound',
    'theircoming3.ogg',
  ),
  commons('efeitos/errado.wav', 'Errado!', '🚫', 'David Pride (Cotswold Jam)', CC0, '5/55/Buzzer.wav'),
  kenney('efeitos/acerto.ogg', 'Acerto', '✅', 'interface', 'Audio/confirmation_004.ogg'),
  commons('efeitos/gongo.ogg', 'Gongo', '🔔', 'PDSounds', CC0, '4/42/Gong_or_bell_vibrant_%28short%29.ogg'),
  commons(
    'efeitos/lingua-de-sogra.ogg',
    'Língua de sogra',
    '🥳',
    'Flo Sorg',
    PUBLIC_DOMAIN,
    'e/e0/Luftr%C3%BCssel.ogg',
  ),
  commons('efeitos/risada-maligna.ogg', 'Risada maligna', '😈', 'Freesound (#50176)', CC0, '4/48/Evil_laugh.ogg'),
  commons('efeitos/ohhh.ogg', 'Ohhh!', '😮', 'starlite (PDSounds)', PUBLIC_DOMAIN, '0/0f/Ohhh_ahhh.ogg'),
  commons(
    'efeitos/internet-discada.oga',
    'Internet discada',
    '📞',
    'PDSounds',
    CC0,
    '8/85/Dial_up_connection_%28short%29.oga',
  ),
  kenney('efeitos/explosao.ogg', 'Explosão', '💥', 'scifi', 'Audio/lowFrequency_explosion_000.ogg'),
  kenney('efeitos/soco.ogg', 'Soco', '👊', 'impact', 'Audio/impactPunch_heavy_002.ogg'),
  kenney('efeitos/panelada.ogg', 'Panelada', '🍳', 'rpg', 'Audio/metalPot2.ogg'),
  kenney('efeitos/moedas.ogg', 'Moedas', '🪙', 'rpg', 'Audio/handleCoins.ogg'),
  kenney('efeitos/power-up.ogg', 'Power-up', '⚡', 'digital', 'Audio/powerUp1.ogg'),
];

/**
 * The 24 default buttons, in deck order. A voice line skipped for lack of a TTS key gives its place
 * to the rest of the pack; a sound that failed to download keeps it for the next run.
 */
const DEFAULT_BUTTONS: readonly PackSound['file'][] = [
  'memes-pt/que-isso-meu-filho.mp3',
  'memes-pt/deu-ruim.mp3',
  'memes-pt/brabo-demais.mp3',
  'memes-pt/oloco.mp3',
  'memes-pt/errou-feio-errou-rude.mp3',
  'memes-pt/bora-codar.mp3',
  'memes-pt/compilou-de-primeira.mp3',
  'memes-pt/funciona-na-minha-maquina.mp3',
  'memes-en/bruh.mp3',
  'memes-en/emotional-damage.mp3',
  'memes-en/lets-go.mp3',
  'memes-en/oh-no.mp3',
  'memes-en/mission-failed.mp3',
  'memes-en/ship-it.mp3',
  'memes-en/game-over.ogg',
  'efeitos/aplausos.wav',
  'efeitos/risadas.wav',
  'efeitos/ba-dum-tss.wav',
  'efeitos/trombone-triste.ogg',
  'efeitos/grilos.mp3',
  'efeitos/rufar-de-tambores.wav',
  'efeitos/buzina.wav',
  'efeitos/braaam.ogg',
  'efeitos/errado.wav',
];

/** An expected failure, printed as "Erro: <message> — Solução: <solution>". */
class PackError extends Error {
  constructor(
    message: string,
    readonly solution: string = RERUN,
  ) {
    super(message);
    this.name = 'PackError';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const categoryOf = (file: string) => file.slice(0, file.indexOf('/')) as Category;
const withoutTags = (text: string) => text.replace(/\[[^\]]*\]\s*/g, '').trim();
const toPackError = (err: unknown): PackError =>
  err instanceof PackError ? err : new PackError((err as Error)?.message ?? String(err));
const usd = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------------------------------------
// Downloads

const AUDIO_TYPES = /^(audio\/|application\/ogg|application\/octet-stream|video\/ogg)/;
const ZIP_TYPES = /^application\/(zip|x-zip-compressed|octet-stream)/;
const MAX_BYTES = { audio: 20 * 1024 * 1024, zip: 60 * 1024 * 1024 } as const;
/** Wikimedia answers 429 to bursts and Kenney 403: keep a gap between requests to the same host. */
const HOST_GAP_MS: Record<string, number> = { 'upload.wikimedia.org': 1500, 'kenney.nl': 1500 };
const lastRequest = new Map<string, number>();

function sniff(buf: Buffer): 'ogg' | 'wav' | 'mp3' | 'flac' | 'zip' | null {
  const tag = buf.subarray(0, 4).toString('latin1');
  if (tag === 'OggS') return 'ogg';
  if (tag === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WAVE') return 'wav';
  if (tag === 'fLaC') return 'flac';
  if (tag === 'PK\u0003\u0004') return 'zip';
  if (tag.startsWith('ID3') || (buf[0] === 0xff && ((buf[1] ?? 0) & 0xe0) === 0xe0)) return 'mp3';
  return null;
}

function retryAfterMs(res: Response): number | null {
  const value = res.headers.get('retry-after');
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return secs * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

async function politeFetch(url: string, timeoutMs = 60_000): Promise<Response> {
  const host = new URL(url).host;
  const wait = (lastRequest.get(host) ?? 0) + (HOST_GAP_MS[host] ?? 250) - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest.set(host, Date.now());
  return fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/** Downloads with retries (429, 5xx, network) and checks status, content type, size and magic bytes. */
async function download(url: string, kind: 'audio' | 'zip'): Promise<Buffer> {
  let lastError = 'falha no download';
  for (let attempt = 1; attempt <= 4; attempt++) {
    let res: Response;
    try {
      res = await politeFetch(url, kind === 'zip' ? 180_000 : 60_000);
    } catch (err) {
      lastError = `falha de rede: ${(err as Error).message}`;
      await sleep(2000 * attempt);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      lastError = `HTTP ${res.status} em ${url}`;
      await res.body?.cancel();
      await sleep(Math.min(retryAfterMs(res) ?? 5000 * attempt, 30_000));
      continue;
    }
    if (!res.ok) throw new PackError(`HTTP ${res.status} em ${url}`);
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!(kind === 'zip' ? ZIP_TYPES : AUDIO_TYPES).test(type)) {
      throw new PackError(
        `${url} respondeu ${type || 'sem content-type'} em vez de ${kind === 'zip' ? 'zip' : 'áudio'}`,
      );
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastError = `download interrompido: ${(err as Error).message}`;
      continue;
    }
    const declared = Number(res.headers.get('content-length'));
    if (!res.headers.get('content-encoding') && declared > 0 && declared !== buf.length) {
      lastError = `download incompleto de ${url}`;
      continue;
    }
    if (buf.length < 512 || buf.length > MAX_BYTES[kind]) {
      throw new PackError(`${url} veio com tamanho inesperado (${buf.length} bytes)`);
    }
    const magic = sniff(buf);
    if (kind === 'zip' ? magic !== 'zip' : magic === null || magic === 'zip') {
      throw new PackError(`o conteúdo de ${url} não é ${kind === 'zip' ? 'um zip' : 'um áudio'}`);
    }
    return buf;
  }
  throw new PackError(lastError);
}

const zipName = (pack: KenneyPack) => pack.zip.slice(pack.zip.lastIndexOf('/') + 1);

/** A Kenney zip saved by the browser (SFX_PACK_ZIP_DIR or Downloads), for when the site refuses scripts. */
async function savedKenneyZip(pack: KenneyPack): Promise<Buffer | null> {
  const dirs = [process.env.SFX_PACK_ZIP_DIR?.trim(), path.join(os.homedir(), 'Downloads')];
  for (const dir of dirs) {
    const file = dir ? path.join(dir, zipName(pack)) : '';
    if (!file || !existsSync(file)) continue;
    const buf = await readFile(file);
    if (sniff(buf) !== 'zip') continue;
    console.log(`Usando ${file}, salvo no PC.`);
    return buf;
  }
  return null;
}

/** Kenney zip: a saved copy first, then the known link, then the current link read from the asset page. */
async function kenneyZip(pack: KenneyPack): Promise<Buffer> {
  const saved = await savedKenneyZip(pack);
  if (saved) return saved;
  try {
    try {
      return await download(pack.zip, 'zip');
    } catch (err) {
      const res = await politeFetch(pack.page).catch(() => null);
      const html = res?.ok ? await res.text() : '';
      const link = html.match(/https:\/\/kenney\.nl\/media\/pages\/assets\/[^"'\s]+?\.zip/)?.[0];
      if (!link || link === pack.zip) throw err;
      return await download(link, 'zip');
    }
  } catch (err) {
    throw new PackError(
      `não consegui baixar ${zipName(pack)} da Kenney (${toPackError(err).message})`,
      `espere alguns minutos e rode npm run sfx:pack de novo; se continuar, baixe o zip em ${pack.page} pelo navegador (ele vai para Downloads) e rode de novo`,
    );
  }
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim().split(/\r?\n/)[0] || `${command} saiu com código ${code}`));
    });
  });
}

/** No zip library is installed: Expand-Archive on Windows, unzip elsewhere. `label` names the zip in errors. */
async function extractZip(zip: string, dest: string, label: string): Promise<void> {
  const windows = process.platform === 'win32';
  const quote = (p: string) => `'${p.replace(/'/g, "''")}'`;
  // One-line error (the innermost exception says why) instead of PowerShell's multi-line error record.
  const expand = `Expand-Archive -LiteralPath ${quote(zip)} -DestinationPath ${quote(dest)} -Force -ErrorAction Stop`;
  const report =
    '$e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }; [Console]::Error.WriteLine($e.Message)';
  const script = `$ProgressPreference='SilentlyContinue'; try { ${expand} } catch { ${report}; exit 1 }`;
  const [command, args]: [string, string[]] = windows
    ? ['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]]
    : ['unzip', ['-q', '-o', zip, '-d', dest]];
  try {
    await run(command, args);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new PackError(
        `o ${command} não foi encontrado para extrair ${label}`,
        windows
          ? 'confira se o Windows PowerShell está instalado e rode npm run sfx:pack de novo'
          : 'instale o unzip (sudo apt install unzip ou brew install unzip) e rode npm run sfx:pack de novo',
      );
    }
    throw new PackError(
      `${label} veio corrompido (${(err as Error).message})`,
      `apague ${label} de Downloads ou de SFX_PACK_ZIP_DIR, se estiver lá, e rode npm run sfx:pack de novo`,
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Probe and place

type Probe = { ok: true; durationMs: number } | { ok: false; reason: string };

/** Decodes the whole file with ffmpeg: any decoding error drops it before it reaches the library. */
function probe(ffmpeg: string, file: string): Promise<Probe> {
  return new Promise((resolve) => {
    const args = ['-nostdin', '-hide_banner', '-v', 'error', '-progress', 'pipe:1', '-i', file, '-f', 'null', '-'];
    const child = spawn(ffmpeg, args, { windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill(), 30_000);
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, reason: e.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const micros = [...out.matchAll(/out_time_us=(\d+)/g)].at(-1)?.[1];
      const durationMs = micros ? Number(micros) / 1000 : 0;
      const firstError = err.trim().split(/\r?\n/)[0];
      if (code !== 0 || firstError) resolve({ ok: false, reason: firstError || `ffmpeg saiu com código ${code}` });
      else if (durationMs < 50) resolve({ ok: false, reason: 'o arquivo não tem áudio' });
      else if (durationMs > SFX_MAX_DURATION_MS) resolve({ ok: false, reason: 'o som passa de 2 minutos' });
      else resolve({ ok: true, durationMs });
    });
  });
}

/** Checks the staged file and moves it into the library atomically (the scanner ignores ".part"). */
async function place(ffmpeg: string, staged: string, dest: string): Promise<void> {
  const check = await probe(ffmpeg, staged);
  if (!check.ok) {
    throw new PackError(
      `áudio com defeito descartado: ${check.reason}`,
      `${RERUN}; o arquivo ruim não entrou na pasta`,
    );
  }
  await mkdir(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  await copyFile(staged, part);
  await rename(part, dest);
}

// ---------------------------------------------------------------------------------------------
// Voice lines

type TtsStats = { model: string; chars: Map<string, number>; lines: number; blocked: PackError | null };

function ttsError(err: unknown): PackError {
  const status = err instanceof OpenRouterError ? err.status : undefined;
  if (status === 401) {
    return new PackError(
      'o OpenRouter recusou a OPENROUTER_API_KEY',
      'gere uma chave em https://openrouter.ai/keys, salve no .env e rode npm run sfx:pack de novo',
    );
  }
  if (status === 402) {
    return new PackError(
      'a conta do OpenRouter está sem créditos',
      'adicione créditos em https://openrouter.ai/settings/credits e rode npm run sfx:pack de novo',
    );
  }
  return new PackError(`a voz não foi gerada (${(err as Error).message.slice(0, 160)})`);
}

/** Parallel lines may all hit the missing model: switch (and warn) only once. */
function switchToFallbackModel(stats: TtsStats): void {
  if (stats.model === TTS_MODELS[1]) return;
  stats.model = TTS_MODELS[1];
  console.log(`Aviso: ${TTS_MODELS[0]} não respondeu; as falas seguem com ${TTS_MODELS[1]}, sem as tags de emoção.`);
}

async function synthesize(client: OpenRouter, source: TtsSource, stats: TtsStats): Promise<Buffer> {
  if (stats.blocked) throw stats.blocked;
  const speak = async (model: string) => {
    const input = model === TTS_MODELS[0] ? source.text : withoutTags(source.text);
    const { audio } = await client.speech({
      model,
      input,
      voice: source.voice,
      languageCode: source.lang,
      timeoutMs: 45_000,
    });
    stats.chars.set(model, (stats.chars.get(model) ?? 0) + input.length);
    stats.lines++;
    return audio;
  };
  try {
    return await speak(stats.model);
  } catch (err) {
    const status = err instanceof OpenRouterError ? err.status : undefined;
    // The expressive model may disappear from OpenRouter: switch to the fallback when it works.
    if (stats.model === TTS_MODELS[0] && (status === 400 || status === 404)) {
      try {
        const audio = await speak(TTS_MODELS[1]);
        switchToFallbackModel(stats);
        return audio;
      } catch {
        // keep the original error
      }
    }
    const error = ttsError(err);
    if (status === 401 || status === 402) stats.blocked = error;
    throw error;
  }
}

/** List price per character of a speech model (public endpoint), to report the spend. */
async function pricePerChar(model: string): Promise<number | null> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models?output_modalities=speech', {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { id: string; pricing?: { prompt?: string } }[] };
    const price = Number(body.data?.find((m) => m.id === model)?.pricing?.prompt);
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Buttons

type ButtonsFile = { version: 1; buttons: SfxButton[] };
type PackState = { version: 1; buttons: string[] };

async function readJson(file: string): Promise<unknown> {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    throw new PackError(
      `${file} não é um JSON válido (${(err as Error).message})`,
      'corrija o arquivo ou mova-o para outro lugar e rode npm run sfx:pack de novo',
    );
  }
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await rename(tmp, file);
}

async function readButtons(file: string): Promise<SfxButton[]> {
  const data = (await readJson(file)) as Partial<ButtonsFile> | null;
  if (data === null) return [];
  if (data.version !== 1 || !Array.isArray(data.buttons)) {
    throw new PackError(
      `${file} tem um formato que este script não conhece`,
      'atualize o stream95 ou mova o arquivo para outro lugar e rode npm run sfx:pack de novo',
    );
  }
  return data.buttons;
}

async function readState(file: string): Promise<Set<string>> {
  const data = (await readJson(file)) as Partial<PackState> | null;
  return new Set(Array.isArray(data?.buttons) ? data.buttons.filter((f) => typeof f === 'string') : []);
}

/**
 * Pack sounds that deserve a default button, in deck order. A default sound that failed in this
 * run keeps its place for the next run instead of handing it to another sound.
 */
function buttonCandidates(
  present: Set<string>,
  existing: SfxButton[],
  offered: Set<string>,
  failed: Set<string>,
): PackSound[] {
  const mapped = new Set(existing.map((b) => b.soundId).filter(Boolean));
  const order = [...DEFAULT_BUTTONS, ...PACK.map((s) => s.file).filter((f) => !DEFAULT_BUTTONS.includes(f))];
  const held = DEFAULT_BUTTONS.filter((f) => failed.has(f) && !offered.has(f)).length;
  const room = Math.max(0, MAX_BUTTONS - existing.length - held);
  return order
    .map((file) => PACK.find((s) => s.file === file))
    .filter((s): s is PackSound => s !== undefined)
    .filter((s) => present.has(s.file) && !offered.has(s.file) && !mapped.has(sfxSoundId(s.file)))
    .slice(0, room);
}

/** Body of POST /api/sfx/buttons (the server picks the id). */
function buttonBody(sound: PackSound): Omit<SfxButton, 'id'> {
  return {
    label: sound.label.slice(0, 32),
    soundId: sfxSoundId(sound.file),
    emoji: sound.emoji,
    color: COLORS[categoryOf(sound.file)],
    volume: BUTTON_VOLUME,
  };
}

type Server = { base: string; library: SfxLibrary };

/** A running server owns the buttons in memory: talk to its API instead of writing the file under it. */
async function findServer(port: number): Promise<Server | null> {
  const base = `http://127.0.0.1:${port}`;
  try {
    const res = await fetch(`${base}/api/sfx`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    const library = (await res.json()) as Partial<SfxLibrary>;
    if (typeof library.dir !== 'string' || !Array.isArray(library.sounds) || !Array.isArray(library.buttons)) {
      return null;
    }
    return { base, library: library as SfxLibrary };
  } catch {
    return null;
  }
}

async function api<T>(server: Server, method: 'POST', route: string, body?: unknown): Promise<T> {
  const res = await fetch(`${server.base}${route}`, {
    method,
    headers: { 'x-stream95': '1', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new PackError(
      `o servidor respondeu HTTP ${res.status} em ${route}: ${text.slice(0, 160)}`,
      'pare o servidor (Ctrl+C), rode npm run sfx:pack de novo e inicie o servidor depois',
    );
  }
  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------------------------
// Credits

function creditsText(present: PackSound[]): string {
  const lines = [
    'Créditos do pacote inicial de sons do stream95',
    'Gerado por npm run sfx:pack. O comando refaz este arquivo a cada execução.',
    '',
    'Licenças',
    '- CC0 1.0 e domínio público: uso livre, inclusive em lives, sem crédito obrigatório.',
    '- CC BY 3.0: uso livre, inclusive em lives, desde que você dê crédito ao autor.',
    '  Cole as linhas "Crédito" no painel ou na descrição do canal.',
    '- Voz gerada por IA: falas criadas por você com a ElevenLabs pelo OpenRouter, sujeitas aos termos',
    '  de uso dessas plataformas (https://openrouter.ai/terms e https://elevenlabs.io/terms-of-use).',
    '',
  ];
  for (const category of CATEGORIES) {
    const sounds = present.filter((s) => categoryOf(s.file) === category);
    if (sounds.length === 0) continue;
    lines.push(`== ${category} ==`, '');
    for (const sound of sounds) {
      lines.push(sound.file, `  Autor: ${sound.author}`, `  Licença: ${sound.license.name} (${sound.license.url})`);
      const source = sound.source;
      if (source.kind === 'url') lines.push(`  Fonte: ${source.page}`, `  Download: ${source.url}`);
      if (source.kind === 'zip') {
        const pack = KENNEY[source.pack];
        lines.push(`  Fonte: ${pack.page} (${pack.title}, arquivo ${source.member})`);
      }
      if (source.kind === 'tts') lines.push(`  Texto: ${withoutTags(source.text)}`);
      if (sound.credit) lines.push(`  Crédito: ${sound.credit}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// Main

type Outcome = { sound: PackSound; status: 'added' | 'kept' | 'failed'; error?: PackError };

async function pool<T>(items: readonly T[], size: number, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++] as T;
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

async function main(): Promise<number> {
  const env = loadEnv();
  const ffmpeg = ffmpegStatic;
  if (!ffmpeg || !existsSync(ffmpeg)) {
    throw new PackError('o ffmpeg do pacote ffmpeg-static não foi encontrado', 'rode npm install e tente de novo');
  }
  const server = await findServer(env.PORT);
  // a running server knows its folder; otherwise the same rule as the server (SOUNDS_DIR or Documents)
  const soundsDir =
    server?.library.dir ?? sfxPaths({ dataDir: env.dataDir, root: env.root, soundsDir: env.SOUNDS_DIR }).dir;
  const buttonsFile = path.join(env.dataDir, SFX_BUTTONS_FILE);
  const stateFile = path.join(env.dataDir, STATE_FILE);

  console.log('Pacote inicial de sons do stream95');
  console.log(`Pasta dos sons: ${soundsDir}`);
  if (server) console.log(`Servidor ligado em ${server.base}: os botões entram pela API.`);

  const outcomes = new Map<string, Outcome>();
  const missing: PackSound[] = [];
  for (const sound of PACK) {
    if (existsSync(path.join(soundsDir, sound.file))) outcomes.set(sound.file, { sound, status: 'kept' });
    else missing.push(sound);
  }
  const settle = (sound: PackSound, error?: unknown) => {
    outcomes.set(
      sound.file,
      error ? { sound, status: 'failed', error: toPackError(error) } : { sound, status: 'added' },
    );
  };
  const dest = (sound: PackSound) => path.join(soundsDir, ...sound.file.split('/'));

  const tts = missing.filter((s): s is PackSound & { source: TtsSource } => s.source.kind === 'tts');
  const urls = missing.filter((s): s is PackSound & { source: UrlSource } => s.source.kind === 'url');
  const zips = new Map<KenneyId, (PackSound & { source: ZipSource })[]>();
  for (const sound of missing) {
    if (sound.source.kind !== 'zip') continue;
    const list = zips.get(sound.source.pack) ?? [];
    list.push(sound as PackSound & { source: ZipSource });
    zips.set(sound.source.pack, list);
  }

  const stats: TtsStats = { model: TTS_MODELS[0], chars: new Map(), lines: 0, blocked: null };
  let ttsSkipped = 0;
  const work = await mkdtemp(path.join(os.tmpdir(), 'stream95-sfx-pack-'));
  try {
    const downloadUrls = async () => {
      if (urls.length)
        console.log(`Baixando ${plural(urls.length, 'efeito', 'efeitos')} do Wikimedia Commons e do OpenGameArt...`);
      const dir = path.join(work, 'url');
      await mkdir(dir, { recursive: true });
      for (const sound of urls) {
        try {
          const buf = await download(sound.source.url, 'audio');
          const staged = path.join(dir, path.basename(sound.file));
          await writeFile(staged, buf);
          await place(ffmpeg, staged, dest(sound));
          settle(sound);
        } catch (err) {
          settle(sound, err);
        }
      }
    };

    const downloadZips = async () => {
      if (zips.size) console.log(`Buscando ${plural(zips.size, 'pacote', 'pacotes')} da Kenney (CC0)...`);
      for (const [id, sounds] of zips) {
        const dir = path.join(work, `kenney-${id}`);
        try {
          await mkdir(dir, { recursive: true });
          const zip = path.join(work, `kenney-${id}.zip`);
          await writeFile(zip, await kenneyZip(KENNEY[id]));
          await extractZip(zip, dir, zipName(KENNEY[id]));
        } catch (err) {
          for (const sound of sounds) settle(sound, err);
          continue;
        }
        for (const sound of sounds) {
          try {
            const staged = path.join(dir, ...sound.source.member.split('/'));
            if (!existsSync(staged)) {
              throw new PackError(
                `${sound.source.member} não existe mais em ${KENNEY[id].title}`,
                'avise o projeto: o pacote da Kenney mudou e o script precisa de outro arquivo',
              );
            }
            await place(ffmpeg, staged, dest(sound));
            settle(sound);
          } catch (err) {
            settle(sound, err);
          }
        }
      }
    };

    const generateVoices = async () => {
      if (tts.length === 0) return;
      if (!env.OPENROUTER_API_KEY) {
        ttsSkipped = tts.length;
        return;
      }
      console.log(`Gerando ${plural(tts.length, 'fala', 'falas')} com ${TTS_MODELS[0]}...`);
      const client = new OpenRouter({
        apiKey: env.OPENROUTER_API_KEY,
        title: 'stream95 sfx pack',
        referer: REPO_URL,
        log: silentLogger,
      });
      const dir = path.join(work, 'tts');
      await mkdir(dir, { recursive: true });
      await pool(tts, TTS_CONCURRENCY, async (sound) => {
        try {
          const audio = await synthesize(client, sound.source, stats);
          const staged = path.join(dir, path.basename(sound.file));
          await writeFile(staged, audio);
          await place(ffmpeg, staged, dest(sound));
          settle(sound);
        } catch (err) {
          settle(sound, err);
        }
      });
    };

    await Promise.all([downloadUrls(), downloadZips(), generateVoices()]);
  } finally {
    await rm(work, { recursive: true, force: true });
  }

  // Credits for every pack sound in the library, rewritten only when they change.
  const presentSounds = PACK.filter((s) => existsSync(dest(s)));
  const present = new Set(presentSounds.map((s) => s.file));
  const creditsFile = path.join(soundsDir, CREDITS_FILE);
  const credits = creditsText(presentSounds);
  const oldCredits = existsSync(creditsFile) ? await readFile(creditsFile, 'utf8') : '';
  if (presentSounds.length && credits !== oldCredits) {
    await mkdir(soundsDir, { recursive: true });
    await writeFile(`${creditsFile}.part`, credits, 'utf8');
    await rename(`${creditsFile}.part`, creditsFile);
  }

  // Buttons: only add, up to MAX_BUTTONS, never for a pack sound that already got one.
  const offered = await readState(stateFile);
  const failed = new Set([...outcomes.values()].filter((o) => o.status === 'failed').map((o) => o.sound.file));
  let added: SfxButton[] = [];
  let total = 0;
  let buttonsWhere = buttonsFile;
  if (server) {
    const library = await api<SfxLibrary>(server, 'POST', '/api/sfx/rescan');
    const known = new Set(library.sounds.map((s) => s.id));
    const candidates = buttonCandidates(present, library.buttons, offered, failed).filter((s) =>
      known.has(sfxSoundId(s.file)),
    );
    for (const sound of candidates) {
      added.push(await api<SfxButton>(server, 'POST', '/api/sfx/buttons', buttonBody(sound)));
      offered.add(sound.file);
    }
    total = library.buttons.length + added.length;
    buttonsWhere = `${server.base}/api/sfx`;
  } else {
    const existing = await readButtons(buttonsFile);
    const candidates = buttonCandidates(present, existing, offered, failed);
    added = candidates.map((sound) => ({ id: randomUUID(), ...buttonBody(sound) }));
    for (const sound of candidates) offered.add(sound.file);
    if (added.length) await writeJsonAtomic(buttonsFile, { version: 1, buttons: [...existing, ...added] });
    total = existing.length + added.length;
  }
  if (added.length) await writeJsonAtomic(stateFile, { version: 1, buttons: [...offered].sort() } satisfies PackState);

  // Summary
  const all = [...outcomes.values()];
  console.log('');
  for (const category of CATEGORIES) {
    const items = all.filter((o) => categoryOf(o.sound.file) === category);
    const count = (status: Outcome['status']) => items.filter((o) => o.status === status).length;
    const kept = count('kept');
    const broken = count('failed');
    const keptText = `${kept} já ${kept === 1 ? 'estava' : 'estavam'} na pasta`;
    console.log(
      `  ${category}: ${plural(count('added'), 'novo', 'novos')}, ${keptText}${broken ? `, ${broken} com erro` : ''}`,
    );
  }
  if (stats.lines) {
    let cost = 0;
    let chars = 0;
    for (const [model, count] of stats.chars) {
      const price = (await pricePerChar(model)) ?? (model === TTS_MODELS[0] ? 80e-6 : 40e-6);
      cost += price * count;
      chars += count;
    }
    const models = [...stats.chars.keys()].join(' e ');
    console.log(
      `  Vozes: ${plural(stats.lines, 'fala', 'falas')} com ${models}, ${chars} caracteres, ${usd(cost)} no OpenRouter`,
    );
  }
  const relative = path.relative(env.root, buttonsWhere);
  const where = server || !relative || relative.startsWith('..') || path.isAbsolute(relative) ? buttonsWhere : relative;
  console.log(
    added.length
      ? `  Botões: ${plural(added.length, 'novo', 'novos')} (${total} no total) em ${where}`
      : `  Botões: nenhum novo (${total} no deck; o limite do pacote é ${MAX_BUTTONS})`,
  );
  if (presentSounds.length) console.log(`  Créditos: ${creditsFile}`);
  if (ttsSkipped) {
    console.log(
      `Aviso: sem OPENROUTER_API_KEY, ${plural(ttsSkipped, 'fala', 'falas')} de memes ${ttsSkipped === 1 ? 'ficou' : 'ficaram'} de fora — Solução: defina a chave no .env e rode npm run sfx:pack de novo`,
    );
  }
  if (!server && added.length) {
    console.log('Os botões novos aparecem no deck quando o servidor iniciar.');
  }

  const failures = all.filter((o) => o.status === 'failed');
  const groups = new Map<string, { error: PackError; files: string[] }>();
  for (const failure of failures) {
    const error = failure.error ?? new PackError('falha desconhecida');
    const key = `${error.message}|${error.solution}`;
    const group = groups.get(key) ?? { error, files: [] };
    group.files.push(failure.sound.file);
    groups.set(key, group);
  }
  for (const { error, files } of groups.values()) {
    console.error(`Erro: ${files.join(', ')}: ${error.message} — Solução: ${error.solution}`);
  }
  return failures.length ? 1 : 0;
}

try {
  process.exitCode = await main();
} catch (err) {
  const error = toPackError(err);
  console.error(`Erro: ${error.message} — Solução: ${error.solution}`);
  process.exitCode = 1;
}
