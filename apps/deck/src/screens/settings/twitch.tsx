import type { ServiceState } from '@stream95/shared';
import { BadgeCheck, KeyRound, LogIn, LogOut, MessageSquare, UserX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CopyButton } from '@/components/copy-button';
import { MultiStateButton } from '@/components/motion-ui/multi-state-button';
import { type Notice, useNotify } from '@/components/notify';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useDeckEvent } from '@/lib/store';
import { cn } from '@/lib/utils';
import {
  errorNotice,
  HoldButton,
  InlineError,
  OfflineNote,
  Spinner,
  useAction,
  useNow,
  useOnline,
} from '@/screens/live/kit';
import { COPY_SECONDARY, ExternalButton, prettyUrl } from './shared';

type TwitchStatus = {
  configured: boolean;
  login: string | null;
  scopes: string[];
  chat: ServiceState;
  chatSource: 'irc' | 'eventsub';
  eventsub: ServiceState;
};

type DeviceFlow = { userCode: string; verificationUri: string; until: number };

const STATE_TEXT: Record<ServiceState, string> = {
  online: 'conectado',
  connecting: 'conectando',
  off: 'desligado',
  error: 'com erro',
  unconfigured: 'não configurado',
};

const STATE_TONE: Record<ServiceState, string> = {
  online: 'text-success',
  connecting: 'text-warning',
  off: 'text-muted-foreground',
  error: 'text-destructive',
  unconfigured: 'text-muted-foreground',
};

/** Steps of the Twitch device login: open the page, confirm the code, wait. */
function FlowCard({ flow, onClose }: { flow: DeviceFlow; onClose: () => void }) {
  const now = useNow(15_000);
  const minutes = Math.max(1, Math.ceil((flow.until - now) / 60_000));
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-info/30 bg-info/10 p-4">
      <p className="flex items-center gap-2 text-sm font-medium" role="status">
        <Spinner className="text-info" />
        Esperando você autorizar na Twitch…
      </p>
      <ol className="flex list-decimal flex-col gap-4 pl-5 text-sm marker:text-muted-foreground">
        <li className="space-y-2">
          <p>Abra a página da Twitch logado na conta do canal.</p>
          <div className="flex flex-wrap gap-2">
            <ExternalButton href={flow.verificationUri} variant="default">
              Abrir {prettyUrl(flow.verificationUri)}
            </ExternalButton>
            <CopyButton
              value={flow.verificationUri}
              label="Copiar endereço da Twitch"
              copiedLabel="Endereço copiado"
              copiedText="Copiado"
              className={COPY_SECONDARY}
            >
              Copiar endereço
            </CopyButton>
          </div>
        </li>
        <li className="space-y-2">
          <p>Confira o código e autorize.</p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-2xl font-semibold tracking-[0.2em]">{flow.userCode}</span>
            <CopyButton
              value={flow.userCode}
              label="Copiar código da Twitch"
              copiedLabel="Código copiado"
              copiedText="Copiado"
              className={COPY_SECONDARY}
            >
              Copiar código
            </CopyButton>
          </div>
        </li>
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">O código vale por mais {minutes} min.</p>
        <Button type="button" variant="ghost" onClick={onClose} className="h-12 rounded-xl px-4">
          Fechar
        </Button>
      </div>
    </div>
  );
}

