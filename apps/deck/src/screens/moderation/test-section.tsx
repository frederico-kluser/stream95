import type { ModeratedMessage } from '@stream95/shared';
import { Check, CircleAlert, LoaderCircle, Send } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { MultiStateButton } from '@/components/motion-ui/multi-state-button';
import { useNotify } from '@/components/notify';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useDeck } from '@/lib/store';
import { cn } from '@/lib/utils';
import { BY_LABEL } from './labels';
import { JevBars, OfflineReason, StatusChip } from './message-bits';
import { errorNotice } from './stores';

type SendState = 'idle' | 'sending' | 'sent' | 'error';
type Result = ModeratedMessage | { hidden: true };

const SAMPLES = [
  { label: 'Pergunta', text: 'que teclado você usa? parece muito bom' },
  { label: 'Problema técnico', text: 'o áudio tá cortando aqui, mais alguém?' },
  { label: 'Link', text: 'curso grátis aqui bit.ly/curso-gratis-agora' },
  { label: 'Caixa alta', text: 'OLHA ISSO AQUI GENTE QUE COISA MAIS INCRÍVEL DO MUNDO' },
  { label: 'Ofensa', text: 'cala a boca, seu inútil' },
] as const;

const OUTCOME: Record<ModeratedMessage['status'], string> = {
  shown: 'Apareceu no overlay.',
  held: 'Foi para a fila de aprovação.',
  rejected: 'Ficou fora da live.',
  expired: 'Expirou na fila.',
};

const BUTTON_TEXT: Record<SendState, string> = {
  idle: 'Enviar teste',
  sending: 'Analisando…',
  sent: 'Enviada',
  error: 'Não enviou',
};

const BUTTON_ICON: Record<SendState, ReactNode> = {
  idle: <Send className="size-4" />,
  sending: <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />,
  sent: <Check className="size-4" />,
  error: <CircleAlert className="size-4" />,
};

function ProfileSwitch({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-border px-3">
      <label htmlFor={id} className="flex-1 cursor-pointer py-3 text-sm font-medium">
        {label}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={(next) => onChange(next)} />
    </div>
  );
}

/** Sends a fake chat message through the same pipeline as Twitch messages and shows the verdict. */
export function TestSection() {
  const { connection, settings } = useDeck();
  const notify = useNotify();
  const [user, setUser] = useState('visitante');
  const [text, setText] = useState('');
  const [isSub, setIsSub] = useState(false);
  const [isMod, setIsMod] = useState(false);
  const [isFirst, setIsFirst] = useState(false);
  const [state, setState] = useState<SendState>('idle');
  const [result, setResult] = useState<Result | null>(null);
  const lock = useRef(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const online = connection === 'online';
  const canSend = online && text.trim().length > 0 && state !== 'sending';

  useEffect(() => () => clearTimeout(resetTimer.current ?? undefined), []);

  const settleTo = (next: SendState) => {
    setState(next);
    clearTimeout(resetTimer.current ?? undefined);
    resetTimer.current = setTimeout(() => setState('idle'), 1800);
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (lock.current || !canSend) return;
    lock.current = true;
    setState('sending');
    try {
      const r = await api<Result>('POST', '/api/chat/simulate', {
        user: user.trim() || 'visitante',
        text: text.trim(),
        isSub,
        isMod,
        isFirst,
      });
      setResult(r);
      setText('');
      settleTo('sent');
    } catch (err) {
      notify(errorNotice(err));
      settleTo('error');
    } finally {
      lock.current = false;
    }
  };

  const trustedNote =
    isMod && settings.moderation.trustMods
      ? 'Mods passam direto, sem moderação. Desligue “Mod” para testar a IA.'
      : null;

  return (
    <Section
      title="Testar moderação"
      description="Mande uma mensagem de mentira pelo mesmo caminho do chat. Se for aprovada, ela aparece no overlay."
    >
      <form onSubmit={send} className="flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <label htmlFor="mod-test-user" className="text-sm font-medium">
              Nome
            </label>
            <Input
              id="mod-test-user"
              value={user}
              maxLength={25}
              autoComplete="off"
              onChange={(e) => setUser(e.target.value)}
              className="h-12"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="mod-test-text" className="text-sm font-medium">
              Mensagem
            </label>
            <Textarea
              id="mod-test-text"
              value={text}
              maxLength={500}
              rows={2}
              placeholder="Escreva como alguém do chat"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter breaks the line (like the Twitch chat)
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              className="min-h-12"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium" id="mod-test-samples">
            Exemplos prontos
          </p>
          <ul
            aria-labelledby="mod-test-samples"
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] md:flex-wrap md:overflow-visible"
          >
            {SAMPLES.map((s) => (
              <li key={s.label} className="shrink-0">
                <Button
                  type="button"
                  variant={text === s.text ? 'secondary' : 'outline'}
                  aria-pressed={text === s.text}
                  className="h-12 px-4"
                  onClick={() => setText(s.text)}
                >
                  {s.label}
                </Button>
              </li>
            ))}
          </ul>
        </div>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Quem manda</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            <ProfileSwitch id="mod-test-sub" label="Inscrito" checked={isSub} onChange={setIsSub} />
            <ProfileSwitch id="mod-test-mod" label="Mod" checked={isMod} onChange={setIsMod} />
            <ProfileSwitch id="mod-test-first" label="Primeira mensagem" checked={isFirst} onChange={setIsFirst} />
          </div>
          {trustedNote && <p className="text-sm text-muted-foreground">{trustedNote}</p>}
        </fieldset>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <MultiStateButton
            type="submit"
            state={state}
            icon={BUTTON_ICON[state]}
            disabled={!canSend}
            feedback={state === 'error' ? 'shake' : state === 'sent' ? 'pop' : 'none'}
            pillClassName="flex h-12 items-center rounded-full px-6 text-sm font-medium shadow-sm"
            surfaceClassName={cn(
              state === 'error' ? 'bg-destructive text-background' : 'bg-primary text-primary-foreground',
              !canSend && state === 'idle' && 'opacity-50',
            )}
            className="self-start"
          >
            {BUTTON_TEXT[state]}
          </MultiStateButton>
          {!online ? (
            <OfflineReason connection={connection} />
          ) : (
            !text.trim() && <p className="text-sm text-muted-foreground">Escreva uma mensagem ou toque num exemplo.</p>
          )}
        </div>
      </form>

      <div aria-live="polite">
        {result && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-sm font-medium">Resultado do último teste</p>
            {'hidden' in result ? (
              <p className="text-sm text-muted-foreground">Comando reconhecido. A mensagem não vai para o chat.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={result.status} />
                  <span className="text-sm">
                    Quem decidiu: <span className="font-medium">{BY_LABEL[result.verdict.by]}</span>
                  </span>
                  <span className="text-sm text-muted-foreground">{OUTCOME[result.status]}</span>
                </div>
                {result.verdict.reason && (
                  <p className="text-sm wrap-anywhere text-muted-foreground">{result.verdict.reason}</p>
                )}
                {result.verdict.probabilities && <JevBars p={result.verdict.probabilities} />}
              </>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
