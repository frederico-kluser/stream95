import { ExternalLink, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SaveButton, type SaveState, useOnline } from '@/screens/live/kit';

/**
 * Save + undo for a settings form, with the reason when Save is off ("nothing changed" or
 * "fix the marked fields"; the offline reason comes from OfflineNote at the top of the block).
 */
export function SaveBar({
  label,
  state,
  dirty,
  valid,
  onSave,
  onReset,
}: {
  label: string;
  state: SaveState;
  dirty: boolean;
  valid: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  const online = useOnline();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SaveButton state={state} onClick={onSave} disabled={!online || !dirty || !valid}>
        {label}
      </SaveButton>
      {dirty && (
        <Button type="button" variant="ghost" onClick={onReset} className="h-12 rounded-xl px-4">
          <Undo2 className="size-4" aria-hidden />
          Desfazer
        </Button>
      )}
      {state === 'idle' && !dirty && <span className="text-sm text-muted-foreground">Nada para salvar.</span>}
      {state === 'idle' && dirty && !valid && (
        <span className="text-sm text-destructive">Corrija os campos marcados para salvar.</span>
      )}
    </div>
  );
}

/** Secondary look for the Motion UI CopyButton (its own classes are concatenated, hence the `!`). */
export const COPY_SECONDARY = 'h-12! rounded-xl! bg-secondary! px-4! text-secondary-foreground! hover:bg-accent!';

/** A link styled as a 48 px button that opens in a new tab. */
export function ExternalButton({
  href,
  children,
  variant = 'outline',
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: 'default' | 'outline' | 'secondary';
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(buttonVariants({ variant }), 'h-12 gap-2 rounded-xl px-4', className)}
    >
      {children}
      <ExternalLink className="ml-auto size-4 opacity-70" aria-hidden />
      <span className="sr-only"> (abre em outra aba)</span>
    </a>
  );
}

/** "https://www.twitch.tv/activate?x=1" → "www.twitch.tv/activate" */
export function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return url;
  }
}
