import { Megaphone, MessageSquareText } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { Section } from '@/components/section';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useDeck } from '@/lib/store';
import { ActionButton, useRunAction } from './kit/action';
import { useOnline } from './kit/connection';
import { useDraft } from './kit/draft';
import { FieldShell } from './kit/fields';
import { SelectRow, SwitchRow } from './kit/settings';
import { ANIMATIONS } from './options';

const TEXT_MAX = 300;

/** The assistant says a free text on the live, with the chosen animation and, if wanted, out loud. */
export function SaySection() {
  const { status } = useDeck();
  const { online, reason } = useOnline();
  const action = useRunAction();
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useDraft('assistant.say.text', '');
  const [animation, setAnimation] = useDraft('assistant.say.animation', 'Explain');
  const [speak, setSpeak] = useDraft('assistant.say.speak', false);
  const [error, setError] = useState<string | null>(null);
  const noVoice = status?.openrouter === 'unconfigured';

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const clean = text.trim();
    if (!clean) {
      setError('Escreva o que o assistente vai falar.');
      field.current?.focus();
      return;
    }
    if (!online) return;
    void action.run(() => api('POST', '/api/assistant/say', { text: clean, animation, speak: speak && !noVoice }));
  };

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <MessageSquareText className="size-4 text-brand" aria-hidden />
          Falar
        </span>
      }
      description="O assistente diz o seu texto na live."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-2">
        <FieldShell id="assistant-say" label="Texto" error={error} count={{ value: text.length, max: TEXT_MAX }}>
          {(aria) => (
            <Textarea
              {...aria}
              ref={field}
              value={text}
              maxLength={TEXT_MAX}
              rows={2}
              placeholder="ex.: deploy feito, ninguém mexe em produção hoje."
              onChange={(e) => {
                setText(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
              }}
              className="min-h-20"
            />
          )}
        </FieldShell>
        <div className="flex flex-col divide-y divide-border">
          <SelectRow label="Animação" value={animation} options={ANIMATIONS} onChange={setAnimation} />
          <SwitchRow
            label="Falar em voz alta"
            hint="Usa a voz do assistente, tocada no PC."
            checked={speak && !noVoice}
            disabled={noVoice}
            reason="Precisa da OPENROUTER_API_KEY no PC."
            onChange={setSpeak}
          />
        </div>
        <ActionButton
          phase={action.phase}
          type="submit"
          className="pt-2"
          icon={<Megaphone className="size-5 sm:size-4" />}
          label="Falar"
          pendingLabel="Enviando…"
          doneLabel="Na tela"
          blocked={online ? undefined : reason}
        />
      </form>
    </Section>
  );
}
