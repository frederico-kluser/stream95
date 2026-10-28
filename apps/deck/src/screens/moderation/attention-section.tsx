import type { AttentionItem } from '@stream95/shared';
import { Check, CheckCheck, MessageCircleQuestionMark, Radar, TriangleAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ago, pct } from '@/lib/format';
import { useDeck } from '@/lib/store';
import { useItemMotion, useNow } from './hooks';
import { attentionKey, resolveAttention, useResolvedAttention } from './stores';

const QUESTIONS_PREVIEW = 5;

/** Open alerts, one per message and kind, newest first. */
function useOpenAttention() {
  const { attention } = useDeck();
  const resolved = useResolvedAttention();
  return useMemo(() => {
    const byKey = new Map<string, AttentionItem>();
    for (const a of attention) {
      const key = attentionKey(a);
      if (!resolved.has(key)) byKey.set(key, a);
    }
    const open = [...byKey.values()].sort((a, b) => b.at - a.at);
    return {
      tech: open.filter((a) => a.kind === 'techIssue'),
      questions: open.filter((a) => a.kind === 'question'),
    };
  }, [attention, resolved]);
}

function TechIssueCard({ item, now }: { item: AttentionItem; now: number }) {
  const motionProps = useItemMotion();
  return (
    <motion.li
      layout="position"
      {...motionProps}
      className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-warning">Problema técnico</p>
          <p className="mt-1 text-base leading-snug wrap-anywhere">
            <span className="font-semibold">{item.displayName}:</span> {item.text}
          </p>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {ago(item.at, now)} · Jev {pct(item.score)}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        className="h-12 w-full sm:w-auto sm:self-end sm:px-5"
        onClick={() => resolveAttention([attentionKey(item)])}
      >
        <Check aria-hidden />
        Resolvido
      </Button>
    </motion.li>
  );
}

function QuestionRow({ item, now }: { item: AttentionItem; now: number }) {
  const motionProps = useItemMotion();
  return (
    <motion.li layout="position" {...motionProps} className="flex min-h-12 items-center gap-3 py-1.5">
      <MessageCircleQuestionMark className="size-4 shrink-0 text-info" aria-hidden />
      <p className="min-w-0 flex-1 text-sm leading-snug wrap-anywhere">
        <span className="font-semibold">{item.displayName}:</span> {item.text}{' '}
        <span className="text-xs whitespace-nowrap text-muted-foreground">{ago(item.at, now)}</span>
      </p>
      <Button
        variant="ghost"
        size="icon"
        className="size-12 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={`Marcar a pergunta de ${item.displayName} como respondida`}
        onClick={() => resolveAttention([attentionKey(item)])}
      >
        <Check className="size-5" aria-hidden />
      </Button>
    </motion.li>
  );
}

/** Questions and technical problems Jev found in the chat, until the streamer marks them done. */
export function AttentionSection() {
  const { settings, status } = useDeck();
  const { tech, questions } = useOpenAttention();
  const [showAll, setShowAll] = useState(false);
  const now = useNow();
  const mod = settings.moderation;
  // Jev runs on OpenRouter: without the key on the PC it never reads the chat
  const noAiKey = status?.openrouter === 'unconfigured';
  const jevOff = !mod.llm || mod.engine !== 'jev' || mod.mode === 'off';
  const visibleQuestions = showAll ? questions : questions.slice(0, QUESTIONS_PREVIEW);
  const empty = tech.length === 0 && questions.length === 0;

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          Atenção agora
          {tech.length > 0 && (
            <Badge className="border-transparent bg-warning/15 text-warning tabular-nums">
              {tech.length} {tech.length === 1 ? 'problema' : 'problemas'}
            </Badge>
          )}
        </span>
      }
      description="Perguntas e problemas técnicos que o Jev encontrou no chat."
    >
      {empty ? (
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm">
          <Radar className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">Nada pedindo sua atenção</p>
            <p className="text-muted-foreground">
              {noAiKey
                ? 'A IA não está configurada no PC (falta a OPENROUTER_API_KEY), então o Jev não lê o chat.'
                : jevOff
                  ? 'O Jev está desligado. Ligue “Usar IA” e “Jev analisa todo comentário” em Modo.'
                  : 'Quando alguém avisar de som, vídeo ou atraso, ou fizer uma pergunta, aparece aqui.'}
            </p>
          </div>
        </div>
      ) : (
        <>
          {tech.length > 0 && (
            <ul className="relative grid gap-3 md:grid-cols-2" aria-label="Problemas técnicos">
              <AnimatePresence initial={false} mode="popLayout">
                {tech.map((item) => (
                  <TechIssueCard key={attentionKey(item)} item={item} now={now} />
                ))}
              </AnimatePresence>
            </ul>
          )}
          {questions.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  Perguntas
                  <Badge variant="secondary" className="tabular-nums">
                    {questions.length}
                  </Badge>
                </h3>
                <Button
                  variant="ghost"
                  className="h-12 px-3 text-muted-foreground"
                  onClick={() => resolveAttention(questions.map(attentionKey))}
                >
                  <CheckCheck aria-hidden />
                  Limpar perguntas
                </Button>
              </div>
              <ul className="relative divide-y divide-border">
                <AnimatePresence initial={false} mode="popLayout">
                  {visibleQuestions.map((item) => (
                    <QuestionRow key={attentionKey(item)} item={item} now={now} />
                  ))}
                </AnimatePresence>
              </ul>
              {questions.length > QUESTIONS_PREVIEW && (
                <Button variant="ghost" className="h-12 w-full" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? 'Mostrar menos' : `Mostrar todas (${questions.length})`}
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </Section>
  );
}
