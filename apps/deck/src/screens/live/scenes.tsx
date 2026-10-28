import type { ServiceState } from '@stream95/shared';
import { Clapperboard, Unplug } from 'lucide-react';
import { motion } from 'motion/react';
import { useMotionUITheme, useMotionUITransition } from '@/components/motion-ui/ui-theme';
import { EmptyState, Section } from '@/components/section';
import { api } from '@/lib/api';
import { useDeck } from '@/lib/store';
import { cn } from '@/lib/utils';
import { OfflineNote, Spinner, useAction, useOnline } from './kit';

const OBS_PROBLEM: Record<Exclude<ServiceState, 'online'>, string> = {
  connecting: 'Conectando ao OBS…',
  off: 'O OBS está fechado ou com o servidor WebSocket desligado. O stream95 tenta de novo sozinho.',
  error: 'O OBS pediu uma senha que não confere.',
  unconfigured: 'A troca de cenas ainda não está configurada.',
};

/** What to do when the OBS is not reachable (instead of an empty grid). */
function ObsSetup({ state }: { state: ServiceState | undefined }) {
  const waiting = !state || state === 'connecting';
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-4">
      <p className="flex items-start gap-2 text-sm font-medium">
        {waiting ? (
          <Spinner className="mt-0.5" />
        ) : (
          <Unplug className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        )}
        <span>{state && state !== 'online' ? OBS_PROBLEM[state] : 'Esperando o estado do OBS…'}</span>
      </p>
      {!waiting && (
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            No OBS, abra{' '}
            <span className="font-medium text-foreground">Ferramentas → Configurações do servidor WebSocket</span> e
            marque <span className="font-medium text-foreground">Ativar servidor WebSocket</span>.
          </li>
          <li>
            Clique em <span className="font-medium text-foreground">Mostrar informações de conexão</span> e copie a
            senha.
          </li>
          <li>
            No arquivo <code className="font-mono text-foreground">.env</code> do stream95, cole a senha em{' '}
            <code className="font-mono text-foreground">OBS_WS_PASSWORD</code> e reinicie o servidor.
          </li>
        </ol>
      )}
    </div>
  );
}

function SceneTile({
  name,
  live,
  pending,
  disabled,
  onSelect,
}: {
  name: string;
  live: boolean;
  pending: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { motionMode } = useMotionUITheme();
  const snap = useMotionUITransition('snap');
  const full = motionMode === 'full';
  return (
    <motion.button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-current={live ? 'true' : undefined}
      aria-busy={pending || undefined}
      title={name}
      whileTap={full && !disabled ? { scale: 0.97 } : undefined}
      transition={snap}
      className={cn(
        'relative flex min-h-20 w-full flex-col items-start justify-end gap-2 rounded-xl border p-3 text-left sm:min-h-24',
        'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
        'disabled:cursor-not-allowed disabled:opacity-60',
        live ? 'border-live/40 bg-live/10' : 'border-border bg-background hover:bg-accent',
      )}
    >
      {live && (
        // One ring shared by every tile: it glides to the scene that goes live.
        <motion.span
          layoutId="obs-scene-live"
          transition={full ? snap : { duration: 0 }}
          className="pointer-events-none absolute -inset-px rounded-xl ring-2 ring-live"
          aria-hidden
        />
      )}
      {(pending || live) && (
        <span
          className={cn(
            'flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase',
            pending ? 'text-muted-foreground' : 'text-live',
          )}
        >
          {pending ? (
            <>
              <Spinner className="size-3.5" />
              Trocando…
            </>
          ) : (
            <>
              <span className="size-2 rounded-full bg-live animate-pulse motion-reduce:animate-none" aria-hidden />
              No ar
            </>
          )}
        </span>
      )}
      <span className="line-clamp-2 text-base leading-snug font-medium break-words">{name}</span>
    </motion.button>
  );
}

/** Big buttons for the OBS scenes; the one on air is marked "NO AR". */
export function ScenesSection({ className }: { className?: string }) {
  const { status, obsScenes, scene } = useDeck();
  const online = useOnline();
  const { pending, run } = useAction<string>();
  const obs = status?.obs;
  const ready = obs === 'online';

  const go = (name: string) => {
    if (name === scene) return;
    void run(name, () => api('POST', '/api/obs/scene', { name }));
  };

  return (
    <Section
      className={className}
      title="Cenas do OBS"
      description={
        ready ? 'Toque numa cena para colocá-la no ar.' : 'Ligue o OBS ao stream95 para trocar de cena por aqui.'
      }
    >
      <OfflineNote />
      {!ready ? (
        <ObsSetup state={obs} />
      ) : obsScenes.length === 0 ? (
        <EmptyState icon={<Clapperboard className="size-6" aria-hidden />} title="Nenhuma cena no OBS">
          Crie as cenas no OBS ou importe a coleção pronta do stream95. Elas aparecem aqui na hora.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {obsScenes.map((name) => (
            <li key={name} className="min-w-0">
              <SceneTile
                name={name}
                live={name === scene}
                pending={pending === name}
                disabled={!online}
                onSelect={() => go(name)}
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
