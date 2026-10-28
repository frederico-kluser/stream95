import { ChartColumn, ListPlus, Lock, Vote, X } from 'lucide-react';
import { Section } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDeck } from '@/lib/store';
import { useDraft } from '@/screens/assistant/kit/draft';
import { PollForm } from './poll-form';
import { PollResults } from './poll-results';

/**
 * Poll on the live: results first while one is on screen, then the form. With a poll showing, the
 * form stays folded behind "Nova enquete" so the results are what the streamer sees.
 */
export function PollSection() {
  const { poll } = useDeck();
  const [composing, setComposing] = useDraft('alerts.poll.composing', false);
  const showForm = !poll || composing;

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <ChartColumn className="size-4 text-brand" aria-hidden />
          Enquete
        </span>
      }
      description="O chat vota com !1, !2… e o resultado aparece na live."
      actions={
        poll ? (
          <Badge variant={poll.open ? 'default' : 'secondary'} className="h-6 px-2.5">
            {poll.open ? <Vote aria-hidden /> : <Lock aria-hidden />}
            {poll.open ? 'Aberta' : 'Encerrada'}
          </Badge>
        ) : undefined
      }
    >
      {poll && <PollResults poll={poll} />}
      {poll && (
        <Button
          type="button"
          variant="outline"
          className="h-12 self-start px-4"
          aria-expanded={composing}
          aria-controls="poll-composer"
          onClick={() => setComposing(!composing)}
        >
          {composing ? <X className="size-4" aria-hidden /> : <ListPlus className="size-4" aria-hidden />}
          {composing ? 'Fechar nova enquete' : 'Nova enquete'}
        </Button>
      )}
      {showForm && (
        <div id="poll-composer">
          <PollForm replacing={Boolean(poll)} onOpened={() => setComposing(false)} />
        </div>
      )}
    </Section>
  );
}
