import type { TwitchTokenManager } from './token.js';

const HELIX = 'https://api.twitch.tv/helix';

/** The few Helix endpoints stream95 needs, authenticated with the streamer's user token. */
export class Helix {
  private readonly userIds = new Map<string, string>();

  constructor(
    private readonly tokens: TwitchTokenManager,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.tokens.getAccessToken();
    const clientId = this.tokens.current?.clientId;
    if (!token || !clientId) throw new Error('Twitch não autenticada');
    const res = await this.fetchImpl(`${HELIX}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Client-Id': clientId,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!res.ok) throw new Error(`helix ${method} ${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
    return (text ? JSON.parse(text) : undefined) as T;
  }

  async userId(login: string): Promise<string> {
    const key = login.toLowerCase();
    const cached = this.userIds.get(key);
    if (cached) return cached;
    const data = await this.request<{ data: { id: string }[] }>('GET', `/users?login=${encodeURIComponent(key)}`);
    const id = data.data[0]?.id;
    if (!id) throw new Error(`canal não encontrado: ${login}`);
    this.userIds.set(key, id);
    return id;
  }

  /** Send a chat message as the logged-in user (scope user:write:chat). */
  async say(channel: string, message: string): Promise<void> {
    const sender = this.tokens.current?.userId;
    if (!sender || !this.tokens.has('user:write:chat')) throw new Error('login sem permissão de chat');
    const broadcaster = await this.userId(channel);
    await this.request('POST', '/chat/messages', {
      broadcaster_id: broadcaster,
      sender_id: sender,
      message: message.slice(0, 480),
    });
  }

  /** Delete a message on Twitch (scope moderator:manage:chat_messages; the user must be a mod). */
  async deleteMessage(channel: string, messageId: string): Promise<void> {
    const moderator = this.tokens.current?.userId;
    if (!moderator || !this.tokens.has('moderator:manage:chat_messages'))
      throw new Error('login sem permissão de moderação');
    const broadcaster = await this.userId(channel);
    await this.request(
      'DELETE',
      `/moderation/chat?broadcaster_id=${broadcaster}&moderator_id=${moderator}&message_id=${encodeURIComponent(messageId)}`,
    );
  }

  async subscribe(type: string, version: string, condition: Record<string, string>, sessionId: string): Promise<void> {
    await this.request('POST', '/eventsub/subscriptions', {
      type,
      version,
      condition,
      transport: { method: 'websocket', session_id: sessionId },
    });
  }
}
