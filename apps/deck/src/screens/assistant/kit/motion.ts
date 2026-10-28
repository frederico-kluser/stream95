import { useReducedMotion } from 'motion/react';
import { useMotionUITheme, useMotionUITransition } from '@/components/motion-ui/ui-theme';

/**
 * Enter animation for content that shows up after a choice or an action (an answer, a set of
 * fields), on the theme's `ui` token. Reduced motion keeps the fade and drops the travel.
 */
export function useReveal() {
  const reduced = useReducedMotion();
  const { reducedMotion, travel } = useMotionUITheme();
  const ui = useMotionUITransition('ui');
  if (reduced && reducedMotion === 'off') return { initial: false as const };
  if (reduced) return { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: ui };
  return { initial: { opacity: 0, y: travel.hover * 2 }, animate: { opacity: 1, y: 0 }, transition: ui };
}

/** Whether shared-layout slides (selection pills, list reflow) should move. */
export function useTravel(): boolean {
  const reduced = useReducedMotion();
  return !reduced;
}
