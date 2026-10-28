import { Bell, Clapperboard, Music2, Settings2, ShieldCheck, Sparkles } from 'lucide-react';
import { type ReactNode, type RefObject, useLayoutEffect, useRef } from 'react';
import {
  SmoothTabs,
  SmoothTabsList,
  SmoothTabsPanel,
  SmoothTabsPanels,
  SmoothTabsTab,
} from '@/components/motion-ui/smooth-tabs';
import { TECH_ISSUE_TAG, useMuteNotices } from '@/components/notify';
import { StatusStrip } from '@/components/status-strip';
import { useDeck } from '@/lib/store';
import { cn } from '@/lib/utils';
import { attentionKey, useModerationWatchers, useResolvedAttention } from '@/screens/moderation/stores';

export const SCREENS = ['moderacao', 'sons', 'assistente', 'alertas', 'live', 'config'] as const;
export type ScreenId = (typeof SCREENS)[number];

const META: Record<ScreenId, { label: string; icon: ReactNode }> = {
  moderacao: { label: 'Moderação', icon: <ShieldCheck className="size-5 md:size-4" aria-hidden /> },
  sons: { label: 'Sons', icon: <Music2 className="size-5 md:size-4" aria-hidden /> },
  assistente: { label: 'Assistente', icon: <Sparkles className="size-5 md:size-4" aria-hidden /> },
  alertas: { label: 'Alertas', icon: <Bell className="size-5 md:size-4" aria-hidden /> },
  live: { label: 'Live', icon: <Clapperboard className="size-5 md:size-4" aria-hidden /> },
  config: { label: 'Config', icon: <Settings2 className="size-5 md:size-4" aria-hidden /> },
};

function TabBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    // phones: on the icon's top-right corner; tablets up: after the label
    <span className="absolute -top-1 left-1/2 ml-2 min-w-4 rounded-full bg-warning px-1 text-[10px] leading-4 font-semibold text-background tabular-nums md:static md:ml-1">
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * Publishes the sticky bars' size on <html>: `--deck-header-h` (the tab bar sticks right under the
 * header, which grows when the status pills wrap) and `--deck-sticky-top` (header plus tab bar),
 * which `scroll-padding-top` uses so keyboard focus and scrollIntoView never land under them.
 */
function useStickyVars(header: RefObject<HTMLElement | null>, bar: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const top = header.current;
    const tabs = bar.current;
    if (!top || !tabs) return;
    const root = document.documentElement;
    const update = () => {
      const h = top.getBoundingClientRect().height;
      root.style.setProperty('--deck-header-h', `${h}px`);
      // phones: 0 (the tab bar is fixed at the bottom, so its sticky wrapper is empty)
      root.style.setProperty('--deck-sticky-top', `${h + tabs.getBoundingClientRect().height}px`);
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(top);
    observer?.observe(tabs);
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--deck-header-h');
      root.style.removeProperty('--deck-sticky-top');
    };
  }, [header, bar]);
}

/**
 * Header with the live status, then one tab per screen. On phones the tabs float at the bottom,
 * within thumb reach; from tablets up they stick under the header, so another screen is always one
 * tap away, however far down the page is.
 */
export function AppShell({
  screen,
  onScreen,
  panels,
}: {
  screen: ScreenId;
  onScreen: (screen: ScreenId) => void;
  panels: Record<ScreenId, ReactNode>;
}) {
  const { queue, attention, scene, status } = useDeck();
  const resolved = useResolvedAttention();
  const alerts =
    queue.length + attention.filter((a) => a.kind === 'techIssue' && !resolved.has(attentionKey(a))).length;
  // Technical-problem notices must work on every tab, not only after Moderação was opened once…
  useModerationWatchers();
  // …but not on Moderação itself: it lists each problem with its own "Resolvido".
  useMuteNotices(TECH_ISSUE_TAG, screen === 'moderacao');

  const headerRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useStickyVars(headerRef, barRef);

  const change = (next: string) => {
    // A new screen starts at its top. Scroll before the tab changes, so the sliding pill measures
    // both of its positions at the same scroll.
    if (window.scrollY > 0) window.scrollTo(0, 0);
    onScreen(next as ScreenId);
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header
        ref={headerRef}
        className="sticky top-0 z-40 border-b border-border/60 bg-background/85 pt-safe backdrop-blur-md md:border-b-0"
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-brand text-brand-foreground text-sm font-bold">
                s
              </span>
              <span className="font-semibold tracking-tight">stream95</span>
            </div>
            {scene && status?.obs === 'online' && (
              <span className="min-w-0 truncate rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                Cena: <span className="font-medium text-foreground">{scene}</span>
              </span>
            )}
          </div>
          <StatusStrip />
        </div>
      </header>

      <SmoothTabs value={screen} onValueChange={change}>
        {/* Phones: this bar is empty (the list is fixed at the bottom). Tablets up: it sticks under the header. */}
        <div
          ref={barRef}
          className="md:sticky md:top-[var(--deck-header-h,0px)] md:z-30 md:border-b md:border-border/60 md:bg-background/85 md:backdrop-blur-md"
        >
          <div className="md:mx-auto md:w-full md:max-w-5xl md:px-4 md:pb-3">
            <SmoothTabsList
              ariaLabel="Telas do painel"
              className={cn(
                // @container: the tabs size themselves by the room the bar really has (a dock with a
                // classic scrollbar is 15 px narrower than its window)
                '@container fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-40 shadow-lg',
                'md:static md:shadow-none',
              )}
            >
              {SCREENS.map((id) => (
                // flex-auto: a tab is as wide as its label plus an even share of the rest, so
                // "Moderação" and "Assistente" fit whole on a 320 px phone and next to a badge.
                // 44 px wide at least whenever that still leaves room for both whole.
                <SmoothTabsTab
                  key={id}
                  value={id}
                  className="min-h-12 min-w-0 flex-auto! px-0! py-1.5! @min-[290px]:min-w-11 md:px-4! md:py-2.5!"
                >
                  <span className="relative flex min-w-0 flex-col items-center gap-0.5 md:flex-row md:gap-2">
                    {META[id].icon}
                    <span className="max-w-full truncate text-[11px] leading-tight tracking-tight md:max-w-none md:text-sm md:tracking-normal">
                      {META[id].label}
                    </span>
                    {id === 'moderacao' && <TabBadge count={alerts} />}
                  </span>
                </SmoothTabsTab>
              ))}
            </SmoothTabsList>
          </div>
        </div>
        <main className="mx-auto w-full max-w-5xl px-4 pt-4 pb-32 md:pt-6 md:pb-12">
          <SmoothTabsPanels>
            {SCREENS.map((id) => (
              // min-w-0: a long unbreakable line must not widen the panel past the phone screen.
              <SmoothTabsPanel key={id} value={id} className="min-w-0">
                <div className="flex min-w-0 flex-col gap-4">{panels[id]}</div>
              </SmoothTabsPanel>
            ))}
          </SmoothTabsPanels>
        </main>
      </SmoothTabs>
    </div>
  );
}
