import { SFX_COLORS, type SfxButton, type SfxColor, type SfxSound } from '@stream95/shared';
import { Check, CircleAlert, Play, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { HoldToConfirmButton } from '@/components/motion-ui/hold-to-confirm';
import { MultiStateButton } from '@/components/motion-ui/multi-state-button';
import { Sheet, SheetBackdrop, SheetClose, SheetHandle, SheetPanel } from '@/components/motion-ui/sheet';
import { useNotify } from '@/components/notify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { api } from '@/lib/api';
import { pct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { colorForCategory, labelFromName, MAX_LABEL, pickEmoji, QUICK_EMOJIS, sliderValue } from './lib';
import { FILL_PILL, playStatus, SLIDER_TOUCH, Spinner } from './parts';
import { usePlayOnPc } from './play-feedback';
import { SoundPicker } from './sound-picker';
import { TilePreview } from './sound-tile';
import { TONES } from './tones';
import { type ActionError, type ActionState, useAction } from './use-action';

export type EditorTarget = { mode: 'new' } | { mode: 'edit'; button: SfxButton };

const SAVE: Record<ActionState, string> = { idle: 'Salvar', busy: 'Salvando…', done: 'Salvo', error: 'Não salvou' };

function saveIcon(state: ActionState) {
  if (state === 'busy') return <Spinner className="size-4" />;
  if (state === 'done') return <Check className="size-4" />;
  if (state === 'error') return <CircleAlert className="size-4" />;
  return <Save className="size-4" />;
}

function EditorForm({
  titleId,
  target,
  sounds,
  offline,
  onDone,
}: {
  titleId: string;
  target: EditorTarget;
  sounds: readonly SfxSound[];
  offline: boolean;
  onDone: () => void;
}) {
  const editing = target.mode === 'edit' ? target.button : null;
  const labelId = useId();
  const emojiId = useId();
  const emojiHintId = useId();
  const colorName = useId();
  const volumeId = useId();
  const removeHintId = useId();
  const [label, setLabel] = useState(editing?.label ?? '');
  const [labelTouched, setLabelTouched] = useState(editing !== null);
  const [emoji, setEmoji] = useState(editing?.emoji ?? '');
  const [emojiTooLong, setEmojiTooLong] = useState(false);
  const [color, setColor] = useState<SfxColor>(editing?.color ?? 'violet');
  const [colorTouched, setColorTouched] = useState(editing !== null);
  const [volume, setVolume] = useState(editing?.volume ?? 1);
  const [soundId, setSoundId] = useState<string | null>(editing?.soundId ?? null);
  const [error, setError] = useState<ActionError | null>(null);
  const [holdKey, setHoldKey] = useState(0);
  const [holdTipShown, setHoldTipShown] = useState(false);
  const save = useAction();
  const remove = useAction();
  const test = usePlayOnPc('soundId', soundId);
  const notify = useNotify();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const chosen = useMemo(() => (soundId ? sounds.find((s) => s.id === soundId) : undefined), [sounds, soundId]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  // Inline while the sheet is open (a toast would sit behind the scrim); a toast if it was closed meanwhile.
  const showError = useCallback(
    (err: ActionError) => {
      if (alive.current) setError(err);
      else notify({ tone: 'error', title: err.title, description: err.fix });
    },
    [notify],
  );

  const pick = useCallback(
    (sound: SfxSound) => {
      setSoundId(sound.id);
      if (!labelTouched) setLabel(labelFromName(sound.name));
      if (!colorTouched) setColor(colorForCategory(sound.category));
    },
    [labelTouched, colorTouched],
  );

  const submit = async () => {
    if (offline || save.busy || remove.busy) return;
    const name = label.trim() || (chosen ? labelFromName(chosen.name) : '');
    if (!name) {
      setError({ title: 'Dê um nome ao botão', fix: 'Escreva um nome ou escolha um som.' });
      return;
    }
    setError(null);
    const body = {
      label: name,
      soundId,
      color,
      volume,
      // An empty string clears the emoji of an existing button; a new one just leaves it out.
      ...(emoji ? { emoji } : editing?.emoji ? { emoji: '' } : {}),
    };
    const result = await save.run(
      () =>
        editing
          ? api<SfxButton>('PATCH', `/api/sfx/buttons/${encodeURIComponent(editing.id)}`, body)
          : api<SfxButton>('POST', '/api/sfx/buttons', body),
      { onError: showError, settleMs: 1500 },
    );
    if (result.ok && alive.current) closeTimer.current = setTimeout(onDone, 450);
  };

  const removeButton = async () => {
    if (!editing) return;
    if (offline) {
      setError({ title: 'Sem conexão com o PC', fix: 'Remova quando o painel reconectar.' });
      setHoldKey((k) => k + 1);
      return;
    }
    const result = await remove.run(() => api('DELETE', `/api/sfx/buttons/${encodeURIComponent(editing.id)}`), {
      onError: (err) => {
        showError(err);
        setHoldKey((k) => k + 1);
      },
    });
    if (!result.ok) return;
    notify({ tone: 'success', title: `Botão ${editing.label} removido` });
    onDone();
  };

  const canTest = !offline && chosen?.status === 'ready';
  const testLine = playStatus(test.result);
  const testReason = offline
    ? 'Sem conexão com o PC.'
    : !chosen
      ? 'Escolha um som para testar.'
      : chosen.status !== 'ready'
        ? 'O som ainda não está pronto.'
        : null;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex items-center gap-3 px-5 pb-2">
        <h2 id={titleId} className="text-lg font-semibold">
          {editing ? 'Editar botão' : 'Novo botão'}
        </h2>
        <SheetClose label="Fechar" className="ml-auto size-12!" />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-5 pt-1 pb-6">
        <div className="mx-auto w-40">
          <TilePreview
            emoji={emoji}
            label={label.trim() || (chosen ? labelFromName(chosen.name) : '')}
            color={color}
            volume={volume}
          />
        </div>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Som</legend>
          <SoundPicker sounds={sounds} value={soundId} onPick={pick} />
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor={labelId}>Nome</Label>
          <Input
            id={labelId}
            value={label}
            // UTF-16 units, so never more than the server's 32 code points
            maxLength={MAX_LABEL}
            autoComplete="off"
            enterKeyHint="done"
            placeholder={chosen ? labelFromName(chosen.name) : 'ex.: Risada'}
            onChange={(e) => {
              setLabel(e.target.value);
              setLabelTouched(true);
            }}
            className="h-12"
          />
        </div>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Emoji</legend>
          <div>
            <div className="flex items-center gap-2">
              <Input
                id={emojiId}
                aria-label="Emoji do botão"
                aria-describedby={emojiHintId}
                value={emoji}
                // room for the current emoji plus a new one: only the last one stays
                maxLength={32}
                autoComplete="off"
                onChange={(e) => {
                  const next = pickEmoji(e.target.value);
                  setEmojiTooLong(next === null);
                  if (next !== null) setEmoji(next);
                }}
                className="h-12 w-20 text-center text-2xl"
              />
              {emoji ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-12 rounded-xl"
                  onClick={() => {
                    setEmoji('');
                    setEmojiTooLong(false);
                  }}
                >
                  Tirar emoji
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Digite um ou toque num destes:</p>
              )}
            </div>
            {/* the server keeps up to 8 code points: a longer emoji is not sent */}
            <p id={emojiHintId} role="status" className="mt-1 text-xs text-warning empty:mt-0">
              {emojiTooLong ? 'Esse emoji não cabe no botão. Escolha outro.' : ''}
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {QUICK_EMOJIS.map((item) => (
              <button
                key={item}
                type="button"
                aria-label={`Usar ${item}`}
                aria-pressed={emoji === item}
                onClick={() => {
                  setEmoji(item);
                  setEmojiTooLong(false);
                }}
                className="flex h-12 items-center justify-center rounded-xl border border-border text-2xl outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/60 aria-pressed:border-primary aria-pressed:bg-accent"
              >
                {item}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Cor</legend>
          <div className="flex flex-wrap gap-2">
            {SFX_COLORS.map((c) => (
              <label
                key={c}
                title={TONES[c].name}
                className={cn(
                  'flex size-12 cursor-pointer items-center justify-center rounded-full border-2 border-transparent has-checked:border-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/60',
                  TONES[c].swatch,
                )}
              >
                <input
                  type="radio"
                  name={colorName}
                  value={c}
                  checked={color === c}
                  onChange={() => {
                    setColor(c);
                    setColorTouched(true);
                  }}
                  className="sr-only"
                />
                <span className="sr-only">{TONES[c].name}</span>
                {color === c && (
                  <span
                    aria-hidden
                    className="flex size-6 items-center justify-center rounded-full bg-background/85 text-foreground"
                  >
                    <Check className="size-4" />
                  </span>
                )}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <span id={volumeId} className="text-sm font-medium">
              Volume deste botão
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">{pct(volume)}</span>
          </div>
          <Slider
            aria-labelledby={volumeId}
            min={0}
            max={1}
            step={0.05}
            value={[volume]}
            format={{ style: 'percent' }}
            onValueChange={(value) => setVolume(sliderValue(value))}
            className={SLIDER_TOUCH}
          />
          <p className="text-xs text-muted-foreground">Multiplica o volume geral da mesa.</p>
        </div>

        {editing && (
          <div className="flex flex-col gap-2 border-t border-border pt-5">
            <HoldToConfirmButton
              key={holdKey}
              holdSeconds={1.2}
              onConfirm={() => void removeButton()}
              onCancel={() => setHoldTipShown(true)}
              aria-describedby={removeHintId}
              className={cn('h-12! w-full!', offline && 'opacity-50')}
            >
              {remove.busy ? <Spinner className="size-4" /> : <Trash2 className="size-4" aria-hidden />}
              Segure para remover
            </HoldToConfirmButton>
            <p id={removeHintId} className="text-xs text-muted-foreground">
              {holdTipShown
                ? 'Mantenha pressionado até a barra encher. O som continua na biblioteca.'
                : 'Remove só o botão. O som continua na biblioteca.'}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border bg-card px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {error && (
          <div role="alert" className="text-sm">
            <p className="font-medium text-destructive">{error.title}</p>
            {error.fix && <p className="text-muted-foreground">{error.fix}</p>}
          </div>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 flex-1 rounded-xl"
            disabled={!canTest}
            onClick={() => void test.play()}
          >
            {test.result.phase === 'pending' ? <Spinner className="size-4" /> : <Play aria-hidden />}
            Testar no PC
          </Button>
          <MultiStateButton
            type="submit"
            state={save.state}
            icon={saveIcon(save.state)}
            disabled={offline}
            widthMorph={false}
            feedback={save.state === 'error' ? 'shake' : save.state === 'done' ? 'pop' : 'none'}
            announce={save.state === 'done' ? 'Botão salvo' : undefined}
            className={cn(FILL_PILL, 'flex-1 rounded-xl!')}
            pillClassName="min-h-12 rounded-xl px-4 text-sm font-semibold"
            surfaceClassName={cn('bg-primary text-primary-foreground hover:bg-primary/85', offline && 'opacity-50')}
          >
            {SAVE[save.state]}
          </MultiStateButton>
        </div>
        <p className={cn('flex min-h-4 items-center gap-1 text-xs', testLine?.className ?? 'text-muted-foreground')}>
          {testLine ? (
            <>
              {testLine.icon}
              {testLine.text}
            </>
          ) : offline ? (
            'Sem conexão com o PC. Salvar volta quando o painel reconectar.'
          ) : (
            (testReason ?? 'O teste toca no PC, pela fonte de áudio do OBS.')
          )}
        </p>
      </div>
    </form>
  );
}

/** Bottom sheet to create or change a button: sound, name, emoji, color and volume. */
export function ButtonEditor({
  open,
  onOpenChange,
  target,
  session,
  sounds,
  offline,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: EditorTarget;
  /** Changes on every open, so the form starts fresh. */
  session: number;
  sounds: readonly SfxSound[];
  offline: boolean;
}) {
  const titleId = useId();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetBackdrop label="Fechar o editor" />
      <SheetPanel
        labelledBy={titleId}
        className="flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden px-0! pb-0! sm:max-w-lg"
      >
        <SheetHandle />
        <EditorForm
          key={session}
          titleId={titleId}
          target={target}
          sounds={sounds}
          offline={offline}
          onDone={() => onOpenChange(false)}
        />
      </SheetPanel>
    </Sheet>
  );
}
