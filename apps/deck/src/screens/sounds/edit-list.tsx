import type { SfxButton, SfxSound } from '@stream95/shared';
import { ChevronDown, ChevronUp, Music2, Pencil, Plus, Trash2 } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { memo, useCallback, useEffect, useId, useState } from 'react';
import { HoldToConfirmButton } from '@/components/motion-ui/hold-to-confirm';
import { useMotionUITransition } from '@/components/motion-ui/ui-theme';
import { useNotify } from '@/components/notify';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CreateMissingButtons } from './create-missing';
import { availability, categoryLabel, plural } from './lib';
import { holdTip, Spinner, VolumeMark } from './parts';
import { toneOf } from './tones';
import { toActionError } from './use-action';

type RowProps = {
  button: SfxButton;
  index: number;
  last: boolean;
  sound: SfxSound | undefined;
  offline: boolean;
  removing: boolean;
  /** Bumped after a failed removal: remounts the hold button, which locks itself once confirmed. */
  attempt: number;
  hintId: string;
  onEdit: (button: SfxButton) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onRemove: (button: SfxButton) => void;
  onHoldCancel: () => void;
};

const EditRow = memo(function EditRow({
  button,
  index,
  last,
  sound,
  offline,
  removing,
  attempt,
  hintId,
  onEdit,
  onMove,
  onRemove,
  onHoldCancel,
}: RowProps) {
  const reduce = useReducedMotion();
  const ui = useMotionUITransition('ui');
  const tone = toneOf(button.color);
  const avail = availability(button, sound);
  const detail = avail.ok ? `${avail.sound.name} · ${categoryLabel(avail.sound.category)}` : avail.text;
  const detailTone = avail.ok ? 'text-muted-foreground' : avail.kind === 'error' ? 'text-destructive' : 'text-warning';

  return (
    <motion.li
      layout={reduce ? false : 'position'}
      transition={ui}
      className={cn('flex items-center gap-2 rounded-2xl border p-1.5 sm:p-2', tone.tile, removing && 'opacity-60')}
    >
      <span aria-hidden className="hidden w-6 shrink-0 text-center text-xs text-muted-foreground tabular-nums sm:block">
        {index + 1}
      </span>
      <button
        type="button"
        onClick={() => onEdit(button)}
        aria-label={`Editar ${button.label}`}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-xl px-1.5 py-1 text-left outline-none hover:bg-background/40 focus-visible:ring-3 focus-visible:ring-ring/60 sm:gap-2.5 sm:px-2"
      >
        {button.emoji ? (
          <span aria-hidden className="w-7 shrink-0 text-center text-2xl leading-none">
            {button.emoji}
          </span>
        ) : (
          <Music2 aria-hidden className={cn('size-6 shrink-0', tone.icon)} />
        )}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-3 text-sm leading-snug font-semibold break-words text-foreground sm:line-clamp-2">
            {button.label}
          </span>
          {/* On phones the sound name shows only when something is wrong; the label needs the room. */}
          <span className={cn('text-xs break-words', avail.ok ? 'hidden sm:line-clamp-2' : 'line-clamp-2', detailTone)}>
            {detail}
          </span>
        </span>
        <VolumeMark volume={button.volume} className="hidden sm:inline-flex" />
        <Pencil aria-hidden className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
      </button>
      {/* Phones: up over down, so the name keeps the width of one more button. */}
      <div className="flex shrink-0 flex-col sm:flex-row sm:gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-12 rounded-xl max-sm:h-11"
          aria-label={`Mover ${button.label} para cima`}
          disabled={offline || index === 0}
          onClick={() => onMove(button.id, -1)}
        >
          <ChevronUp className="size-5" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-12 rounded-xl max-sm:h-11"
          aria-label={`Mover ${button.label} para baixo`}
          disabled={offline || last}
          onClick={() => onMove(button.id, 1)}
        >
          <ChevronDown className="size-5" aria-hidden />
        </Button>
      </div>
      <HoldToConfirmButton
        key={attempt}
        holdSeconds={1.2}
        onConfirm={() => onRemove(button)}
        onCancel={onHoldCancel}
        aria-describedby={hintId}
        className={cn('size-12! shrink-0', offline && 'opacity-50')}
      >
        {removing ? <Spinner className="size-5" /> : <Trash2 className="size-5" aria-hidden />}
        <span className="sr-only">Remover {button.label}</span>
      </HoldToConfirmButton>
    </motion.li>
  );
});

