import '@react95/core/themes/win95.css';
import { contract, tokens } from '@react95/core';
import { setElementVars } from '@vanilla-extract/dynamic';

// win95.css paints the first frame; any other theme is applied at runtime as
// inline CSS variables on <html> (they win over the :root stylesheet). This is the
// same approach React95's own Storybook uses — no page reload, no second stylesheet.
type ThemeTokens = (typeof tokens)['win95'];

export const THEME_NAMES = Object.keys(tokens);

export function applyTheme(name: string): void {
  const all = tokens as unknown as Record<string, ThemeTokens>;
  setElementVars(document.documentElement, contract, all[name] ?? tokens.win95);
}
