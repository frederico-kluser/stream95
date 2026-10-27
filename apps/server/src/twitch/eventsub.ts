import { randomUUID } from 'node:crypto';
import type { ChatMessage, EmoteRange, ServiceState, StreamAlert } from '@stream95/shared';
import type { Logger } from '../log.js';
import type { Helix } from './helix.js';
import type { TwitchTokenManager } from './token.js';

const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws';

type Frame = {
  metadata?: { message_id?: string; message_type?: string; subscription_type?: string };
  payload?: {
    session?: { id: string; keepalive_timeout_seconds?: number; reconnect_url?: string };
    subscription?: { type?: string; status?: string };
    // biome-ignore lint/suspicious/noExplicitAny: event payloads differ per subscription type
    event?: any;
  };
};

export type EventSubHandlers = {
  alert: (alert: StreamAlert) => void;
  state: (s: ServiceState) => void;
  redemptionsActive: (on: boolean) => void;
  /** True while chat arrives through EventSub (the anonymous IRC reader then steps aside). */
  chatActive: (on: boolean) => void;
  message: (msg: ChatMessage) => void;
  removeMessage: (id: string) => void;
  removeUser: (login: string) => void;
  clear: () => void;
};

type AlertBase = { id: string; timestamp: number; source: 'eventsub' };

const TIERS: Record<string, StreamAlert['tier']> = { '1000': '1000', '2000': '2000', '3000': '3000' };

/** Map an EventSub `channel.chat.message` event into the shared ChatMessage shape. */
// biome-ignore lint/suspicious/noExplicitAny: EventSub payloads are read field by field
export function chatFromEventSub(event: any, channel: string): ChatMessage {
  const fragments: { type?: string; text?: string; emote?: { id?: string } | null }[] = event?.message?.fragments ?? [];
  const emotes: EmoteRange[] = [];
  let pos = 0;
  for (const f of fragments) {
    const len = Array.from(f.text ?? '').length;
    if (f.type === 'emote' && f.emote?.id && len > 0)
      emotes.push({ id: String(f.emote.id), start: pos, end: pos + len - 1 });
    pos += len;
  }
  const badges: string[] = (event?.badges ?? [])
    .map((b: { set_id?: string }) => String(b.set_id ?? ''))
    .filter(Boolean);
  const has = (b: string) => badges.includes(b);
  return {
    id: String(event?.message_id ?? randomUUID()),
    channel,
    userId: String(event?.chatter_user_id ?? ''),
    login: String(event?.chatter_user_login ?? ''),
    displayName: String(event?.chatter_user_name ?? event?.chatter_user_login ?? ''),
    ...(event?.color ? { color: String(event.color) } : {}),
    text: String(event?.message?.text ?? ''),
    emotes,
    badges,
    isBroadcaster: has('broadcaster'),
    isMod: has('moderator') || has('lead_moderator'),
    isVip: has('vip'),
    isSub: has('subscriber') || has('founder'),
    isFirst: event?.message_type === 'user_intro',
    isHighlighted: event?.message_type === 'channel_points_highlighted',
    timestamp: Date.now(),
    source: 'twitch',
  };
}

/** Map `channel.chat.notification` notices (subs, gifts, raids) to alerts. Returns null for notices we ignore. */
// biome-ignore lint/suspicious/noExplicitAny: see chatFromEventSub
export function alertFromChatNotice(event: any, base: AlertBase): StreamAlert | null {
  const user = event?.chatter_is_anonymous ? 'Anônimo' : String(event?.chatter_user_name ?? 'alguém');
  const tierOf = (o: { sub_tier?: string; is_prime?: boolean } | undefined): StreamAlert['tier'] =>
    o?.is_prime ? 'prime' : (TIERS[o?.sub_tier ?? ''] ?? '1000');
  switch (event?.notice_type) {
    case 'sub':
      return { ...base, kind: 'sub', user, tier: tierOf(event.sub), months: Number(event.sub?.duration_months ?? 1) };
    case 'resub':
      return {
        ...base,
        kind: 'resub',
        user,
        tier: tierOf(event.resub),
        months: Number(event.resub?.cumulative_months ?? 1),
        ...(event.message?.text ? { message: String(event.message.text) } : {}),
      };
    case 'sub_gift':
      // gifts that belong to a community gift were already announced by community_sub_gift
      if (event.sub_gift?.community_gift_id) return null;
      return {
        ...base,
        kind: 'giftsub',
        user,
        amount: 1,
        message: `para ${event.sub_gift?.recipient_user_name ?? 'alguém'}`,
      };
    case 'community_sub_gift':
      return {
        ...base,
        kind: 'giftsub',
        user,
        amount: Number(event.community_sub_gift?.total ?? 1),
        tier: tierOf(event.community_sub_gift),
      };
    case 'raid':
      return {
        ...base,
        kind: 'raid',
        user: String(event.raid?.user_name ?? user),
        amount: Number(event.raid?.viewer_count ?? 0),
      };
    default:
      return null;
  }
}