/** Edit mode: new button, bulk creation, and the ordered list with edit, move and remove. */
export const EditPanel = memo(function EditPanel({
  buttons,
  sounds,
  soundsById,
  offline,
  onNew,
  onEdit,
  onMove,
}: {
  buttons: readonly SfxButton[];
  sounds: readonly SfxSound[];
  soundsById: ReadonlyMap<string, SfxSound>;
  offline: boolean;
  onNew: () => void;
  onEdit: (button: SfxButton) => void;
  onMove: (id: string, delta: -1 | 1) => void;
}) {
  const titleId = useId();
  const hintId = useId();
  const notify = useNotify();
  const [removing, setRemoving] = useState<ReadonlySet<string>>(() => new Set());
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set());
  const [attempts, setAttempts] = useState<Readonly<Record<string, number>>>({});

  // Forget removed ids once the server list no longer has them.
  useEffect(() => {
    setGone((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(buttons.map((b) => b.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [buttons]);

  const remove = useCallback(
    async (button: SfxButton) => {
      const retry = () => setAttempts((prev) => ({ ...prev, [button.id]: (prev[button.id] ?? 0) + 1 }));
      if (offline) {
        notify({ tone: 'warning', title: 'Sem conexão com o PC', description: 'Remova quando o painel reconectar.' });
        retry();
        return;
      }
      setRemoving((prev) => new Set(prev).add(button.id));
      try {
        await api('DELETE', `/api/sfx/buttons/${encodeURIComponent(button.id)}`);
        setGone((prev) => new Set(prev).add(button.id));
        notify({ tone: 'success', title: `Botão ${button.label} removido` });
      } catch (err) {
        const { title, fix } = toActionError(err);
        notify({ tone: 'error', title, description: fix });
        retry();
      } finally {
        setRemoving((prev) => {
          const next = new Set(prev);
          next.delete(button.id);
          return next;
        });
      }
    },
    [offline, notify],
  );

  const onRemove = useCallback((button: SfxButton) => void remove(button), [remove]);
  const onHoldCancel = useCallback(() => holdTip(notify, 'Segure a lixeira para remover'), [notify]);

  const visible = gone.size > 0 ? buttons.filter((b) => !gone.has(b.id)) : buttons;

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-4 rounded-2xl border border-dashed border-border p-3 sm:p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="text-base font-semibold">
          Editar botões
        </h2>
        <p id={hintId} className="text-sm text-pretty text-muted-foreground">
          Toque num botão para mudar nome, som, emoji, cor e volume. As setas mudam a ordem. Segure a lixeira para
          remover.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Button type="button" className="h-12 rounded-xl" onClick={onNew} disabled={offline}>
            <Plus aria-hidden />
            Novo botão
          </Button>
          <p className="text-xs text-muted-foreground">
            {offline ? 'Sem conexão com o PC.' : `${plural(visible.length, 'botão', 'botões')} na mesa.`}
          </p>
        </div>
        <CreateMissingButtons sounds={sounds} buttons={buttons} offline={offline} />
      </div>
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          A mesa ainda não tem botões. Crie o primeiro em Novo botão.
        </p>
      ) : (
        <ol aria-label="Botões na ordem da mesa" className="flex flex-col gap-2">
          {visible.map((button, index) => (
            <EditRow
              key={button.id}
              button={button}
              index={index}
              last={index === visible.length - 1}
              sound={button.soundId ? soundsById.get(button.soundId) : undefined}
              offline={offline}
              removing={removing.has(button.id)}
              attempt={attempts[button.id] ?? 0}
              hintId={hintId}
              onEdit={onEdit}
              onMove={onMove}
              onRemove={onRemove}
              onHoldCancel={onHoldCancel}
            />
          ))}
        </ol>
      )}
    </section>
  );
});
