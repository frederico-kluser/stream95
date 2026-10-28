import { currentToken } from './auth';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** API failure with the server's "Erro: … — Solução: …" message. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }

  /** The server refused this device: it has to be paired again. */
  get needsPairing(): boolean {
    return this.status === 401;
  }
}

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/**
 * Calls the local server. Writes always carry `x-stream95: 1` (CSRF guard) and, on a paired
 * device, the `x-stream95-token`. Bodies are JSON, except FormData uploads.
 */
export async function api<T = unknown>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'x-stream95': '1' };
  const token = currentToken();
  if (token) headers['x-stream95-token'] = token;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  } else if (method !== 'GET' && method !== 'DELETE') {
    headers['content-type'] = 'application/json';
    payload = '{}';
  }
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: payload });
  } catch {
    throw new ApiError('Erro: sem conexão com o servidor — Solução: confira se o stream95 está rodando no PC', 0);
  }
  const text = await res.text();
  const data = text ? parse(text) : null;
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `Erro: o servidor respondeu ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

/** A failure as the deck shows it: what happened, then what to do. */
export type ErrorParts = { title: string; fix?: string };

const upperFirst = (text: string): string => text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);

/**
 * Splits "Erro: x — Solução: y" for display; plain text stays as the title. Both parts start with a
 * capital letter, like every other notice ("sem conexão…" becomes "Sem conexão…").
 */
export function splitError(message: string): ErrorParts {
  const m = /^Erro:\s*(.*?)\s*—\s*Solução:\s*(.*)$/s.exec(message);
  if (!m) return { title: upperFirst(message.replace(/^Erro:\s*/, '')) };
  return { title: upperFirst(m[1] ?? message), ...(m[2] ? { fix: upperFirst(m[2]) } : {}) };
}
