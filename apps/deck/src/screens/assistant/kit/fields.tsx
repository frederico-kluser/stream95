import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Props the field wrapper hands to its input: the id plus the hint/error wiring. */
export type FieldAria = { id: string; 'aria-describedby'?: string; 'aria-invalid'?: true };

/**
 * Label above the control, optional character count on the right, hint or error below. The input
 * itself comes from `children`, which receives the ids it must carry.
 */
export function FieldShell({
  id,
  label,
  hint,
  error,
  count,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** Current length and limit, shown as "12/300". */
  count?: { value: number; max: number };
  className?: string;
  children: (aria: FieldAria) => ReactNode;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const aria: FieldAria = {
    id,
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    ...(error ? { 'aria-invalid': true as const } : {}),
  };
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {count && (
          <span
            className={cn(
              'font-mono text-xs text-muted-foreground tabular-nums',
              count.value > count.max && 'text-destructive',
            )}
          >
            {count.value}/{count.max}
          </span>
        )}
      </div>
      {children(aria)}
      {error ? (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-pretty text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Keeps only digits (numeric fields use a text input with the numeric keyboard). */
export const digits = (value: string): string => value.replace(/\D+/g, '').slice(0, 7);

/** Parses an integer field; null when empty or out of range. */
export function intInRange(value: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}
