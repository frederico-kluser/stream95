import type { Counter } from '@stream95/shared';
import { Hash, Minus, Pencil, Plus, Trash } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { Sheet, SheetBackdrop, SheetClose, SheetHandle, SheetPanel, SheetTrigger } from '@/components/motion-ui/sheet';
import type { Notice } from '@/components/notify';
import { EmptyState, Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useDeck } from '@/lib/store';
import { HoldButton, InlineError, OfflineNote, Spinner, useAction, useOnline } from './kit';
import { RollingNumber } from './rolling-number';
import { COUNTER_ID_MAX, counterSlug, uniqueSlug } from './slug';

const LABEL_MAX = 24;
const VALUE_MAX = 1_000_000;

const counterPath = (id: string) => `/api/counters/${encodeURIComponent(id)}`;

/** Name, value and removal of one counter, in a bottom sheet (thumb reach on phones). */
function CounterEditor({ counter, onDone }: { counter: Counter; onDone: () => void }) {
  const online = useOnline();
  const uid = useId();
  const [error, setError] = useState<Notice | null>(null);
  const { pending, run } = useAction<'save' | 'remove'>(setError);
  const [label, setLabel] = useState(counter.label);
  const [value, setValue] = useState(String(counter.value));

  const cleanLabel = label.trim();
  const parsed = Number(value);
  const valueOk = value.trim() !== '' && Number.isInteger(parsed) && parsed >= 0 && parsed <= VALUE_MAX;
  const labelChanged = cleanLabel !== counter.label;
  const valueChanged = valueOk && parsed !== counter.value;
  const canSave = online && cleanLabel.length > 0 && valueOk && (labelChanged || valueChanged);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setError(null);
    const ok = await run('save', async () => {
      // Same id + new label renames the counter on the server.
      if (labelChanged) await api('POST', '/api/counters', { id: counter.id, label: cleanLabel });
      if (valueChanged) await api('PUT', counterPath(counter.id), { value: parsed });
    });
    if (ok) onDone();
  };

  const remove = async () => {
    setError(null);
    const ok = await run('remove', () => api('DELETE', counterPath(counter.id)));
    if (ok) onDone();
  };

  return (
    <div className="flex flex-col gap-5">
      <OfflineNote />
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-label`}>Nome</Label>
          <Input
            id={`${uid}-label`}
            value={label}
            maxLength={LABEL_MAX}
            onChange={(e) => setLabel(e.target.value)}
            className="h-12"
            aria-invalid={cleanLabel.length === 0 || undefined}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-value`}>Valor</Label>
          <div className="flex gap-2">
            <Input
              id={`${uid}-value`}
              type="number"
              inputMode="numeric"
              min={0}
              max={VALUE_MAX}
              step={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-12 min-w-0 flex-1 font-mono tabular-nums"
              aria-invalid={!valueOk || undefined}
              aria-describedby={`${uid}-value-hint`}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setValue('0')}
              disabled={value === '0'}
              className="h-12 shrink-0 rounded-xl px-4"
            >
              Zerar
            </Button>
          </div>
          <p id={`${uid}-value-hint`} className="text-xs text-muted-foreground">
            {valueOk
              ? `Agora: ${counter.value.toLocaleString('pt-BR')}. O novo valor vale quando você salvar.`
              : 'Use um número inteiro de 0 a 1.000.000.'}
          </p>
        </div>
        <Button type="submit" disabled={!canSave || pending !== null} className="h-12 rounded-xl text-base">
          {pending === 'save' && <Spinner />}
          {pending === 'save' ? 'Salvando…' : 'Salvar'}
        </Button>
      </form>
      <InlineError notice={error} />
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <p className="text-sm text-muted-foreground">Remover tira o contador do overlay e do chat.</p>
        <HoldButton
          onConfirm={remove}
          disabled={!online}
          pending={pending === 'remove'}
          pendingLabel="Removendo…"
          className="w-full! rounded-xl!"
        >
          <Trash className="size-4" aria-hidden />
          Segure para remover
        </HoldButton>
      </div>
    </div>
  );
}

