import { randomUUID } from 'node:crypto';
import type { ChatMessage, EmoteRange, ServiceState, StreamAlert } from '@stream95/shared';
import { ChatClient } from '@twurple/chat';
import type { Logger } from '../log.js';

export type ChatHandlers = {
  message: (msg: ChatMessage) => void;
  alert: (alert: StreamAlert) => void;
  removeMessage: (id: string) => void;
  removeUser: (login: string) => void;
  clear: () => void;
  state: (s: ServiceState) => void;
};

// biome-ignore lint/suspicious/noExplicitAny: twurple's message class is only used through its getters
type TwurpleMessage = any;

export function parseEmoteOffsets(offsets: Map<string, string[]>): EmoteRange[] {
  const out: EmoteRange[] = [];
  for (const [id, ranges] of offsets) {
    for (const r of ranges) {
      const [a, b] = r.split('-').map(Number);
      if (Number.isInteger(a) && Number.isInteger(b)) out.push({ id, start: a as number, end: b as number });
    }
  }
  return out.sort((x, y) => x.start - y.start);
}

export function toChatMessage(channel: string, text: string, msg: TwurpleMessage): ChatMessage {
  const info = msg.userInfo;
  return {
    id: msg.id ?? randomUUID(),
    channel: channel.replace(/^#/, ''),
    userId: info.userId,
    login: info.userName,
    displayName: info.displayName || info.userName,
    ...(info.color ? { color: info.color } : {}),
    text,
    emotes: parseEmoteOffsets(msg.emoteOffsets ?? new Map()),
    badges: [...(info.badges?.keys?.() ?? [])],
    isBroadcaster: Boolean(info.isBroadcaster),
    isMod: Boolean(info.isMod),
    isVip: Boolean(info.isVip),
    isSub: Boolean(info.isSubscriber || info.isFounder),
    isFirst: Boolean(msg.isFirst),
    isHighlighted: Boolean(msg.isHighlight),
    timestamp: msg.date instanceof Date ? msg.date.getTime() : Date.now(),
    source: 'twitch',
  };
}

const tierOf = (plan: string | undefined): StreamAlert['tier'] =>
  plan === 'Prime' ? 'prime' : plan === '2000' ? '2000' : plan === '3000' ? '3000' : '1000';

/**
 * Anonymous, read-only connection to Twitch chat (no login needed). Besides chat
 * it delivers USERNOTICEs, so subs, resubs, gifts, raids and bits work out of the box.
 */
export class TwitchChat {
  private client: ChatClient | null = null;
  /** Community gifts are followed by one onSubGift per recipient: count them down to avoid alert spam. */
  private readonly communityGifts = new Map<string, number>();
  private ignoreRedemptions = false;

  constructor(
    private readonly handlers: ChatHandlers,
    private readonly log: Logger,
  ) {}

  /** When EventSub is online it owns redemption alerts (it knows the reward title). */
  setRedemptionsFromEventSub(on: boolean): void {
    this.ignoreRedemptions = on;
  }

  connect(channel: string): void {
    this.disconnect();
    const login = channel.toLowerCase().replace(/^#/, '');
    this.handlers.state('connecting');
    const chat = new ChatClient({ channels: [login], rejoinChannelsOnReconnect: true });
    this.client = chat;
    const alert = (a: Omit<StreamAlert, 'id' | 'timestamp' | 'source'>) =>
      this.handlers.alert({ id: randomUUID(), timestamp: Date.now(), source: 'eventsub', ...a });

    chat.onConnect(() => this.handlers.state('online'));
    chat.onDisconnect((manually) => this.handlers.state(manually ? 'off' : 'connecting'));
    chat.onJoinFailure((_ch, reason) => {
      this.log.warn({ reason }, 'twitch: join failed');
      this.handlers.state('error');
    });

    const onText = (ch: string, _user: string, text: string, msg: TwurpleMessage) => {
      const message = toChatMessage(ch, text, msg);
      if (msg.isCheer && msg.bits > 0) {
        alert({ kind: 'cheer', user: message.displayName, amount: msg.bits, message: text });
      }
      if (msg.isRedemption && !this.ignoreRedemptions) {
        alert({ kind: 'redeem', user: message.displayName, message: text, reward: 'recompensa do canal' });
      }
      this.handlers.message(message);
    };
    chat.onMessage(onText);
    chat.onAction((ch, user, text, msg) => onText(ch, user, `/me ${text}`, msg));

    chat.onSub((_ch, _user, info) =>
      alert({ kind: 'sub', user: info.displayName, tier: tierOf(info.plan), months: info.months }),
    );
    chat.onResub((_ch, _user, info) =>
      alert({
        kind: 'resub',
        user: info.displayName,
        tier: tierOf(info.plan),
        months: info.months,
        ...(info.message ? { message: info.message } : {}),
      }),
    );
    chat.onCommunitySub((_ch, _user, info) => {
      const gifter = info.gifterDisplayName ?? 'Anônimo';
      this.communityGifts.set(info.gifterUserId ?? 'anon', info.count);
      alert({ kind: 'giftsub', user: gifter, amount: info.count, tier: tierOf(info.plan) });
    });
    chat.onSubGift((_ch, _user, info) => {
      const key = info.gifterUserId ?? 'anon';
      const remaining = this.communityGifts.get(key) ?? 0;
      if (remaining > 0) {
        if (remaining === 1) this.communityGifts.delete(key);
        else this.communityGifts.set(key, remaining - 1);
        return;
      }
      alert({
        kind: 'giftsub',
        user: info.gifterDisplayName ?? 'Anônimo',
        amount: 1,
        message: `para ${info.displayName}`,
        tier: tierOf(info.plan),
      });
    });
    chat.onRaid((_ch, _user, info) => alert({ kind: 'raid', user: info.displayName, amount: info.viewerCount }));

    chat.onMessageRemove((_ch, messageId) => this.handlers.removeMessage(messageId));
    chat.onTimeout((_ch, user) => this.handlers.removeUser(user));
    chat.onBan((_ch, user) => this.handlers.removeUser(user));
    chat.onChatClear(() => this.handlers.clear());

    chat.connect();
    this.log.info({ channel: login }, 'twitch: connecting to chat (anonymous)');
  }

  disconnect(): void {
    if (!this.client) return;
    const c = this.client;
    this.client = null;
    try {
      c.quit();
    } catch {
      // already closed
    }
  }
}
