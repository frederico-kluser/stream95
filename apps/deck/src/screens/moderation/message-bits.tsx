import type { ChatMessage, ModerationSignals, ModerationVerdict } from '@stream95/shared';
import {
  Ban,
  Check,
  CircleDashed,
  Hourglass,
  LoaderCircle,
  type LucideIcon,
  MessageCircleQuestionMark,
  SquareTerminal,
  TimerOff,
  Trash2,
  WifiOff,
  Wrench,
} from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { HoldToConfirmButton } from '@/components/motion-ui/hold-to-confirm';
import { ProgressBar } from '@/components/motion-ui/progress-bar';
import { useNotify } from '@/components/notify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { pct } from '@/lib/format';
import type { Connection } from '@/lib/store';
import { cn } from '@/lib/utils';
import { BY_LABEL, CATEGORY_LABEL, type RowStatus, STATUS_LABEL } from './labels';
import { errorNotice, markRemoved } from './stores';

const STATUS_STYLE: Record<RowStatus, { className: string; Icon: LucideIcon; spin?: boolean }> = {
  shown: { className: 'bg-success/15 text-success', Icon: Check },
  held: { className: 'bg-warning/15 text-warning', Icon: Hourglass },
  rejected: { className: 'bg-destructive/15 text-destructive', Icon: Ban },
  expired: { className: 'bg-muted text-muted-foreground', Icon: TimerOff },
  pending: { className: 'bg-info/15 text-info', Icon: LoaderCircle, spin: true },
  removed: { className: 'bg-muted text-muted-foreground', Icon: Trash2 },
  command: { className: 'bg-muted text-muted-foreground', Icon: SquareTerminal },
  unknown: { className: 'bg-muted text-muted-foreground', Icon: CircleDashed },
};

/** Moderation status with icon and text (never color alone). */
export function StatusChip({ status, className }: { status: RowStatus; className?: string }) {
  const { className: tone, Icon, spin } = STATUS_STYLE[status];
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap',
        tone,
        className,
      )}
    >
      <Icon className={cn('size-3.5', spin && 'animate-spin motion-reduce:animate-none')} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** SUB, MOD, VIP and first-message badges of a chat author. */
export function AuthorBadges({ m }: { m: Pick<ChatMessage, 'isMod' | 'isVip' | 'isSub' | 'isFirst'> }) {
  return (
    <>
      {m.isMod && (
        <Badge variant="outline" title="Moderador">
          MOD
        </Badge>
      )}
      {m.isVip && (
        <Badge variant="outline" title="VIP">
          VIP
        </Badge>
      )}
      {m.isSub && (
        <Badge variant="outline" title="Inscrito">
          SUB
        </Badge>
      )}
      {m.isFirst && (
        <Badge className="border-transparent bg-info/15 text-info" title="Primeira mensagem no canal">
          1ª<span className="sr-only"> mensagem no canal</span>
        </Badge>
      )}
    </>
  );
}

/** Question / technical problem tags from Jev, from the attention threshold up. */
export function SignalTags({ signals, at }: { signals?: ModerationSignals; at: number }) {
  if (!signals) return null;
  const tech = signals.techIssue >= at;
  const question = signals.question >= at;
  if (!tech && !question) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {tech && (
        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-warning/15 px-2 text-xs font-medium text-warning">
          <Wrench className="size-3.5" aria-hidden />
          técnico
        </span>
      )}
      {question && (
        <span className="inline-flex h-6 items-center gap-1 rounded-full bg-info/15 px-2 text-xs font-medium text-info">
          <MessageCircleQuestionMark className="size-3.5" aria-hidden />
          pergunta
        </span>
      )}
    </span>
  );
}

