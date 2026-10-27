// Local word lists for the zero-latency moderation layer.
//
// Design: the HARD list only holds terms that are offensive in any context, so a
// match blocks immediately. Ambiguous words (that are insults in one sentence and
// harmless in another — "macaco", "veado", "puta" as an intensifier) go to the
// SUSPICIOUS list: with the LLM on, the model reads the context; with it off, the
// message waits in the review queue. Mild profanity not aimed at anyone ("porra,
// funcionou!") is allowed by policy and is in neither list.
//
// Terms are written in normalized form (lowercase, no accents) — see normalize.ts.

/** Portuguese slurs that are never acceptable. Block on sight. */
export const HARD_TERMS_PT: readonly string[] = ['boiola', 'boiolinha', 'baitola', 'traveco', 'mongoloide'];

/** English slurs kept from the `obscenity` dataset (everything else goes to the LLM). */
export const HARD_ENGLISH_WORDS: ReadonlySet<string> = new Set([
  'abeed',
  'abo',
  'africoon',
  'arabush',
  'boonga',
  'chingchong',
  'chink',
  'fag',
  'kike',
  'nigger',
  'retard',
  'spastic',
  'tranny',
]);

/** Explicit sexual terms from the `obscenity` dataset that are always out of place in chat. */
export const EXPLICIT_ENGLISH_WORDS: ReadonlySet<string> = new Set([
  'blowjob',
  'deepthroat',
  'gangbang',
  'handjob',
  'fellatio',
  'bestiality',
  'incest',
  'lubejob',
  'double penetration',
  'finger bang',
]);

/** Ambiguous Portuguese terms: hold for review when the LLM is unavailable. */
export const SUSPICIOUS_TERMS_PT: readonly string[] = [
  'viado',
  'veado',
  'bicha',
  'sapatao',
  'macaco',
  'macaca',
  'macacada',
  'senzala',
  'retardado',
  'retardada',
  'crioulo',
  'neguinho',
  'puta',
  'vagabunda',
  'piranha',
  'vadia',
  'arrombado',
  'arrombada',
  'corno',
  'otario',
  'babaca',
  'imbecil',
  'idiota',
  'lixo',
  'cuzao',
  'fdp',
  'filho da puta',
  'vai se foder',
  'vsf',
  'vtnc',
  'tnc',
  'pau no cu',
  'se mata',
  'te mata',
  'vou te pegar',
  'nazista',
  'hitler',
  'estupro',
  'estuprar',
  'pedofilo',
  'nudes',
];

/** Spam/scam shapes typical of Twitch bot raids and BR golpes. */
export const SCAM_PATTERNS: readonly RegExp[] = [
  /\b(compr[ae]r?|vend[eoa]|barat[oa]s?|pre[cç]o|promo[cç][aã]o|desconto)\b.{0,40}\b(seguidores?|followers?|viewers?|views?|primes?|inscritos?)\b/i,
  /\b(best|cheap|buy)\s+(viewers|followers|primes)\b/i,
  /\bwanna\s+become\s+famous\b/i,
  /\b(airdrop|nft\s+gr[aá]tis|ganhe?\s+pix|pix\s+gr[aá]tis|dobr[ae]\s+seu\s+pix|renda\s+extra)\b/i,
  /\b(invest\w*)\b.{0,30}\b(cripto|crypto|bitcoin|forex|trade)\b/i,
  /\b(me\s+chama\s+no\s+(pv|privado|zap|whats)|chama\s+no\s+zap|dm\s+me)\b/i,
];

/** Invite/shortener hosts that are always suspicious when posted by a viewer. */
export const SUSPICIOUS_HOSTS: readonly string[] = [
  'bit.ly',
  'tinyurl.com',
  'cutt.ly',
  'shorturl.at',
  'is.gd',
  't.me',
  'wa.me',
  'chat.whatsapp.com',
  'discord.gg',
  'grabify.link',
  'iplogger.org',
];

/** Messages that are obviously harmless: skip the LLM to save time and money. */
export const TRIVIAL_SAFE: readonly RegExp[] = [
  /^(k{2,}|(ha){2,}h?|(he){2,}h?|(rs){2,}|(hu){2,}e?|lol|lmao|xd)$/i,
  /^(oi+e?|ol[aá]+|salve+|eae+|e a[ií]+|opa+|hey+|hello+|hi+|yo+)( chat| galera| pessoal| geral)?[!.]*$/i,
  /^(boa (noite|tarde)|bom dia)( chat| galera| pessoal| geral)?[!.]*$/i,
  /^(gg+|f+|o\/|\\o\/|w+|pog+|bora+|vamo+|let'?s go+|nice+|top+|show+|massa+|daora+|brabo+|que isso+)[!.]*$/i,
  /^[!?.]{1,5}$/,
  /^\d{1,3}$/,
];

/** TLDs that make "word.tld" a link. File-extension-like TLDs are only links with a scheme/www/path. */
export const LINK_TLDS: ReadonlySet<string> = new Set([
  'com',
  'net',
  'org',
  'io',
  'gg',
  'tv',
  'me',
  'br',
  'ly',
  'co',
  'xyz',
  'app',
  'dev',
  'link',
  'info',
  'biz',
  'ru',
  'cn',
  'tk',
  'ml',
  'ga',
  'cf',
  'gq',
  'top',
  'site',
  'online',
  'store',
  'shop',
  'live',
  'stream',
  'click',
  'fun',
  'icu',
  'club',
  'vip',
  'pro',
  'ai',
  'so',
  'sh',
  'to',
  'cc',
  'us',
  'uk',
  'de',
  'fr',
  'es',
  'pt',
  'it',
  'nl',
  'pl',
  'jp',
  'kr',
  'in',
  'ar',
  'mx',
  'cl',
  'eu',
  'md',
  'py',
  'rs',
  'ws',
  'zip',
  'mov',
  'lol',
  'gov',
  'edu',
]);

export const FILE_LIKE_TLDS: ReadonlySet<string> = new Set([
  'md',
  'py',
  'rs',
  'sh',
  'pl',
  'so',
  'cc',
  'zip',
  'mov',
  'ws',
  'to',
]);
