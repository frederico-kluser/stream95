import {
  Button,
  Checkbox,
  Dropdown,
  Fieldset,
  Frame,
  Input,
  RadioButton,
  Range,
  Tab,
  Tabs,
  TextArea,
} from '@react95/core';
import {
  type AlertKind,
  type MessageStatus,
  type ModeratedMessage,
  type ModerationCategory,
  SCENES,
  type ServiceState,
  type Social,
  TTS_VOICES,
} from '@stream95/shared';
import { type ReactNode, useState } from 'react';
import { api } from '../lib/api';
import { mmss, usd } from '../lib/format';
import { useStream, useStreamEvent } from '../lib/stream';
import { THEME_NAMES } from '../lib/themes';

type Patch = Record<string, unknown>;

function useDockActions() {
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      setError(null);
      return await fn();
    } catch (err) {
      setError((err as Error).message);
      return undefined;
    }
  };
  const patch = (p: Patch) => run(() => api('PATCH', '/api/settings', p));
  return { error, setError, run, patch };
}

function Row({ children }: { children: ReactNode }) {
  return <div className="s95-row">{children}</div>;
}

const VERDICT_BY: Record<ModeratedMessage['verdict']['by'], string> = {
  rules: 'regras',
  jev: 'Jev',
  llm: 'IA',
  human: 'streamer',
  fallback: 'sem IA (fallback)',
  trusted: 'confiável',
  disabled: 'moderação desligada',
};

const CATEGORY_LABEL: Record<ModerationCategory, string> = {
  ok: 'ok',
  harassment: 'assédio',
  hate: 'ódio',
  sexual: 'sexual',
  violence: 'violência',
  self_harm: 'autolesão',
  spam: 'spam',
  scam: 'golpe',
  personal_data: 'dados pessoais',
  links: 'links',
  caps: 'caixa alta',
  flood: 'flood',
  blocklist: 'termo bloqueado',
  length: 'tamanho',
  other: 'outro',
};

const DECISION_LABEL: Record<MessageStatus, string> = {
  shown: 'exibida',
  held: 'na fila',
  rejected: 'barrada',
  expired: 'expirou',
};

const STATE_LABEL: Record<ServiceState, string> = {
  online: '● online',
  connecting: '◌ conectando',
  off: '○ desligado',
  error: '✖ erro',
  unconfigured: '– não configurado',
};

function StatusBar() {
  const { status, connected, queue } = useStream();
  if (!connected || !status)
    return <div className="s95-statusbar">○ servidor stream95 desconectado — rode "npm start"</div>;
  return (
    <div className="s95-statusbar">
      <span>Chat {STATE_LABEL[status.chat]}</span>
      <span>EventSub {STATE_LABEL[status.eventsub]}</span>
      <span>IA {STATE_LABEL[status.openrouter]}</span>
      <span>OBS {STATE_LABEL[status.obs]}</span>
      <span>Fila: {queue.length}</span>
      <span>Gasto IA: {usd(status.spentUsd)}</span>
    </div>
  );
}

// ------------------------------------------------------------------ moderation

