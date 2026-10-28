import { CountersSection } from './live/counters';
import { PomodoroSection } from './live/pomodoro';
import { ScenesSection } from './live/scenes';

/** Live: OBS scenes on top (the most used during a stream), then the pomodoro and the counters. */
export function LiveScreen() {
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <ScenesSection className="lg:col-span-2" />
      <PomodoroSection />
      <CountersSection />
    </div>
  );
}
