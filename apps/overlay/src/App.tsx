import type { SceneId } from '@stream95/shared';
import { type ReactElement, useEffect } from 'react';
import { useStream } from './lib/stream';
import { applyTheme } from './lib/themes';
import { Home } from './pages/Home';
import {
  AlertsOverlay,
  AllOverlay,
  AudioOverlay,
  ChatOverlay,
  ClippyOverlay,
  PollOverlay,
  TaskbarOverlay,
} from './pages/Overlays';
import { SCENE_COMPONENTS } from './pages/Scenes';

const OVERLAYS: Record<string, () => ReactElement> = {
  chat: ChatOverlay,
  alerts: AlertsOverlay,
  clippy: ClippyOverlay,
  taskbar: TaskbarOverlay,
  poll: PollOverlay,
  all: AllOverlay,
  audio: AudioOverlay,
};

/** Page for a path. The control deck is its own app (apps/deck), served by the server at /dock/. */
export function route(pathname: string): () => ReactElement {
  const [, kind, name] = pathname.replace(/\/+$/, '').split('/');
  if (kind === 'overlay' && name && OVERLAYS[name]) return OVERLAYS[name];
  if (kind === 'scene' && name && name in SCENE_COMPONENTS) return SCENE_COMPONENTS[name as SceneId];
  return Home;
}

export function App() {
  const { settings } = useStream();
  const theme = settings.overlay.theme;
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const Page = route(location.pathname);
  return <Page />;
}
