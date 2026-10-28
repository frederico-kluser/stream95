import type { AssistantReply } from '@stream95/shared';
import { Cpu, MessageCircleQuestionMark, Send, Timer } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type FormEvent, useRef, useState } from 'react';
import { CopyButton } from '@/components/copy-button';
import { Section } from '@/components/section';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { seconds } from '@/lib/format';
import { useDeck } from '@/lib/store';
import { ActionButton, useRunAction } from './kit/action';
import { useOnline } from './kit/connection';
import { useDraft } from './kit/draft';
import { FieldShell } from './kit/fields';
import { useReveal } from './kit/motion';

const QUESTION_MAX = 300;

function Answer({ reply }: { reply: AssistantReply }) {
  const reveal = useReveal();
  return (
    <motion.div
      {...reveal}
      className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-4"
      aria-live="polite"
    >
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Você perguntou</p>
        <p className="text-sm text-pretty break-words text-muted-foreground">{reply.question}</p>
      </div>
      <p className="text-base leading-relaxed text-pretty break-words">{reply.answer}</p>
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {reply.model && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Cpu className="size-3.5 shrink-0" aria-hidden />
              <span className="sr-only">Modelo:</span>
              <span className="font-mono break-all">{reply.model}</span>
            </span>
          )}
          {reply.latencyMs !== undefined && (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Timer className="size-3.5 shrink-0" aria-hidden />
              <span className="sr-only">Tempo de resposta:</span>
              {seconds(reply.latencyMs)}
            </span>
          )}
        </div>
        <CopyButton value={reply.answer} variant="icon" label="Copiar resposta" copiedLabel="Resposta copiada" />
      </div>
    </motion.div>
  );
}

/** Ask the assistant from the deck: the question and the answer show up on the live. */
export function AskSection() {
  const { settings, status } = useDeck();
  const { online, reason } = useOnline();
  const action = useRunAction();
  const field = useRef<HTMLTextAreaElement>(null);
  const [question, setQuestion] = useDraft('assistant.ask.question', '');
  const [reply, setReply] = useDraft<AssistantReply | null>('assistant.ask.reply', null);
  const [error, setError] = useState<string | null>(null);

  const blocked = !online
    ? reason
    : !settings.assistant.enabled
      ? 'Ligue “Assistente ligado” em Na tela para perguntar.'
      : status?.openrouter === 'unconfigured'
        ? 'Configure a OPENROUTER_API_KEY no PC para usar a IA.'
        : undefined;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = question.trim();
    if (!text) {
      setError('Escreva uma pergunta.');
      field.current?.focus();
      return;
    }
    if (blocked) return;
    void action.run(async () => {
      const r = await api<AssistantReply>('POST', '/api/assistant/ask', { question: text, asker: 'streamer' });
      setReply(r);
    });
  };

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <MessageCircleQuestionMark className="size-4 text-brand" aria-hidden />
          Perguntar
        </span>
      }
      description="O assistente responde na live, com a sua pergunta na tela."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FieldShell
          id="assistant-question"
          label="Pergunta"
          error={error}
          hint={<span className="hidden pointer-fine:inline">Ctrl + Enter envia.</span>}
          count={{ value: question.length, max: QUESTION_MAX }}
        >
          {(aria) => (
            <Textarea
              {...aria}
              ref={field}
              value={question}
              maxLength={QUESTION_MAX}
              rows={3}
              placeholder="ex.: o que é um ponteiro?"
              onChange={(e) => {
                setQuestion(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
              }}
              className="min-h-24"
            />
          )}
        </FieldShell>
        <ActionButton
          phase={action.phase}
          type="submit"
          icon={<Send className="size-5 sm:size-4" />}
          label="Perguntar"
          pendingLabel="Pensando…"
          doneLabel="Respondeu"
          errorLabel="Erro"
          blocked={blocked}
        />
      </form>
      <AnimatePresence initial={false}>{reply && <Answer key={reply.id} reply={reply} />}</AnimatePresence>
    </Section>
  );
}
