import { TTS_VOICES, type TtsVoice } from '@stream95/shared';
import { AudioLines, SkipForward, Volume2 } from 'lucide-react';
import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { SegmentedToggle, SegmentedToggleOption } from '@/components/motion-ui/segmented-toggle';
import { Section } from '@/components/section';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { api } from '@/lib/api';
import { pct } from '@/lib/format';
import { useDeck } from '@/lib/store';
import { cn } from '@/lib/utils';
import { ActionButton, useRunAction } from './kit/action';
import { useOnline } from './kit/connection';
import { useDraft } from './kit/draft';
import { FieldShell } from './kit/fields';
import {
  GroupTitle,
  type Option,
  Reason,
  SettingSelect,
  SettingSlider,
  SettingSwitch,
  useSetting,
} from './kit/settings';
import { TTS_MODES, type TtsMode, voiceLabel } from './options';

const SAMPLE = 'Testando a voz do stream95. Um, dois, três.';
const TEST_MAX = 400;

const isVoice = (v: string): v is TtsVoice => (TTS_VOICES as readonly string[]).includes(v);

/** Voices the server accepts (GET /api/voices); the shared list is shown until it answers. */
function useVoiceOptions(): readonly Option<TtsVoice>[] {
  const [voices, setVoices] = useState<readonly TtsVoice[]>(TTS_VOICES);
  useEffect(() => {
    let alive = true;
    api<{ voices: string[] }>('GET', '/api/voices')
      .then((r) => {
        const known = r.voices.filter(isVoice);
        if (alive && known.length > 0) setVoices(known);
      })
      .catch(() => {
        // the bundled list is the same one the server validates against
      });
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(() => voices.map((v) => ({ value: v, label: voiceLabel(v) })), [voices]);
}

function ModeControl({ mode }: { mode: TtsMode }) {
  const id = useId();
  const { online } = useOnline();
  const setting = useSetting(mode, (next: TtsMode) => ({ tts: { mode: next } }));
  const current = TTS_MODES.find((m) => m.value === setting.value) ?? TTS_MODES[0];
  return (
    <div className="flex flex-col gap-2 py-3">
      <p id={id} className={cn('text-sm font-medium', !online && 'text-muted-foreground')}>
        Quem é lido
      </p>
      {/* own scroll on very narrow phones; the padding keeps the focus ring visible */}
      <div inert={!online} className={cn('-mx-1 overflow-x-auto px-1 py-1', !online && 'opacity-50')}>
        <SegmentedToggle<TtsMode>
          value={setting.value}
          onChange={(next) => void setting.change(next)}
          ariaLabel="Quem é lido"
          className="w-full min-w-max"
        >
          {TTS_MODES.map((m) => (
            <SegmentedToggleOption key={m.value} value={m.value} className="min-h-12 flex-1 justify-center px-2.5!">
              {m.label}
            </SegmentedToggleOption>
          ))}
        </SegmentedToggle>
      </div>
      <p className="text-sm text-pretty text-muted-foreground" aria-live="polite">
        {current?.detail}
      </p>
    </div>
  );
}

function TestVoice({ blocked }: { blocked?: string }) {
  const action = useRunAction();
  const [text, setText] = useDraft('assistant.tts.test', '');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    const say = text.trim() || SAMPLE;
    void action.run(() => api('POST', '/api/tts/say', { text: say }));
  };
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 py-3">
      <FieldShell
        id="tts-test"
        label="Texto de teste"
        hint="Em branco, lê a frase de exemplo."
        count={{ value: text.length, max: TEST_MAX }}
      >
        {(aria) => (
          <Input
            {...aria}
            value={text}
            maxLength={TEST_MAX}
            placeholder={SAMPLE}
            enterKeyHint="send"
            autoComplete="off"
            onChange={(e) => setText(e.target.value)}
            className="h-12"
          />
        )}
      </FieldShell>
      <ActionButton
        phase={action.phase}
        type="submit"
        size="regular"
        tone="secondary"
        block
        icon={<Volume2 className="size-4" />}
        label="Testar voz"
        pendingLabel="Gerando a fala…"
        doneLabel="Tocando no PC"
        blocked={blocked}
      />
    </form>
  );
}

/** Text-to-speech: who is read aloud, with which voice, plus a test and an emergency skip. */
export function VoiceSection() {
  const { settings, status } = useDeck();
  const { online, reason } = useOnline();
  const skip = useRunAction();
  const voices = useVoiceOptions();
  const t = settings.tts;
  const noKey = status?.openrouter === 'unconfigured';
  const blocked = !online ? reason : noKey ? 'Configure a OPENROUTER_API_KEY no PC para gerar a voz.' : undefined;

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <AudioLines className="size-4 text-brand" aria-hidden />
          Voz (TTS)
        </span>
      }
      description="Leitura do chat em voz alta, tocada no PC da live."
    >
      <ActionButton
        phase={skip.phase}
        tone="secondary"
        icon={<SkipForward className="size-5 sm:size-4" />}
        label="Pular fala atual"
        pendingLabel="Pulando…"
        doneLabel="Fala pulada"
        blocked={online ? undefined : reason}
        onClick={() => void skip.run(() => api('POST', '/api/tts/skip'))}
      />
      {online && noKey && <Reason>A voz usa a OpenRouter: configure a OPENROUTER_API_KEY no PC.</Reason>}

      <div className="flex flex-col">
        <GroupTitle>Chat</GroupTitle>
        <div className="flex flex-col divide-y divide-border">
          <SettingSwitch
            label="Ler o chat em voz alta"
            hint="Só lê mensagens que passaram pela moderação."
            checked={t.enabled}
            toPatch={(enabled) => ({ tts: { enabled } })}
          />
          <ModeControl mode={t.mode} />
          <SettingSelect label="Voz" value={t.voice} options={voices} toPatch={(voice) => ({ tts: { voice } })} />
          <SettingSwitch
            label="Uma voz para cada pessoa"
            hint="A mesma pessoa sempre fala com a mesma voz."
            checked={t.voicePerUser}
            toPatch={(voicePerUser) => ({ tts: { voicePerUser } })}
          />
          <SettingSwitch
            label="Ler o nome de quem escreveu"
            hint="Começa com “fulano disse”."
            checked={t.readUsername}
            toPatch={(readUsername) => ({ tts: { readUsername } })}
          />
          <SettingSlider
            label="Tamanho máximo da fala"
            value={t.maxChars}
            min={20}
            max={400}
            step={10}
            display={(v) => `${v} caracteres`}
            toPatch={(maxChars) => ({ tts: { maxChars } })}
          />
          <SettingSlider
            label="Volume"
            value={t.volume}
            min={0}
            max={1}
            step={0.05}
            format={{ style: 'percent' }}
            display={pct}
            toPatch={(volume) => ({ tts: { volume } })}
          />
        </div>
      </div>

      <Separator />
      <div className="flex flex-col">
        <GroupTitle>Testar</GroupTitle>
        <TestVoice blocked={blocked} />
      </div>

      <Separator />
      <div className="flex flex-col">
        <GroupTitle>Assistente</GroupTitle>
        <div className="flex flex-col divide-y divide-border">
          <SettingSwitch
            label="O assistente fala as respostas"
            hint="Além do balão na tela."
            checked={settings.assistant.speak}
            toPatch={(speak) => ({ assistant: { speak } })}
          />
          <SettingSelect
            label="Voz do assistente"
            value={settings.assistant.voice}
            options={voices}
            toPatch={(voice) => ({ assistant: { voice } })}
          />
        </div>
      </div>
    </Section>
  );
}
