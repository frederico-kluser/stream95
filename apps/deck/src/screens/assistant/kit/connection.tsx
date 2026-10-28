import { LoaderCircle, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type Connection, useDeck } from '@/lib/store';

/** Why the actions are blocked right now ('' while the deck is online). */
export function offlineReason(connection: Connection): string {
  if (connection === 'online') return '';
  return connection === 'connecting' ? 'Conectando ao stream95…' : 'Sem conexão com o PC. Tentando de novo…';
}

export function useOnline(): { online: boolean; reason: string } {
  const { connection } = useDeck();
  return { online: connection === 'online', reason: offlineReason(connection) };
}

/**
 * Banner at the top of a screen while the server is unreachable. A short "connecting" phase (page
 * load, quick reconnect) waits a moment before showing, so the banner does not flash.
 */
export function ConnectionNotice() {
  const { connection } = useDeck();
  const [visible, setVisible] = useState(connection === 'offline');

  useEffect(() => {
    if (connection === 'online') {
      setVisible(false);
      return;
    }
    if (connection === 'offline') {
      setVisible(true);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(timer);
  }, [connection]);

  if (connection === 'online' || !visible) return null;
  const connecting = connection === 'connecting';
  return (
    <div aria-live="polite" className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4">
      {connecting ? (
        <LoaderCircle
          className="mt-0.5 size-5 shrink-0 animate-spin text-warning motion-reduce:animate-none"
          aria-hidden
        />
      ) : (
        <WifiOff className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium">{connecting ? 'Conectando ao stream95…' : 'Sem conexão com o stream95'}</p>
        <p className="text-sm text-pretty text-muted-foreground">
          Os botões desta tela voltam a funcionar quando o PC responder.
        </p>
      </div>
    </div>
  );
}
