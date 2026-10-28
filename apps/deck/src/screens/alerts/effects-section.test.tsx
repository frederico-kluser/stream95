import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotionUIThemeProvider } from '@/components/motion-ui/ui-theme';
import { type DeckState, initialState } from '@/lib/store';
import motionTheme from '../../../motion.theme';
import { EffectsSection } from './effects-section';

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

describe('Efeitos', () => {
  it('calls the full-screen effect “tela de erro”, with no Windows names', () => {
    mocks.state = { ...initialState(), connection: 'online' };
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root?.render(
        <MotionUIThemeProvider theme={motionTheme}>
          <EffectsSection />
        </MotionUIThemeProvider>,
      );
    });
    const text = host.textContent ?? '';
    expect(text).toContain('Tela de erro');
    expect(text).toContain('Mensagem da tela de erro');
    expect(text).toContain('Segure para mostrar a tela de erro na live');
    expect(text).not.toMatch(/tela azul|windows|microsoft/i);
  });
});
