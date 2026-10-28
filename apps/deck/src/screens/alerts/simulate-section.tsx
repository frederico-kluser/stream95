import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';
import type { AlertKind } from '@stream95/shared';
import { Bell, Check, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { type FormEvent, useId, useState } from 'react';
import { useMotionUITransition } from '@/components/motion-ui/ui-theme';
import { Section } from '@/components/section';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useDeck } from '@/lib/store';
import { cn } from '@/lib/utils';
import { ActionButton, useRunAction } from '@/screens/assistant/kit/action';
import { useOnline } from '@/screens/assistant/kit/connection';
import { useDraft } from '@/screens/assistant/kit/draft';
import { digits, FieldShell, intInRange } from '@/screens/assistant/kit/fields';
import { useReveal, useTravel } from '@/screens/assistant/kit/motion';
import { Reason } from '@/screens/assistant/kit/settings';
import { ALERT_KINDS, kindMeta, MESSAGE_MAX, MONTHS_MAX, REWARD_MAX, USER_MAX } from './kinds';

type Field = 'amount' | 'months' | 'message';
type Errors = Partial<Record<Field, string>>;

const num = (n: number): string => new Intl.NumberFormat('pt-BR').format(n);

/** Nine kinds as a radio grid; the selection pill slides between tiles. */
function KindPicker({
  value,
  onChange,
  labelledBy,
}: {
  value: AlertKind;
  onChange: (kind: AlertKind) => void;
  labelledBy: string;
}) {
  const pill = useId();
  const travel = useTravel();
  const snap = useMotionUITransition('snap');
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as AlertKind)}
      aria-labelledby={labelledBy}
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
    >
      {ALERT_KINDS.map((k, i) => {
        const Icon = k.icon;
        // An odd last tile spans both columns on phones instead of sitting alone.
        const lone = i === ALERT_KINDS.length - 1 && ALERT_KINDS.length % 2 === 1;
        return (
          <Radio.Root
            key={k.kind}
            value={k.kind}
            className={cn(
              'relative flex min-h-18 flex-col items-center justify-center gap-1.5 rounded-xl border border-border px-2 py-3 text-center text-sm leading-tight font-medium text-muted-foreground transition-colors outline-none select-none hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background data-checked:border-transparent data-checked:text-foreground',
              lone && 'max-sm:col-span-2',
            )}
          >
            {k.kind === value && (
              <motion.span
                layoutId={pill}
                aria-hidden
                className="absolute inset-0 rounded-xl bg-primary/10 ring-2 ring-primary"
                transition={travel ? snap : { duration: 0 }}
              />
            )}
            <Icon className="relative size-5" aria-hidden />
            <span className="relative text-balance">{k.label}</span>
            <Radio.Indicator className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="size-3" aria-hidden />
            </Radio.Indicator>
          </Radio.Root>
        );
      })}
    </RadioGroup>
  );
}

