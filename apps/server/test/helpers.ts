import type { ChatMessage } from '@stream95/shared';

let seq = 0;

export function chatMsg(text: string, over: Partial<ChatMessage> = {}): ChatMessage {
  seq++;
  const login = over.login ?? 'viewer';
  return {
    id: `m${seq}`,
    channel: 'canal',
    userId: over.userId ?? `u-${login}`,
    login,
    displayName: over.displayName ?? login,
    text,
    emotes: [],
    badges: [],
    isBroadcaster: false,
    isMod: false,
    isVip: false,
    isSub: false,
    isFirst: false,
    isHighlighted: false,
    timestamp: Date.now(),
    source: 'twitch',
    ...over,
  };
}

/** Fake fetch that answers OpenRouter chat completions with a fixed content (or an error status). */
export function fakeOpenRouterFetch(
  content: string | ((body: unknown) => string),
  opts: { status?: number; delayMs?: number } = {},
) {
  const calls: unknown[] = [];
  const impl = (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    calls.push(body);
    if (opts.delayMs) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, opts.delayMs);
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    }
    if (opts.status && opts.status !== 200)
      return new Response('{"error":{"message":"nope"}}', { status: opts.status });
    const text = typeof content === 'function' ? content(body) : content;
    return new Response(
      JSON.stringify({ model: body.model, choices: [{ message: { content: text } }], usage: { cost: 0.00001 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  return { impl, calls };
}
