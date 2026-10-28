import type { SfxButton, SfxSound } from '@stream95/shared';
import { Check, CircleAlert, ListPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MultiStateButton } from '@/components/motion-ui/multi-state-button';
import { useNotify } from '@/components/notify';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { colorForCategory, labelFromName, MAX_BUTTONS, plural, unmappedReadySounds } from './lib';
import { FILL_PILL, Spinner } from './parts';
import { useAction } from './use-action';

/** "Criar botões para os sons sem botão": one button per ready sound not mapped yet (up to 24 in total). */
export function CreateMissingButtons({
  sounds,
  buttons,
  offline,
  className,
}: {
  sounds: readonly SfxSound[];
  buttons: readonly SfxButton[];
  offline: boolean;
  className?: string;
}) {
  const notify = useNotify();
  const action = useAction();
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const missing = useMemo(() => unmappedReadySounds(sounds, buttons), [sounds, buttons]);
  const room = Math.max(0, MAX_BUTTONS - buttons.length);
  const reason = offline
    ? 'Sem conexão com o PC.'
    : missing.length === 0
      ? 'Todo som pronto já tem botão.'
      : room === 0
        ? `A mesa já tem ${MAX_BUTTONS} botões.`
        : null;
  const hint =
    reason ??
    `${plural(missing.length, 'som pronto', 'sons prontos')} sem botão${missing.length > room ? `; cabem mais ${room}` : ''}.`;

  const create = () => {
    if (reason) return;
    const list = missing.slice(0, room);
    let done = 0;
    setProgress({ done, total: list.length });
    void action
      .run(
        async () => {
          for (const sound of list) {
            await api<SfxButton>('POST', '/api/sfx/buttons', {
              label: labelFromName(sound.name),
              soundId: sound.id,
              color: colorForCategory(sound.category),
              volume: 1,
            });
            done += 1;
            setProgress({ done, total: list.length });
          }
        },
        {
          onError: ({ title, fix }) =>
            notify({
              tone: 'error',
              title: done > 0 ? `Parou depois de ${plural(done, 'botão criado', 'botões criados')}` : title,
              description: done > 0 ? title : fix,
            }),
        },
      )
      .then((r) => {
        if (r.ok) notify({ tone: 'success', title: `${plural(done, 'botão criado', 'botões criados')} na mesa` });
      });
  };

  const label =
    action.state === 'busy'
      ? `Criando ${Math.min(progress.done + 1, progress.total)} de ${progress.total}…`
      : action.state === 'done'
        ? 'Botões criados'
        : action.state === 'error'
          ? 'Parou no meio'
          : 'Criar botões para os sons sem botão';
  const icon =
    action.state === 'busy' ? (
      <Spinner className="size-4" />
    ) : action.state === 'done' ? (
      <Check className="size-4" />
    ) : action.state === 'error' ? (
      <CircleAlert className="size-4" />
    ) : (
      <ListPlus className="size-4" />
    );

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <MultiStateButton
        state={action.state === 'busy' ? `busy-${progress.done}` : action.state}
        icon={icon}
        onClick={create}
        disabled={reason !== null}
        widthMorph={false}
        feedback={action.state === 'error' ? 'shake' : action.state === 'done' ? 'pop' : 'none'}
        announce={action.state === 'done' ? 'Botões criados' : undefined}
        className={cn(FILL_PILL, 'rounded-xl!')}
        pillClassName="min-h-12 rounded-xl px-4 text-sm font-medium"
        surfaceClassName={cn('bg-secondary text-secondary-foreground hover:bg-muted', reason && 'opacity-50')}
      >
        {/* The label may wrap on narrow phones (the pill keeps it on one line by default). */}
        <span className="whitespace-normal text-center leading-tight">{label}</span>
      </MultiStateButton>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
