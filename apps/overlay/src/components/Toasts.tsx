import { Computer } from '@react95/icons/Computer';
import { InfoBubble } from '@react95/icons/InfoBubble';
import { Network } from '@react95/icons/Network';
import { User } from '@react95/icons/User';
import type { Toast } from '@stream95/shared';
import { type ReactElement, useEffect, useState } from 'react';
import { useStreamEvent } from '../lib/stream';

const ICONS: Record<string, ReactElement> = {
  User: <User variant="16x16_4" />,
  Network: <Network variant="16x16_4" />,
  Computer: <Computer variant="16x16_4" />,
};

/** Windows-style balloon tips above the taskbar tray (GitHub pushes, pomodoro, shoutouts). */
export function ToastLayer({ bottom = 34 }: { bottom?: number }) {
  const [toasts, setToasts] = useState<(Toast & { at: number })[]>([]);
  useStreamEvent((e) => {
    if (e.type === 'toast') setToasts((t) => [...t, { ...e.toast, at: Date.now() }].slice(-3));
  });
  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setInterval(() => setToasts((all) => all.filter((x) => Date.now() - x.at < 7000)), 500);
    return () => clearInterval(t);
  }, [toasts.length]);
  return (
    <div className="s95-toasts" style={{ bottom }}>
      {toasts.map((t) => (
        <div key={t.id} className={`s95-balloon s95-pop s95-balloon-${t.level}`}>
          <div className="s95-balloon-title">
            {(t.icon && ICONS[t.icon]) || <InfoBubble variant="32x32_4" width={16} height={16} />}
            <b>{t.title}</b>
          </div>
          {t.body && <div className="s95-balloon-body">{t.body}</div>}
        </div>
      ))}
    </div>
  );
}
