import type { Settings, Social } from '@stream95/shared';
import { Plus, Share2, Trash } from 'lucide-react';
import { type ComponentProps, useId } from 'react';
import { EmptyState, Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useDeck } from '@/lib/store';
import { cn } from '@/lib/utils';
import { OfflineNote, useSaveState } from '@/screens/live/kit';
import { useDraft } from './draft';
import { SaveBar } from './shared';

const MAX_SOCIALS = 8;
const LABEL_MAX = 24;
const VALUE_MAX = 64;
const COMMAND_MAX = 24;

type Row = { key: string; label: string; value: string; url: string; command: string };
type RowErrors = Partial<Record<'label' | 'value' | 'url' | 'command', string>>;

let nextKey = 0;
const newKey = () => `social-${++nextKey}`;

const toRows = (socials: Social[]): Row[] =>
  socials.map((s) => ({ key: newKey(), label: s.label, value: s.value, url: s.url ?? '', command: s.command ?? '' }));

/** "github.com/x" → "https://github.com/x"; blank stays blank. */
function withScheme(url: string): string {
  const clean = url.trim();
  if (!clean) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(clean) ? clean : `https://${clean}`;
}

/** A row the user added and left blank: ignored (not saved, not flagged). */
const blank = (r: Row) => !r.label.trim() && !r.value.trim() && !r.url.trim() && !r.command.trim();

const fromRows = (rows: Row[]): Social[] =>
  rows
    .filter((r) => !blank(r))
    .map((r) => {
      const url = withScheme(r.url);
      const command = r.command.trim();
      return { label: r.label.trim(), value: r.value.trim(), ...(url ? { url } : {}), ...(command ? { command } : {}) };
    });

/** Chat command as typed: lowercase, no "!", spaces become "_" (the server accepts a-z, 0-9 and _). */
const cleanCommand = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/^!+/, '')
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, COMMAND_MAX);

function validate(rows: Row[]): RowErrors[] {
  const commands = rows.map((r) => r.command.trim()).filter(Boolean);
  return rows.map((r) => {
    const errors: RowErrors = {};
    if (blank(r)) return errors;
    if (!r.label.trim()) errors.label = 'Dê um nome, ex.: Discord.';
    if (!r.value.trim()) errors.value = 'Escreva o que aparece na tela.';
    const url = withScheme(r.url);
    if (url) {
      try {
        const parsed = new URL(url);
        if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes('.')) errors.url = 'Link inválido.';
      } catch {
        errors.url = 'Link inválido.';
      }
    }
    const command = r.command.trim();
    if (command && commands.filter((c) => c === command).length > 1) errors.command = 'Comando repetido.';
    return errors;
  });
}

function RowField({
  id,
  label,
  error,
  hint,
  prefix,
  ...input
}: { id: string; label: string; error?: string; hint?: string; prefix?: string } & ComponentProps<typeof Input>) {
  const note = error ?? hint;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {prefix && (
          <span
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-muted-foreground"
            aria-hidden
          >
            {prefix}
          </span>
        )}
        <Input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? `${id}-note` : undefined}
          className={cn('h-12', prefix && 'pl-6 font-mono')}
          {...input}
        />
      </div>
      {note && (
        <p id={`${id}-note`} className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
          {note}
        </p>
      )}
    </div>
  );
}

/** Social links shown on the scenes; each one can answer a chat command (!discord). */
export function SocialsSection() {
  const { settings } = useDeck();
  const uid = useId();
  const { state, save } = useSaveState();
  const socials = useDraft(settings.socials, toRows, fromRows);
  const rows = socials.draft;
  const errors = validate(rows);
  const valid = errors.every((e) => Object.keys(e).length === 0);
  const full = rows.length >= MAX_SOCIALS;

  const edit = (key: string, patch: Partial<Row>) =>
    socials.update((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = () =>
    socials.update((list) =>
      list.length >= MAX_SOCIALS ? list : [...list, { key: newKey(), label: '', value: '', url: '', command: '' }],
    );
  const remove = (key: string) => socials.update((list) => list.filter((r) => r.key !== key));

  const onSave = () =>
    save(async () => {
      const saved = await api<Settings>('PATCH', '/api/settings', { socials: fromRows(rows) });
      socials.commit(saved.socials);
    });

  return (
    <Section
      title="Redes sociais"
      description="Aparecem nas cenas. Com um comando, o chat recebe o link quando alguém digita !comando."
    >
      <OfflineNote />
      {rows.length === 0 ? (
        <EmptyState icon={<Share2 className="size-6" aria-hidden />} title="Nenhuma rede social">
          Adicione o Discord, o GitHub ou o site do canal.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row, i) => {
            const id = `${uid}-${row.key}`;
            const err = errors[i] ?? {};
            const name = row.label.trim() || 'rede nova';
            return (
              <li key={row.key} className="flex flex-col gap-3 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{row.label.trim() || 'Rede nova'}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Tirar ${name} da lista`}
                    onClick={() => remove(row.key)}
                    className="size-12 shrink-0 rounded-xl text-muted-foreground hover:text-destructive"
                  >
                    <Trash className="size-4" aria-hidden />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <RowField
                    id={`${id}-label`}
                    label="Nome"
                    placeholder="Discord"
                    maxLength={LABEL_MAX}
                    value={row.label}
                    error={err.label}
                    onChange={(e) => edit(row.key, { label: e.target.value })}
                  />
                  <RowField
                    id={`${id}-value`}
                    label="Texto na tela"
                    placeholder="@seu_canal"
                    maxLength={VALUE_MAX}
                    value={row.value}
                    error={err.value}
                    onChange={(e) => edit(row.key, { value: e.target.value })}
                  />
                  <RowField
                    id={`${id}-url`}
                    label="Link (opcional)"
                    placeholder="https://…"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={row.url}
                    error={err.url}
                    onChange={(e) => edit(row.key, { url: e.target.value })}
                  />
                  <RowField
                    id={`${id}-command`}
                    label="Comando no chat (opcional)"
                    prefix="!"
                    placeholder="discord"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={row.command}
                    error={err.command}
                    hint={row.command ? `O chat digita !${row.command}` : undefined}
                    onChange={(e) => edit(row.key, { command: cleanCommand(e.target.value) })}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Button
        type="button"
        variant="outline"
        onClick={add}
        disabled={full}
        className="h-12 w-full rounded-xl border-dashed"
      >
        <Plus className="size-4" aria-hidden />
        {full ? `Cabem até ${MAX_SOCIALS} redes` : 'Adicionar rede'}
      </Button>
      <SaveBar
        label="Salvar redes"
        state={state}
        dirty={socials.dirty}
        valid={valid}
        onSave={onSave}
        onReset={socials.reset}
      />
    </Section>
  );
}
