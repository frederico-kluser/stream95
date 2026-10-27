import { List, ProgressBar } from '@react95/core';
import { Computer } from '@react95/icons/Computer';
import { Explorer100 } from '@react95/icons/Explorer100';
import { Mspaint } from '@react95/icons/Mspaint';
import { Notepad } from '@react95/icons/Notepad';
import { RecycleEmpty } from '@react95/icons/RecycleEmpty';
import { Textchat } from '@react95/icons/Textchat';
import { Winmine1 } from '@react95/icons/Winmine1';
import { LOGICAL, pollLayout, type Rect } from '@stream95/shared';
import { type CSSProperties, type ReactElement, useEffect, useRef } from 'react';
import { useStream } from '../lib/stream';
import { socialIcon } from './Taskbar';
import { Win } from './Win';

/** Live poll fed by !1, !2... votes in chat. Rows shrink (then split in two columns) to fit 2..9 options. */
export function PollWindow({ rect }: { rect: Rect }) {
  const { poll } = useStream();
  if (!poll) return null;
  const total = Math.max(1, poll.totalVotes);
  const n = poll.options.length;
  const layout = pollLayout(rect, n);
  const votes = `${poll.totalVotes} voto${poll.totalVotes === 1 ? '' : 's'}`;
  const vars = { '--poll-row': `${layout.row}px`, '--poll-label': `${layout.label}px` } as CSSProperties;
  return (
    <Win
      rect={rect}
      title={poll.open ? `Enquete: vote !1 a !${n} · ${votes}` : `Enquete encerrada · ${votes}`}
      icon={<Notepad variant="16x16_4" />}
    >
      <div className="s95-poll" style={vars}>
        <div className="s95-poll-q">{poll.question}</div>
        <div className="s95-poll-grid" style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}>
          {poll.options.map((o, i) => (
            <div key={o.label} className="s95-poll-row">
              <span className="s95-poll-label">
                !{i + 1} {o.label}
              </span>
              <ProgressBar
                className="s95-poll-bar"
                width={`${layout.bar}px`}
                percent={Math.round((o.votes / total) * 100)}
              />
              <span className="s95-poll-votes">{o.votes}</span>
            </div>
          ))}
        </div>
      </div>
    </Win>
  );
}

/** "Meus links" window with the socials as a Win95 list. */
export function LinksWindow({ rect }: { rect: Rect }) {
  const { settings, counters } = useStream();
  return (
    <Win rect={rect} title="Meus links - Explorer" icon={<Explorer100 variant="16x16_4" />}>
      <div className="s95-links">
        <List className="s95-links-list">
          {settings.socials.map((s) => (
            <List.Item key={s.label} icon={socialIcon(s.label)}>
              <span className="s95-li">
                <b>{s.label}</b>
                <span>{s.value}</span>
                {s.command ? <span className="s95-muted">!{s.command}</span> : null}
              </span>
            </List.Item>
          ))}
        </List>
        <div className="s95-inset s95-links-side">
          <div>
            <b>Comandos</b>
          </div>
          <div>!clippy &lt;pergunta&gt;</div>
          <div>!tts &lt;mensagem&gt;</div>
          <div>!redes · !projeto</div>
          {counters.length > 0 && (
            <div className="s95-links-counters">
              {counters.map((c) => (
                <span key={c.id}>
                  {c.label}: <b>{c.value}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Win>
  );
}

type DesktopIcon = { label: string; icon: ReactElement };

const DESKTOP_ICONS: DesktopIcon[] = [
  { label: 'Meu Computador', icon: <Computer variant="32x32_4" /> },
  { label: 'Lixeira', icon: <RecycleEmpty variant="32x32_4" /> },
  { label: 'Chat.exe', icon: <Textchat variant="32x32_4" /> },
  { label: 'stream95.txt', icon: <Notepad variant="32x32_4" /> },
  { label: 'Campo Minado', icon: <Winmine1 variant="32x32_4" /> },
  { label: 'Paint', icon: <Mspaint variant="32x32_4" /> },
];

/** clip-path covering the whole stage except the given rectangles (evenodd, joined at the origin). */
export function holesClipPath(holes: Rect[]): string {
  const { w, h } = LOGICAL;
  const parts = [`0 0, ${w}px 0, ${w}px ${h}px, 0 ${h}px, 0 0`];
  for (const r of holes) {
    parts.push(
      `${r.x}px ${r.y}px, ${r.x}px ${r.y + r.h}px, ${r.x + r.w}px ${r.y + r.h}px, ${r.x + r.w}px ${r.y}px, ${r.x}px ${r.y}px, 0 0`,
    );
  }
  return `polygon(evenodd, ${parts.join(', ')})`;
}

/** Teal Windows 95 desktop with a column of icons; `holes` stay transparent for OBS sources. */
export function Desktop({ icons = DESKTOP_ICONS, holes = [] }: { icons?: DesktopIcon[]; holes?: Rect[] }) {
  return (
    <div className="s95-desktop" style={holes.length ? { clipPath: holesClipPath(holes) } : undefined}>
      <div className="s95-desktop-icons">
        {icons.map((i) => (
          <div key={i.label} className="s95-desktop-icon">
            {i.icon}
            <span>{i.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Starfield Simulation" screensaver on a canvas. */
export function Starfield({ stars = 260, speed = 0.012 }: { stars?: number; speed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const field = Array.from({ length: stars }, () => ({
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      z: Math.random(),
    }));
    let raf = 0;
    const draw = () => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      for (const s of field) {
        s.z -= speed;
        if (s.z <= 0.01) {
          s.x = Math.random() * 2 - 1;
          s.y = Math.random() * 2 - 1;
          s.z = 1;
        }
        const px = (s.x / s.z) * (w / 2) + w / 2;
        const py = (s.y / s.z) * (h / 2) + h / 2;
        const size = Math.max(1, Math.round((1 - s.z) * 3));
        const shade = Math.round((1 - s.z) * 255);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(Math.round(px), Math.round(py), size, size);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [stars, speed]);
  return <canvas ref={ref} className="s95-starfield" width={960} height={540} />;
}
