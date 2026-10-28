import type { Settings } from '@stream95/shared';
import { Info } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNotify } from '@/components/notify';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useOnline } from './connection';
import { notifyError } from './errors';

type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/** Body of PATCH /api/settings: any subset of the settings tree. */
export type SettingsPatch = DeepPartial<Settings>;

/** Saves a partial settings object; failures become an error notice and resolve to false. */
export function useSettingsPatch(): (patch: SettingsPatch) => Promise<boolean> {
  const notify = useNotify();
  return useCallback(
    async (patch: SettingsPatch) => {
      try {
        await api('PATCH', '/api/settings', patch);
        return true;
      } catch (err) {
        notifyError(notify, err);
        return false;
      }
    },
    [notify],
  );
}

/**
 * Shows the value the user just picked until the server echoes it over the WebSocket, so the
 * control answers on the first frame. `set(null)` drops the local value (used to revert).
 */
export function useOptimisticValue<T>(server: T): [T, (next: T | null) => void] {
  const [local, setLocal] = useState<{ value: T } | null>(null);
  useEffect(() => {
    if (local && Object.is(local.value, server)) setLocal(null);
  }, [local, server]);
  const set = useCallback((next: T | null) => setLocal(next === null ? null : { value: next }), []);
  return [local ? local.value : server, set];
}

/** A setting bound to the server: optimistic, one request at a time, reverted when refused. */
export function useSetting<T>(server: T, toPatch: (value: T) => SettingsPatch) {
  const save = useSettingsPatch();
  const [value, setLocal] = useOptimisticValue(server);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  const change = async (next: T) => {
    if (busy.current || Object.is(next, value)) return;
    busy.current = true;
    setLocal(next);
    setPending(true);
    const ok = await save(toPatch(next));
    busy.current = false;
    setPending(false);
    if (!ok) setLocal(null);
  };

  return { value, pending, change };
}

/** Small uppercase heading that splits a card into groups. */
export function GroupTitle({ children }: { children: ReactNode }) {
  return <p className="pt-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{children}</p>;
}

/** Explains why a control is blocked, right next to it. */
export function Reason({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('flex items-start gap-1.5 text-sm text-pretty text-muted-foreground', className)}>
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </span>
  );
}

/** A whole-row switch: the label, the hint and the switch are one 56 px tall target. */
export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
  reason,
  busy = false,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Shown under the hint while the switch is disabled for a reason other than the connection. */
  reason?: string;
  busy?: boolean;
}) {
  const id = useId();
  // The outer div carries the list divider; the label inside gets the hover tint and rounded corners.
  return (
    <div className="py-1">
      <label
        htmlFor={id}
        className={cn(
          '-mx-2 flex min-h-14 items-center justify-between gap-4 rounded-lg px-2 py-2 transition-colors',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-muted/40',
        )}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span id={`${id}-label`} className={cn('text-sm font-medium', disabled && 'text-muted-foreground')}>
            {label}
          </span>
          {hint && (
            <span id={`${id}-hint`} className="text-sm text-pretty text-muted-foreground">
              {hint}
            </span>
          )}
          {disabled && reason && <Reason>{reason}</Reason>}
        </span>
        <Switch
          id={id}
          checked={checked}
          disabled={disabled}
          aria-labelledby={`${id}-label`}
          aria-describedby={hint ? `${id}-hint` : undefined}
          aria-busy={busy || undefined}
          onCheckedChange={(next) => onChange(next)}
        />
      </label>
    </div>
  );
}

export function SettingSwitch({
  label,
  hint,
  checked,
  toPatch,
  disabled = false,
  reason,
}: {
  label: string;
  hint?: ReactNode;
  checked: boolean;
  toPatch: (next: boolean) => SettingsPatch;
  disabled?: boolean;
  reason?: string;
}) {
  const { online } = useOnline();
  const setting = useSetting(checked, toPatch);
  return (
    <SwitchRow
      label={label}
      hint={hint}
      checked={setting.value}
      busy={setting.pending}
      disabled={!online || disabled}
      reason={online ? reason : undefined}
      onChange={(next) => void setting.change(next)}
    />
  );
}