function QueueItem({ m, act }: { m: ModeratedMessage; act: (path: string, body?: Patch) => void }) {
  return (
    <div className="s95-queue-item">
      <div>
        <b>{m.displayName}</b>
        {m.isFirst && <span className="s95-tag">1ª</span>}
        {m.isSub && <span className="s95-tag s95-tag-sub">SUB</span>}: {m.text}
      </div>
      <div className="s95-muted">
        {VERDICT_BY[m.verdict.by]} · {CATEGORY_LABEL[m.verdict.category]} · {m.verdict.reason}
      </div>
      <Row>
        <Button onClick={() => act(`/api/mod/${m.id}/approve`, {})}>Aprovar</Button>
        <Button onClick={() => act(`/api/mod/${m.id}/approve`, { trustUser: true })}>Aprovar + confiar</Button>
        <Button onClick={() => act(`/api/mod/${m.id}/reject`, {})}>Rejeitar</Button>
        <Button onClick={() => act(`/api/mod/${m.id}/reject`, { blockUser: true })}>Banir na sessão</Button>
      </Row>
    </div>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** Badges for what Jev noticed in a message (question to answer, technical problem). */
function SignalTags({ m, at }: { m: ModeratedMessage; at: number }) {
  const s = m.verdict.signals;
  if (!s) return null;
  return (
    <>
      {s.techIssue >= at && <span className="s95-tag s95-tag-warn">técnico {pct(s.techIssue)}</span>}
      {s.question >= at && <span className="s95-tag s95-tag-info">pergunta {pct(s.question)}</span>}
    </>
  );
}

/** What the streamer should look at now, newest first: reported problems and open questions. */
function AttentionPanel() {
  const { attention } = useStream();
  const [clearedAt, setClearedAt] = useState(0);
  const items = attention.filter((a) => a.at > clearedAt).reverse();
  return (
    <Fieldset legend={`Atenção do Jev (${items.length})`}>
      {items.length === 0 && (
        <div className="s95-muted">Perguntas e avisos de problema técnico do chat aparecem aqui.</div>
      )}
      {items.slice(0, 12).map((a) => (
        <div key={`${a.messageId}-${a.kind}`} className={`s95-attention s95-attention-${a.kind}`}>
          <span className="s95-tag">{a.kind === 'techIssue' ? 'técnico' : 'pergunta'}</span>
          <b>{a.displayName}</b>: {a.text} <span className="s95-muted">({pct(a.score)})</span>
        </div>
      ))}
      {items.length > 0 && <Button onClick={() => setClearedAt(Date.now())}>Limpar</Button>}
    </Fieldset>
  );
}

function ModerationTab() {
  const { settings, queue, log } = useStream();
  const { error, run, patch } = useDockActions();
  const [sim, setSim] = useState({ user: 'visitante', text: '', isSub: false, isMod: false, isFirst: false });
  const act = (path: string, body?: Patch) => void run(() => api('POST', path, body ?? {}));
  const mod = settings.moderation;
  return (
    <div className="s95-tab">
      {error && <div className="s95-error">{error}</div>}
      <Fieldset legend="Modo">
        {/* React95's RadioButton text is absolutely positioned: stack them, never in a flex row */}
        <div className="s95-radios">
          {(['auto', 'manual', 'off'] as const).map((mode) => (
            <RadioButton
              key={mode}
              name="mode"
              checked={mod.mode === mode}
              onChange={() => void patch({ moderation: { mode } })}
            >
              {mode === 'auto'
                ? 'Automático (regras + IA)'
                : mode === 'manual'
                  ? 'Manual (tudo na fila)'
                  : 'Só regras locais'}
            </RadioButton>
          ))}
        </div>
        <Row>
          <Checkbox checked={mod.llm} onChange={() => void patch({ moderation: { llm: !mod.llm } })}>
            Usar IA (OpenRouter)
          </Checkbox>
          <Checkbox
            checked={mod.holdFirstTimeChatters}
            onChange={() => void patch({ moderation: { holdFirstTimeChatters: !mod.holdFirstTimeChatters } })}
          >
            Segurar 1ª mensagem
          </Checkbox>
        </Row>
        <Row>
          <Checkbox
            checked={mod.engine === 'jev'}
            onChange={() => void patch({ moderation: { engine: mod.engine === 'jev' ? 'llm' : 'jev' } })}
          >
            Jev analisa todo comentário
          </Checkbox>
          <Checkbox
            checked={mod.escalateToLlm}
            onChange={() => void patch({ moderation: { escalateToLlm: !mod.escalateToLlm } })}
          >
            2ª opinião da IA nos casos ambíguos
          </Checkbox>
        </Row>
      </Fieldset>
      <Fieldset legend={`Fila de aprovação (${queue.length})`}>
        {queue.length === 0 && <div className="s95-muted">Nada esperando. Chat tranquilo.</div>}
        {queue.map((m) => (
          <QueueItem key={m.id} m={m} act={act} />
        ))}
      </Fieldset>
      <AttentionPanel />
      <Fieldset legend="Últimas decisões">
        <div className="s95-log">
          {[...log]
            .reverse()
            .slice(0, 30)
            .map((m) => (
              <div key={`${m.id}-${m.status}-${m.decidedAt}`} className={`s95-log-line s95-log-${m.status}`}>
                <span className="s95-log-status">{DECISION_LABEL[m.status]}</span>
                <b>{m.displayName}</b>: {m.text}
                <span className="s95-muted"> — {m.verdict.reason}</span>
                <SignalTags m={m} at={mod.attentionAt} />
                {m.status === 'shown' && (
                  <button type="button" className="s95-linkbtn" onClick={() => act(`/api/chat/${m.id}`)}>
                    apagar
                  </button>
                )}
              </div>
            ))}
        </div>
      </Fieldset>
      <Fieldset legend="Testar moderação">
        <Row>
          <Input
            value={sim.user}
            onChange={(e) => setSim({ ...sim, user: e.currentTarget.value })}
            style={{ width: 110 }}
          />
          <Input
            placeholder="mensagem de teste"
            value={sim.text}
            onChange={(e) => setSim({ ...sim, text: e.currentTarget.value })}
            style={{ flex: 1 }}
          />
          <Button
            onClick={() =>
              sim.text &&
              void run(async () => {
                await api('POST', '/api/chat/simulate', sim);
                setSim({ ...sim, text: '' });
              })
            }
          >
            Enviar
          </Button>
        </Row>
        <Row>
          <Checkbox checked={sim.isSub} onChange={() => setSim({ ...sim, isSub: !sim.isSub })}>
            inscrito
          </Checkbox>
          <Checkbox checked={sim.isMod} onChange={() => setSim({ ...sim, isMod: !sim.isMod })}>
            mod
          </Checkbox>
          <Checkbox checked={sim.isFirst} onChange={() => setSim({ ...sim, isFirst: !sim.isFirst })}>
            primeira msg
          </Checkbox>
        </Row>
      </Fieldset>
    </div>
  );
}

// ------------------------------------------------------------ clippy & voice

function AssistantTab() {
  const { settings } = useStream();
  const { error, run, patch } = useDockActions();
  const [question, setQuestion] = useState('');
  const [say, setSay] = useState('');
  const [last, setLast] = useState<string>('');
  useStreamEvent((e) => {
    if (e.type === 'assistant:reply')
      setLast(
        `${e.reply.asker}: ${e.reply.question}\n→ ${e.reply.answer}  (${e.reply.latencyMs ?? '?'} ms, ${e.reply.model ?? ''})`,
      );
  });
  const a = settings.assistant;
  const t = settings.tts;
  return (
    <div className="s95-tab">
      {error && <div className="s95-error">{error}</div>}
      <Fieldset legend="Perguntar ao Clippy (API local)">
        <Row>
          <Input
            value={question}
            placeholder="como faço um merge sem dor?"
            onChange={(e) => setQuestion(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button
            onClick={() =>
              question && void run(() => api('POST', '/api/assistant/ask', { question, asker: settings.channel }))
            }
          >
            Perguntar
          </Button>
        </Row>
        {last && <pre className="s95-pre">{last}</pre>}
        <Row>
          <Input
            value={say}
            placeholder="o Clippy fala isto"
            onChange={(e) => setSay(e.currentTarget.value)}
            style={{ flex: 1 }}
          />
          <Button onClick={() => say && void run(() => api('POST', '/api/assistant/say', { text: say, speak: true }))}>
            Falar
          </Button>
        </Row>
      </Fieldset>
      <Fieldset legend="Assistente">
        <Row>
          <Checkbox checked={a.enabled} onChange={() => void patch({ assistant: { enabled: !a.enabled } })}>
            Ativo
          </Checkbox>
          <Checkbox checked={a.speak} onChange={() => void patch({ assistant: { speak: !a.speak } })}>
            Responder em voz
          </Checkbox>
          <Checkbox checked={a.replyInChat} onChange={() => void patch({ assistant: { replyInChat: !a.replyInChat } })}>
            Responder no chat
          </Checkbox>
        </Row>
        <Row>
          Agente
          <Dropdown
            options={['Clippy', 'Merlin', 'Rover', 'Links', 'Bonzi', 'Peedy', 'Genie', 'Genius', 'Rocky', 'F1']}
            value={a.agent}
            onChange={(e) => void patch({ assistant: { agent: e.currentTarget.value } })}
          />
          Voz
          <Dropdown
            options={[...TTS_VOICES]}
            value={a.voice}
            onChange={(e) => void patch({ assistant: { voice: e.currentTarget.value } })}
          />
        </Row>
      </Fieldset>
      <Fieldset legend="Leitura do chat em voz (TTS)">
        <Row>
          <Checkbox checked={t.enabled} onChange={() => void patch({ tts: { enabled: !t.enabled } })}>
            Ligado
          </Checkbox>
          <Dropdown
            options={['command', 'all', 'subs', 'highlight']}
            value={t.mode}
            onChange={(e) => void patch({ tts: { mode: e.currentTarget.value } })}
          />
          <span className="s95-muted">
            {{ command: 'só !tts', all: 'todas aprovadas', subs: 'inscritos/VIPs', highlight: 'destaques' }[t.mode]}
          </span>
        </Row>
        <Row>
          Voz padrão
          <Dropdown
            options={[...TTS_VOICES]}
            value={t.voice}
            onChange={(e) => void patch({ tts: { voice: e.currentTarget.value } })}
          />
          <Checkbox checked={t.voicePerUser} onChange={() => void patch({ tts: { voicePerUser: !t.voicePerUser } })}>
            Uma voz por pessoa
          </Checkbox>
          <Checkbox checked={t.readUsername} onChange={() => void patch({ tts: { readUsername: !t.readUsername } })}>
            Ler o nome
          </Checkbox>
        </Row>
        <Row>
          Volume {Math.round(t.volume * 100)}%
          <Range
            min={0}
            max={100}
            value={Math.round(t.volume * 100)}
            onChange={(e) => void patch({ tts: { volume: Number(e.currentTarget.value) / 100 } })}
          />
          Máx. {t.maxChars} letras
          <Range
            min={40}
            max={400}
            step={10}
            value={t.maxChars}
            onChange={(e) => void patch({ tts: { maxChars: Number(e.currentTarget.value) } })}
          />
        </Row>
        <Row>
          <Button
            onClick={() =>
              void run(() => api('POST', '/api/tts/say', { text: 'Testando a voz do stream noventa e cinco. Câmbio!' }))
            }
          >
            Testar voz
          </Button>
          <Button onClick={() => void run(() => api('POST', '/api/tts/skip', {}))}>Pular fala atual</Button>
        </Row>
      </Fieldset>
    </div>
  );
}

// ---------------------------------------------------------------------- alerts

const ALERT_BUTTONS: { kind: AlertKind; label: string; amount?: number }[] = [
  { kind: 'follow', label: 'Follow' },
  { kind: 'sub', label: 'Inscrição' },
  { kind: 'resub', label: 'Reinscrição' },
  { kind: 'giftsub', label: 'Presente x5', amount: 5 },
  { kind: 'cheer', label: '500 bits', amount: 500 },
  { kind: 'raid', label: 'Raid 12', amount: 12 },
  { kind: 'raid', label: 'Raid 80 (BSOD)', amount: 80 },
  { kind: 'redeem', label: 'Resgate' },
];

function AlertsTab() {
  const { settings } = useStream();
  const { error, run, patch } = useDockActions();
  const [user, setUser] = useState('visitante');
  const al = settings.alerts;
  return (
    <div className="s95-tab">
      {error && <div className="s95-error">{error}</div>}
      <Fieldset legend="Simular alerta">
        <Row>
          Nome <Input value={user} onChange={(e) => setUser(e.currentTarget.value)} style={{ width: 140 }} />
        </Row>
        <div className="s95-grid-buttons">
          {ALERT_BUTTONS.map((b) => (
            <Button
              key={b.label}
              onClick={() =>
                void run(() =>
                  api('POST', '/api/alerts/simulate', {
                    kind: b.kind,
                    user,
                    ...(b.amount ? { amount: b.amount } : {}),
                    ...(b.kind === 'resub' ? { months: 12, message: 'Melhor canal de código raiz!' } : {}),
                    ...(b.kind === 'redeem' ? { reward: 'Hidratar o streamer' } : {}),
                  }),
                )
              }
            >
              {b.label}
            </Button>
          ))}
          <Button onClick={() => void run(() => api('POST', '/api/fx/bsod', {}))}>Tela azul</Button>
          <Button
            onClick={() =>
              void run(() => api('POST', '/api/fx/toast', { title: 'Olá!', body: 'Teste de balão de notificação' }))
            }
          >
            Balão
          </Button>
        </div>
      </Fieldset>
      <Fieldset legend="Configurações">
        <Row>
          <Checkbox checked={al.sound} onChange={() => void patch({ alerts: { sound: !al.sound } })}>
            Som (jingles 8-bit)
          </Checkbox>
          <Checkbox checked={al.speak} onChange={() => void patch({ alerts: { speak: !al.speak } })}>
            Clippy anuncia em voz
          </Checkbox>
        </Row>
        <Row>
          Duração {al.durationMs / 1000}s
          <Range
            min={3}
            max={20}
            value={al.durationMs / 1000}
            onChange={(e) => void patch({ alerts: { durationMs: Number(e.currentTarget.value) * 1000 } })}
          />
        </Row>
        <Row>
          Tela azul para raids com ≥
          <Input
            type="number"
            value={al.bsodRaidThreshold}
            onChange={(e) => void patch({ alerts: { bsodRaidThreshold: Number(e.currentTarget.value) || 1 } })}
            style={{ width: 70 }}
          />
          pessoas
        </Row>
      </Fieldset>
    </div>
  );
}

// ------------------------------------------------------------------------ poll

function PollTab() {
  const { poll } = useStream();
  const { error, run } = useDockActions();
  const [question, setQuestion] = useState('Qual linguagem a gente usa hoje?');
  const [options, setOptions] = useState('Rust\nGo\nTypeScript');
  const [duration, setDuration] = useState(120);
  return (
    <div className="s95-tab">
      {error && <div className="s95-error">{error}</div>}
      <Fieldset legend="Nova enquete">
        <Input value={question} onChange={(e) => setQuestion(e.currentTarget.value)} style={{ width: '100%' }} />
        <TextArea
          value={options}
          rows={4}
          onChange={(e) => setOptions(e.currentTarget.value)}
          style={{ width: '100%' }}
        />
        <Row>
          Duração (s, 0 = manual)
          <Input
            type="number"
            value={duration}
            onChange={(e) => setDuration(Number(e.currentTarget.value) || 0)}
            style={{ width: 70 }}
          />
          <Button
            onClick={() =>
              void run(() =>
                api('POST', '/api/poll', {
                  question,
                  options: options
                    .split('\n')
                    .map((o) => o.trim())
                    .filter(Boolean),
                  durationSec: duration,
                }),
              )
            }
          >
            Iniciar
          </Button>
        </Row>
      </Fieldset>
      {poll && (
        <Fieldset legend={poll.open ? 'Em andamento' : 'Encerrada'}>
          <div>
            <b>{poll.question}</b>
          </div>
          {poll.options.map((o, i) => (
            <div key={o.label}>
              !{i + 1} {o.label}: <b>{o.votes}</b>
            </div>
          ))}
          <Row>
            <Button onClick={() => void run(() => api('POST', '/api/poll/close', {}))}>Encerrar</Button>
            <Button onClick={() => void run(() => api('DELETE', '/api/poll'))}>Tirar da tela</Button>
          </Row>
        </Fieldset>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------ live

function LiveTab() {
  const { pomodoro, counters, obsScenes, scene, status } = useStream();
  const { error, run } = useDockActions();
  const [newCounter, setNewCounter] = useState('');
  const left = pomodoro.running && pomodoro.endsAt ? pomodoro.endsAt - Date.now() : pomodoro.remainingMs;
  return (
    <div className="s95-tab">
      {error && <div className="s95-error">{error}</div>}
      <Fieldset
        legend={`Pomodoro ${pomodoro.mode === 'idle' ? '(parado)' : `#${pomodoro.cycle} ${pomodoro.mode === 'focus' ? 'foco' : 'pausa'} ${mmss(left)}`}`}
      >
        <Row>
          <Button onClick={() => void run(() => api('POST', '/api/pomodoro/start', { mode: 'focus' }))}>Foco</Button>
          <Button onClick={() => void run(() => api('POST', '/api/pomodoro/start', { mode: 'break' }))}>Pausa</Button>
          <Button
            onClick={() => void run(() => api('POST', `/api/pomodoro/${pomodoro.running ? 'pause' : 'resume'}`, {}))}
          >
            {pomodoro.running ? 'Pausar' : 'Retomar'}
          </Button>
          <Button onClick={() => void run(() => api('POST', '/api/pomodoro/stop', {}))}>Parar</Button>
        </Row>
      </Fieldset>
      <Fieldset legend="Contadores">
        {counters.map((c) => (
          <Row key={c.id}>
            <span style={{ width: 90 }}>
              {c.label}: <b>{c.value}</b>
            </span>
            <Button onClick={() => void run(() => api('POST', `/api/counters/${c.id}/add`, { delta: 1 }))}>+1</Button>
            <Button onClick={() => void run(() => api('POST', `/api/counters/${c.id}/add`, { delta: -1 }))}>−1</Button>
            <Button onClick={() => void run(() => api('PUT', `/api/counters/${c.id}`, { value: 0 }))}>zerar</Button>
            <Button onClick={() => void run(() => api('DELETE', `/api/counters/${c.id}`))}>remover</Button>
          </Row>
        ))}
        <Row>
          <Input
            placeholder="novo contador"
            value={newCounter}
            onChange={(e) => setNewCounter(e.currentTarget.value)}
          />
          <Button
            onClick={() =>
              newCounter &&
              void run(async () => {
                await api('POST', '/api/counters', { id: newCounter, label: newCounter });
                setNewCounter('');
              })
            }
          >
            Criar
          </Button>
        </Row>
      </Fieldset>
      <Fieldset legend={`Cenas do OBS (${status?.obs ? STATE_LABEL[status.obs] : '...'})`}>
        {obsScenes.length === 0 && (
          <div className="s95-muted">
            Ative em OBS → Ferramentas → Configurações do servidor WebSocket e coloque a senha em OBS_WS_PASSWORD no
            .env.
          </div>
        )}
        <div className="s95-grid-buttons">
          {obsScenes.map((s) => (
            <Button
              key={s}
              className={s === scene ? 's95-pressed' : ''}
              onClick={() => void run(() => api('POST', '/api/obs/scene', { name: s }))}
            >
              {s}
            </Button>
          ))}
        </div>
        {obsScenes.length === 0 && (
          <div className="s95-grid-buttons">
            {SCENES.map((s) => (
              <Button key={s.id} onClick={() => void run(() => api('POST', '/api/scene', { scene: s.id }))}>
                {s.name}
              </Button>
            ))}
          </div>
        )}
      </Fieldset>
    </div>
  );
}

// ---------------------------------------------------------------------- config

let rowSeq = 0;
type SocialRow = Social & { rowId: number };

function SocialsEditor({ socials, save }: { socials: Social[]; save: (s: Social[]) => void }) {
  const [rows, setRows] = useState<SocialRow[]>(() => socials.map((s) => ({ ...s, rowId: ++rowSeq })));
  const set = (id: number, k: keyof Social, v: string) =>
    setRows(rows.map((r) => (r.rowId === id ? ({ ...r, [k]: v || undefined } as SocialRow) : r)));
  return (
    <>
      {rows.map((r) => (
        <Row key={r.rowId}>
          <Input value={r.label} onChange={(e) => set(r.rowId, 'label', e.currentTarget.value)} style={{ width: 80 }} />
          <Input
            value={r.value}
            onChange={(e) => set(r.rowId, 'value', e.currentTarget.value)}
            style={{ width: 140 }}
          />
          <Input
            value={r.url ?? ''}
            placeholder="https://..."
            onChange={(e) => set(r.rowId, 'url', e.currentTarget.value)}
            style={{ width: 160 }}
          />
          <Input
            value={r.command ?? ''}
            placeholder="comando"
            onChange={(e) => set(r.rowId, 'command', e.currentTarget.value)}
            style={{ width: 80 }}
          />
          <Button onClick={() => setRows(rows.filter((x) => x.rowId !== r.rowId))}>x</Button>
        </Row>
      ))}
      <Row>
        <Button onClick={() => setRows([...rows, { label: 'Novo', value: '...', rowId: ++rowSeq }])}>Adicionar</Button>
        <Button onClick={() => save(rows.map(({ rowId: _id, ...s }) => s))}>Salvar redes</Button>
      </Row>
    </>
  );
}

function ConfigTab() {
  const { settings, status } = useStream();
  const { error, run, patch } = useDockActions();
  const [channel, setChannel] = useState(settings.channel);
  const [domains, setDomains] = useState(settings.moderation.allowedLinkDomains.join('\n'));
  const [terms, setTerms] = useState(settings.moderation.blockedTerms.join('\n'));
  const [device, setDevice] = useState<{ userCode: string; verificationUri: string } | null>(null);
  const o = settings.overlay;
  const lines = (s: string) =>
    s
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
  return (
    <div className="s95-tab">
      {error && <div className="s95-error">{error}</div>}
      <Fieldset legend="Canal e visual">
        <Row>
          twitch.tv/
          <Input value={channel} onChange={(e) => setChannel(e.currentTarget.value)} style={{ width: 160 }} />
          <Button onClick={() => void patch({ channel: channel.trim().toLowerCase() })}>Salvar</Button>
        </Row>
        <Row>
          Tema React95
          <Dropdown
            options={THEME_NAMES}
            value={o.theme}
            onChange={(e) => void patch({ overlay: { theme: e.currentTarget.value } })}
          />
          Contagem (min)
          <Input
            type="number"
            value={o.startingMinutes}
            onChange={(e) => void patch({ overlay: { startingMinutes: Number(e.currentTarget.value) || 5 } })}
            style={{ width: 60 }}
          />
        </Row>
        <Row>
          <Input
            value={o.startingTitle}
            onChange={(e) => void patch({ overlay: { startingTitle: e.currentTarget.value } })}
            style={{ flex: 1 }}
          />
          <Input
            value={o.brbTitle}
            onChange={(e) => void patch({ overlay: { brbTitle: e.currentTarget.value } })}
            style={{ width: 120 }}
          />
        </Row>
      </Fieldset>
      <Fieldset legend="Redes sociais (rótulo · valor · link · !comando)">
        <SocialsEditor socials={settings.socials} save={(s) => void patch({ socials: s })} />
      </Fieldset>
      <Fieldset legend="Regras de moderação">
        <Row>
          <Checkbox
            checked={settings.moderation.trustSubs}
            onChange={() => void patch({ moderation: { trustSubs: !settings.moderation.trustSubs } })}
          >
            Confiar em inscritos
          </Checkbox>
          <Checkbox
            checked={settings.moderation.trustVips}
            onChange={() => void patch({ moderation: { trustVips: !settings.moderation.trustVips } })}
          >
            Confiar em VIPs
          </Checkbox>
          Se a IA falhar
          <Dropdown
            options={['review', 'allow']}
            value={settings.moderation.onLlmError}
            onChange={(e) => void patch({ moderation: { onLlmError: e.currentTarget.value } })}
          />
        </Row>
        <div className="s95-two">
          <div>
            <div>Domínios liberados</div>
            <TextArea
              aria-label="Domínios liberados"
              rows={5}
              value={domains}
              onChange={(e) => setDomains(e.currentTarget.value)}
            />
          </div>
          <div>
            <div>Termos bloqueados (extra)</div>
            <TextArea
              aria-label="Termos bloqueados"
              rows={5}
              value={terms}
              onChange={(e) => setTerms(e.currentTarget.value)}
            />
          </div>
        </div>
        <Button
          onClick={() => void patch({ moderation: { allowedLinkDomains: lines(domains), blockedTerms: lines(terms) } })}
        >
          Salvar listas
        </Button>
      </Fieldset>
      <Fieldset legend="Twitch (opcional: follows, resgates, chat oficial via EventSub)">
        <Row>
          <Button
            onClick={() =>
              void run(async () => {
                setDevice(await api<{ userCode: string; verificationUri: string }>('POST', '/api/twitch/login', {}));
              })
            }
          >
            Entrar com a Twitch
          </Button>
          <Button onClick={() => void run(() => api('POST', '/api/twitch/logout', {}))}>Sair</Button>
        </Row>
        {device && (
          <div className="s95-inset" style={{ padding: 6 }}>
            Abra{' '}
            <a href={device.verificationUri} target="_blank" rel="noreferrer">
              {device.verificationUri}
            </a>{' '}
            e confirme o código <b style={{ fontSize: 16 }}>{device.userCode}</b>
          </div>
        )}
      </Fieldset>
      <Fieldset legend="Diagnóstico">
        <div>Gasto de IA nesta sessão: {usd(status?.spentUsd ?? 0)}</div>
        <div>
          URLs para o OBS: <a href="/">página inicial</a>
        </div>
      </Fieldset>
    </div>
  );
}

/** Control panel — open it as an OBS Custom Browser Dock (Docks → Custom Browser Docks). */
export function Dock() {
  return (
    <Frame className="s95-dock" bgColor="$material">
      <StatusBar />
      <Tabs defaultActiveTab="Moderação" className="s95-tabs">
        <Tab title="Moderação">
          <ModerationTab />
        </Tab>
        <Tab title="Clippy & Voz">
          <AssistantTab />
        </Tab>
        <Tab title="Alertas">
          <AlertsTab />
        </Tab>
        <Tab title="Enquete">
          <PollTab />
        </Tab>
        <Tab title="Live">
          <LiveTab />
        </Tab>
        <Tab title="Config">
          <ConfigTab />
        </Tab>
      </Tabs>
    </Frame>
  );
}
