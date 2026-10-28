import type { ChatMessage } from '@stream95/shared';
import { ArrowDown, MessagesSquare } from 'lucide-react';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { useDeck } from '@/lib/store';
import { useNow } from './hooks';
import { BY_LABEL, clock, latestById, type RowStatus, statusOfIncoming } from './labels';
import { AuthorBadges, DeleteMessageButton, OfflineReason, StatusChip } from './message-bits';
import { useRemovedMessages } from './stores';

const MAX_ROWS = 80;
const NEAR_BOTTOM_PX = 64;

/** The scrolling element inside shadcn's ScrollArea. */
const viewportOf = (root: HTMLElement | null): HTMLElement | null =>
  root?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null;

const ChatRow = memo(function ChatRow({
  m,
  status,
  decidedBy,
  online,
}: {
  m: ChatMessage;
  status: RowStatus;
  decidedBy?: string;
  online: boolean;
}) {
  return (
    <li className="flex items-start gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed wrap-anywhere">
          <span className="mr-1.5 font-semibold">{m.displayName}</span>
          <span className="mr-1.5 inline-flex gap-1 align-middle empty:hidden">
            <AuthorBadges m={m} />
          </span>
          {m.text}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusChip status={status} />
          {decidedBy && (
            <span className="text-xs text-muted-foreground">
              Quem decidiu: <span className="font-medium text-foreground">{decidedBy}</span>
            </span>
          )}
          <time className="text-xs text-muted-foreground tabular-nums" dateTime={new Date(m.timestamp).toISOString()}>
            {clock(m.timestamp)}
          </time>
        </div>
      </div>
      {status === 'shown' && <DeleteMessageButton id={m.id} author={m.displayName} compact disabled={!online} />}
    </li>
  );
});

function ChatFeed() {
  const { incoming, log, chat, queue, connection, status: services } = useDeck();
  const removed = useRemovedMessages();
  const now = useNow(5_000);
  const rootRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [unseen, setUnseen] = useState(0);
  const online = connection === 'online';
  const rows = incoming.slice(-MAX_ROWS);
  const lastId = rows.at(-1)?.id;
  const hasRows = rows.length > 0;

  const ctx = useMemo(
    () => ({
      latest: latestById(log),
      queueIds: new Set(queue.map((m) => m.id)),
      chatIds: new Set(chat.map((m) => m.id)),
      removed,
    }),
    [log, queue, chat, removed],
  );

  // follow new messages only while the reader is at the bottom
  useEffect(() => {
    if (!hasRows) return;
    const vp = viewportOf(rootRef.current);
    if (!vp) return;
    const onScroll = () => {
      atBottom.current = vp.scrollHeight - vp.scrollTop - vp.clientHeight < NEAR_BOTTOM_PX;
      if (atBottom.current) setUnseen(0);
    };
    vp.addEventListener('scroll', onScroll, { passive: true });
    return () => vp.removeEventListener('scroll', onScroll);
  }, [hasRows]);

  useLayoutEffect(() => {
    if (!lastId) return;
    const vp = viewportOf(rootRef.current);
    if (!vp) return;
    if (atBottom.current) vp.scrollTop = vp.scrollHeight;
    else setUnseen((n) => n + 1);
  }, [lastId]);

  const jumpToEnd = () => {
    const vp = viewportOf(rootRef.current);
    if (vp) vp.scrollTop = vp.scrollHeight;
    atBottom.current = true;
    setUnseen(0);
  };

  if (rows.length === 0) {
    return (
      <EmptyState icon={<MessagesSquare className="size-6" aria-hidden />} title="Nenhuma mensagem ainda">
        {services && services.chat !== 'online'
          ? 'O chat da Twitch não está conectado. Confira o login em Config ou use Testar moderação.'
          : 'Quando alguém escrever no chat da Twitch, a mensagem aparece aqui na hora.'}
      </EmptyState>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <ScrollArea className="h-[min(26rem,55dvh)] rounded-lg border border-border">
        <ul className="divide-y divide-border px-3" aria-label="Mensagens do chat, da mais antiga para a mais nova">
          {rows.map((m) => {
            const status = statusOfIncoming(m, { ...ctx, now });
            const decided = ctx.latest.get(m.id);
            return (
              <ChatRow
                key={m.id}
                m={m}
                status={status}
                decidedBy={decided ? BY_LABEL[decided.verdict.by] : undefined}
                online={online}
              />
            );
          })}
        </ul>
      </ScrollArea>
      {unseen > 0 && (
        <Button
          className="absolute bottom-3 left-1/2 h-12 -translate-x-1/2 rounded-full px-4 shadow-lg"
          onClick={jumpToEnd}
        >
          <ArrowDown aria-hidden />
          {unseen === 1 ? '1 mensagem nova' : `${unseen} mensagens novas`}
        </Button>
      )}
    </div>
  );
}

/** Every chat message as it arrives, with what moderation did to it (optional panel). */
export function LiveChatSection({ show, onShowChange }: { show: boolean; onShowChange: (show: boolean) => void }) {
  const { connection } = useDeck();
  return (
    <Section title="Chat ao vivo" description="Cada mensagem assim que chega e o que a moderação fez com ela.">
      <div className="flex min-h-12 items-center gap-4">
        <label htmlFor="mod-show-chat" className="min-w-0 flex-1 cursor-pointer">
          <span className="block text-sm font-medium">Mostrar chat</span>
          <span className="block text-sm text-muted-foreground">
            {show ? 'Para apagar uma mensagem exibida, segure a lixeira.' : 'Desligado para economizar espaço.'}
          </span>
        </label>
        <Switch id="mod-show-chat" checked={show} onCheckedChange={(next) => onShowChange(next)} />
      </div>
      {show && (
        <>
          <OfflineReason connection={connection} />
          <ChatFeed />
        </>
      )}
    </Section>
  );
}