/** Fires a test alert on the overlay (sound, voice and card), with the fields that kind uses. */
export function SimulateSection() {
  const { settings } = useDeck();
  const { online, reason } = useOnline();
  const action = useRunAction();
  const reveal = useReveal();
  const kindsLabel = useId();
  const [kind, setKind] = useDraft<AlertKind>('alerts.kind', 'follow');
  const [user, setUser] = useDraft('alerts.user', '');
  const [amounts, setAmounts] = useDraft<Partial<Record<AlertKind, string>>>('alerts.amounts', {});
  const [months, setMonths] = useDraft('alerts.months', '6');
  const [reward, setReward] = useDraft('alerts.reward', '');
  const [message, setMessage] = useDraft('alerts.message', '');
  const [errors, setErrors] = useState<Errors>({});

  const meta = kindMeta(kind);
  const amountText = amounts[kind] ?? String(meta.amount?.initial ?? '');
  const clearError = (field: Field) => setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found: Errors = {};
    const amount = meta.amount ? intInRange(amountText, meta.amount.min, meta.amount.max) : null;
    if (meta.amount && amount === null)
      found.amount = `Use um número inteiro de ${num(meta.amount.min)} a ${num(meta.amount.max)}.`;
    const monthCount = meta.months ? intInRange(months, 1, MONTHS_MAX) : null;
    if (meta.months && monthCount === null) found.months = `Use de 1 a ${MONTHS_MAX} meses.`;
    if (meta.message?.required && !message.trim()) found.message = 'Escreva o texto do alerta.';
    setErrors(found);
    const firstBad = (['amount', 'months', 'message'] as const).find((f) => found[f]);
    if (firstBad) {
      document.getElementById(`alert-${firstBad}`)?.focus();
      return;
    }
    if (!online) return;
    const body = {
      kind,
      ...(user.trim() ? { user: user.trim() } : {}),
      ...(amount !== null ? { amount } : {}),
      ...(monthCount !== null ? { months: monthCount } : {}),
      ...(meta.reward && reward.trim() ? { reward: reward.trim() } : {}),
      ...(meta.message && message.trim() ? { message: message.trim() } : {}),
    };
    void action.run(() => api('POST', '/api/alerts/simulate', body));
  };

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <Bell className="size-4 text-brand" aria-hidden />
          Simular alerta
        </span>
      }
      description="Mostra na live como o alerta aparece e soa, sem precisar de um evento real."
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p id={kindsLabel} className="text-sm font-medium">
            Tipo de alerta
          </p>
          <KindPicker
            value={kind}
            labelledBy={kindsLabel}
            onChange={(next) => {
              setKind(next);
              setErrors({});
            }}
          />
        </div>

        <motion.div key={kind} {...reveal} className="grid gap-4 sm:grid-cols-2">
          <FieldShell id="alert-user" label={meta.user} hint="Em branco, aparece “visitante”.">
            {(aria) => (
              <Input
                {...aria}
                value={user}
                maxLength={USER_MAX}
                placeholder="visitante"
                autoComplete="off"
                autoCapitalize="none"
                onChange={(e) => setUser(e.target.value)}
                className="h-12"
              />
            )}
          </FieldShell>

          {meta.amount && (
            <FieldShell
              id="alert-amount"
              label={meta.amount.label}
              error={errors.amount}
              hint={
                kind === 'raid'
                  ? `Com ${num(settings.alerts.bsodRaidThreshold)} pessoas ou mais, o raid ocupa a tela toda.`
                  : undefined
              }
            >
              {(aria) => (
                <Input
                  {...aria}
                  value={amountText}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  onChange={(e) => {
                    setAmounts((prev) => ({ ...prev, [kind]: digits(e.target.value) }));
                    clearError('amount');
                  }}
                  className="h-12 tabular-nums"
                />
              )}
            </FieldShell>
          )}

          {meta.months && (
            <FieldShell id="alert-months" label="Meses de inscrição" error={errors.months}>
              {(aria) => (
                <Input
                  {...aria}
                  value={months}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  onChange={(e) => {
                    setMonths(digits(e.target.value));
                    clearError('months');
                  }}
                  className="h-12 tabular-nums"
                />
              )}
            </FieldShell>
          )}

          {meta.reward && (
            <FieldShell id="alert-reward" label="Recompensa" count={{ value: reward.length, max: REWARD_MAX }}>
              {(aria) => (
                <Input
                  {...aria}
                  value={reward}
                  maxLength={REWARD_MAX}
                  placeholder="ex.: hidratar"
                  autoComplete="off"
                  onChange={(e) => setReward(e.target.value)}
                  className="h-12"
                />
              )}
            </FieldShell>
          )}

          {meta.message && (
            <FieldShell
              id="alert-message"
              label={meta.message.label}
              error={errors.message}
              count={{ value: message.length, max: MESSAGE_MAX }}
              className="sm:col-span-2"
            >
              {(aria) => (
                <Input
                  {...aria}
                  value={message}
                  maxLength={MESSAGE_MAX}
                  placeholder={meta.message?.placeholder}
                  autoComplete="off"
                  onChange={(e) => {
                    setMessage(e.target.value);
                    clearError('message');
                  }}
                  className="h-12"
                />
              )}
            </FieldShell>
          )}
        </motion.div>

        {!settings.alerts.sound && !settings.alerts.speak && (
          <Reason>O som e a voz dos alertas estão desligados em Ajustes dos alertas.</Reason>
        )}

        <ActionButton
          phase={action.phase}
          type="submit"
          icon={<Zap className="size-5 sm:size-4" />}
          label="Disparar alerta"
          pendingLabel="Disparando…"
          doneLabel="Na tela"
          blocked={online ? undefined : reason}
        />
      </form>
    </Section>
  );
}