/** "Quem segurou: Jev · assédio" followed by the reason. */
export function VerdictSummary({ verdict, lead }: { verdict: ModerationVerdict; lead: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        <span className="text-muted-foreground">{lead}</span>
        <span className="font-medium">{BY_LABEL[verdict.by]}</span>
        {verdict.category !== 'ok' && (
          <>
            <span className="text-muted-foreground" aria-hidden>
              ·
            </span>
            <span className="font-medium">{CATEGORY_LABEL[verdict.category]}</span>
          </>
        )}
      </p>
      {verdict.reason && <p className="text-sm text-muted-foreground wrap-anywhere">{verdict.reason}</p>}
    </div>
  );
}

const JEV_ROWS = [
  { key: 'allow', label: 'mostrar', tone: 'var(--success)' },
  { key: 'review', label: 'revisar', tone: 'var(--warning)' },
  { key: 'block', label: 'barrar', tone: 'var(--destructive)' },
] as const;

/** Jev's probability for each action as three small labeled bars ("barrar 40%"). */
export function JevBars({ p }: { p: NonNullable<ModerationVerdict['probabilities']> }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <span className="sr-only">Chances segundo o Jev:</span>
      {JEV_ROWS.map((row) => (
        <ProgressBar
          key={row.key}
          value={p[row.key]}
          size="sm"
          tone={row.tone}
          label={
            <span className="text-xs whitespace-nowrap text-muted-foreground">
              {row.label} <span className="font-medium text-foreground tabular-nums">{pct(p[row.key])}</span>
            </span>
          }
        />
      ))}
    </div>
  );
}

/** Why the controls are disabled while the deck is not connected. */
export function OfflineReason({ connection, className }: { connection: Connection; className?: string }) {
  if (connection === 'online') return null;
  return (
    <p className={cn('flex items-start gap-2 text-sm text-warning', className)}>
      <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden />
      {connection === 'connecting'
        ? 'Conectando ao servidor. As ações voltam assim que conectar.'
        : 'Sem conexão com o servidor. As ações voltam quando o painel reconectar.'}
    </p>
  );
}

/**
 * Deletes a displayed message from the overlay (and from Twitch, when the login allows it).
 * Irreversible, so it is a short hold.
 */
export function DeleteMessageButton({
  id,
  author,
  compact = false,
  disabled = false,
}: {
  id: string;
  author: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const notify = useNotify();
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  const hintId = useId();
  const name = `Apagar mensagem de ${author}`;

  const remove = async () => {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    try {
      await api('DELETE', `/api/chat/${encodeURIComponent(id)}`);
      markRemoved([id]);
    } catch (err) {
      notify(errorNotice(err));
      lock.current = false;
      setPending(false);
      setAttempt((n) => n + 1); // a fresh hold button (the old one stays confirmed)
    }
  };

  const size = compact ? 'size-12 shrink-0' : 'h-12 shrink-0 self-start px-4 sm:self-end';
  if (disabled || pending) {
    return (
      <Button
        variant="ghost"
        disabled
        aria-label={compact ? (pending ? 'Apagando…' : name) : undefined}
        className={cn(size, 'text-muted-foreground')}
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
        ) : (
          <Trash2 className="size-4" aria-hidden />
        )}
        {!compact && (pending ? 'Apagando…' : 'Segure para apagar')}
      </Button>
    );
  }
  return (
    <>
      <HoldToConfirmButton
        key={attempt}
        holdSeconds={0.8}
        onConfirm={() => void remove()}
        aria-describedby={hintId}
        className={cn(
          'h-12! shrink-0 rounded-lg! bg-transparent! text-muted-foreground! shadow-none! hover:bg-muted! hover:text-foreground!',
          compact ? 'w-12!' : 'w-auto! self-start px-4 sm:self-end',
        )}
      >
        <Trash2 className="size-4" aria-hidden />
        {compact ? <span className="sr-only">{name}</span> : 'Segure para apagar'}
      </HoldToConfirmButton>
      <span id={hintId} className="sr-only">
        Segure por quase um segundo para apagar do overlay e do chat da Twitch.
      </span>
    </>
  );
}
