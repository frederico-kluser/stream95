import type { SfxButton, SfxSound } from '@stream95/shared';
import { Check, CircleAlert, CircleCheck, FolderOpen, Play, RefreshCw, Search, Trash2 } from 'lucide-react';
import { memo, useCallback, useEffect, useId, useMemo, useState } from 'react';
import { CopyButton } from '@/components/copy-button';
import { HoldToConfirmButton } from '@/components/motion-ui/hold-to-confirm';
import { MultiStateButton } from '@/components/motion-ui/multi-state-button';
import { useNotify } from '@/components/notify';
import { EmptyState, Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { buttonsBySound, categoriesOf, countByStatus, durationText, groupSounds, plural } from './lib';
import { holdTip, playStatus, SoundStatusBadge, Spinner } from './parts';
import { usePlayOnPc } from './play-feedback';
import { UploadSounds } from './upload';
import { type ActionState, useAction } from './use-action';
import { useSettingDraft, useSettingsPatch } from './use-setting-draft';

const RESCAN: Record<ActionState, string> = {
  idle: 'Atualizar',
  busy: 'Atualizando…',
  done: 'Atualizado',
  error: 'Falhou',
};

function rescanIcon(state: ActionState) {
  if (state === 'busy') return <Spinner className="size-4" />;
  if (state === 'done') return <Check className="size-4" />;
  if (state === 'error') return <CircleAlert className="size-4" />;
  return <RefreshCw className="size-4" />;
}

/** Folder on the PC, file counts, re-scan, loudness normalization and upload. */
export const LibrarySection = memo(function LibrarySection({
  dir,
  sounds,
  offline,
  normalize,
}: {
  dir: string;
  sounds: readonly SfxSound[];
  offline: boolean;
  normalize: boolean;
}) {
  const counts = useMemo(() => countByStatus(sounds), [sounds]);
  const categories = useMemo(() => categoriesOf(sounds), [sounds]);
  const rescan = useAction();
  const patch = useSettingsPatch();
  const [norm, setNorm] = useSettingDraft(normalize, (value: boolean) => patch({ sfx: { normalize: value } }));
  const normalizeId = useId();

  return (
    <Section
      title="Biblioteca no PC"
      description="Os arquivos ficam nesta pasta do PC e são convertidos sozinhos para WAV 48 kHz, o formato que toca sem atraso no OBS. Você também pode copiar arquivos direto para a pasta."
    >
      <div className="flex flex-col gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <FolderOpen className="size-3.5" aria-hidden />
          Pasta da biblioteca
        </span>
        <div className="flex items-start gap-2">
          <code className="min-w-0 flex-1 rounded-lg border border-border bg-muted/50 px-3 py-3 font-mono text-xs break-all">
            {dir || 'Aguardando o PC…'}
          </code>
          <CopyButton
            value={dir}
            disabled={!dir}
            label="Copiar o caminho da pasta"
            copiedLabel="Caminho copiado"
            copiedText="Copiado"
            className="h-12! px-4!"
          >
            Copiar
          </CopyButton>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul aria-label="Arquivos por situação" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <li className="flex items-center gap-1.5">
            <CircleCheck className="size-4 text-success" aria-hidden />
            {plural(counts.ready, 'pronto', 'prontos')}
          </li>
          {counts.converting > 0 && (
            <li className="flex items-center gap-1.5 text-info">
              <Spinner className="size-4" />
              {counts.converting} convertendo
            </li>
          )}
          {counts.error > 0 && (
            <li className="flex items-center gap-1.5 text-destructive">
              <CircleAlert className="size-4" aria-hidden />
              {counts.error} com erro
            </li>
          )}
        </ul>
        <MultiStateButton
          state={rescan.state}
          icon={rescanIcon(rescan.state)}
          onClick={() => {
            if (!offline) void rescan.run(() => api('POST', '/api/sfx/rescan'));
          }}
          disabled={offline}
          feedback={rescan.state === 'error' ? 'shake' : 'none'}
          announce={rescan.state === 'done' ? 'Biblioteca atualizada' : undefined}
          className="rounded-xl!"
          pillClassName="min-h-12 rounded-xl px-4 text-sm font-medium"
          surfaceClassName={cn('bg-secondary text-secondary-foreground hover:bg-muted', offline && 'opacity-50')}
        >
          {RESCAN[rescan.state]}
        </MultiStateButton>
      </div>

      <div className="flex items-center gap-4 rounded-xl border border-border px-3">
        <label
          htmlFor={normalizeId}
          className="flex min-h-14 min-w-0 flex-1 cursor-pointer flex-col justify-center py-2"
        >
          <span className="text-sm font-medium">Normalizar volume</span>
          <span className="text-sm text-muted-foreground">
            Deixa todos os sons com o mesmo volume. Os arquivos são convertidos de novo.
          </span>
        </label>
        <Switch id={normalizeId} checked={norm} disabled={offline} onCheckedChange={(checked) => setNorm(checked)} />
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">Enviar sons</h3>
        <UploadSounds categories={categories} offline={offline} />
      </div>
    </Section>
  );
});

const SoundRow = memo(function SoundRow({
  sound,
  usedBy,
  offline,
  hintId,
  onRemoved,
}: {
  sound: SfxSound;
  usedBy: number;
  offline: boolean;
  hintId: string;
  onRemoved: (id: string) => void;
}) {
  const notify = useNotify();
  const { result, play } = usePlayOnPc('soundId', sound.id);
  const remove = useAction();
  const [holdKey, setHoldKey] = useState(0);
  const line = playStatus(result);
  const canPlay = !offline && sound.status === 'ready';

  const removeFile = async () => {
    if (offline) {
      notify({ tone: 'warning', title: 'Sem conexão com o PC', description: 'Apague quando o painel reconectar.' });
      setHoldKey((k) => k + 1);
      return;
    }
    const r = await remove.run(() => api('DELETE', `/api/sfx/sounds/${encodeURIComponent(sound.id)}`));
    if (r.ok) {
      onRemoved(sound.id);
      notify({ tone: 'success', title: `${sound.name} apagado do PC` });
    } else setHoldKey((k) => k + 1);
  };

  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-xl border border-border bg-background/40 p-2 pl-3',
        remove.busy && 'opacity-60',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{sound.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <SoundStatusBadge status={sound.status} />
          {sound.durationMs !== undefined && <span className="tabular-nums">{durationText(sound.durationMs)}</span>}
          {usedBy > 0 && <span>{plural(usedBy, 'botão', 'botões')}</span>}
          {line && (
            <span className={cn('flex items-center gap-1', line.className)}>
              {line.icon}
              {line.text}
            </span>
          )}
        </div>
        {sound.status === 'error' && sound.error && (
          <p className="mt-1 text-xs break-words text-destructive">{sound.error}</p>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        className="h-12 min-w-12 shrink-0 rounded-xl px-3"
        disabled={!canPlay}
        aria-label={`Tocar no PC: ${sound.name}`}
        onClick={() => void play()}
      >
        {result.phase === 'pending' ? <Spinner className="size-4" /> : <Play aria-hidden />}
        <span className="hidden sm:inline">Tocar no PC</span>
      </Button>
      <HoldToConfirmButton
        key={holdKey}
        holdSeconds={2}
        onConfirm={() => void removeFile()}
        onCancel={() => holdTip(notify, 'Segure a lixeira para apagar')}
        aria-describedby={hintId}
        className={cn('size-12! shrink-0', offline && 'opacity-50')}
      >
        {remove.busy ? <Spinner className="size-5" /> : <Trash2 className="size-5" aria-hidden />}
        <span className="sr-only">Apagar {sound.name} do PC</span>
      </HoldToConfirmButton>
    </li>
  );
});

/** Every file in the library, by folder: status, duration, play on the PC, delete from the PC. */
export const SoundListSection = memo(function SoundListSection({
  sounds,
  buttons,
  offline,
}: {
  sounds: readonly SfxSound[];
  buttons: readonly SfxButton[];
  offline: boolean;
}) {
  const hintId = useId();
  const [query, setQuery] = useState('');
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const used = useMemo(() => buttonsBySound(buttons), [buttons]);
  const visible = useMemo(() => (gone.size > 0 ? sounds.filter((s) => !gone.has(s.id)) : sounds), [sounds, gone]);
  const groups = useMemo(() => groupSounds(visible, query), [visible, query]);

  // Forget deleted ids once the server list no longer has them.
  useEffect(() => {
    setGone((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(sounds.map((s) => s.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [sounds]);

  const onRemoved = useCallback((id: string) => setGone((prev) => new Set(prev).add(id)), []);

  return (
    <Section
      title="Sons na pasta"
      description={
        <span id={hintId}>
          {plural(visible.length, 'arquivo', 'arquivos')}. Segure a lixeira por 2 segundos para apagar um arquivo do PC;
          os botões com esse som ficam sem som.
        </span>
      }
    >
      {visible.length === 0 ? (
        <EmptyState icon={<FolderOpen className="size-8" aria-hidden />} title="A pasta está vazia">
          Envie arquivos acima ou copie para a pasta da biblioteca no PC.
        </EmptyState>
      ) : (
        <>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label="Buscar arquivo na biblioteca"
              placeholder="Buscar arquivo"
              enterKeyHint="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-12 pl-9"
            />
          </div>
          {groups.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhum arquivo com esse nome.</p>
          ) : (
            groups.map((group) => (
              <section key={group.category} aria-label={group.label} className="flex flex-col gap-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {group.label} · {group.sounds.length}
                </h3>
                <ul className="flex flex-col gap-2">
                  {group.sounds.map((sound) => (
                    <SoundRow
                      key={sound.id}
                      sound={sound}
                      usedBy={used.get(sound.id) ?? 0}
                      offline={offline}
                      hintId={hintId}
                      onRemoved={onRemoved}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </Section>
  );
});
