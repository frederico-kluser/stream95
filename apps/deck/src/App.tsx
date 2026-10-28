import { useEffect, useState } from 'react';
import { AppShell, SCREENS, type ScreenId } from '@/components/app-shell';
import { PairingScreen } from '@/components/pairing-screen';
import type { ErrorParts } from '@/lib/api';
import { isLocalHost } from '@/lib/auth';
import { bootOnce } from '@/lib/boot';
import { getClient } from '@/lib/store';
import { AlertsScreen } from '@/screens/alerts';
import { AssistantScreen } from '@/screens/assistant';
import { LiveScreen } from '@/screens/live';
import { ModerationScreen } from '@/screens/moderation';
import { SettingsScreen } from '@/screens/settings';
import { SoundsScreen } from '@/screens/sounds';

const isScreen = (v: string): v is ScreenId => (SCREENS as readonly string[]).includes(v);

function initialScreen(): ScreenId {
  const fromHash = location.hash.replace('#', '');
  if (isScreen(fromHash)) return fromHash;
  try {
    const saved = localStorage.getItem('stream95.screen') ?? '';
    if (isScreen(saved)) return saved;
  } catch {
    // no storage: fall back to moderation
  }
  return 'moderacao';
}

type Gate = 'checking' | 'ready' | 'pair' | 'removed';

export function App() {
  const [screen, setScreen] = useState<ScreenId>(initialScreen);
  const [gate, setGate] = useState<Gate>('checking');
  // Why the QR code just scanned did not pair this device (expired, already used…).
  const [pairError, setPairError] = useState<ErrorParts | null>(null);

  useEffect(() => {
    let cancelled = false;
    void bootOnce().then((result) => {
      if (cancelled) return;
      setPairError(result.pairError);
      setGate(result.gate);
      if (result.gate === 'ready') getClient();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The PC removed this device (or forgot it): back to pairing instead of reconnecting forever.
  useEffect(() => {
    if (gate !== 'ready' || isLocalHost()) return;
    return getClient().onUnpaired(() => setGate('removed'));
  }, [gate]);

  useEffect(() => {
    const onHash = () => {
      const v = location.hash.replace('#', '');
      if (isScreen(v)) setScreen(v);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);

  const go = (next: ScreenId) => {
    setScreen(next);
    history.replaceState(null, '', `#${next}`);
    try {
      localStorage.setItem('stream95.screen', next);
    } catch {
      // ignore
    }
  };

  if (gate === 'checking') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-muted-foreground">
        <p className="text-sm">Conectando ao stream95…</p>
      </div>
    );
  }
  if (gate === 'pair' || gate === 'removed') {
    return (
      <PairingScreen
        removed={gate === 'removed'}
        initialError={gate === 'pair' ? pairError : null}
        onPaired={() => setGate('ready')}
      />
    );
  }

  return (
    <AppShell
      screen={screen}
      onScreen={go}
      panels={{
        moderacao: <ModerationScreen />,
        sons: <SoundsScreen />,
        assistente: <AssistantScreen />,
        alertas: <AlertsScreen />,
        live: <LiveScreen />,
        config: <SettingsScreen />,
      }}
    />
  );
}