/**
 * EventSub over WebSocket (user token from the Device Code Flow). When the login
 * has `user:read:chat`, chat itself comes from here — Twitch's preferred path —
 * and the anonymous IRC reader steps aside; it also delivers follows and
 * channel-points redemptions, which IRC cannot see.
 *
 * If the socket dies unexpectedly Twitch drops every subscription of the session
 * (events in between are lost), so we open a fresh session and subscribe again;
 * a planned `session_reconnect` keeps the subscriptions.
 */
export class EventSubClient {
  private ws: WebSocket | null = null;
  private keepalive: NodeJS.Timeout | null = null;
  private retry: NodeJS.Timeout | null = null;
  private keepaliveMs = 15_000;
  private stopped = true;
  private readonly seen = new Set<string>();
  private attempts = 0;

  constructor(
    private readonly helix: Helix,
    private readonly tokens: TwitchTokenManager,
    private readonly channel: () => string,
    private readonly handlers: EventSubHandlers,
    private readonly log: Logger,
  ) {}

  start(): void {
    this.stop();
    if (!this.tokens.configured) {
      this.handlers.state('unconfigured');
      return;
    }
    if (!this.tokens.current) {
      this.handlers.state('off');
      return;
    }
    this.stopped = false;
    this.open(EVENTSUB_URL, false);
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.handlers.redemptionsActive(false);
    this.handlers.chatActive(false);
  }

  private open(url: string, isReconnect: boolean): void {
    this.handlers.state('connecting');
    const ws = new WebSocket(url);
    const previous = this.ws;
    this.ws = ws;
    ws.onmessage = (ev) => {
      this.armKeepalive();
      let frame: Frame;
      try {
        frame = JSON.parse(String(ev.data)) as Frame;
      } catch {
        return;
      }
      void this.handle(frame, ws, isReconnect, previous);
    };
    ws.onclose = () => {
      if (this.ws === ws && !this.stopped) {
        // Unplanned drop: subscriptions are gone. Hand chat back to IRC until we resubscribe.
        this.handlers.chatActive(false);
        this.scheduleRetry();
      }
    };
    ws.onerror = () => {
      this.log.warn({}, 'eventsub socket error');
    };
  }

  private async handle(frame: Frame, ws: WebSocket, isReconnect: boolean, previous: WebSocket | null): Promise<void> {
    const type = frame.metadata?.message_type;
    const id = frame.metadata?.message_id;
    if (id) {
      if (this.seen.has(id)) return;
      this.seen.add(id);
      if (this.seen.size > 1000) this.seen.delete(this.seen.values().next().value as string);
    }
    switch (type) {
      case 'session_welcome': {
        const session = frame.payload?.session;
        if (!session) return;
        this.keepaliveMs = ((session.keepalive_timeout_seconds ?? 10) + 5) * 1000;
        this.attempts = 0;
        if (isReconnect) {
          previous?.close();
          this.handlers.state('online');
        } else {
          await this.subscribeAll(session.id);
        }
        return;
      }
      case 'session_reconnect': {
        const url = frame.payload?.session?.reconnect_url;
        if (url) this.open(url, true);
        return;
      }
      case 'notification':
        this.onNotification(frame.payload?.subscription?.type ?? '', frame.payload?.event);
        return;
      case 'revocation':
        this.log.warn({ sub: frame.payload?.subscription }, 'eventsub subscription revoked');
        return;
      default:
        if (ws !== this.ws) ws.close();
    }
  }

