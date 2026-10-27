import { type AgentType, ClippyProvider, useClippy } from '@react95/clippy';
import { CLIPPY_FRAME, LOGICAL, type Rect, UI_SCALE } from '@stream95/shared';
import { useEffect, useRef, useState } from 'react';
import { useStream, useStreamEvent } from '../lib/stream';

type Balloon = { id: number; header?: string; text: string; until: number };

/** Reading time on stream: ~14 chars/s, between 4 and 16 seconds. */
export const balloonMs = (text: string) => Math.min(16_000, Math.max(4_000, (text.length / 14) * 1000 + 1500));

/** Places the clippy.js agent (appended to <body>, outside the zoomed stage) and plays animations on events. */
function ClippyBrain({ at, scale }: { at: Rect; scale: number }) {
  /** 1 = normal sprite, 0.5 = compact — derived from the reserved slot's width. */
  const size = at.w / CLIPPY_FRAME.w;
  const { clippy } = useClippy();
  const [balloon, setBalloon] = useState<Balloon | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!clippy) return;
    const el = clippy._el;
    Object.assign(el.style, {
      position: 'fixed',
      left: `${at.x * scale}px`,
      top: `${at.y * scale}px`,
      right: 'auto',
      bottom: 'auto',
      transform: `scale(${scale * size})`,
      transformOrigin: 'top left',
      zIndex: '50',
      pointerEvents: 'none',
    });
    clippy.play('Greeting');
  }, [clippy, at.x, at.y, scale, size]);

  const show = (text: string, header?: string, animation?: string) => {
    seq.current += 1;
    setBalloon({ id: seq.current, text, ...(header ? { header } : {}), until: Date.now() + balloonMs(text) });
    if (clippy && animation) {
      clippy.stop();
      clippy.play(clippy.animations().includes(animation) ? animation : 'Explain');
    }
  };

  useStreamEvent((e) => {
    if (e.type === 'assistant:thinking')
      show('Hmm... deixa eu pensar.', `${e.asker} perguntou: ${e.question}`, 'Thinking');
    if (e.type === 'assistant:reply')
      show(e.reply.answer, `${e.reply.asker} perguntou: ${e.reply.question}`, e.reply.animation);
    if (e.type === 'assistant:say') show(e.text, undefined, e.animation);
  });

  useEffect(() => {
    if (!balloon) return;
    const t = setTimeout(() => setBalloon((b) => (b?.id === balloon.id ? null : b)), balloon.until - Date.now());
    return () => clearTimeout(t);
  }, [balloon]);

  if (!balloon) return null;
  return (
    <div
      className="s95-clippy-balloon s95-pop"
      style={{ right: Math.max(4, LOGICAL.w - at.x - at.w * 0.9), bottom: LOGICAL.h - at.y + 6 }}
    >
      {balloon.header && <div className="s95-clippy-q">{balloon.header}</div>}
      <div>{balloon.text}</div>
    </div>
  );
}

/** Clippy (or Merlin, Rover, Links...) living on the overlay, driven by the local assistant API. */
export function ClippyStage({ rect = { x: 820, y: 400, ...CLIPPY_FRAME } }: { rect?: Rect }) {
  const { settings } = useStream();
  const scale = Number(new URLSearchParams(location.search).get('scale') ?? UI_SCALE) || UI_SCALE;
  if (!settings.assistant.enabled) return null;
  return (
    <ClippyProvider agentName={settings.assistant.agent as AgentType}>
      <ClippyBrain at={rect} scale={scale} />
    </ClippyProvider>
  );
}
