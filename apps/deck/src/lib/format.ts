export const pct = (n: number): string => `${Math.round(n * 100)}%`;

export const usd = (n: number): string => `US$ ${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`;

/** 125000 → "2:05" */
export function mmss(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Short relative time in Portuguese: "agora", "há 12 s", "há 3 min", "há 2 h". */
export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return 'agora';
  if (s < 60) return `há ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  return `há ${Math.round(m / 60)} h`;
}

/** 1830 → "1,8 s"; 450 → "0,5 s" */
export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}