  private async subscribeAll(sessionId: string): Promise<void> {
    const me = this.tokens.current;
    if (!me) return;
    let ok = 0;
    let redemptions = false;
    let chat = false;
    try {
      const broadcaster = await this.helix.userId(this.channel());
      const chatCondition = { broadcaster_user_id: broadcaster, user_id: me.userId };
      const subs: [string, string, Record<string, string>, string][] = [
        [
          'channel.follow',
          '2',
          { broadcaster_user_id: broadcaster, moderator_user_id: me.userId },
          'moderator:read:followers',
        ],
        [
          'channel.channel_points_custom_reward_redemption.add',
          '1',
          { broadcaster_user_id: broadcaster },
          'channel:read:redemptions',
        ],
        ['channel.chat.message', '1', chatCondition, 'user:read:chat'],
        ['channel.chat.notification', '1', chatCondition, 'user:read:chat'],
        ['channel.chat.message_delete', '1', chatCondition, 'user:read:chat'],
        ['channel.chat.clear_user_messages', '1', chatCondition, 'user:read:chat'],
        ['channel.chat.clear', '1', chatCondition, 'user:read:chat'],
      ];
      for (const [type, version, condition, scope] of subs) {
        if (!this.tokens.has(scope)) continue;
        try {
          await this.helix.subscribe(type, version, condition, sessionId);
          ok++;
          if (type.startsWith('channel.channel_points')) redemptions = true;
          if (type === 'channel.chat.message') chat = true;
        } catch (err) {
          this.log.warn({ type, err: (err as Error).message }, 'eventsub subscribe failed');
        }
      }
    } catch (err) {
      this.log.warn({ err: (err as Error).message }, 'eventsub setup failed');
    }
    this.handlers.redemptionsActive(redemptions);
    this.handlers.chatActive(chat);
    this.handlers.state(ok > 0 ? 'online' : 'error');
  }

  // biome-ignore lint/suspicious/noExplicitAny: see Frame
  private onNotification(type: string, event: any): void {
    if (!event) return;
    const base: AlertBase = { id: randomUUID(), timestamp: Date.now(), source: 'eventsub' };
    switch (type) {
      case 'channel.chat.message': {
        const msg = chatFromEventSub(event, this.channel());
        const bits = Number(event.cheer?.bits ?? 0);
        if (bits > 0)
          this.handlers.alert({ ...base, kind: 'cheer', user: msg.displayName, amount: bits, message: msg.text });
        this.handlers.message(msg);
        return;
      }
      case 'channel.chat.notification': {
        const alert = alertFromChatNotice(event, base);
        if (alert) this.handlers.alert(alert);
        return;
      }
      case 'channel.chat.message_delete':
        this.handlers.removeMessage(String(event.message_id ?? ''));
        return;
      case 'channel.chat.clear_user_messages':
        this.handlers.removeUser(String(event.target_user_login ?? ''));
        return;
      case 'channel.chat.clear':
        this.handlers.clear();
        return;
      case 'channel.follow':
        this.handlers.alert({ ...base, kind: 'follow', user: String(event.user_name ?? event.user_login ?? 'alguém') });
        return;
      case 'channel.channel_points_custom_reward_redemption.add':
        this.handlers.alert({
          ...base,
          kind: 'redeem',
          user: String(event.user_name ?? 'alguém'),
          reward: String(event.reward?.title ?? 'recompensa'),
          ...(Number(event.reward?.cost) > 0 ? { amount: Number(event.reward.cost) } : {}),
          ...(event.user_input ? { message: String(event.user_input) } : {}),
        });
        return;
    }
  }

  private armKeepalive(): void {
    if (this.keepalive) clearTimeout(this.keepalive);
    this.keepalive = setTimeout(() => {
      this.log.warn({}, 'eventsub keepalive missed — reconnecting');
      this.ws?.close();
      this.scheduleRetry();
    }, this.keepaliveMs);
  }

  private scheduleRetry(): void {
    if (this.stopped || this.retry) return;
    this.handlers.state('connecting');
    const wait = Math.min(60_000, 1000 * 2 ** this.attempts++);
    this.retry = setTimeout(() => {
      this.retry = null;
      if (!this.stopped) this.open(EVENTSUB_URL, false);
    }, wait);
  }

  private clearTimers(): void {
    if (this.keepalive) clearTimeout(this.keepalive);
    if (this.retry) clearTimeout(this.retry);
    this.keepalive = null;
    this.retry = null;
  }
}
