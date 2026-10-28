import { LoaderCircle, TriangleAlert } from 'lucide-react';
import { SegmentedToggle, SegmentedToggleOption } from '@/components/motion-ui/segmented-toggle';
import { Section } from '@/components/section';
import { Switch } from '@/components/ui/switch';
import { useDeck } from '@/lib/store';
import { cn } from '@/lib/utils';
import { type DraftKey, useModerationSettings } from './hooks';
import { MODE_HELP, MODE_LABEL, type ModerationMode } from './labels';
import { OfflineReason } from './message-bits';

const MODES: ModerationMode[] = ['auto', 'manual', 'off'];

function SettingSwitch({
  id,
  label,
  hint,
  checked,
  pending,
  disabled,
  reason,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  pending: boolean;
  disabled: boolean;
  /** Why the option does not apply right now (shown instead of the hint). */
  reason?: string | null;
  onChange: (checked: boolean) => void;
}) {
  // while saving the switch stays as is (repeat taps are ignored upstream), so fast saves never flash
  const off = disabled || Boolean(reason);
  return (
    <div className="flex min-h-14 items-center gap-4 py-2">
      <label htmlFor={id} className={cn('min-w-0 flex-1', !off && 'cursor-pointer')}>
        <span className="flex items-center gap-2 text-sm font-medium">
          {label}
          {pending && <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />}
          {pending && <span className="sr-only">salvando</span>}
        </span>
        <span className={cn('mt-0.5 block text-sm', reason ? 'text-warning' : 'text-muted-foreground')}>
          {reason ?? hint}
        </span>
      </label>
      <Switch id={id} checked={checked} disabled={off} onCheckedChange={(next) => onChange(next)} />
    </div>
  );
}

/** How the chat is moderated: the mode and the AI switches. */
export function ModeSection() {
  const { connection, status } = useDeck();
  const { values, busy, patch } = useModerationSettings();
  const online = connection === 'online';
  const mode = values.mode;
  const aiBlocked = mode === 'off' ? 'No modo Só regras a IA fica desligada.' : null;
  const needsAi = aiBlocked ?? (values.llm ? null : 'Ligue “Usar IA” para usar esta opção.');
  const escalateBlocked =
    needsAi ??
    (values.engine !== 'jev'
      ? 'Só vale com o Jev ligado.'
      : mode === 'manual'
        ? 'No modo Manual tudo já espera na fila.'
        : null);
  const pendingOf = (key: DraftKey) => busy.has(key);
  const aiDown = status?.openrouter === 'unconfigured' || status?.openrouter === 'error';

  return (
    <Section title="Modo" description={MODE_HELP[mode]}>
      <OfflineReason connection={connection} />
      {/* the pill moves at once (optimistic); a failed save moves it back with an error notice */}
      <fieldset disabled={!online} className="min-w-0 disabled:opacity-60">
        <legend className="sr-only">Modo da moderação</legend>
        <SegmentedToggle<ModerationMode>
          value={mode}
          onChange={(next) => void patch('mode', next)}
          ariaLabel="Modo da moderação"
          className="flex! w-full sm:max-w-lg"
        >
          {MODES.map((value) => (
            <SegmentedToggleOption
              key={value}
              value={value}
              className="h-12 flex-1 justify-center px-2! text-[13px]! sm:text-sm!"
            >
              {MODE_LABEL[value]}
            </SegmentedToggleOption>
          ))}
        </SegmentedToggle>
      </fieldset>
      {values.llm && mode !== 'off' && aiDown && (
        <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {status?.openrouter === 'unconfigured'
            ? 'A IA não está configurada no PC (falta a OPENROUTER_API_KEY). Mensagens duvidosas vão para a fila.'
            : 'A IA está com erro agora. Mensagens duvidosas vão para a fila.'}
        </p>
      )}
      <div className="grid divide-y divide-border md:grid-cols-2 md:gap-x-8 md:divide-y-0">
        <SettingSwitch
          id="mod-llm"
          label="Usar IA"
          hint="O Jev e a IA da OpenRouter ajudam a decidir."
          checked={values.llm}
          pending={pendingOf('llm')}
          disabled={!online}
          reason={aiBlocked}
          onChange={(next) => void patch('llm', next)}
        />
        <SettingSwitch
          id="mod-jev"
          label="Jev analisa todo comentário"
          hint="Lê cada mensagem em cerca de 0,4 s e avisa perguntas e problemas técnicos."
          checked={values.engine === 'jev'}
          pending={pendingOf('engine')}
          disabled={!online}
          reason={needsAi}
          onChange={(next) => void patch('engine', next ? 'jev' : 'llm')}
        />
        <SettingSwitch
          id="mod-escalate"
          label="2ª opinião da IA nos casos ambíguos"
          hint="Quando o Jev fica em dúvida, a IA dá a palavra final. Desligado, a dúvida vai para a fila."
          checked={values.escalateToLlm}
          pending={pendingOf('escalateToLlm')}
          disabled={!online}
          reason={escalateBlocked}
          onChange={(next) => void patch('escalateToLlm', next)}
        />
        <SettingSwitch
          id="mod-first"
          label="Segurar a 1ª mensagem de quem chega"
          hint="Bom contra contas novas de spam. Em canal pequeno, segura todo primeiro oi."
          checked={values.holdFirstTimeChatters}
          pending={pendingOf('holdFirstTimeChatters')}
          disabled={!online}
          onChange={(next) => void patch('holdFirstTimeChatters', next)}
        />
      </div>
    </Section>
  );
}
