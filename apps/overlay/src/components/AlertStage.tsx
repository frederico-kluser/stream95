import { Button, ProgressBar } from '@react95/core';
import { Bulb } from '@react95/icons/Bulb';
import { Earth } from '@react95/icons/Earth';
import { Joy102 } from '@react95/icons/Joy102';
import { Mail } from '@react95/icons/Mail';
import { Mailnews8 } from '@react95/icons/Mailnews8';
import { Network } from '@react95/icons/Network';
import { User } from '@react95/icons/User';
import { Winpopup3 } from '@react95/icons/Winpopup3';
import type { AlertKind, StreamAlert } from '@stream95/shared';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useStream, useStreamEvent } from '../lib/stream';
import { BsodScreen } from './Bsod';
import { Win } from './Win';

type Meta = { title: string; icon: ReactElement; progress?: string };

const META: Record<AlertKind, Meta> = {
  follow: { title: 'Novo seguidor', icon: <User variant="32x32_4" /> },
  sub: { title: 'Assistente de inscrição', icon: <Mail variant="32x32_4" />, progress: 'Instalando inscrição...' },
  resub: { title: 'Assistente de inscrição', icon: <Mail variant="32x32_4" />, progress: 'Atualizando inscrição...' },
  giftsub: {
    title: 'Pacote de presentes',
    icon: <Mailnews8 variant="32x32_4" />,
    progress: 'Distribuindo presentes...',
  },
  raid: {
    title: 'Conexão de rede detectada',
    icon: <Network variant="32x32_4" />,
    progress: 'Conectando visitantes...',
  },
  cheer: { title: 'Bits recebidos', icon: <Joy102 variant="32x32_4" /> },
  redeem: { title: 'Recompensa resgatada', icon: <Bulb variant="32x32_4" /> },
  donation: { title: 'Doação recebida', icon: <Earth variant="32x32_4" /> },
  custom: { title: 'stream95', icon: <Winpopup3 variant="32x32_4" /> },
};

export function alertHeadline(a: StreamAlert): string {
  const n = a.amount ?? 0;
  switch (a.kind) {
    case 'follow':
      return `${a.user} agora segue o canal!`;
    case 'sub':
      return `${a.user} se inscreveu${a.tier === 'prime' ? ' com Prime' : a.tier && a.tier !== '1000' ? ` (tier ${Number(a.tier) / 1000})` : ''}!`;
    case 'resub':
      return `${a.user} renovou: ${a.months ?? 1} ${a.months === 1 ? 'mês' : 'meses'} de inscrição!`;
    case 'giftsub':
      return `${a.user} presenteou ${n || 1} ${n > 1 ? 'inscrições' : 'inscrição'}!`;
    case 'raid':
      return `Raid de ${a.user}: ${n} ${n === 1 ? 'pessoa chegando' : 'pessoas chegando'}!`;
    case 'cheer':
      return `${a.user} mandou ${n} bits!`;
    case 'redeem':
      return `${a.user} resgatou "${a.reward ?? 'recompensa'}"`;
    case 'donation':
      return `${a.user} fez uma doação!`;
    default:
      return a.message ?? a.user;
  }
}

function AlertDialog({ alert, durationMs }: { alert: StreamAlert; durationMs: number }) {
  const meta = META[alert.kind] ?? META.custom;
  const [percent, setPercent] = useState(0);
  useEffect(() => {
    if (!meta.progress) return;
    const start = performance.now();
    const fill = durationMs * 0.6;
    let raf = 0;
    const tick = () => {
      const p = Math.min(100, Math.round(((performance.now() - start) / fill) * 100));
      setPercent(p);
      if (p < 100) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [meta.progress, durationMs]);

  const rect = { x: 300, y: 56, w: 360, h: meta.progress ? 168 : alert.message ? 150 : 118 };
  return (
    <Win rect={rect} title={meta.title} controls={false} className="s95-pop">
      <div className="s95-alert">
        <div className="s95-alert-icon">{meta.icon}</div>
        <div className="s95-alert-body">
          <div className="s95-alert-headline">{alertHeadline(alert)}</div>
          {alert.message && <div className="s95-inset s95-alert-msg">"{alert.message}"</div>}
          {meta.progress && (
            <div className="s95-alert-progress">
              <div>{percent < 100 ? meta.progress : 'Concluído! Valeu demais!'}</div>
              <ProgressBar width="250px" percent={percent} />
            </div>
          )}
        </div>
      </div>
      <div className="s95-alert-actions">
        <Button className="s95-default-btn">OK</Button>
      </div>
    </Win>
  );
}

/** Shows stream alerts one at a time as Windows 95 dialogs; big raids get the blue screen. */
export function AlertStage() {
  const { settings } = useStream();
  const [queue, setQueue] = useState<StreamAlert[]>([]);
  const current = queue[0];
  const durationMs = settings.alerts.durationMs;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useStreamEvent((e) => {
    if (e.type === 'alert') setQueue((q) => [...q, e.alert].slice(-20));
  });

  useEffect(() => {
    if (!current) return;
    timer.current = setTimeout(() => setQueue((q) => q.slice(1)), durationMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [current, durationMs]);

  if (!current) return null;
  if (current.kind === 'raid' && (current.amount ?? 0) >= settings.alerts.bsodRaidThreshold) {
    return (
      <BsodScreen
        title="RAID"
        lines={[
          `Uma raid de ${current.user} com ${current.amount} pessoas ocorreu em 0028:C0FFEE95.`,
          'O sistema pode ficar instável de tanta gente legal.',
          '* Pressione qualquer tecla para dar as boas-vindas.',
          '* Pressione CTRL+ALT+DEL para seguir o canal de quem chegou.',
        ]}
      />
    );
  }
  return <AlertDialog key={current.id} alert={current} durationMs={durationMs} />;
}
