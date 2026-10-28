import { AlertSettingsSection } from '@/screens/alerts/alert-settings-section';
import { EffectsSection } from '@/screens/alerts/effects-section';
import { PollSection } from '@/screens/alerts/poll-section';
import { SimulateSection } from '@/screens/alerts/simulate-section';
import { ConnectionNotice } from '@/screens/assistant/kit/connection';

/**
 * Alertas: test alerts, one-shot effects and the chat poll. One column on phones (in this order);
 * two from large tablets up.
 */
export function AlertsScreen() {
  return (
    <>
      <ConnectionNotice />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <SimulateSection />
          <EffectsSection />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <PollSection />
          <AlertSettingsSection />
        </div>
      </div>
    </>
  );
}
