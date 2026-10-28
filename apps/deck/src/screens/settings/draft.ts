import { useCallback, useState } from 'react';

/** JSON with object keys sorted, so two equal values always give the same key. */
export function stableKey(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : v,
  );
}

/**
 * Local edits over a value that lives on the server. The form follows the server while the user
 * has not touched it; after an edit it keeps the edit until saved or discarded. `toDraft` turns the
 * server value into form fields, `fromDraft` turns the fields back (used to compare and to save).
 */
export function useDraft<S, D>(source: S, toDraft: (s: S) => D, fromDraft: (d: D) => S) {
  const sourceKey = stableKey(source);
  const [state, setState] = useState(() => ({ draft: toDraft(source), baseKey: sourceKey }));
  let draft = state.draft;
  if (state.baseKey !== sourceKey) {
    // The server changed: follow it unless there are local edits.
    if (stableKey(fromDraft(state.draft)) === state.baseKey) draft = toDraft(source);
    setState({ draft, baseKey: sourceKey });
  }
  const dirty = stableKey(fromDraft(draft)) !== sourceKey;
  const update = useCallback((fn: (d: D) => D) => setState((s) => ({ ...s, draft: fn(s.draft) })), []);
  /** Back to the server value. */
  const reset = () => setState({ draft: toDraft(source), baseKey: sourceKey });
  /**
   * After a save: show what the server kept (it may have cleaned the input). The base stays until
   * the `settings` event brings the same value, so the form never flashes the old one.
   */
  const commit = (saved: S) => setState((s) => ({ ...s, draft: toDraft(saved) }));
  return { draft, update, dirty, reset, commit };
}

/** One entry per line, trimmed, without blanks or repeats (case-insensitive). */
export function parseLines(text: string, clean: (line: string) => string = (line) => line.trim()): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const value = clean(raw);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/** "https://www.GitHub.com/user?x" → "github.com" (the server ignores www. and matches subdomains). */
export function cleanDomain(line: string): string {
  return line
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

export const isDomain = (value: string): boolean => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value);
