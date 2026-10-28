import type { ModeratedMessage } from '@stream95/shared';
import { History } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useMemo, useState } from 'react';
import { SegmentedToggle, SegmentedToggleOption } from '@/components/motion-ui/segmented-toggle';
import { EmptyState, Section } from '@/components/section';
import { ago } from '@/lib/format';
import { useDeck } from '@/lib/store';
import { useItemMotion, useNow } from './hooks';
import { latestDecisions, type RowStatus, verdictParts } from './labels';
import { AuthorBadges, DeleteMessageButton, OfflineReason, SignalTags, StatusChip } from './message-bits';
import { useRemovedMessages } from './stores';

const LIMIT = 30;

type Filter = 'all' | 'shown' | 'rejected';

const FILTER_LABEL: Record<Filter, string> = { all: 'Todas', shown: 'Exibidas', rejected: 'Barradas' };

const EMPTY: Record<Filter, { title: string; body: string }> = {
  all: {
    title: 'Nenhuma decisão ainda',
    body: 'Cada mensagem do chat aparece aqui com quem decidiu e por quê. Mande uma em Testar moderação para ver.',
  },
  shown: { title: 'Nada exibido ainda', body: 'As mensagens que foram para a live aparecem aqui.' },
  rejected: { title: 'Nada barrado ainda', body: 'Quando a moderação barrar uma mensagem, ela aparece aqui.' },
};

const DecisionRow = memo(function DecisionRow({
  m,
  status,
  now,
  attentionAt,
  online,
}: {
  m: ModeratedMessage;
  status: RowStatus;
  now: number;
  attentionAt: number;
  online: boolean;
}) {
  const motionProps = useItemMotion();
  const [who, ...why] = verdictParts(m.verdict);
  // a held message waits for the streamer (an expired one waited): nobody decided it
  const lead = m.status === 'held' || m.status === 'expired' ? 'Quem segurou:' : 'Quem decidiu:';
  return (
    <motion.li layout="position" {...motionProps} className="flex flex-col gap-1.5 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusChip status={status} />
        <span className="font-semibold wrap-anywhere">{m.displayName}</span>
        <AuthorBadges m={m} />
        <span className="ml-auto text-xs whitespace-nowrap text-muted-foreground tabular-nums">
          {ago(m.decidedAt, now)}
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="text-sm leading-relaxed wrap-anywhere">{m.text}</p>
          <p className="text-xs leading-relaxed wrap-anywhere text-muted-foreground">
            {lead} <span className="font-medium text-foreground">{who}</span>
            {why.length > 0 && <> · {why.join(' · ')}</>}
          </p>
          <SignalTags signals={m.verdict.signals} at={attentionAt} />
        </div>
        {status === 'shown' && <DeleteMessageButton id={m.id} author={m.displayName} disabled={!online} />}
      </div>
    </motion.li>
  );
});

/** The last decisions of the moderation, newest first, one line per message. */
export function DecisionsSection() {
  const { log, settings, connection } = useDeck();
  const removed = useRemovedMessages();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('all');
  const online = connection === 'online';
  const decisions = useMemo(() => latestDecisions(log), [log]);
  const rows = useMemo(
    () => (filter === 'all' ? decisions : decisions.filter((m) => m.status === filter)).slice(0, LIMIT),
    [decisions, filter],
  );
  const canDelete = rows.some((m) => m.status === 'shown' && !removed.has(m.id));

  return (
    <Section
      title="Últimas decisões"
      description={`As ${LIMIT} mais recentes, da mais nova para a mais antiga.${canDelete ? ' Para apagar uma exibida, segure o botão.' : ''}`}
    >
      <SegmentedToggle<Filter>
        value={filter}
        onChange={setFilter}
        ariaLabel="Filtrar decisões"
        className="flex! w-full sm:w-fit"
      >
        {(Object.keys(FILTER_LABEL) as Filter[]).map((value) => (
          <SegmentedToggleOption key={value} value={value} className="h-12 flex-1 justify-center sm:flex-none">
            {FILTER_LABEL[value]}
          </SegmentedToggleOption>
        ))}
      </SegmentedToggle>
      {canDelete && <OfflineReason connection={connection} />}
      {rows.length === 0 ? (
        <EmptyState icon={<History className="size-6" aria-hidden />} title={EMPTY[filter].title}>
          {EMPTY[filter].body}
        </EmptyState>
      ) : (
        <ul className="relative divide-y divide-border">
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((m) => (
              <DecisionRow
                key={m.id}
                m={m}
                status={removed.has(m.id) ? 'removed' : m.status}
                now={now}
                attentionAt={settings.moderation.attentionAt}
                online={online}
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Section>
  );
}
