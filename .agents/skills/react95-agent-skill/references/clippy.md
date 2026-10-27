# Clippy — `@react95/clippy` 2.2.3 (and `modern-clippy` 1.0.2 for comparison)

Verified against `packages/clippy/src/*` (commit `97bd045`), the published
`@react95/clippy@2.2.3` tarball, `clippyjs@0.1.0` (which it bundles) and the published
`modern-clippy@1.0.2` tarball.

## 1. `@react95/clippy`

A React context provider + hook around **clippyjs 0.1.0** (pi0's 2026 TypeScript-friendly
rewrite of Smore's Clippy.js — no jQuery). The published package **bundles** clippyjs and all
10 agents (animation data, sprite maps and mp3 sounds as separate chunks that are loaded with
dynamic `import()` only for the agent you choose). It is independent of `@react95/core`
(no CSS import needed).

```bash
npm i @react95/clippy        # peerDependencies: react >= 16.8.0
```

- Published `package.json`: `main: cjs/index.js`, `module: esm/index.mjs`,
  `types: types/index.d.ts`, **no `exports` map**. ~16 MB on disk per format (agent sprite
  maps are 0.9–2.5 MB each, loaded on demand).
- Exports: `ClippyProvider`, `useClippy`, `AGENTS`; types `AgentType`, `ClippyAgent`.

### ClippyProvider

| Prop        | Type                                                                                                                       | Default         | Notes                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------- |
| `agentName` | `AgentType` (`'Bonzi' \| 'Clippy' \| 'F1' \| 'Genie' \| 'Genius' \| 'Links' \| 'Merlin' \| 'Peedy' \| 'Rocky' \| 'Rover'`) | `AGENTS.CLIPPY` | Changing it plays `Hide` on the current agent, disposes it, then loads the new one. |
| `children`  | `ReactNode`                                                                                                                | —               |                                                                                     |

Lifecycle (from `ClippyProvider.tsx`): in `useEffect` → `initAgent(agentLoaders[agentName])`
→ `agent.show(false)` (plays `Show`; first position = 80% of the viewport width/height,
clamped) → context `{ clippy: agent }`. On unmount → `agent.dispose()` (removes its DOM and
listeners). Load errors are `console.error`ed. Every provider creates its **own** agent —
mount one provider near the root (Storybook mounts exactly one in a separate React root).

`AGENTS` = `{ BONZI: 'Bonzi', CLIPPY: 'Clippy', F1: 'F1', GENIE: 'Genie', GENIUS: 'Genius',
LINKS: 'Links', MERLIN: 'Merlin', PEEDY: 'Peedy', ROCKY: 'Rocky', ROVER: 'Rover' }`.

### useClippy

`useClippy(): { clippy: ClippyAgent | undefined }` — `undefined` until the agent has loaded
(asynchronously), and outside a provider. Always guard.

```tsx
import { useEffect } from 'react';
import { ClippyProvider, useClippy, AGENTS } from '@react95/clippy';
import { Button } from '@react95/core';

function Assistant() {
  const { clippy } = useClippy();

  useEffect(() => {
    if (!clippy) return;
    clippy.play('Wave');
    clippy.speak("It looks like you're writing a letter. Would you like help?");
  }, [clippy]);

  return (
    <Button disabled={!clippy} onClick={() => clippy?.animate()}>
      Animate
    </Button>
  );
}

export function App() {
  return (
    <ClippyProvider agentName={AGENTS.CLIPPY}>
      <Assistant />
    </ClippyProvider>
  );
}
```

### DOM, styling and built-in interaction

- The agent is a `div` appended to `document.body`: `position: fixed; z-index: 10001;
  cursor: pointer` (above every React95 layer). The speech balloon is another `div` on
  `body` with **inline** styles: `background #ffc`, 1px black border, 5px radius, 8px padding,
  z-index 10001; its content element has `max-width 200px; min-width 120px;
  font-family: "Microsoft Sans", sans-serif; font-size: 10pt`.
- To use the React95 font (what the repo's Storybook does in `withClippy.tsx`):

```ts
Object.assign(clippy._balloon._content.style, { fontFamily: "'MS Sans Serif', sans-serif", fontSize: '12px' });
```

(`_balloon`, `_content`, `_el` are internal but present in the published types; Storybook
also re-measures the balloon because clippyjs sizes it with rounded-down `offsetWidth`, which
can make the last word wrap and spill with MS Sans Serif.)
- `packages/clippy/src/style.ts` (classic `.clippy-balloon` CSS) is not imported anywhere —
  dead code; don't rely on `.clippy*` class names.
- Users can **drag** the agent (pauses it, hides the balloon); **double-click** plays
  `ClickedOn` if the agent has it, otherwise a random animation; window resize keeps it in view.
- Sounds: each agent plays mp3 frames when `audio.canPlayType('audio/mp3')` — subject to
  browser autoplay rules.
- SSR: all DOM work happens in effects, so server rendering doesn't crash; in Next.js App
  Router put the provider in a `'use client'` component (context + hooks).

### Agent API (`ClippyAgent` = clippyjs `Agent`)

All actions except `stop`/`stopCurrent`/`closeBalloon`/`pause`/`resume`/`reposition`/
`dispose`/queries are **queued** and run one after another; when the queue empties the agent
plays random `Idle*` animations. Parameters are typed `any` in the `.d.ts` (JS source).

| Method             | Signature (defaults)                                                | Behavior                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `show`             | `show(fast?: boolean): boolean`                                     | `fast`: display immediately and start idling; otherwise place at 80%/80% if not yet positioned and play `Show`.                                                                              |
| `hide`             | `hide(fast?: boolean, callback?: () => void): void`                 | Clears the queue; `fast` hides immediately, otherwise plays `Hide`; then `callback`.                                                                                                         |
| `play`             | `play(animation: string, timeout = 5000, cb?: () => void): boolean` | Queues an animation; `false` if it doesn't exist. Looping animations are told to exit after `timeout` ms (`0` = never); `cb` runs when it exits.                                             |
| `animate`          | `animate(): boolean`                                                | Plays a random non-`Idle` animation.                                                                                                                                                         |
| `animations`       | `animations(): string[]`                                            | All animation names of the agent.                                                                                                                                                            |
| `hasAnimation`     | `hasAnimation(name: string): boolean`                               |                                                                                                                                                                                              |
| `speak`            | `speak(text: string, hold?: boolean): void`                         | Queued balloon with a typewriter effect (200 ms per word); auto-closes 2 s after the last word. With `hold: true` it stays open **and the queue waits** until `stopCurrent()` (or `stop()`). |
| `closeBalloon`     | `closeBalloon(): void`                                              | Hides the balloon (after the 2 s delay) — does **not** release a held `speak`.                                                                                                               |
| `moveTo`           | `moveTo(x: number, y: number, duration = 1000): void`               | Queued; `left`/`top` in viewport px, clamped to a 5px margin; uses the agent's `Move<Dir>` animation if it has one (Clippy has none → plain tween); `0` jumps.                               |
| `gestureAt`        | `gestureAt(x: number, y: number): boolean`                          | Plays `Gesture<Dir>` (or `Look<Dir>`) toward the point; Dir ∈ Up/Down/Left/Right.                                                                                                            |
| `delay`            | `delay(ms = 250): void`                                             | Queued pause.                                                                                                                                                                                |
| `stopCurrent`      | `stopCurrent(): void`                                               | Exits the current animation and closes the balloon (releases a held speak).                                                                                                                  |
| `stop`             | `stop(): void`                                                      | Clears the queue, exits the animation, hides the balloon.                                                                                                                                    |
| `pause` / `resume` | `(): void`                                                          | Pause/resume animation and balloon timers.                                                                                                                                                   |
| `reposition`       | `(): void`                                                          | Pull the agent back into the viewport.                                                                                                                                                       |
| `dispose`          | `(): void`                                                          | Remove DOM + listeners (the provider calls it on unmount).                                                                                                                                   |

```ts
clippy.moveTo(window.innerWidth - 200, 120);
clippy.gestureAt(40, 40);
clippy.speak('Click the Start button to begin.', true); // stays until…
setTimeout(() => clippy.stopCurrent(), 5000); // …released here
clippy.play('Congratulate', 3000, () => console.log('done'));
```

### Animation names per agent (extracted from the bundled agent data)

- **Clippy (43):** Alert, CheckingSomething, Congratulate, EmptyTrash, Explain, GestureDown,
  GestureLeft, GestureRight, GestureUp, GetArtsy, GetAttention, GetTechy, GetWizardy, GoodBye,
  Greeting, Hearing_1, Hide, Idle1_1, IdleAtom, IdleEyeBrowRaise, IdleFingerTap,
  IdleHeadScratch, IdleRopePile, IdleSideToSide, IdleSnooze, LookDown, LookDownLeft,
  LookDownRight, LookLeft, LookRight, LookUp, LookUpLeft, LookUpRight, Print, Processing,
  RestPose, Save, Searching, SendMail, Show, Thinking, Wave, Writing.
- **Bonzi (73):** Acknowledge, Alert, Announce, Blink, Confused, Congratulate, Decline,
  DoMagic1, DoMagic2, DontRecognize, Explain, GestureDown, GestureLeft, GestureRight,
  GestureUp, GetAttention, GetAttention2, GetAttentionContinued, GetAttentionReturn, Greet,
  Hearing_1, Hearing_2, Hide, Idle1_1…Idle1_6, Idle2_1, Idle2_2, Idle3_1…Idle3_3, LookDown,
  LookDownReturn, LookLeft, LookLeftReturn, LookRight, LookRightReturn, LookUp, LookUpReturn,
  MoveDown, MoveDownReturn, MoveLeft, MoveLeftReturn, MoveRight, MoveRightReturn, MoveUp,
  MoveUpReturn, Pleased, Process, Processing, Read, ReadContinued, ReadReturn, Reading,
  RestPose, Sad, Search, Searching, Show, StartListening, StopListening, Suggest, Surprised,
  Think, Uncertain, Wave, Write, WriteContinued, WriteReturn, Writing.
- **F1 (48):** Alert, CheckingSomething, Congratulate, EmptyTrash, Explain, GestureDown,
  GestureLeft, GestureRight, GestureUp, GetArtsy, GetAttention, GetTechy, GetWizardy, Goodbye,
  Greeting, Hearing_1, Hide, Idle1_1, IdleBlink, IdleBlinkWithBrows, IdleCuteToeTwist,
  IdleFallsAsleep, IdleHeadPatting, IdleLeansAgainstWall, IdleLookDown, IdleLookLeft,
  IdleLookRight, IdleLooksAtUser, IdleLowersBrows, IdleLowersToGround, LookDown, LookDownLeft,
  LookDownRight, LookLeft, LookRight, LookUp, LookUpLeft, LookUpRight, Print, Processing,
  RestPose, Save, Searching, SendMail, Show, Thinking, Wave, Writing.
- **Genie (76):** Acknowledge, Alert, Announce, Blink, Confused, Congratulate, Congratulate_2,
  Decline, DoMagic1, DoMagic2, DontRecognize, Explain, GestureDown, GestureLeft, GestureRight,
  GestureUp, GetAttention, GetAttentionContinued, GetAttentionReturn, Greet, Hearing_1…
  Hearing_4, Hide, Idle1_1…Idle1_6, Idle2_1…Idle2_3, Idle3_1, Idle3_2, LookDown,
  LookDownBlink, LookDownReturn, LookLeft, LookLeftBlink, LookLeftReturn, LookRight,
  LookRightBlink, LookRightReturn, LookUp, LookUpBlink, LookUpReturn, MoveDown, MoveLeft,
  MoveRight, MoveUp, Pleased, Process, Processing, Read, ReadContinued, ReadReturn, Reading,
  RestPose, Sad, Search, Searching, Show, StartListening, StopListening, Suggest, Surprised,
  Think, Thinking, Uncertain, Wave, Write, WriteContinued, WriteReturn, Writing.
- **Genius (47):** Alert, CheckingSomething, Congratulate, DeepIdle1, EmptyTrash, Explain,
  GestureDown, GestureLeft, GestureRight, GestureUp, GetArtsy, GetAttention, GetTechy,
  GetWizardy, Goodbye, Greeting, Hearing_1, Hide, Idle0, Idle1, Idle1_1, Idle2…Idle9,
  LookDown, LookDownLeft, LookDownRight, LookLeft, LookRight, LookUp, LookUpLeft, LookUpRight,
  Print, Processing, RestPose, Save, Searching, SendMail, Show, Thinking, Wave, Writing.
- **Links (50):** Alert, CheckingSomething, Congratulate, DeepIdleA, DeepIdleE, EmptyTrash,
  Explain, GestureDown, GestureLeft, GestureRight, GestureUp, GetArtsy, GetAttention,
  GetTechy, GetWizardy, GoodBye, Greeting, Hearing_1, Hide, Idle1_1, IdleBlink, IdleButterFly,
  IdleCleaning, IdleLegLick, IdleScratch, IdleStretch, IdleTailWagA…IdleTailWagD, IdleTwitch,
  IdleYawn, LookDown, LookDownLeft, LookDownRight, LookLeft, LookRight, LookUp, LookUpLeft,
  LookUpRight, Print, Processing, RestPose, Save, Searching, SendMail, Show, Thinking, Wave,
  Writing.
- **Merlin (73):** Acknowledge, Alert, Announce, Blink, Confused, Congratulate, Congratulate_2,
  Decline, DoMagic1, DoMagic2, DontRecognize, Explain, GestureDown, GestureLeft, GestureRight,
  GestureUp, GetAttention, GetAttentionContinued, GetAttentionReturn, Greet, Hearing_1…
  Hearing_4, Hide, Idle1_1…Idle1_4, Idle2_1, Idle2_2, Idle3_1, Idle3_2, LookDown,
  LookDownBlink, LookDownReturn, LookLeft, LookLeftBlink, LookLeftReturn, LookRight,
  LookRightBlink, LookRightReturn, LookUp, LookUpBlink, LookUpReturn, MoveDown, MoveLeft,
  MoveRight, MoveUp, Pleased, Process, Processing, Read, ReadContinued, ReadReturn, Reading,
  RestPose, Sad, Search, Searching, Show, StartListening, StopListening, Suggest, Surprised,
  Think, Thinking, Uncertain, Wave, Write, WriteContinued, WriteReturn, Writing.
- **Peedy (85):** Acknowledge, Alert, Announce, Blink, Confused, Congratulate, Decline,
  DoMagic1, DoMagic2, DontRecognize, Explain, GestureDown, GestureLeft, GestureRight,
  GestureUp, GetAttention, GetAttentionContinued, GetAttentionReturn, Greet, Hearing_1…
  Hearing_3, Hide, Idle1_1…Idle1_5, Idle2_1, Idle2_2, Idle3_1…Idle3_3, LookDown, LookDownBlink,
  LookDownLeft, LookDownLeftBlink, LookDownLeftReturn, LookDownReturn, LookDownRight,
  LookDownRightBlink, LookDownRightReturn, LookLeft, LookLeftBlink, LookLeftReturn, LookRight,
  LookRightBlink, LookRightReturn, LookUp, LookUpBlink, LookUpLeft, LookUpLeftBlink,
  LookUpLeftReturn, LookUpReturn, LookUpRight, LookUpRightBlink, LookUpRightReturn, MoveDown,
  MoveLeft, MoveRight, MoveUp, Pleased, Process, Processing, Read, ReadContinued, ReadReturn,
  Reading, RestPose, Sad, Search, Searching, Show, StartListening, StopListening, Suggest,
  Surprised, Think, Thinking, Uncertain, Wave, Write, WriteContinued, WriteReturn, Writing.
- **Rocky (46):** Alert, CheckingSomething, Congratulate, DeepIdle1, EmptyTrash, Explain,
  GestureDown, GestureLeft, GestureRight, GestureUp, GetArtsy, GetAttention, GetTechy,
  GetWizardy, Goodbye, Greeting, Hearing_1, Hide, Idle(1)…Idle(9) (literal parentheses),
  Idle1_1, LookDown, LookDownLeft, LookDownRight, LookLeft, LookRight, LookUp, LookUpLeft,
  LookUpRight, Print, Processing, RestPose, Save, Searching, SendMail, Show, Thinking, Wave,
  Writing.
- **Rover (29):** Acknowledge, Books, Celebrity, CharacterSucceeds, ClickedOn, Congratulate,
  Cooking, Embarrassed, GestureLeft, GetAttention, GetAttentionMinor, Greet, Hide, HideQuick,
  Idle, ImageSearching, LookUp, LookUpLeft, Money, Pleased, RestPose, Searching, Shopping,
  Show, Sports, Surprised, Thinking, Travel, Writing.

Names differ between agents (`GoodBye` vs `Goodbye`, `Greeting` vs `Greet`) — call
`clippy.hasAnimation(name)` or check `play()`'s boolean when switching agents.

## 2. `modern-clippy` 1.0.2 (alternative, not part of React95)

npm `modern-clippy` (GitHub `vchaindz/modern-clippy`, MIT, last published 2024-10-30):
TypeScript, zero dependencies, ESM (`dist/modern-clippy.js`) + UMD (`dist/modern-clippy.umd.cjs`).
Exports: `initClippy`, `loadAgent`, class `ModernClippy`, and types `ClippyOptions`,
`AgentData`, `AnimationData`, `Frame`, `ImageMap`, `Position`.

### `initClippy(options?)`

```ts
interface ClippyOptions {
  basePath: string;
} // as declared in dist/index.d.ts (required if you pass an object)
function initClippy(options: ClippyOptions = { basePath: '' }): Promise<ModernClippy>;
```

1. Preloads `${basePath}/agents/Clippy/map.png` with `new Image()` — the promise **rejects** if
   the sprite can't load.
2. Builds the Clippy agent (124×93 frames) with **6 hard-coded animations**: `Idle`, `Wave`,
   `Thinking`, `Explain`, `GetAttention`, `Congratulate`.
3. Calls `show()` (appends to `document.body`, plays `Idle`) and resolves with the instance.

Assets: the sprite ships at `node_modules/modern-clippy/dist/agents/Clippy/map.png` (1.33 MB)
and must be served by **your** app at `${basePath}/agents/Clippy/map.png` — e.g. Vite: copy it
to `public/agents/Clippy/map.png` and keep `basePath: ''` (URL `/agents/Clippy/map.png`), or
to `public/clippy/agents/Clippy/map.png` with `basePath: '/clippy'`.
`loadAgent(_agentName, basePath = '')` is the same loader without `show()`; the agent name is
ignored (Clippy only).

### `ModernClippy` instance

| Member      | Signature (defaults)                                  | Behavior                                                                                                                                                                   |
| ----------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `container` | `HTMLElement`                                         | `div.clippy-agent`, inline `position: fixed; bottom: 20px; right: 20px; z-index: 1000`.                                                                                    |
| `show`      | `show(): void`                                        | Appends the container to `body`, plays `Idle`.                                                                                                                             |
| `hide`      | `hide(): void`                                        | `container.remove()` (no animation; also the only cleanup).                                                                                                                |
| `play`      | `play(animationName: string): Promise<void>`          | Unknown name → `console.error`, resolves. While another animation runs, queued (all built-ins except `Idle`); `Idle` interrupts. Resolves when its frames finish.          |
| `speak`     | `speak(text: string, duration = 3000): void`          | White bubble (1px black border, absolute `top: -60px; left: -100px`, max-width 200px) fades in, removed after `duration` + 300 ms. **Not queued** — several calls overlap. |
| `moveTo`    | `moveTo(x: number, y: number, duration = 1000): void` | `x`/`y` are the container's **right/bottom** offsets in px (not left/top), animated with WAAPI `ease-in-out`; `0` jumps.                                                   |

No sounds, no drag, no hold/close for bubbles, no other agents, no `dispose`.
`package.json` exports `"./style.css"` → `./dist/style.css`, but that file is **missing** from
the 1.0.2 tarball (importing it fails). The packaged `agents/Clippy/agent.json` (Idle, Wave
only) is not used by `initClippy`.

```tsx
import { useEffect, useRef } from 'react';
import { initClippy, type ModernClippy } from 'modern-clippy';

export function useModernClippy(basePath = '') {
  const ref = useRef<ModernClippy | null>(null);
  useEffect(() => {
    let cancelled = false;
    initClippy({ basePath }).then((clippy) => {
      if (cancelled) return clippy.hide();
      ref.current = clippy;
      clippy.play('Wave');
      clippy.speak('Hello from React!');
    });
    return () => {
      cancelled = true;
      ref.current?.hide();
      ref.current = null;
    };
  }, [basePath]);
  return ref;
}
```

## 3. Which one?

|                              | `@react95/clippy` 2.2.3                                                   | `modern-clippy` 1.0.2             |
| ---------------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| Integration                  | `ClippyProvider` + `useClippy()`                                          | imperative `initClippy()`         |
| Agents                       | 10 (Clippy, Bonzi, F1, Genie, Genius, Links, Merlin, Peedy, Rocky, Rover) | Clippy only                       |
| Animations                   | full sets (Clippy: 43)                                                    | 6                                 |
| Sounds / drag / double-click | yes / yes / yes                                                           | no / no / no                      |
| Speech                       | queued typewriter balloon, `hold`                                         | timed bubble, not queued          |
| Assets                       | bundled JS chunks, lazy per agent (no setup)                              | you must serve `map.png` yourself |
| Default position / z-index   | 80%/80% of viewport, 10001                                                | bottom-right 20px, 1000           |
| Footprint                    | ~16 MB package, ~1–2.8 MB fetched per agent (sprite map + data + sounds)  | ~1.36 MB package (sprite 1.33 MB) |
| Cleanup                      | automatic on provider unmount                                             | call `hide()`                     |

For a React95 app, prefer `@react95/clippy` (same org, used by the official Storybook).
