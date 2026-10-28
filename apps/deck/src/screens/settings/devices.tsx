import type { PairedDevice } from '@stream95/shared';
import { ImageOff, Laptop, QrCode, RefreshCw, Smartphone, Tablet, Trash, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { CopyButton } from '@/components/copy-button';
import { MultiStateButton } from '@/components/motion-ui/multi-state-button';
import type { Notice } from '@/components/notify';
import { EmptyState, Section } from '@/components/section';
import { api } from '@/lib/api';
import { currentToken, isLocalHost } from '@/lib/auth';
import { ago } from '@/lib/format';
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
import { COPY_SECONDARY } from './shared';

type PairInfo = {
  code: string | null;
  url: string | null;
  expiresAt: number | null;
  /** A phone can open `url` (the server listens on the local network). */
  lan: boolean;
  /** Pairing URL on every network card of this PC. */
  urls: string[];
  /** Why phones cannot connect ("Erro: … — Solução: …"), when `lan` is false. */
  hint: string | null;
};

const NO_INFO: PairInfo = { code: null, url: null, expiresAt: null, lan: true, urls: [], hint: null };

const POLL_MS = 10_000;

// Tolerant readers: the deck keeps working if the server adds or renames a field.
function asPairInfo(raw: unknown): PairInfo {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    code: typeof r.code === 'string' && r.code ? r.code : null,
    url: typeof r.url === 'string' && r.url ? r.url : null,
    expiresAt: typeof r.expiresAt === 'number' ? r.expiresAt : null,
    lan: r.lan !== false,
    urls: Array.isArray(r.urls) ? r.urls.filter((u): u is string => typeof u === 'string') : [],
    hint: typeof r.hint === 'string' && r.hint ? r.hint : null,
  };
}

function asDevices(raw: unknown): PairedDevice[] {
  if (Array.isArray(raw)) return raw as PairedDevice[];
  const list = (raw as { devices?: unknown } | null)?.devices;
  return Array.isArray(list) ? (list as PairedDevice[]) : [];
}

const shortDate = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function DeviceIcon({ name }: { name: string }) {
  const n = name.toLowerCase();
  if (n.includes('ipad')) return <Tablet className="size-5" aria-hidden />;
  if (n.includes('iphone') || n.includes('android')) return <Smartphone className="size-5" aria-hidden />;
  return <Laptop className="size-5" aria-hidden />;
}

/** Hint for the empty device list, matching what the pairing panel below shows (QR code or LAN warning). */
function noDeviceHint(info: PairInfo | null, failed: boolean): string | null {
  if (info && !info.lan) {
    return 'Libere o acesso pela rede para conectar o celular ou o tablet. Veja como no aviso abaixo.';
  }
  // The pairing info did not load: nothing shows below, and the error is already on top.
  if (!info && failed) return null;
  return 'Use o QR code abaixo para conectar o celular ou o tablet.';
}

function validity(expiresAt: number | null, now: number): { text: string; expired: boolean } {
  if (!expiresAt) return { text: '', expired: false };
  const ms = expiresAt - now;
  if (ms <= 0) return { text: 'Este código expirou. Gere um novo.', expired: true };
  const min = Math.ceil(ms / 60_000);
  return { text: min <= 1 ? 'Vale por menos de 1 minuto.' : `Vale por mais ${min} minutos.`, expired: false };
}

/**
 * The pairing QR. On this PC the <img> loads it straight from the server. On a paired phone the
 * request needs the device token, which an <img> cannot send, so the SVG is fetched with the token
 * and shown from a blob URL.
 */
