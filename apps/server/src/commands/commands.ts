import type { ChatMessage, Settings } from '@stream95/shared';
import type { CounterService } from '../features/counters.js';
import type { PollService } from '../features/poll.js';
import type { PomodoroService } from '../features/pomodoro.js';

export type CommandIntent = { kind: 'assistant'; question: string } | { kind: 'tts'; text: string };

export type CommandOutcome = {
  /** Keep this message out of the chat overlay (votes, mod-only effects). */
  hide: boolean;
  /** Runs only AFTER the message passes moderation. */
  intent?: CommandIntent;
  /** Our own answer (no user content) — spoken by Clippy and sent to chat when logged in. */
  reply?: string;
};

export type CommandEffects = {
  bsod: (title: string, message: string) => void;
  toast: (title: string, body: string) => void;
};

export type CommandContext = {
  settings: () => Settings;
  poll: PollService;
  pomodoro: PomodoroService;
  counters: CounterService;
  effects: CommandEffects;
  projectUrl: string;
};

export function parseCommand(text: string): { name: string; args: string } | null {
  const m = /^!([\p{L}\d_]{1,24})(?:\s+([\s\S]*))?$/u.exec(text.trim());
  if (!m) return null;
  return { name: (m[1] ?? '').toLowerCase(), args: (m[2] ?? '').trim() };
}

const fmtMs = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Chat commands. Anything with user-provided text becomes an intent that waits for moderation. */
export class CommandRouter {
  constructor(private readonly ctx: CommandContext) {}

  list(): string[] {
    const socials = this.ctx.settings().socials.flatMap((s) => (s.command ? [`!${s.command}`] : []));
    return [
      '!clippy <pergunta>',
      '!tts <mensagem>',
      '!redes',
      ...socials,
      '!1..!9 (enquete)',
      '!pomodoro',
      '!projeto',
      '!lurk',
    ];
  }

  handle(msg: ChatMessage): CommandOutcome | null {
    const cmd = parseCommand(msg.text);
    if (!cmd) return null;
    const s = this.ctx.settings();
    const isMod = msg.isMod || msg.isBroadcaster;
    const name = cmd.name;

    if (/^[1-9]$/.test(name)) {
      this.ctx.poll.vote(msg.login, Number(name));
      return { hide: true };
    }

    switch (name) {
      case 'clippy':
      case 'ajuda':
      case 'pergunta':
      case 'ask': {
        if (!s.assistant.enabled) return { hide: false };
        if (!cmd.args) return { hide: false, reply: `Me pergunta algo assim: !clippy como inverto uma string em JS?` };
        return { hide: false, intent: { kind: 'assistant', question: cmd.args } };
      }
      case 'tts': {
        if (!s.tts.enabled || !['command', 'all'].includes(s.tts.mode) || !cmd.args) return { hide: false };
        return { hide: false, intent: { kind: 'tts', text: cmd.args } };
      }
      case 'comandos':
      case 'commands':
      case 'help':
        return { hide: false, reply: `Comandos: ${this.list().join(' · ')}` };
      case 'redes':
      case 'socials':
        return {
          hide: false,
          reply: s.socials.map((x) => `${x.label}: ${x.url ?? x.value}`).join(' · '),
        };
      case 'projeto':
      case 'overlay':
        return { hide: false, reply: `Este overlay é open source: ${this.ctx.projectUrl}` };
      case 'lurk':
        return {
          hide: false,
          reply: `${msg.displayName} foi compilar em segundo plano. Volte quando o build terminar!`,
        };
      case 'pomodoro': {
        const p = this.ctx.pomodoro.current;
        if (p.mode === 'idle') return { hide: false, reply: 'Pomodoro parado. Foco total no código!' };
        const label = p.mode === 'focus' ? 'foco' : 'pausa';
        return {
          hide: false,
          reply: `Pomodoro #${p.cycle}: ${label}, faltam ${fmtMs(p.remainingMs)}${p.running ? '' : ' (pausado)'}`,
        };
      }
      case 'bsod':
        if (!isMod) return { hide: false };
        this.ctx.effects.bsod(
          'stream95',
          cmd.args ||
            'Um erro fatal 0E ocorreu em 0028:C0011E36 no VXD CAFE(01). Pressione qualquer tecla para continuar.',
        );
        return { hide: true };
      case 'so':
      case 'shoutout': {
        if (!isMod || !cmd.args) return { hide: false };
        const user = cmd.args.replace(/^@/, '').split(/\s+/)[0] ?? '';
        if (!/^\w{3,25}$/.test(user)) return { hide: true };
        this.ctx.effects.toast('Recomendação do canal', `Sigam ${user} em twitch.tv/${user}`);
        return { hide: true, reply: `Sigam ${user}: https://twitch.tv/${user.toLowerCase()}` };
      }
      default: {
        const social = s.socials.find((x) => x.command === name);
        if (social) return { hide: false, reply: `${social.label}: ${social.url ?? social.value}` };
        const counter = this.ctx.counters.all.find((c) => c.id === name);
        if (counter && isMod) {
          const delta = cmd.args === '-' ? -1 : Number.parseInt(cmd.args || '1', 10) || 1;
          const updated = this.ctx.counters.add(counter.id, delta);
          return { hide: true, ...(updated ? { reply: `${updated.label}: ${updated.value}` } : {}) };
        }
        return null;
      }
    }
  }
}
