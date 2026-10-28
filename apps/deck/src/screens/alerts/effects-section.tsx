import type { ToastLevel } from '@stream95/shared';
import {
  BellRing,
  CircleCheck,
  Info,
  type LucideIcon,
  MonitorX,
  OctagonAlert,
  TriangleAlert,
  Wand,
} from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { SegmentedToggle, SegmentedToggleOption } from '@/components/motion-ui/segmented-toggle';
import { Section } from '@/components/section';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { ActionButton, HoldAction, useRunAction } from '@/screens/assistant/kit/action';
import { useOnline } from '@/screens/assistant/kit/connection';
import { useDraft } from '@/screens/assistant/kit/draft';
import { FieldShell } from '@/screens/assistant/kit/fields';
import { GroupTitle } from '@/screens/assistant/kit/settings';

const BSOD_MAX = 300;
const TITLE_MAX = 60;
const BODY_MAX = 200;

const LEVELS: readonly { value: ToastLevel; label: string; icon: LucideIcon }[] = [
  { value: 'info', label: 'Info', icon: Info },
  { value: 'success', label: 'Sucesso', icon: CircleCheck },
  { value: 'warning', label: 'Atenção', icon: TriangleAlert },
  { value: 'error', label: 'Erro', icon: OctagonAlert },
];

function ErrorScreen() {
  const { online, reason } = useOnline();
  const [message, setMessage] = useDraft('alerts.bsod.message', '');
  return (
    <div className="flex flex-col gap-4 py-3">
      <FieldShell
        id="bsod-message"
        label="Mensagem da tela de erro"
        hint="Opcional. Em branco, usa a mensagem de erro padrão."
        count={{ value: message.length, max: BSOD_MAX }}
      >
        {(aria) => (
          <Input
            {...aria}
            value={message}
            maxLength={BSOD_MAX}
            placeholder="ex.: o deploy de sexta caiu"
            autoComplete="off"
            onChange={(e) => setMessage(e.target.value)}
            className="h-12"
          />
        )}
      </FieldShell>
      <HoldAction
        label="Segure para mostrar a tela de erro na live"
        icon={<MonitorX className="size-4 shrink-0" />}
        hint="Segure por 1,5 segundo. Soltar antes cancela."
        success="Tela de erro na live"
        blocked={online ? undefined : reason}
        onConfirm={() => {
          const text = message.trim();
          return api('POST', '/api/fx/bsod', text ? { message: text } : {});
        }}
      />
    </div>
  );
}

function ToastForm() {
  const { online, reason } = useOnline();
  const action = useRunAction();
  const levelLabel = useId();
  const [title, setTitle] = useDraft('alerts.toast.title', '');
  const [body, setBody] = useDraft('alerts.toast.body', '');
  const [level, setLevel] = useDraft<ToastLevel>('alerts.toast.level', 'info');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    if (!t) {
      setError('Escreva um título.');
      document.getElementById('toast-title')?.focus();
      return;
    }
    if (!online) return;
    void action.run(() => api('POST', '/api/fx/toast', { title: t, body: body.trim(), level }));
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 py-3">
      <FieldShell id="toast-title" label="Título" error={error} count={{ value: title.length, max: TITLE_MAX }}>
        {(aria) => (
          <Input
            {...aria}
            value={title}
            maxLength={TITLE_MAX}
            placeholder="ex.: build verde"
            autoComplete="off"
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
            className="h-12"
          />
        )}
      </FieldShell>
      <FieldShell id="toast-body" label="Texto" hint="Opcional." count={{ value: body.length, max: BODY_MAX }}>
        {(aria) => (
          <Input
            {...aria}
            value={body}
            maxLength={BODY_MAX}
            placeholder="ex.: todos os testes passaram"
            autoComplete="off"
            onChange={(e) => setBody(e.target.value)}
            className="h-12"
          />
        )}
      </FieldShell>
      <div className="flex flex-col gap-2">
        <p id={levelLabel} className="text-sm font-medium">
          Tipo
        </p>
        <div className="-mx-1 overflow-x-auto px-1 py-1">
          <SegmentedToggle<ToastLevel>
            value={level}
            onChange={setLevel}
            ariaLabel="Tipo do aviso"
            className="w-full min-w-max"
          >
            {LEVELS.map((l) => {
              const Icon = l.icon;
              return (
                <SegmentedToggleOption key={l.value} value={l.value} className="min-h-12 flex-1 justify-center px-2.5!">
                  <Icon className="hidden size-4 sm:block" aria-hidden />
                  {l.label}
                </SegmentedToggleOption>
              );
            })}
          </SegmentedToggle>
        </div>
      </div>
      <ActionButton
        phase={action.phase}
        type="submit"
        icon={<BellRing className="size-5 sm:size-4" />}
        label="Mostrar aviso"
        pendingLabel="Enviando…"
        doneLabel="Na tela"
        blocked={online ? undefined : reason}
      />
    </form>
  );
}

/** One-shot effects for the audience: the full-screen error and a notice on the overlay. */
export function EffectsSection() {
  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <Wand className="size-4 text-brand" aria-hidden />
          Efeitos
        </span>
      }
      description="Aparecem na hora para quem assiste."
    >
      <div className="flex flex-col">
        <GroupTitle>Tela de erro</GroupTitle>
        <ErrorScreen />
      </div>
      <Separator />
      <div className="flex flex-col">
        <GroupTitle>Aviso</GroupTitle>
        <ToastForm />
      </div>
    </Section>
  );
}
