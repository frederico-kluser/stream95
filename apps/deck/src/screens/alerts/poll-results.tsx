import type { PollState } from '@stream95/shared';
import { Crown, Lock, SquareStop, Trash2, Vote } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ProgressBar } from '@/components/motion-ui/progress-bar';
import { api } from '@/lib/api';
import { mmss, pct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ActionButton, HoldAction, useRunAction } from '@/screens/assistant/kit/action';
import { useOnline } from '@/screens/assistant/kit/connection';

/** Current time, ticking every `interval` ms while it is set (null stops the clock). */
function useNow(interval: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (interval === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}

const votes = (n: number): string => `${n} ${n === 1 ? 'voto' : 'votos'}`;

/** Live results of the poll on screen, with "end" and "remove". */
export function PollResults({ poll }: { poll: PollState }) {
  const { online, reason } = useOnline();
  const close = useRunAction();
  const ticking = poll.open && poll.endsAt !== undefined;
  const now = useNow(ticking ? 1000 : null);
  const top = Math.max(0, ...poll.options.map((o) => o.votes));
  const leaders = top > 0 ? poll.options.filter((o) => o.votes === top).length : 0;
  const rows = poll.options.map((o, i) => ({ ...o, key: `${poll.id}:${i}`, number: i + 1 }));
  const blocked = online ? undefined : reason;

  const left = poll.endsAt !== undefined ? poll.endsAt - now : null;
  const status = !poll.open
    ? 'Encerrada'
    : left === null
      ? 'Aberta · sem limite de tempo'
      : left > 500
        ? `Aberta · termina em ${mmss(left)}`
        : 'Aberta · encerrando…';
  const leaderTag = leaders > 1 ? 'empate' : poll.open ? 'na frente' : 'venceu';

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/30 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-base font-medium text-balance break-words">{poll.question}</p>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
          {poll.open ? (
            <Vote className="size-4 shrink-0 text-success" aria-hidden />
          ) : (
            <Lock className="size-4 shrink-0" aria-hidden />
          )}
          {status}
        </p>
      </div>

      <ol className="flex flex-col gap-4">
        {rows.map((r) => {
          const share = poll.totalVotes > 0 ? r.votes / poll.totalVotes : 0;
          const ahead = top > 0 && r.votes === top;
          return (
            <li key={r.key}>
              <ProgressBar
                value={share}
                highlight={ahead}
                progressbar
                aria-label={`${r.label}: ${votes(r.votes)}, ${pct(share)}`}
                label={
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <span className="shrink-0 font-mono text-muted-foreground">!{r.number}</span>
                    <span className={cn('min-w-0 truncate', ahead && 'font-medium')}>{r.label}</span>
                    {ahead && (
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium">
                        <Crown className="size-3.5" aria-hidden />
                        {/* phones keep the room for the option name: the crown alone marks the leader */}
                        <span className="max-sm:sr-only">{leaderTag}</span>
                      </span>
                    )}
                  </span>
                }
                valueLabel={
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {r.votes}
                    <span className="max-sm:hidden"> {r.votes === 1 ? 'voto' : 'votos'}</span> · {pct(share)}
                  </span>
                }
              />
            </li>
          );
        })}
      </ol>

      <p className="text-sm text-muted-foreground tabular-nums">{votes(poll.totalVotes)} no total</p>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-3">
        {poll.open && (
          <ActionButton
            phase={close.phase}
            icon={<SquareStop className="size-5 sm:size-4" />}
            label="Encerrar"
            pendingLabel="Encerrando…"
            doneLabel="Encerrada"
            blocked={blocked}
            onClick={() => void close.run(() => api('POST', '/api/poll/close'))}
          />
        )}
        <HoldAction
          size="regular"
          label="Segure para remover da tela"
          icon={<Trash2 className="size-4 shrink-0" />}
          hint="Tira a enquete da live. Os votos se perdem."
          success="Enquete removida da tela"
          blocked={blocked}
          onConfirm={() => api('DELETE', '/api/poll')}
        />
      </div>
    </div>
  );
}
