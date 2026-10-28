import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from 'lucide-react';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Toast, ToastStack, useToast } from '@/components/motion-ui/toast-stack';
import { cn } from '@/lib/utils';

export type Tone = 'info' | 'success' | 'warning' | 'error';

export type Notice = {
  title: string;
  description?: string;
  tone?: Tone;
  /** 0 keeps the notice until dismissed (technical problems reported by viewers). */
  durationMs?: number;
  action?: { label: string; onClick: () => void };
  /** Kind of notice, so a screen that already lists those can mute them (see `useMuteNotices`). */
  tag?: string;
};

/** Tag of the "Problema técnico no chat" notices: Moderação lists them, so it mutes the toast. */
export const TECH_ISSUE_TAG = 'tech-issue';

type Item = Notice & { id: number };

const NotifyContext = createContext<(notice: Notice) => void>(() => {});
/** Mutes a tag until the returned function runs. */
const MuteContext = createContext<(tag: string) => () => void>(() => () => {});

/** `notify({ title, tone })` from anywhere inside the deck. */
export const useNotify = () => useContext(NotifyContext);

/** While `active`, notices with this tag are dropped and the ones on screen close. */
export function useMuteNotices(tag: string, active: boolean): void {
  const mute = useContext(MuteContext);
  useEffect(() => (active ? mute(tag) : undefined), [mute, tag, active]);
}

const ICON: Record<Tone, ReactNode> = {
  info: <Info className="size-4 text-info" aria-hidden />,
  success: <CheckCircle2 className="size-4 text-success" aria-hidden />,
  warning: <TriangleAlert className="size-4 text-warning" aria-hidden />,
  error: <CircleAlert className="size-4 text-destructive" aria-hidden />,
};

function NoticeCard({ item, onClose }: { item: Item; onClose: () => void }) {
  const { isVisible } = useToast();
  const tone = item.tone ?? 'info';
  return (
    <div
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
      className="flex items-start gap-3 rounded-xl border border-border bg-popover py-3 pr-1 pl-3 text-popover-foreground shadow-lg"
    >
      <span className="mt-0.5 shrink-0">{ICON[tone]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground break-words">{item.description}</p>
        )}
        {item.action && (
          // 44 px tall: it is tapped on phones, often in a hurry (Resolvido, Desfazer)
          <button
            type="button"
            tabIndex={isVisible ? 0 : -1}
            onClick={() => {
              item.action?.onClick();
              onClose();
            }}
            className="mt-2 inline-flex min-h-11 items-center rounded-lg bg-brand/15 px-4 text-sm font-medium text-brand hover:bg-brand/25 focus-visible:outline-2 focus-visible:outline-ring"
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label="Fechar aviso"
        tabIndex={isVisible ? 0 : -1}
        onClick={onClose}
        className="-my-2 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const seq = useRef(0);
  // tag -> how many places mute it right now
  const muted = useRef(new Map<string, number>());
  const dismiss = useCallback((id: number) => setItems((prev) => prev.filter((t) => t.id !== id)), []);
  const notify = useCallback(
    (notice: Notice) => {
      if (notice.tag && muted.current.has(notice.tag)) return;
      const id = ++seq.current;
      setItems((prev) => [{ ...notice, id }, ...prev].slice(0, 8));
      const ms = notice.durationMs ?? (notice.tone === 'error' ? 7000 : 4000);
      if (ms > 0) setTimeout(() => dismiss(id), ms);
    },
    [dismiss],
  );
  const mute = useCallback((tag: string) => {
    muted.current.set(tag, (muted.current.get(tag) ?? 0) + 1);
    setItems((prev) => (prev.some((t) => t.tag === tag) ? prev.filter((t) => t.tag !== tag) : prev));
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const left = (muted.current.get(tag) ?? 1) - 1;
      if (left > 0) muted.current.set(tag, left);
      else muted.current.delete(tag);
    };
  }, []);
  return (
    <NotifyContext.Provider value={notify}>
      <MuteContext.Provider value={mute}>
        {children}
        {/* phones: above the bottom navigation, and above whatever a screen floats there (Sons sets the
            variable while its round Stop button shows) */}
        <ToastStack
          className={cn(
            'z-50 max-md:bottom-[var(--deck-toast-bottom,6rem)]! transition-[bottom] duration-200 motion-reduce:transition-none',
          )}
        >
          {items.map((item) => (
            <Toast key={item.id}>
              <NoticeCard item={item} onClose={() => dismiss(item.id)} />
            </Toast>
          ))}
        </ToastStack>
      </MuteContext.Provider>
    </NotifyContext.Provider>
  );
}
