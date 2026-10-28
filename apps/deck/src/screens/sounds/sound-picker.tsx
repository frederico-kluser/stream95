import type { SfxSound } from '@stream95/shared';
import { Check, Search } from 'lucide-react';
import { memo, useId, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { categoryLabel, durationText, groupSounds } from './lib';
import { SoundStatusBadge } from './parts';

const SoundOption = memo(function SoundOption({
  name,
  sound,
  checked,
  onPick,
}: {
  name: string;
  sound: SfxSound;
  checked: boolean;
  onPick: (sound: SfxSound) => void;
}) {
  return (
    <label className="group flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/60 has-checked:bg-accent has-focus-visible:bg-muted has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-ring">
      <input
        type="radio"
        name={name}
        value={sound.id}
        checked={checked}
        onChange={() => onPick(sound)}
        className="sr-only"
      />
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center rounded-full border border-input group-has-checked:border-primary group-has-checked:bg-primary group-has-checked:text-primary-foreground"
      >
        <Check className="size-3 opacity-0 group-has-checked:opacity-100" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium group-has-checked:font-semibold">{sound.name}</span>
      {sound.durationMs !== undefined && (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{durationText(sound.durationMs)}</span>
      )}
      <SoundStatusBadge status={sound.status} />
    </label>
  );
});

/** Searchable list of the library sounds, grouped by folder, with status and duration. */
export function SoundPicker({
  sounds,
  value,
  onPick,
}: {
  sounds: readonly SfxSound[];
  value: string | null;
  onPick: (sound: SfxSound) => void;
}) {
  const name = useId();
  const [query, setQuery] = useState('');
  const groups = useMemo(() => groupSounds(sounds, query), [sounds, query]);
  const chosen = value ? sounds.find((s) => s.id === value) : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Buscar som na biblioteca"
          placeholder="Buscar som"
          enterKeyHint="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter searches; it must not submit the editor form.
            if (e.key === 'Enter') e.preventDefault();
          }}
          className="h-12 pl-9"
        />
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {chosen ? (
          <>
            Escolhido: <span className="font-medium text-foreground">{chosen.name}</span> ·{' '}
            {categoryLabel(chosen.category)}
          </>
        ) : value ? (
          'O som escolhido não está mais na biblioteca. Escolha outro.'
        ) : (
          'Nenhum som escolhido.'
        )}
      </p>
      <div className="max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-border">
        {groups.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {sounds.length === 0
              ? 'A biblioteca está vazia. Envie sons em Biblioteca no PC.'
              : 'Nenhum som com esse nome.'}
          </p>
        ) : (
          groups.map((group) => (
            <fieldset key={group.category} className="min-w-0 border-b border-border last:border-b-0">
              <legend className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground">
                {group.label} · {group.sounds.length}
              </legend>
              {group.sounds.map((sound) => (
                <SoundOption key={sound.id} name={name} sound={sound} checked={sound.id === value} onPick={onPick} />
              ))}
            </fieldset>
          ))
        )}
      </div>
    </div>
  );
}
