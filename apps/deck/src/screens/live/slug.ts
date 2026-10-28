/** Max id length the server keeps for a counter (it is also the chat command: `!id`). */
export const COUNTER_ID_MAX = 20;

/** Counter id from its label, cleaned the way the server does: "Cafés tomados" → "cafes_tomados". */
export function counterSlug(label: string): string {
  return label
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, COUNTER_ID_MAX)
    .replace(/_+$/, '');
}

/** Adds _2, _3… when the id is taken, so creating a counter never renames an existing one. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!base || !taken.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const suffix = `_${n}`;
    const id = `${base.slice(0, COUNTER_ID_MAX - suffix.length)}${suffix}`;
    if (!taken.has(id)) return id;
  }
  return base;
}
