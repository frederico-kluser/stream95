import { useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { AboutSection } from './settings/about';
import { DevicesSection } from './settings/devices';
import { ModerationListsSection } from './settings/moderation-lists';
import { OverlaySection } from './settings/overlay';
import { SocialsSection } from './settings/socials';
import { TwitchSection } from './settings/twitch';

const PARTS: { id: string; label: string; section: ReactNode }[] = [
  { id: 'aparelhos', label: 'Aparelhos', section: <DevicesSection /> },
  { id: 'twitch', label: 'Twitch', section: <TwitchSection /> },
  { id: 'moderacao', label: 'Moderação', section: <ModerationListsSection /> },
  { id: 'redes', label: 'Redes sociais', section: <SocialsSection /> },
  { id: 'overlay', label: 'Overlay', section: <OverlaySection /> },
  { id: 'sobre', label: 'Sobre', section: <AboutSection /> },
];

/** Config: a row of shortcuts on top (the page is long on phones), then one block per subject. */
export function SettingsScreen() {
  const reduceMotion = useReducedMotion();
  const jump = (id: string) => {
    const target = document.getElementById(`config-${id}`);
    if (!target) return;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    target.focus({ preventScroll: true });
  };

  return (
    <>
      {/* inline-size containment: the chip row scrolls instead of widening the whole panel */}
      <nav aria-label="Partes da configuração" className="overflow-x-auto [contain:inline-size] [scrollbar-width:none]">
        <ul className="flex w-max gap-2">
          {PARTS.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => jump(p.id)}
                className="h-12 rounded-full border border-border bg-card px-4 text-sm font-medium whitespace-nowrap text-card-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                {p.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {PARTS.map((p) => (
        <div key={p.id} id={`config-${p.id}`} tabIndex={-1} className="scroll-mt-4 outline-none">
          {p.section}
        </div>
      ))}
    </>
  );
}