function PairQr({ version, expired }: { version: number; expired: boolean }) {
  const local = isLocalHost();
  const path = `/api/devices/pair-qr.svg?v=${version}`;
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (local) return;
    let cancelled = false;
    let url: string | null = null;
    (async () => {
      try {
        const headers: Record<string, string> = { 'x-stream95': '1' };
        const token = currentToken();
        if (token) headers['x-stream95-token'] = token;
        const res = await fetch(path, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const svg = await res.text();
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
        setBlobUrl(url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [local, path]);

  const src = local ? path : blobUrl;
  return (
    <div className="relative mx-auto flex size-52 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted sm:mx-0">
      {failed || !src ? (
        <span className="flex flex-col items-center gap-2 px-4 text-center text-sm text-muted-foreground">
          {failed ? <ImageOff className="size-6" aria-hidden /> : <Spinner className="size-6" />}
          {failed ? 'Não deu para mostrar o QR code. Use o código ao lado.' : 'Carregando o QR code…'}
        </span>
      ) : (
        <img
          src={src}
          alt="QR code para conectar outro aparelho a este painel"
          width={208}
          height={208}
          onError={() => setFailed(true)}
          className={cn('size-full object-contain transition-opacity', expired && 'opacity-25')}
        />
      )}
    </div>
  );
}

function PairPanel({
  info,
  now,
  pending,
  fresh,
  onNewCode,
}: {
  info: PairInfo;
  now: number;
  pending: boolean;
  fresh: boolean;
  onNewCode: () => void;
}) {
  const online = useOnline();
  const { text, expired } = validity(info.expiresAt, now);
  // Other addresses of this PC (another network card), without the one already shown.
  const main = originOf(info.url);
  const others = info.urls.filter((u) => originOf(u) !== main);
  const codeState = pending ? 'pending' : fresh ? 'fresh' : 'idle';

  if (!info.lan) {
    // The server says why (LAN off, HOST only for this PC, no network) and how to fix it.
    const why = info.hint ? errorNotice(new Error(info.hint)) : null;
    return (
      <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
        <WifiOff className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="font-medium text-warning">
            {why?.title ?? 'O celular ainda não consegue abrir o painel pela rede.'}
          </p>
          <p className="text-muted-foreground">
            {why?.description ?? 'Confira se o PC está no Wi-Fi e se o acesso pela rede está ligado no .env.'}
          </p>
          <p className="text-muted-foreground">Faça isso só numa rede de confiança, como a da sua casa.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border p-4 sm:flex-row sm:items-start">
      {info.code ? (
        <PairQr version={info.expiresAt ?? 0} expired={expired} />
      ) : (
        <div className="mx-auto flex size-52 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-4 text-center text-sm text-muted-foreground sm:mx-0">
          <QrCode className="size-6" aria-hidden />
          Gere um código para aparecer o QR code.
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>Deixe o celular ou o tablet no mesmo Wi-Fi do PC.</li>
          <li>Aponte a câmera para o QR code. Se preferir, abra o endereço e digite o código.</li>
          <li>
            Na primeira vez, o PC pode mostrar um alerta de segurança perguntando se o Node.js pode usar redes privadas.
            Clique em Permitir.
          </li>
        </ol>

        {info.code && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Código</p>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  'font-mono text-2xl font-semibold tracking-[0.25em]',
                  expired && 'text-muted-foreground line-through',
                )}
              >
                {info.code}
              </span>
              <CopyButton
                value={info.code}
                label="Copiar código"
                copiedLabel="Código copiado"
                copiedText="Copiado"
                disabled={expired}
                className={COPY_SECONDARY}
              >
                Copiar
              </CopyButton>
            </div>
            {text && <p className={cn('text-sm', expired ? 'text-warning' : 'text-muted-foreground')}>{text}</p>}
          </div>
        )}

        {info.url && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Endereço para o celular</p>
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 font-mono text-sm break-all">{info.url}</span>
              <CopyButton
                value={info.url}
                label="Copiar endereço"
                copiedLabel="Endereço copiado"
                copiedText="Copiado"
                className={COPY_SECONDARY}
              >
                Copiar
              </CopyButton>
            </div>
            {others.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Se não abrir, tente: <span className="font-mono break-all">{others.join(' · ')}</span>
              </p>
            )}
          </div>
        )}

        <MultiStateButton
          state={codeState}
          onClick={onNewCode}
          disabled={!online || pending}
          feedback={fresh ? 'pop' : 'none'}
          announce={fresh ? 'Novo código pronto' : ''}
          icon={pending ? <Spinner /> : <RefreshCw className="size-4" />}
          className="self-start"
          pillClassName="h-12 rounded-xl px-5 text-sm font-medium"
          surfaceClassName={cn(
            expired || !info.code ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground',
            !online && 'opacity-50',
          )}
        >
          {pending ? 'Gerando…' : fresh ? 'Novo código pronto' : 'Gerar novo código'}
        </MultiStateButton>
      </div>
    </div>
  );
}

/** Phones and tablets allowed on this deck, and the QR code to add another one. */
export function DevicesSection() {
  const online = useOnline();
  const now = useNow(POLL_MS);
  const [devices, setDevices] = useState<PairedDevice[] | null>(null);
  const [info, setInfo] = useState<PairInfo | null>(null);
  const [loadError, setLoadError] = useState<Notice | null>(null);
  const [fresh, setFresh] = useState(false);
  const { pending, run } = useAction<string>();

  const load = useCallback(async () => {
    const [list, pair] = await Promise.allSettled([api('GET', '/api/devices'), api('GET', '/api/devices/pair-info')]);
    if (list.status === 'fulfilled') setDevices(asDevices(list.value));
    if (pair.status === 'fulfilled') setInfo(asPairInfo(pair.value));
    const failure = list.status === 'rejected' ? list.reason : pair.status === 'rejected' ? pair.reason : null;
    setLoadError(failure ? errorNotice(failure) : null);
  }, []);

  // Pairing happens on the other device, so the list is refreshed while this screen is open.
  useEffect(() => {
    if (!online) return;
    void load();
    const id = setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [online, load]);

  useEffect(() => {
    if (!fresh) return;
    const id = setTimeout(() => setFresh(false), 2000);
    return () => clearTimeout(id);
  }, [fresh]);

  const newCode = () =>
    run('code', async () => {
      const r = asPairInfo(await api('POST', '/api/devices/pair-code'));
      setInfo((prev) => ({
        ...(prev ?? NO_INFO),
        code: r.code,
        url: r.url ?? prev?.url ?? null,
        expiresAt: r.expiresAt,
      }));
      setFresh(true);
    });

  const remove = (device: PairedDevice) =>
    run(`remove:${device.id}`, async () => {
      await api('DELETE', `/api/devices/${encodeURIComponent(device.id)}`);
      setDevices((list) => list?.filter((d) => d.id !== device.id) ?? null);
    });

  return (
    <Section title="Aparelhos" description="Celulares e tablets que podem usar este painel pela rede de casa.">
      <OfflineNote />
      {loadError && <InlineError notice={loadError} />}

      {devices === null ? (
        !loadError && (
          <div className="flex flex-col gap-3" aria-hidden>
            <div className="h-16 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
            <div className="h-16 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
          </div>
        )
      ) : devices.length === 0 ? (
        <EmptyState icon={<Smartphone className="size-6" aria-hidden />} title="Nenhum aparelho conectado">
          {noDeviceHint(info, loadError !== null)}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {devices.map((d) => {
            const key = `remove:${d.id}`;
            return (
              <li
                key={d.id}
                className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <DeviceIcon name={d.name} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Conectado em {shortDate.format(d.createdAt)} ·{' '}
                      {d.lastSeenAt ? `visto ${ago(d.lastSeenAt, now)}` : 'ainda não abriu o painel'}
                    </p>
                  </div>
                </div>
                <HoldButton
                  onConfirm={() => remove(d)}
                  disabled={!online}
                  pending={pending === key}
                  pendingLabel="Removendo…"
                  className="w-full! rounded-xl! sm:w-56!"
                >
                  <Trash className="size-4" aria-hidden />
                  Segure para remover
                </HoldButton>
              </li>
            );
          })}
        </ul>
      )}
      {devices !== null && devices.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Remover desconecta o aparelho na hora. Para voltar, ele precisa escanear um QR code novo.
        </p>
      )}

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="font-medium">Conectar outro aparelho</h3>
        {info ? (
          <PairPanel info={info} now={now} pending={pending === 'code'} fresh={fresh} onNewCode={newCode} />
        ) : (
          !loadError && (
            <div className="h-52 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" aria-hidden />
          )
        )}
      </div>
    </Section>
  );
}
