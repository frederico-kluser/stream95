import type { ServiceStatus } from '@stream95/shared';
import { usd } from '@/lib/format';
import { type Connection, useDeck } from '@/lib/store';
import { cn } from '@/lib/utils';
import { attentionKey, useResolvedAttention } from '@/screens/moderation/stores';

type ServiceState = ServiceStatus['chat'];
type State = ServiceState | Connection;

const DOT: Record<State, string> = {
  online: 'bg-success',
  connecting: 'bg-warning animate-pulse motion-reduce:animate-none',
  off: 'bg-muted-foreground/50',
  offline: 'bg-destructive',
  error: 'bg-destructive',
  unconfigured: 'bg-muted-foreground/30',
};

/** What a state reads like after the service name ("OBS desligado", "IA não configurada"). */
export function stateText(state: State, feminine = false): string {
  switch (state) {
    case 'online':
      return 'online';
    case 'connecting':
      return 'conectando';
    case 'off':
      return feminine ? 'desligada' : 'desligado';
    case 'offline':
      return 'sem conexão';
    case 'error':
      return 'com erro';
    case 'unconfigured':
      return feminine ? 'não configurada' : 'não configurado';
  }
}

/**
 * One service. Online shows just the name and a green dot; any other state also shows it in words,
 * since the dot colors alone do not tell "desligado" from "não configurado" (or red from green for
 * color-blind people), and phones have no hover for the title.
 */
function Pill({
  label,
  state,
  feminine = false,
  title,
}: {
  label: string;
  state: State;
  feminine?: boolean;
  title?: string;
}) {
  const text = stateText(state, feminine);
  return (
    // relative: keeps the sr-only text inside the pill (an absolute span escaped to the header and
    // made narrow docks scroll sideways)
    <span
      title={title ?? `${label}: ${text}`}
      className="relative inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs whitespace-nowrap"
    >
      <span className={cn('size-2 shrink-0 rounded-full', DOT[state])} aria-hidden />
      <span className="font-medium">{label}</span>
      {state === 'online' ? (
        <span className="sr-only">{text}</span>
      ) : (
        <span className="text-muted-foreground">{text}</span>
      )}
    </span>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone: 'warning' | 'info' }) {
  if (value === 0) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap tabular-nums',
        tone === 'warning' ? 'bg-warning/15 text-warning' : 'bg-info/15 text-info',
      )}
    >
      {value} {label}
    </span>
  );
}

type Service = { label: string; state: State; feminine?: boolean; title?: string };

/** "Servidor, Chat e IA" */
function listNames(names: string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}

/**
 * Live status of the server and its services, always visible at the top of the deck. On phones the
 * online services fold into one pill, so the sticky header stays one line in the common case.
 */
export function StatusStrip() {
  const { connection, status, queue, attention } = useDeck();
  const resolved = useResolvedAttention();
  const open = attention.filter((a) => a.kind === 'techIssue' && !resolved.has(attentionKey(a))).length;
  const services: Service[] = [
    { label: 'Servidor', state: connection },
    ...(status
      ? [
          { label: 'Chat', state: status.chat },
          { label: 'IA', state: status.openrouter, feminine: true },
          { label: 'OBS', state: status.obs },
          {
            label: 'Twitch',
            state: status.eventsub,
            feminine: true,
            title: `Login da Twitch (EventSub): ${stateText(status.eventsub, true)}`,
          },
        ]
      : []),
  ].filter((s) => s.state !== 'unconfigured');
  const online = services.filter((s) => s.state === 'online');
  return (
    // wraps instead of scrolling: nothing hides off-screen on a phone
    <section className="flex flex-wrap items-center gap-1.5" aria-label="Estado da live">
      {services.map((s) => (
        <span key={s.label} className={cn('contents', s.state === 'online' && 'max-md:hidden')}>
          <Pill label={s.label} state={s.state} feminine={s.feminine} title={s.title} />
        </span>
      ))}
      {online.length > 0 && (
        <span
          title={`${listNames(online.map((s) => s.label))}: online`}
          className="relative inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs whitespace-nowrap md:hidden"
        >
          <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden />
          <span className="font-medium">
            {online.length === services.length ? 'Tudo online' : `${online.length} online`}
          </span>
          <span className="sr-only">: {listNames(online.map((s) => s.label))}</span>
        </span>
      )}
      <Count label="na fila" value={queue.length} tone="warning" />
      <Count label={open === 1 ? 'aviso técnico' : 'avisos técnicos'} value={open} tone="warning" />
      {status && status.spentUsd > 0 && (
        <span
          className="text-xs text-muted-foreground whitespace-nowrap tabular-nums"
          title="Gasto com IA nesta sessão"
        >
          IA {usd(status.spentUsd)}
        </span>
      )}
    </section>
  );
}
