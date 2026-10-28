import { Check, Plus, Vote, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ActionButton, useRunAction } from '@/screens/assistant/kit/action';
import { useOnline } from '@/screens/assistant/kit/connection';
import { useDraft } from '@/screens/assistant/kit/draft';
import { digits, FieldShell, intInRange } from '@/screens/assistant/kit/fields';
import { useReveal, useTravel } from '@/screens/assistant/kit/motion';
import { Reason } from '@/screens/assistant/kit/settings';

const QUESTION_MAX = 120;
const OPTION_MAX = 60;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 9;
const DURATION_MAX = 3600;

const PRESETS = [
  { seconds: 0, label: 'Sem limite' },
  { seconds: 60, label: '1 min' },
  { seconds: 120, label: '2 min' },
  { seconds: 300, label: '5 min' },
] as const;

type OptionDraft = { id: number; text: string };
type Errors = { question?: string; options?: string; duration?: string };

// Stable keys for the option rows (drafts outlive the component, so the counter lives here too).
let nextId = MIN_OPTIONS + 1;
const blankOptions = (): OptionDraft[] => [
  { id: nextId++, text: '' },
  { id: nextId++, text: '' },
];

/** New poll: question, 2 to 9 options (the chat votes with !1, !2…) and an optional time limit. */
export function PollForm({ replacing, onOpened }: { replacing: boolean; onOpened?: () => void }) {
  const { online, reason } = useOnline();
  const action = useRunAction();
  const reveal = useReveal();
  const travel = useTravel();
  const [question, setQuestion] = useDraft('alerts.poll.question', '');
  const [options, setOptions] = useDraft<OptionDraft[]>('alerts.poll.options', blankOptions);
  const [duration, setDuration] = useDraft('alerts.poll.duration', '0');
  const [errors, setErrors] = useState<Errors>({});
  const focusId = useRef<number | null>(null);

  // A freshly added option gets the focus, so the keyboard stays open on phones.
  useEffect(() => {
    const id = focusId.current;
    if (id === null || !options.some((o) => o.id === id)) return;
    focusId.current = null;
    document.getElementById(`poll-option-${id}`)?.focus();
  }, [options]);

  const add = () => {
    if (options.length >= MAX_OPTIONS) return;
    const id = nextId++;
    focusId.current = id;
    setOptions((prev) => [...prev, { id, text: '' }]);
  };
  const remove = (id: number) =>
    setOptions((prev) => (prev.length > MIN_OPTIONS ? prev.filter((o) => o.id !== id) : prev));
  const edit = (id: number, text: string) => {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, text } : o)));
    if (errors.options) setErrors((prev) => ({ ...prev, options: undefined }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    const filled = options.map((o) => o.text.trim()).filter(Boolean);
    const seconds = intInRange(duration || '0', 0, DURATION_MAX);
    const found: Errors = {};
    if (!q) found.question = 'Escreva a pergunta.';
    if (filled.length < MIN_OPTIONS) found.options = `Preencha pelo menos ${MIN_OPTIONS} opções.`;
    if (seconds === null) found.duration = `Use de 0 a ${DURATION_MAX} segundos.`;
    setErrors(found);
    if (found.question || found.options || found.duration || seconds === null) {
      const empty = options.find((o) => !o.text.trim()) ?? options[0];
      const target = found.question ? 'poll-question' : found.options ? `poll-option-${empty?.id}` : 'poll-duration';
      document.getElementById(target)?.focus();
      return;
    }
    if (!online) return;
    void action
      .run(() => api('POST', '/api/poll', { question: q, options: filled, durationSec: seconds }))
      .then((ok) => {
        if (!ok) return;
        setQuestion('');
        setOptions(blankOptions());
        onOpened?.();
      });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <FieldShell
        id="poll-question"
        label="Pergunta"
        error={errors.question}
        count={{ value: question.length, max: QUESTION_MAX }}
      >
        {(aria) => (
          <Input
            {...aria}
            value={question}
            maxLength={QUESTION_MAX}
            placeholder="ex.: qual linguagem eu uso no próximo projeto?"
            autoComplete="off"
            onChange={(e) => {
              setQuestion(e.target.value);
              if (errors.question) setErrors((prev) => ({ ...prev, question: undefined }));
            }}
            className="h-12"
          />
        )}
      </FieldShell>

      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Opções</legend>
        <ol className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {options.map((o, i) => (
              <motion.li
                key={o.id}
                layout={travel ? 'position' : false}
                {...reveal}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <span className="w-7 shrink-0 text-center font-mono text-sm text-muted-foreground" aria-hidden>
                  !{i + 1}
                </span>
                <label htmlFor={`poll-option-${o.id}`} className="sr-only">
                  Opção {i + 1} (o chat vota com !{i + 1})
                </label>
                <Input
                  id={`poll-option-${o.id}`}
                  value={o.text}
                  maxLength={OPTION_MAX}
                  placeholder={`Opção ${i + 1}`}
                  autoComplete="off"
                  aria-invalid={errors.options && !o.text.trim() ? true : undefined}
                  aria-describedby={errors.options ? 'poll-options-error' : 'poll-options-hint'}
                  onChange={(e) => edit(o.id, e.target.value)}
                  className="h-12 min-w-0 flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-12 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remover opção ${i + 1}`}
                  disabled={options.length <= MIN_OPTIONS}
                  onClick={() => remove(o.id)}
                >
                  <X className="size-5" aria-hidden />
                </Button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
        {errors.options ? (
          <p id="poll-options-error" className="text-sm text-destructive">
            {errors.options}
          </p>
        ) : (
          <p id="poll-options-hint" className="text-sm text-muted-foreground">
            De {MIN_OPTIONS} a {MAX_OPTIONS} opções, com até {OPTION_MAX} letras cada.
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          className="h-12 self-start px-4"
          disabled={options.length >= MAX_OPTIONS}
          onClick={add}
        >
          <Plus className="size-4" aria-hidden />
          {options.length >= MAX_OPTIONS ? 'Máximo de 9 opções' : 'Adicionar opção'}
        </Button>
      </fieldset>

      <FieldShell
        id="poll-duration"
        label="Duração em segundos"
        error={errors.duration}
        hint="0 deixa a enquete aberta até você encerrar. Máximo de 1 hora."
      >
        {(aria) => (
          <div className="flex flex-col gap-3">
            <Input
              {...aria}
              value={duration}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              onChange={(e) => {
                setDuration(digits(e.target.value));
                if (errors.duration) setErrors((prev) => ({ ...prev, duration: undefined }));
              }}
              className="h-12 w-32 tabular-nums"
            />
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">Durações prontas</legend>
              {PRESETS.map((p) => {
                const active = duration === String(p.seconds);
                return (
                  <Button
                    key={p.seconds}
                    type="button"
                    variant={active ? 'secondary' : 'outline'}
                    aria-pressed={active}
                    className={cn('h-12 px-4', active && 'ring-1 ring-primary')}
                    onClick={() => setDuration(String(p.seconds))}
                  >
                    {active && <Check className="size-4" aria-hidden />}
                    {p.label}
                  </Button>
                );
              })}
            </fieldset>
          </div>
        )}
      </FieldShell>

      {replacing && <Reason>A enquete que está na tela sai e os votos dela se perdem.</Reason>}

      <ActionButton
        phase={action.phase}
        type="submit"
        icon={<Vote className="size-5 sm:size-4" />}
        label={replacing ? 'Abrir nova enquete' : 'Abrir enquete'}
        pendingLabel="Abrindo…"
        doneLabel="Na tela"
        blocked={online ? undefined : reason}
      />
    </form>
  );
}