/** Twitch account of the channel (Device Code Flow) and where the chat comes from. */
export function TwitchSection() {
  const online = useOnline();
  const notify = useNotify();
  const [tw, setTw] = useState<TwitchStatus | null>(null);
  const [loadError, setLoadError] = useState<Notice | null>(null);
  const [flow, setFlow] = useState<DeviceFlow | null>(null);
  const { pending, run } = useAction<'login' | 'logout'>();
  const seen = useRef('');

  const load = useCallback(async () => {
    try {
      const status = await api<TwitchStatus>('GET', '/api/twitch/status');
      setTw(status);
      setLoadError(null);
      return status;
    } catch (err) {
      setLoadError(errorNotice(err));
      return null;
    }
  }, []);

  useEffect(() => {
    if (online) void load();
  }, [online, load]);

  // Chat or EventSub changed state (login finished, reconnect…): read the account again.
  useDeckEvent((e) => {
    if (e.type !== 'status') return;
    const key = `${e.status.chat}|${e.status.eventsub}`;
    if (key === seen.current) return;
    seen.current = key;
    void load();
  });

  // While the login page is open on another tab or phone, check every 3 s if it finished.
  useEffect(() => {
    if (!flow) return;
    const id = setInterval(async () => {
      if (Date.now() > flow.until) {
        setFlow(null);
        notify({
          tone: 'warning',
          title: 'O código da Twitch expirou',
          description: 'Toque em Entrar para pegar outro.',
        });
        return;
      }
      const status = await load();
      if (status?.login) {
        setFlow(null);
        notify({ tone: 'success', title: `Twitch conectada como @${status.login}` });
      }
    }, 3000);
    return () => clearInterval(id);
  }, [flow, load, notify]);

  const login = () =>
    run('login', async () => {
      const r = await api<{ userCode: string; verificationUri: string; expiresIn: number }>(
        'POST',
        '/api/twitch/login',
      );
      setFlow({ userCode: r.userCode, verificationUri: r.verificationUri, until: Date.now() + r.expiresIn * 1000 });
    });

  const logout = () =>
    run('logout', async () => {
      await api('POST', '/api/twitch/logout');
      await load();
    });

  return (
    <Section
      title="Twitch"
      description="Com login, o chat chega pelo EventSub, os alertas de follow, sub e raid funcionam e o assistente responde no chat."
    >
      <OfflineNote />
      {!tw ? (
        loadError ? (
          <InlineError notice={loadError} />
        ) : (
          <div className="h-24 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" aria-hidden />
        )
      ) : (
        <>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1 rounded-xl border border-border p-3">
              <dt className="text-xs font-medium text-muted-foreground">Conta</dt>
              <dd className="flex items-center gap-2 font-medium">
                {tw.login ? (
                  <>
                    <BadgeCheck className="size-4 shrink-0 text-success" aria-hidden />
                    <span className="truncate">@{tw.login}</span>
                  </>
                ) : (
                  <>
                    <UserX className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    Sem login
                  </>
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-border p-3">
              <dt className="text-xs font-medium text-muted-foreground">Chat</dt>
              <dd className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <MessageSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="font-medium">
                  {tw.chatSource === 'eventsub' ? 'EventSub, com a sua conta' : 'IRC anônimo, só leitura'}
                </span>
                <span className={cn('text-sm', STATE_TONE[tw.chat])}>{STATE_TEXT[tw.chat]}</span>
              </dd>
            </div>
          </dl>

          {!tw.configured && (
            <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <p className="text-muted-foreground">
                <span className="font-medium text-warning">Falta o TWITCH_CLIENT_ID no arquivo .env.</span> Crie um app
                em dev.twitch.tv, cole o ID do cliente no .env e reinicie o servidor. O passo a passo está em
                docs/twitch.md.
              </p>
            </div>
          )}

          {flow ? (
            <FlowCard flow={flow} onClose={() => setFlow(null)} />
          ) : tw.login ? (
            <div className="flex flex-col gap-2">
              <HoldButton
                onConfirm={logout}
                disabled={!online}
                pending={pending === 'logout'}
                pendingLabel="Saindo…"
                className="w-full! rounded-xl! sm:w-64!"
              >
                <LogOut className="size-4" aria-hidden />
                Segure para sair
              </HoldButton>
              <p className="text-sm text-muted-foreground">
                Ao sair, o chat volta para a leitura anônima e os alertas da Twitch param.
              </p>
            </div>
          ) : (
            <MultiStateButton
              state={pending === 'login' ? 'pending' : 'idle'}
              onClick={login}
              disabled={!online || !tw.configured || pending !== null}
              icon={pending === 'login' ? <Spinner /> : <LogIn className="size-4" />}
              className="self-start"
              pillClassName="h-12 rounded-xl px-5 text-sm font-medium"
              surfaceClassName={cn('bg-primary text-primary-foreground', (!online || !tw.configured) && 'opacity-50')}
            >
              {pending === 'login' ? 'Pedindo o código…' : 'Entrar com a Twitch'}
            </MultiStateButton>
          )}
        </>
      )}
    </Section>
  );
}
