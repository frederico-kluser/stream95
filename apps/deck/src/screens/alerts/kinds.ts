import type { AlertKind } from '@stream95/shared';
import {
  Gem,
  Gift,
  HandCoins,
  HeartPlus,
  type LucideIcon,
  Megaphone,
  Repeat2,
  Star,
  Swords,
  Ticket,
} from 'lucide-react';

export type AmountField = { label: string; min: number; max: number; initial: number };
export type TextField = { label: string; placeholder: string; required?: boolean };

/** One alert kind of POST /api/alerts/simulate and the fields that make sense for it. */
export type KindMeta = {
  kind: AlertKind;
  label: string;
  icon: LucideIcon;
  /** Label of the "user" field for this kind. */
  user: string;
  amount?: AmountField;
  months?: boolean;
  reward?: boolean;
  message?: TextField;
};

export const ALERT_KINDS: readonly KindMeta[] = [
  { kind: 'follow', label: 'Seguidor', icon: HeartPlus, user: 'Quem seguiu' },
  { kind: 'sub', label: 'Inscrição', icon: Star, user: 'Quem se inscreveu' },
  {
    kind: 'resub',
    label: 'Reinscrição',
    icon: Repeat2,
    user: 'Quem renovou',
    months: true,
    message: { label: 'Mensagem', placeholder: 'ex.: mais um mês por aqui!' },
  },
  {
    kind: 'giftsub',
    label: 'Inscrição de presente',
    icon: Gift,
    user: 'Quem deu de presente',
    amount: { label: 'Quantas inscrições', min: 1, max: 1000, initial: 5 },
  },
  {
    kind: 'raid',
    label: 'Raid',
    icon: Swords,
    user: 'Canal do raid',
    amount: { label: 'Quantas pessoas', min: 1, max: 100_000, initial: 25 },
  },
  {
    kind: 'cheer',
    label: 'Bits',
    icon: Gem,
    user: 'Quem mandou',
    amount: { label: 'Quantos bits', min: 1, max: 1_000_000, initial: 100 },
    message: { label: 'Mensagem', placeholder: 'ex.: Cheer100 bora codar!' },
  },
  {
    kind: 'redeem',
    label: 'Resgate',
    icon: Ticket,
    user: 'Quem resgatou',
    reward: true,
    message: { label: 'Texto do resgate', placeholder: 'ex.: escolhe a próxima música' },
  },
  {
    kind: 'donation',
    label: 'Doação',
    icon: HandCoins,
    user: 'Quem doou',
    amount: { label: 'Valor em reais', min: 1, max: 1_000_000, initial: 10 },
    message: { label: 'Mensagem', placeholder: 'ex.: pro café da live' },
  },
  {
    kind: 'custom',
    label: 'Personalizado',
    icon: Megaphone,
    user: 'Nome (opcional)',
    message: { label: 'Texto do alerta', placeholder: 'ex.: deploy feito sem quebrar nada!', required: true },
  },
];

export const kindMeta = (kind: AlertKind): KindMeta =>
  ALERT_KINDS.find((k) => k.kind === kind) ?? (ALERT_KINDS[0] as KindMeta);

export const MONTHS_MAX = 240;
export const USER_MAX = 40;
export const REWARD_MAX = 60;
export const MESSAGE_MAX = 300;
