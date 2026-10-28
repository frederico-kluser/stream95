import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotionUIThemeProvider } from '@/components/motion-ui/ui-theme';
import { type DeckState, initialState } from '@/lib/store';
import motionTheme from '../../../motion.theme';
import { OnScreenSection } from './on-screen-section';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// happy-dom's Web Animations reject `finished` when Motion cancels them; without `animate`, Motion
// runs its own JS animations and the test output stays clean.
vi.hoisted(() => Reflect.deleteProperty(Element.prototype, 'animate'));

const mocks = vi.hoisted(() => ({ state: null as unknown as DeckState }));

vi.mock('@/lib/store', async (original) => ({
  ...(await original<typeof import('@/lib/store')>()),
  useDeck: () => mocks.state,
}));

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

describe('Na tela', () => {
  it('names the chat command by its neutral alias', () => {
    mocks.state = { ...initialState(), connection: 'online' };
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root?.render(
        <MotionUIThemeProvider theme={motionTheme}>
          <OnScreenSection />
        </MotionUIThemeProvider>,
      );
    });
    const text = host.textContent ?? '';
    expect(text).toContain('Responde a quem usa !pergunta no chat e às perguntas feitas aqui.');
    expect(text).not.toMatch(/!clippy|windows|microsoft|office/i);
  });
});
