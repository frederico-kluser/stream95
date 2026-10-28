import { Save, Sparkles } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Section } from '@/components/section';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useDeck } from '@/lib/store';
import { ActionButton, useRunAction } from './kit/action';
import { useOnline } from './kit/connection';
import { FieldShell } from './kit/fields';
import { SettingSelect, SettingSwitch } from './kit/settings';
import { AGENTS } from './options';

const NAME_MAX = 24;

function NameForm({ current }: { current: string }) {
  const { online, reason } = useOnline();
  const action = useRunAction();
  const [draft, setDraft] = useState(current);
  const [base, setBase] = useState(current);
  const [error, setError] = useState<string | null>(null);

  // Renamed elsewhere (another device): follow it, unless the field is being edited.
  if (base !== current) {
    setBase(current);
    if (draft === base) setDraft(current);
  }

  const name = draft.trim();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name) {
      setError('Escreva um nome.');
      return;
    }
    if (name === current) return;
    void action.run(() => api('PATCH', '/api/settings', { assistant: { name } }));
  };

  return (
    <form onSubmit={submit} noValidate className="py-3">
      <FieldShell
        id="assistant-name"
        label="Nome do assistente"
        error={error}
        count={{ value: draft.length, max: NAME_MAX }}
      >
        {(aria) => (
          <div className="flex items-start gap-2">
            <Input
              {...aria}
              value={draft}
              maxLength={NAME_MAX}
              autoComplete="off"
              enterKeyHint="done"
              disabled={!online}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              className="h-12 flex-1"
            />
            <ActionButton
              phase={action.phase}
              type="submit"
              size="regular"
              tone="secondary"
              block={false}
              icon={<Save className="size-4" />}
              label="Salvar"
              pendingLabel="Salvando…"
              doneLabel="Salvo"
              disabled={!online || name === current}
            />
          </div>
        )}
      </FieldShell>
      {!online && <p className="mt-2 text-sm text-muted-foreground">{reason}</p>}
    </form>
  );
}

/** What the audience sees: the animated character, its reactions and its name. */
export function OnScreenSection() {
  const { settings } = useDeck();
  const a = settings.assistant;
  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-brand" aria-hidden />
          Na tela
        </span>
      }
      description="O personagem que conversa com o chat na live."
    >
      <div className="flex flex-col divide-y divide-border">
        <SettingSwitch
          label="Mostrar o assistente animado"
          hint="Desligado, o personagem sai da tela e as respostas continuam aparecendo."
          checked={a.showAgent}
          toPatch={(showAgent) => ({ assistant: { showAgent } })}
        />
        <SettingSwitch
          label="Reagir a cada mensagem do chat"
          hint="Não interrompe uma animação em andamento."
          checked={a.reactToChat}
          disabled={!a.showAgent}
          reason="Ligue “Mostrar o assistente animado” para usar."
          toPatch={(reactToChat) => ({ assistant: { reactToChat } })}
        />
        <SettingSwitch
          label="Assistente ligado"
          hint="Responde a quem usa !pergunta no chat e às perguntas feitas aqui."
          checked={a.enabled}
          toPatch={(enabled) => ({ assistant: { enabled } })}
        />
        <SettingSelect
          label="Personagem"
          value={a.agent}
          options={AGENTS}
          toPatch={(agent) => ({ assistant: { agent } })}
        />
        <NameForm current={a.name} />
      </div>
    </Section>
  );
}