function CounterCard({ counter }: { counter: Counter }) {
  const online = useOnline();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const { pending, run } = useAction<'dec' | 'inc'>();
  const add = (delta: number) =>
    run(delta > 0 ? 'inc' : 'dec', () => api('POST', `${counterPath(counter.id)}/add`, { delta }));

  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{counter.label}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">mods no chat: !{counter.id}</p>
        </div>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger className="h-12! shrink-0 rounded-xl! bg-secondary! px-4! text-sm! text-secondary-foreground!">
            <Pencil className="size-4" aria-hidden />
            Editar
            <span className="sr-only">{counter.label}</span>
          </SheetTrigger>
          <SheetBackdrop label="Fechar a edição" />
          <SheetPanel labelledBy={titleId}>
            <SheetHandle />
            <div className="flex items-center justify-between gap-3 pb-4">
              <h2 id={titleId} className="min-w-0 truncate text-lg font-semibold">
                Editar {counter.label}
              </h2>
              <SheetClose label="Fechar" className="size-12!" />
            </div>
            <CounterEditor counter={counter} onDone={() => setOpen(false)} />
          </SheetPanel>
        </Sheet>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          aria-label={`Diminuir ${counter.label}`}
          aria-busy={pending === 'dec' || undefined}
          disabled={!online || counter.value === 0}
          onClick={() => add(-1)}
          className="h-14 rounded-xl"
        >
          {pending === 'dec' ? <Spinner className="size-5" /> : <Minus className="size-5" aria-hidden />}
        </Button>
        <RollingNumber value={counter.value} className="min-w-16 font-mono text-4xl font-semibold" />
        <Button
          type="button"
          aria-label={`Aumentar ${counter.label}`}
          aria-busy={pending === 'inc' || undefined}
          disabled={!online}
          onClick={() => add(1)}
          className="h-14 rounded-xl"
        >
          {pending === 'inc' ? <Spinner className="size-5" /> : <Plus className="size-5" aria-hidden />}
        </Button>
      </div>
    </div>
  );
}

function NewCounter({ counters }: { counters: Counter[] }) {
  const online = useOnline();
  const uid = useId();
  const [label, setLabel] = useState('');
  const { pending, run } = useAction<'create'>();
  const clean = label.trim();
  const id = uniqueSlug(counterSlug(clean), new Set(counters.map((c) => c.id)));
  const valid = clean.length > 0 && id.length > 0;

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || !online) return;
    const ok = await run('create', () => api('POST', '/api/counters', { id, label: clean }));
    if (ok) setLabel('');
  };

  return (
    <form onSubmit={create} className="flex flex-col gap-2 border-t border-border pt-4">
      <Label htmlFor={`${uid}-new`}>Novo contador</Label>
      <div className="flex gap-2">
        <Input
          id={`${uid}-new`}
          value={label}
          maxLength={LABEL_MAX}
          placeholder="ex.: Bugs esmagados"
          onChange={(e) => setLabel(e.target.value)}
          aria-describedby={`${uid}-new-hint`}
          aria-invalid={(clean.length > 0 && !id) || undefined}
          className="h-12 min-w-0 flex-1"
        />
        <Button
          type="submit"
          disabled={!online || !valid || pending !== null}
          className="h-12 shrink-0 rounded-xl px-4"
        >
          {pending ? <Spinner /> : <Plus className="size-4" aria-hidden />}
          Criar
        </Button>
      </div>
      <p id={`${uid}-new-hint`} className="text-xs text-muted-foreground">
        {!clean
          ? `O comando do chat sai do nome (até ${COUNTER_ID_MAX} letras).`
          : id
            ? `Comando no chat: !${id}`
            : 'Use letras ou números no nome.'}
      </p>
    </form>
  );
}

/** On-screen counters ("bugs", "cafés"): big −/+ for the thumb, edit and remove in a sheet. */
export function CountersSection({ className }: { className?: string }) {
  const { counters } = useDeck();
  return (
    <Section
      className={className}
      title="Contadores"
      description="Aparecem no overlay. Os mods também mudam pelo chat: !nome soma 1, !nome - tira 1."
    >
      <OfflineNote />
      {counters.length === 0 ? (
        <EmptyState icon={<Hash className="size-6" aria-hidden />} title="Nenhum contador">
          Crie o primeiro aqui embaixo, por exemplo Bugs ou Cafés.
        </EmptyState>
      ) : (
        <div className="@container">
          <ul className="grid gap-3 @lg:grid-cols-2">
            {counters.map((c) => (
              <li key={c.id} className="min-w-0">
                <CounterCard counter={c} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <NewCounter counters={counters} />
    </Section>
  );
}
