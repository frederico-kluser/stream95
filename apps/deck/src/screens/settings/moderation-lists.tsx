import type { Settings } from '@stream95/shared';
import { Info } from 'lucide-react';
import { useId, useState } from 'react';
import { Section } from '@/components/section';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { pct } from '@/lib/format';
import { useDeck } from '@/lib/store';
import { cn } from '@/lib/utils';
import { OfflineNote, Spinner, useOnline, useSaveState } from '@/screens/live/kit';
import { cleanDomain, isDomain, parseLines, useDraft } from './draft';
import { SaveBar } from './shared';

type Lists = { domains: string[]; terms: string[] };
type Threshold = 'jevBlockAt' | 'jevAllowAt' | 'attentionAt';

const THRESHOLDS: { key: Threshold; label: string; hint: string }[] = [
  {
    key: 'jevBlockAt',
    label: 'Barrar sozinho a partir de',
    hint: 'Certeza que o Jev precisa para barrar uma mensagem sem perguntar. Mais alto barra menos sozinho.',
  },
  {
    key: 'jevAllowAt',
    label: 'Mostrar sozinho a partir de',
    hint: 'Certeza que o Jev precisa para mostrar uma mensagem direto. Mais alto manda mais mensagens para a fila ou para a IA conferir.',
  },
  {
    key: 'attentionAt',
    label: 'Avisar perguntas e problemas a partir de',
    hint: 'Chance mínima de ser uma pergunta ou um problema técnico para aparecer em Atenção. Mais baixo avisa mais vezes.',
  },
];

const patchSettings = (patch: unknown) => api<Settings>('PATCH', '/api/settings', patch);

