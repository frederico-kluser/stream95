import { Button, Frame, List } from '@react95/core';
import { Computer } from '@react95/icons/Computer';
import { Explorer100 } from '@react95/icons/Explorer100';
import { Logo } from '@react95/icons/Logo';
import { Mplayer10 } from '@react95/icons/Mplayer10';
import { Network } from '@react95/icons/Network';
import { Notepad } from '@react95/icons/Notepad';
import { PowerOff } from '@react95/icons/PowerOff';
import { Textchat } from '@react95/icons/Textchat';
import { User } from '@react95/icons/User';
import { type Social, sceneById } from '@stream95/shared';
import { type ReactElement, useEffect, useState } from 'react';
import { mmss } from '../lib/format';
import { useStream } from '../lib/stream';

export function socialIcon(label: string, size: '16x16_4' | '32x32_4' = '16x16_4'): ReactElement {
  const l = label.toLowerCase();
  if (l.includes('discord')) return <Textchat variant={size} />;
  if (l.includes('linkedin')) return <User variant={size} />;
  if (l.includes('github') || l.includes('git')) return <Computer variant={size} />;
  if (l.includes('youtube') || l.includes('twitch')) return <Mplayer10 variant={size} />;
  if (l.includes('site') || l.includes('blog') || l.includes('web')) return <Explorer100 variant={size} />;
  return <Notepad variant={size} />;
}

function useClock(timeZone: string): string {
  const fmt = () => {
    try {
      return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date());
    } catch {
      return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
  };
  const [now, setNow] = useState(fmt);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fmt only depends on timeZone
  useEffect(() => {
    const t = setInterval(() => setNow(fmt()), 5000);
    return () => clearInterval(t);
  }, [timeZone]);
  return now;
}

function usePomodoroLeft(): string | null {
  const { pomodoro } = useStream();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!pomodoro.running) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [pomodoro.running]);
  if (pomodoro.mode === 'idle') return null;
  const left = pomodoro.running && pomodoro.endsAt ? pomodoro.endsAt - Date.now() : pomodoro.remainingMs;
  return `${pomodoro.mode === 'focus' ? 'Foco' : 'Pausa'} ${mmss(left)}${pomodoro.running ? '' : ' ⏸'}`;
}

function StartMenu({ socials }: { socials: Social[] }) {
  return (
    <Frame className="s95-startmenu s95-pop" boxShadow="$out" bgColor="$material">
      <div className="s95-startmenu-side">
        <span>
          <b>stream</b>95
        </span>
      </div>
      <List className="s95-startmenu-list">
        {socials.map((s) => (
          <List.Item key={s.label} icon={socialIcon(s.label, '32x32_4')}>
            <span>
              <b>{s.label}</b> — {s.value}
            </span>
          </List.Item>
        ))}
        <List.Divider />
        <List.Item icon={<PowerOff variant="32x32_4" />}>Desligar a live...</List.Item>
      </List>
    </Frame>
  );
}

/**
 * Windows 95 taskbar: Start button (the Start menu pops open now and then showing
 * the socials), the current scene as a task, a GitHub ticker, and the tray with
 * pomodoro, counters and the clock.
 */
export function Taskbar({ sceneTitle, startEverySec = 300 }: { sceneTitle?: string; startEverySec?: number }) {
  const { settings, counters, github, scene } = useStream();
  const clock = useClock(settings.overlay.timezone);
  const pomodoro = usePomodoroLeft();
  const [startOpen, setStartOpen] = useState(false);
  const latest = github.at(-1);

  useEffect(() => {
    if (startEverySec <= 0) return;
    let close: ReturnType<typeof setTimeout> | undefined;
    const open = setInterval(() => {
      setStartOpen(true);
      close = setTimeout(() => setStartOpen(false), 10_000);
    }, startEverySec * 1000);
    return () => {
      clearInterval(open);
      if (close) clearTimeout(close);
    };
  }, [startEverySec]);

  const title = sceneTitle ?? (scene ? (sceneById(scene)?.name ?? scene) : 'stream95');
  const visibleCounters = counters.filter((c) => c.value > 0).slice(0, 3);

  return (
    <>
      {startOpen && <StartMenu socials={settings.socials} />}
      <Frame className="s95-taskbar" boxShadow="$out" bgColor="$material">
        <Button className={`s95-start${startOpen ? ' s95-pressed' : ''}`}>
          <Logo variant="16x16_4" />
          <b>Iniciar</b>
        </Button>
        <Button className="s95-task s95-pressed">
          <Network variant="16x16_4" />
          <span>{title}</span>
        </Button>
        <div className="s95-ticker">
          {latest ? (
            <span key={latest.id} className="s95-ticker-text">
              <b>{latest.repo}</b>: {latest.title}
            </span>
          ) : (
            <span className="s95-ticker-text">
              {settings.socials.map((s) => `${s.label}: ${s.value}`).join('   ·   ')}
            </span>
          )}
        </div>
        <Frame className="s95-tray" boxShadow="$in">
          {pomodoro && <span className="s95-tray-item">⏱ {pomodoro}</span>}
          {visibleCounters.map((c) => (
            <span key={c.id} className="s95-tray-item">
              {c.label}: {c.value}
            </span>
          ))}
          <span className="s95-tray-item s95-clock">{clock}</span>
        </Frame>
      </Frame>
    </>
  );
}
