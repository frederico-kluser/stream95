import { type AgentType, ClippyProvider, useClippy } from '@react95/clippy';
import { CLIPPY_FRAME, LOGICAL, type Rect, UI_SCALE } from '@stream95/shared';
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AgentActivity, chatReaction, REACTION_TIMEOUT_MS } from '../lib/agent-reactions';
import { useStream, useStreamEvent } from '../lib/stream';

type Balloon = { id: number; header?: string; text: string; until: number };

type Agent = NonNullable<ReturnType<typeof useClippy>['clippy']>;

/** What the assistant events need from the animated agent; null while it is hidden or loading. */
type AgentHandle = { act: (animation: string) => void };

/** Reading time on stream: ~14 chars/s, between 4 and 16 seconds. */
export const balloonMs = (text: string) => Math.min(16_000, Math.max(4_000, (text.length / 14) * 1000 + 1500));

/**
 * Mutes the agent's own sound effects. Scene sources stay loaded and play straight to the PC's
 * output, so each copy of the agent would add its sounds to the stream: only the audio page makes sound.
 */
function silence(agent: Agent): void {
  // Private clippy.js fields: if an update moves them, the scene keeps running.
  for (const sound of Object.values(agent._animator?._sounds ?? {})) {
    sound.muted = true;
    sound.pause(); // the Show animation may have started one already
  }
}

/** Plays an animation and keeps the agent busy until it ends (or the safety window passes). */
function playTracked(agent: Agent, activity: AgentActivity, name: string, timeoutMs?: number): void {
  const token = activity.begin(Date.now());
  if (!agent.play(name, timeoutMs, () => activity.end(token))) activity.end(token);
}

/** Places the clippy.js agent (appended to <body>, outside the zoomed stage) and animates it. */
function ClippyBrain({
  at,
  scale,
  handle,
  reactToChat,
}: {
  at: Rect;
  scale: number;
  handle: RefObject<AgentHandle | null>;
  reactToChat: boolean;
}) {
  /** 1 = normal sprite, 0.5 = compact — derived from the reserved slot's width. */
  const size = at.w / CLIPPY_FRAME.w;
  const { clippy } = useClippy();
  const [activity] = useState(() => new AgentActivity());
  const lastReaction = useRef<string | null>(null);

  // A layout effect: muted in the same commit that hands us the agent, before any animation of ours.
  useLayoutEffect(() => {
    if (clippy) silence(clippy);
  }, [clippy]);

  useEffect(() => {
    if (!clippy) return;
    Object.assign(clippy._el.style, {
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
    playTracked(clippy, activity, 'Greeting');
  }, [clippy, activity, at.x, at.y, scale, size]);

  // Assistant answers interrupt anything; unknown animations fall back to Explain.
  useEffect(() => {
    if (!clippy) return;
    handle.current = {
      act: (animation) => {
        clippy.stop();
        const name = (clippy.animations() as string[]).includes(animation) ? animation : 'Explain';
        playTracked(clippy, activity, name);
      },
    };
    return () => {
      handle.current = null;
    };
  }, [clippy, activity, handle]);

  // Watchdog: an animation of ours that outlives the safety window is told to finish.
  useEffect(() => {
    if (!clippy) return;
    const timer = setInterval(() => {
      if (activity.takeOverdue(Date.now())) clippy.stopCurrent();
    }, 1_000);
    return () => clearInterval(timer);
  }, [clippy, activity]);

  // Chat reactions only start when none of our animations runs: they never cut one short.
  useStreamEvent((e) => {
    if (e.type !== 'chat:show' || !clippy || !reactToChat) return;
    const name = chatReaction({
      message: e.message,
      busy: activity.isBusy(Date.now()),
      available: clippy.animations() as string[],
      last: lastReaction.current,
    });
    if (!name) return;
    lastReaction.current = name;
    // Free means idling: wrap up the idle fidget so the reaction shows while the message is fresh
    // (and starts inside its own clippy.js timeout).
    clippy.stopCurrent();
    playTracked(clippy, activity, name, REACTION_TIMEOUT_MS);
  });

  return null;
}

/** Answer balloons from the assistant events; `animate` moves the agent when it is on screen. */
function useAssistantBalloon(animate: (animation: string) => void): Balloon | null {
  const [balloon, setBalloon] = useState<Balloon | null>(null);
  const seq = useRef(0);

  const show = (text: string, header: string | undefined, animation: string) => {
    seq.current += 1;
    setBalloon({ id: seq.current, text, ...(header ? { header } : {}), until: Date.now() + balloonMs(text) });
    if (animation) animate(animation);
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

  return balloon;
}

/** Above the agent, pointing at it; with the agent hidden, in its place and without the tail. */
function ClippyBalloon({ at, balloon, solo }: { at: Rect; balloon: Balloon; solo: boolean }) {
  const style = solo
    ? { right: Math.max(4, LOGICAL.w - at.x - at.w), bottom: LOGICAL.h - at.y - at.h }
    : { right: Math.max(4, LOGICAL.w - at.x - at.w * 0.9), bottom: LOGICAL.h - at.y + 6 };
  return (
    <div className={`s95-clippy-balloon s95-pop${solo ? ' s95-clippy-balloon-solo' : ''}`} style={style}>
      {balloon.header && <div className="s95-clippy-q">{balloon.header}</div>}
      <div>{balloon.text}</div>
    </div>
  );
}

/**
 * Clippy (or Merlin, Rover, Links...) living on the overlay, driven by the local assistant API.
 * `showAgent: false` keeps the answers on screen without the animated agent.
 */
export function ClippyStage({ rect = { x: 820, y: 400, ...CLIPPY_FRAME } }: { rect?: Rect }) {
  const { settings } = useStream();
  const agent = useRef<AgentHandle | null>(null);
  const balloon = useAssistantBalloon((animation) => agent.current?.act(animation));
  const scale = Number(new URLSearchParams(location.search).get('scale') ?? UI_SCALE) || UI_SCALE;
  const assistant = settings.assistant;
  if (!assistant.enabled) return null;
  // Settings from an older server lack these flags: keep the agent on screen and reacting.
  const showAgent = assistant.showAgent !== false;
  return (
    <>
      {showAgent && (
        <ClippyProvider agentName={assistant.agent as AgentType}>
          <ClippyBrain at={rect} scale={scale} handle={agent} reactToChat={assistant.reactToChat !== false} />
        </ClippyProvider>
      )}
      {balloon && <ClippyBalloon key={balloon.id} at={rect} balloon={balloon} solo={!showAgent} />}
    </>
  );
}