/** One Jev threshold: follows the server, keeps the dragged value until the server echoes it. */
function ThresholdSlider({
  label,
  hint,
  value,
  onCommit,
}: {
  label: string;
  hint: string;
  value: number;
  onCommit: (value: number) => Promise<unknown>;
}) {
  const online = useOnline();
  const id = useId();
  const [dragged, setDragged] = useState<number | null>(null);
  const { state, save } = useSaveState();
  // The server caught up with the saved value: let it drive the slider again.
  if (dragged !== null && state !== 'saving' && Math.abs(dragged - value) < 0.0005) setDragged(null);
  const shown = dragged ?? value;
  const first = (v: number | readonly number[]) => (Array.isArray(v) ? (v[0] ?? value) : (v as number));

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span id={`${id}-label`} className="text-sm font-medium">
          {label}
        </span>
        <span className="flex items-center gap-2 font-mono text-sm tabular-nums">
          {state === 'saving' && <Spinner className="size-3.5" />}
          {state === 'saved' && <span className="font-sans text-xs text-success">salvo</span>}
          {state === 'error' && <span className="font-sans text-xs text-destructive">não salvou</span>}
          {pct(shown)}
        </span>
      </div>
      <Slider
        aria-labelledby={`${id}-label`}
        min={0.5}
        max={1}
        step={0.01}
        value={[shown]}
        format={{ style: 'percent', maximumFractionDigits: 0 }}
        disabled={!online}
        onValueChange={(v) => setDragged(first(v))}
        onValueCommitted={async (v) => {
          // On failure, snap back to what the server has.
          if (!(await save(() => onCommit(first(v))))) setDragged(null);
        }}
        className="*:min-h-12 [&_[data-slot=slider-thumb]]:size-5"
      />
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Allowed link domains, extra blocked terms and how sure Jev must be before acting alone. */
export function ModerationListsSection() {
  const { settings } = useDeck();
  const uid = useId();
  const m = settings.moderation;
  const { state, save } = useSaveState();

  const source: Lists = {
    domains: parseLines(m.allowedLinkDomains.join('\n'), cleanDomain),
    terms: parseLines(m.blockedTerms.join('\n')),
  };
  const lists = useDraft(
    source,
    (s) => ({ domains: s.domains.join('\n'), terms: s.terms.join('\n') }),
    (d): Lists => ({ domains: parseLines(d.domains, cleanDomain), terms: parseLines(d.terms) }),
  );

  const parsed: Lists = { domains: parseLines(lists.draft.domains, cleanDomain), terms: parseLines(lists.draft.terms) };
  const badDomains = parsed.domains.filter((d) => !isDomain(d));
  const shortTerms = parsed.terms.filter((t) => t.length < 2);
  const valid = badDomains.length === 0 && shortTerms.length === 0;

  const onSave = () =>
    save(async () => {
      const saved = await patchSettings({
        moderation: { allowedLinkDomains: parsed.domains, blockedTerms: parsed.terms },
      });
      lists.commit({
        domains: parseLines(saved.moderation.allowedLinkDomains.join('\n'), cleanDomain),
        terms: parseLines(saved.moderation.blockedTerms.join('\n')),
      });
    });

  const jevActive = m.llm && m.engine === 'jev' && m.mode !== 'off';

  return (
    <Section title="Listas de moderação" description="Uma entrada por linha. Valem para todo o chat na hora.">
      <OfflineNote />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-domains`}>Links liberados</Label>
          <Textarea
            id={`${uid}-domains`}
            value={lists.draft.domains}
            onChange={(e) => {
              const domains = e.target.value;
              lists.update((d) => ({ ...d, domains }));
            }}
            rows={8}
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="github.com"
            aria-invalid={badDomains.length > 0 || undefined}
            aria-describedby={`${uid}-domains-hint`}
            className="max-h-72 min-h-40 font-mono text-sm"
          />
          <p
            id={`${uid}-domains-hint`}
            className={cn('text-sm', badDomains.length ? 'text-destructive' : 'text-muted-foreground')}
          >
            {badDomains.length
              ? `Não parece domínio: ${badDomains.slice(0, 3).join(', ')}${badDomains.length > 3 ? '…' : ''}`
              : `${parsed.domains.length} ${parsed.domains.length === 1 ? 'domínio' : 'domínios'}. Subdomínios entram junto.`}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-terms`}>Termos proibidos</Label>
          <Textarea
            id={`${uid}-terms`}
            value={lists.draft.terms}
            onChange={(e) => {
              const terms = e.target.value;
              lists.update((d) => ({ ...d, terms }));
            }}
            rows={8}
            spellCheck={false}
            autoCapitalize="none"
            placeholder="um termo por linha"
            aria-invalid={shortTerms.length > 0 || undefined}
            aria-describedby={`${uid}-terms-hint`}
            className="max-h-72 min-h-40 text-sm"
          />
          <p
            id={`${uid}-terms-hint`}
            className={cn('text-sm', shortTerms.length ? 'text-destructive' : 'text-muted-foreground')}
          >
            {shortTerms.length
              ? 'Cada termo precisa de 2 letras ou mais.'
              : `${parsed.terms.length} ${parsed.terms.length === 1 ? 'termo' : 'termos'}, além das listas que já vêm prontas. Maiúsculas e acentos não importam.`}
          </p>
        </div>
      </div>
      <SaveBar
        label="Salvar listas"
        state={state}
        dirty={lists.dirty}
        valid={valid}
        onSave={onSave}
        onReset={lists.reset}
      />

      <div className="flex flex-col gap-4 border-t border-border pt-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium">Quanta certeza o Jev precisa</h3>
          <p className="text-sm text-muted-foreground">Cada ajuste é salvo quando você solta o controle.</p>
        </div>
        {!jevActive && (
          <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            Estes ajustes só valem com o Jev ligado. Ele se liga na tela Moderação.
          </p>
        )}
        {THRESHOLDS.map((t) => (
          <ThresholdSlider
            key={t.key}
            label={t.label}
            hint={t.hint}
            value={m[t.key]}
            onCommit={(value) => patchSettings({ moderation: { [t.key]: value } })}
          />
        ))}
      </div>
    </Section>
  );
}
