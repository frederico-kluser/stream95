import type { Notice } from '@/components/notify';
import { splitError } from '@/lib/api';

/** "assistente desligado" → "Assistente desligado". */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Shows the server's "Erro: … — Solução: …" message as a notice: what happened, then what to do. */
export function notifyError(notify: (notice: Notice) => void, err: unknown): void {
  const { title, fix } = splitError(errorText(err));
  notify({ tone: 'error', title: capitalize(title), ...(fix ? { description: capitalize(fix) } : {}) });
}
