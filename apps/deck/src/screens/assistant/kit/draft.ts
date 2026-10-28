import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';

// The tabs unmount the screens they hide: drafts live here so a half-typed form survives a tab switch.
const drafts = new Map<string, unknown>();

/** `useState` that keeps its value while the screen is hidden (until the page reloads). */
export function useDraft<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (drafts.has(key)) return drafts.get(key) as T;
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  useEffect(() => {
    drafts.set(key, value);
  }, [key, value]);
  return [value, setValue];
}