/** Label (and hint) on the left, the control on the right; stacked on phones. */
export function ControlRow({
  label,
  labelId,
  htmlFor,
  hint,
  children,
}: {
  label: ReactNode;
  labelId?: string;
  /** Set when the control is focusable by id (a select trigger); otherwise the label is plain text. */
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-0.5">
        {htmlFor ? (
          <label id={labelId} htmlFor={htmlFor} className="text-sm font-medium">
            {label}
          </label>
        ) : (
          <p id={labelId} className="text-sm font-medium">
            {label}
          </p>
        )}
        {hint && <div className="text-sm text-pretty text-muted-foreground">{hint}</div>}
      </div>
      <div className="w-full sm:w-auto sm:max-w-[60%] sm:shrink-0">{children}</div>
    </div>
  );
}

export type Option<V extends string> = { value: V; label: string; detail?: string };

/** A labelled select, 48 px tall, full width on phones. */
export function SelectRow<V extends string>({
  label,
  hint,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: ReactNode;
  value: V;
  options: readonly Option<V>[];
  onChange: (next: V) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const items = useMemo(() => Object.fromEntries(options.map((o) => [o.value, o.label])), [options]);
  return (
    <ControlRow label={label} labelId={`${id}-label`} htmlFor={id} hint={hint}>
      <Select
        items={items}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (next !== null && next !== value) onChange(next as V);
        }}
      >
        <SelectTrigger id={id} aria-labelledby={`${id}-label`} className="w-full data-[size=default]:h-12 sm:w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="min-h-11">
              {o.label}
              {o.detail && <span className="text-muted-foreground">{o.detail}</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </ControlRow>
  );
}

export function SettingSelect<V extends string>({
  label,
  hint,
  value,
  options,
  toPatch,
}: {
  label: string;
  hint?: ReactNode;
  value: V;
  options: readonly Option<V>[];
  toPatch: (next: V) => SettingsPatch;
}) {
  const { online } = useOnline();
  const setting = useSetting(value, toPatch);
  return (
    <SelectRow
      label={label}
      hint={hint}
      value={setting.value}
      options={options}
      disabled={!online}
      onChange={(next) => void setting.change(next)}
    />
  );
}

const first = (v: number | readonly number[]): number => (typeof v === 'number' ? v : (v[0] ?? 0));

/**
 * A slider that saves when released. The control area is 48 px tall and the thumb 20 px, so it is
 * easy to grab with a thumb; the current value is printed next to the label.
 */
export function SettingSlider({
  label,
  hint,
  value,
  min,
  max,
  step,
  display,
  format,
  toPatch,
}: {
  label: string;
  hint?: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Text next to the label ("180 caracteres", "90%"). */
  display: (value: number) => string;
  /** Read by screen readers as the value text. */
  format?: Intl.NumberFormatOptions;
  toPatch: (next: number) => SettingsPatch;
}) {
  const id = useId();
  const { online } = useOnline();
  const setting = useSetting(value, toPatch);
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? setting.value;
  // 0.1 + 0.05 style float noise would never match the value the server echoes back.
  const decimals = (String(step).split('.')[1] ?? '').length;
  const clean = (v: number | readonly number[]) => Number(first(v).toFixed(decimals));
  return (
    <div className="flex flex-col gap-1 py-3">
      <div className="flex items-baseline justify-between gap-4">
        <span id={`${id}-label`} className={cn('text-sm font-medium', !online && 'text-muted-foreground')}>
          {label}
        </span>
        <span className="text-sm font-medium text-muted-foreground tabular-nums" aria-hidden>
          {display(shown)}
        </span>
      </div>
      {hint && <p className="text-sm text-pretty text-muted-foreground">{hint}</p>}
      <Slider
        aria-labelledby={`${id}-label`}
        value={[shown]}
        min={min}
        max={max}
        step={step}
        format={format}
        locale="pt-BR"
        disabled={!online}
        onValueChange={(v) => setDrag(clean(v))}
        onValueCommitted={(v) => {
          setDrag(null);
          void setting.change(clean(v));
        }}
        className="*:min-h-12 **:data-[slot=slider-thumb]:size-5"
      />
    </div>
  );
}
