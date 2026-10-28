import { cn } from '@/lib/utils';
import { AttentionSection } from './moderation/attention-section';
import { DecisionsSection } from './moderation/decisions-section';
import { LiveChatSection } from './moderation/live-chat-section';
import { ModeSection } from './moderation/mode-section';
import { QueueSection } from './moderation/queue-section';
import { useStoredFlag } from './moderation/stores';
import { TestSection } from './moderation/test-section';

const SHOW_CHAT_KEY = 'stream95.moderation.showChat';

/**
 * Moderation: what needs attention now, the approval queue, the mode, the live chat with each
 * message's fate, the last decisions and a test form. Phones first; from `lg` up the chat and the
 * decisions sit side by side. Each section says why its actions are off while the deck is offline.
 */
export function ModerationScreen() {
  const [showChat, setShowChat] = useStoredFlag(SHOW_CHAT_KEY, false);

  return (
    // inline-size containment: long content never widens the tab panel past the screen
    <div className="flex min-w-0 flex-col gap-4 contain-inline-size">
      <AttentionSection />
      <QueueSection />
      <ModeSection />
      <div className={cn('grid gap-4', showChat && 'lg:grid-cols-2 lg:items-start')}>
        <LiveChatSection show={showChat} onShowChange={setShowChat} />
        <DecisionsSection />
      </div>
      <TestSection />
    </div>
  );
}
