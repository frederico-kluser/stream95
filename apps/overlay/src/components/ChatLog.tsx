import { Textchat } from '@react95/icons/Textchat';
import type { ModeratedMessage, Rect } from '@stream95/shared';
import { useEffect, useRef } from 'react';
import { emoteUrl, readableColor, splitEmotes } from '../lib/format';
import { useStream } from '../lib/stream';
import { Win } from './Win';

const ROLE_TAGS: [keyof ModeratedMessage, string][] = [
  ['isBroadcaster', 'LIVE'],
  ['isMod', 'MOD'],
  ['isVip', 'VIP'],
  ['isSub', 'SUB'],
];

export function ChatLine({ m }: { m: ModeratedMessage }) {
  const parts = splitEmotes(m.text, m.emotes);
  return (
    <li className="s95-chat-line">
      {ROLE_TAGS.filter(([k]) => m[k]).map(([, tag]) => (
        <span key={tag} className={`s95-tag s95-tag-${tag.toLowerCase()}`}>
          {tag}
        </span>
      ))}
      <b className="s95-chat-name" style={{ color: readableColor(m.color) }}>
        {m.displayName}
      </b>
      <span className="s95-chat-text">
        {parts.map((p) =>
          p.kind === 'emote' ? (
            <img key={p.at} className="s95-emote" src={emoteUrl(p.id)} alt={p.name} title={p.name} />
          ) : (
            <span key={p.at}>{p.text}</span>
          ),
        )}
      </span>
    </li>
  );
}

/** Moderated chat inside a Windows 95 window (only messages the server approved arrive here). */
export function ChatWindow({ rect, title }: { rect: Rect; title?: string }) {
  const { chat, settings, connected } = useStream();
  const listRef = useRef<HTMLUListElement>(null);
  const max = settings.overlay.chatMaxMessages;
  const fadeMs = settings.overlay.chatFadeSec * 1000;
  const now = Date.now();
  const visible = chat.filter((m) => !fadeMs || now - m.decidedAt < fadeMs).slice(-max);
  const count = visible.length;

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever a new line arrives
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  return (
    <Win rect={rect} title={title ?? `Chat - ${settings.channel}`} icon={<Textchat variant="16x16_4" />}>
      <div className="s95-inset s95-chat">
        {!connected && <div className="s95-muted">Conectando ao stream95...</div>}
        {connected && visible.length === 0 && <div className="s95-muted">Ninguém digitou ainda. Diga oi!</div>}
        <ul ref={listRef} className="s95-chat-list">
          {visible.map((m) => (
            <ChatLine key={m.id} m={m} />
          ))}
        </ul>
      </div>
    </Win>
  );
}
