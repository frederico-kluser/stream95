import type { OverlaySettings, Settings } from '@stream95/shared';
import { type ChangeEvent, type ComponentProps, type ReactNode, useId } from 'react';
import { useNotify } from '@/components/notify';
import { Section } from '@/components/section';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useDeck } from '@/lib/store';
import { cn } from '@/lib/utils';
import { OfflineNote, useSaveState } from '@/screens/live/kit';
import { useDraft } from './draft';
import { SaveBar } from './shared';

// Theme names of the React95 package used by the scenes (suggestions only; unknown names fall back).
const THEMES = [
  'win95',
  'azureOrange',
  'bee',
  'blackAndWhite',
  'brick',
  'candy',
  'coldGray',
  'counterStrike',
  'eggplant',
  'highContrast',
  'lilac',
  'lilacRoseDark',
  'maple',
  'marine',
  'matrix',
  'millenium',
  'modernDark',
  'molecule',
  'ninjaTurtles',
  'olive',
  'pamelaAnderson',
  'plum',
  'rainyDay',
  'rose',
  'slate',
  'spruce',
  'storm',
  'theSixtiesUSA',
  'tokyoDark',
  'tooSexy',
  'travel',
  'vaporTeal',
  'vermillion',
  'violetDark',
  'water',
];

type Source = { channel: string; overlay: OverlaySettings };
type Form = {
  channel: string;
  theme: string;
  chatMaxMessages: string;
  chatFadeSec: string;
  startingTitle: string;
  startingMinutes: string;
  brbTitle: string;
  endingTitle: string;
  timezone: string;
};
type FormErrors = Partial<Record<keyof Form, string>>;

const toForm = ({ channel, overlay: o }: Source): Form => ({
  channel,
  theme: o.theme,
  chatMaxMessages: String(o.chatMaxMessages),
  chatFadeSec: String(o.chatFadeSec),
  startingTitle: o.startingTitle,
  startingMinutes: String(o.startingMinutes),
  brbTitle: o.brbTitle,
  endingTitle: o.endingTitle,
  timezone: o.timezone,
});

const toInt = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : Number.NaN);

/** "@Fulano", "twitch.tv/fulano" → "fulano" */
const cleanChannel = (text: string) =>
  text
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?twitch\.tv\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
    .toLowerCase();

const fromForm = (f: Form): Source => ({
  channel: cleanChannel(f.channel),
  overlay: {
    theme: f.theme.trim(),
    chatMaxMessages: toInt(f.chatMaxMessages),
    chatFadeSec: toInt(f.chatFadeSec),
    startingTitle: f.startingTitle.trim(),
    startingMinutes: toInt(f.startingMinutes),
    brbTitle: f.brbTitle.trim(),
    endingTitle: f.endingTitle.trim(),
    timezone: f.timezone.trim(),
  },
});

function validTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    Intl.DateTimeFormat('pt-BR', { timeZone: tz }).format(0);
    return true;
  } catch {
    return false;
  }
}

const between = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;

function validate(s: Source): FormErrors {
  const o = s.overlay;
  const errors: FormErrors = {};
  if (!/^[a-z0-9_]{2,40}$/.test(s.channel)) errors.channel = 'Use o nome do canal na Twitch: letras, números e _.';
  if (!o.theme) errors.theme = 'Escolha um tema.';
  if (!between(o.chatMaxMessages, 3, 50)) errors.chatMaxMessages = 'Use um número de 3 a 50.';
  if (!between(o.chatFadeSec, 0, 600)) errors.chatFadeSec = 'Use um número de 0 a 600.';
  if (!between(o.startingMinutes, 1, 60)) errors.startingMinutes = 'Use um número de 1 a 60.';
  if (!validTimeZone(o.timezone)) errors.timezone = 'Fuso não reconhecido. Ex.: America/Sao_Paulo.';
  return errors;
}

function FormField({
  id,
  label,
  hint,
  error,
  ...input
}: { id: string; label: string; hint?: string; error?: string } & ComponentProps<typeof Input>) {
  const note = error ?? hint;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? `${id}-note` : undefined}
        className="h-12"
        {...input}
      />
      {note && (
        <p id={`${id}-note`} className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
          {note}
        </p>
      )}
    </div>
  );
}

function Group({ title, divider = true, children }: { title: string; divider?: boolean; children: ReactNode }) {
  return (
    <div className={cn('min-w-0', divider && 'border-t border-border pt-4')}>
      <fieldset className="min-w-0">
        <legend className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{title}</legend>
        <div className="grid gap-4 md:grid-cols-2">{children}</div>
      </fieldset>
    </div>
  );
}

/** Channel and the texts, theme and timings of the scenes. */
export function OverlaySection() {
  const { settings } = useDeck();
  const notify = useNotify();
  const uid = useId();
  const { state, save } = useSaveState();
  const form = useDraft<Source, Form>({ channel: settings.channel, overlay: settings.overlay }, toForm, fromForm);
  const f = form.draft;
  const next = fromForm(f);
  const errors = validate(next);
  const valid = Object.keys(errors).length === 0;

  const field = (key: keyof Form) => ({
    id: `${uid}-${key}`,
    value: f[key],
    error: errors[key],
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      form.update((d) => ({ ...d, [key]: value }));
    },
  });

  const onSave = () =>
    save(async () => {
      const channelChanged = next.channel !== settings.channel;
      const saved = await api<Settings>('PATCH', '/api/settings', { channel: next.channel, overlay: next.overlay });
      form.commit({ channel: saved.channel, overlay: saved.overlay });
      if (channelChanged) notify({ tone: 'info', title: `O chat agora lê o canal ${saved.channel}` });
    });

  return (
    <Section title="Overlay" description="Canal, textos e tempos das cenas do OBS. Mudam na tela assim que você salva.">
      <OfflineNote />
      <Group title="Canal e visual" divider={false}>
        <FormField
          {...field('channel')}
          label="Canal da Twitch"
          hint="Trocar o canal reconecta o chat."
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={60}
        />
        <FormField
          {...field('theme')}
          label="Tema das cenas"
          hint="Nome do tema do React95, ex.: modernDark."
          list={`${uid}-themes`}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <datalist id={`${uid}-themes`}>
          {THEMES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Group>
      <Group title="Chat na tela">
        <FormField
          {...field('chatMaxMessages')}
          label="Mensagens visíveis"
          hint="De 3 a 50."
          type="number"
          inputMode="numeric"
          min={3}
          max={50}
        />
        <FormField
          {...field('chatFadeSec')}
          label="Esconder mensagens depois de (segundos)"
          hint="0 deixa as mensagens na tela."
          type="number"
          inputMode="numeric"
          min={0}
          max={600}
        />
      </Group>
      <Group title="Telas de começo, pausa e fim">
        <FormField {...field('startingTitle')} label="Título do começo" maxLength={80} />
        <FormField
          {...field('startingMinutes')}
          label="Contagem do começo (minutos)"
          hint="De 1 a 60."
          type="number"
          inputMode="numeric"
          min={1}
          max={60}
        />
        <FormField {...field('brbTitle')} label="Título da tela “Volto já”" maxLength={80} />
        <FormField {...field('endingTitle')} label="Título do fim" maxLength={80} />
      </Group>
      <Group title="Relógio">
        <FormField
          {...field('timezone')}
          label="Fuso horário"
          hint="Ex.: America/Sao_Paulo."
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
      </Group>
      <SaveBar
        label="Salvar overlay"
        state={state}
        dirty={form.dirty}
        valid={valid}
        onSave={onSave}
        onReset={form.reset}
      />
    </Section>
  );
}
