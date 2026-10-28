import { AskSection } from '@/screens/assistant/ask-section';
import { ConnectionNotice } from '@/screens/assistant/kit/connection';
import { OnScreenSection } from '@/screens/assistant/on-screen-section';
import { SaySection } from '@/screens/assistant/say-section';
import { VoiceSection } from '@/screens/assistant/voice-section';

/**
 * Assistente: the animated character on the live, questions and free speech from the deck, and
 * the text-to-speech settings. One column on phones; two from large tablets up.
 */
export function AssistantScreen() {
  return (
    <>
      <ConnectionNotice />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <OnScreenSection />
          <AskSection />
          <SaySection />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <VoiceSection />
        </div>
      </div>
    </>
  );
}
