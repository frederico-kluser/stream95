import { Button } from '@react95/core';
import { CLIPPY_FRAME, type TtsItem } from '@stream95/shared';
import { useEffect, useRef, useState } from 'react';
import { AlertStage } from '../components/AlertStage';
import { BsodLayer } from '../components/Bsod';
import { ChatWindow } from '../components/ChatLog';
import { ClippyStage } from '../components/ClippyStage';
import { Stage } from '../components/Stage';
import { Taskbar } from '../components/Taskbar';
import { ToastLayer } from '../components/Toasts';
import { PollWindow } from '../components/Widgets';
import { audioContext, playJingle } from '../lib/sound';
import { getClient, useStream, useStreamEvent } from '../lib/stream';

const q = () => new URLSearchParams(location.search);
const num = (key: string, fallback: number) => Number(q().get(key)) || fallback;

/** Chat only. Query params x, y, w, h (logical px) position the window. */
export function ChatOverlay() {
  return (
    <Stage>
      <ChatWindow rect={{ x: num('x', 8), y: num('y', 8), w: num('w', 320), h: num('h', 520) }} />
    </Stage>
  );
}

export function AlertsOverlay() {
  return (
    <Stage>
      <AlertStage />
      <BsodLayer />
      <ToastLayer bottom={8} />
    </Stage>
  );
}

export function ClippyOverlay() {
  return (
    <Stage>
      <ClippyStage rect={{ x: num('x', 820), y: num('y', 420), ...CLIPPY_FRAME }} />
    </Stage>
  );
}

export function TaskbarOverlay() {
  return (
    <Stage>
      <Taskbar />
      <ToastLayer />
    </Stage>
  );
}

export function PollOverlay() {
  return (
    <Stage>
      <PollWindow rect={{ x: num('x', 8), y: num('y', 8), w: num('w', 330), h: num('h', 170) }} />
    </Stage>
  );
}

/** Everything that floats (chat, alerts, Clippy, taskbar, toasts, poll) in one browser source. */
export function AllOverlay() {
  return (
    <Stage>
      <ChatWindow rect={{ x: 632, y: 24, w: 316, h: 300 }} />
      <PollWindow rect={{ x: 8, y: 8, w: 330, h: 170 }} />
      <Taskbar />
      <ClippyStage rect={{ x: 820, y: 360, ...CLIPPY_FRAME }} />
      <ToastLayer />
      <AlertStage />
      <BsodLayer />
    </Stage>
  );
}

/**
 * The ONLY page that makes sound: TTS queue + alert jingles. Add it once to OBS
 * (with "Control audio via OBS") so audio never plays twice.
 */
export function AudioOverlay() {
  const { settings, connected } = useStream();
  const queue = useRef<TtsItem[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playing = useRef(false);
  const [now, setNow] = useState<TtsItem | null>(null);
  const [blocked, setBlocked] = useState(false);
  const volume = settings.tts.volume;

  const playNext = () => {
    const item = queue.current.shift();
    if (!item) {
      playing.current = false;
      setNow(null);
      return;
    }
    playing.current = true;
    setNow(item);
    const audio = new Audio(item.url);
    audio.volume = volume;
    audioRef.current = audio;
    const done = () => {
      getClient().send({ type: 'tts:done', id: item.id });
      playNext();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(() => {
      setBlocked(true);
      queue.current.unshift(item);
      playing.current = false;
    });
  };

  useStreamEvent((e) => {
    if (e.type === 'tts:play') {
      queue.current.push(e.item);
      if (!playing.current) playNext();
    }
    if (e.type === 'tts:skip') {
      audioRef.current?.pause();
      if (audioRef.current) {
        const item = now;
        if (item) getClient().send({ type: 'tts:done', id: item.id });
      }
      playNext();
    }
    if (e.type === 'alert' && settings.alerts.sound) playJingle(e.alert.kind);
    if (e.type === 'bsod' && settings.alerts.sound) playJingle('bsod');
  });

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const unlock = () => {
    void audioContext().resume();
    setBlocked(false);
    if (!playing.current) playNext();
  };

  // On stream this source must be invisible: the status line only shows with ?debug.
  const debug = q().has('debug');
  return (
    <div className="s95-audio-page">
      {debug && (
        <div>
          stream95 · áudio {connected ? '● conectado' : '○ desconectado'} ·{' '}
          {now ? `falando: ${now.text}` : 'aguardando'}
        </div>
      )}
      {blocked && (
        <Button onClick={unlock}>
          Clique para liberar o áudio (o navegador bloqueou o autoplay — no OBS isso não acontece)
        </Button>
      )}
    </div>
  );
}
