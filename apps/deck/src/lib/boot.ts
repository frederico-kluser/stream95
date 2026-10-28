import { ApiError, api, type ErrorParts, splitError } from './api';
import { clearDeviceToken, currentToken, deviceName, isLocalHost, setDeviceToken, takePairCode } from './auth';

/** `ready`: show the deck. `pair`: this phone or tablet must be paired first (with the reason, if any). */
export type BootResult = { gate: 'ready' | 'pair'; pairError: ErrorParts | null };

/**
 * A scanned QR code the server refused (401). The server prints a fresh QR code in the terminal when
 * an expired or used one is tried, so that is where the phone should look.
 */
export const STALE_QR_ERROR: ErrorParts = {
  title: 'Esse QR code expirou ou já foi usado',
  fix: 'Escaneie o QR code mais recente no terminal do PC (ou em Config → Aparelhos, no painel do PC)',
};

/** Why pairing with the code from the QR code URL failed, in words for the pairing screen. */
export function qrPairError(err: unknown): ErrorParts {
  if (err instanceof ApiError && err.status === 401) return STALE_QR_ERROR;
  return splitError(err instanceof Error ? err.message : String(err));
}

/**
 * Decides what the deck shows first. The QR code URL carries `?pair=CODE`: it is traded for a device
 * token here. On this PC (localhost) no token is needed at all.
 */
export async function boot(): Promise<BootResult> {
  let pairError: ErrorParts | null = null;
  const code = takePairCode();
  if (code) {
    try {
      const r = await api<{ token: string }>('POST', '/api/devices/pair', { code, name: deviceName() });
      setDeviceToken(r.token);
    } catch (err) {
      pairError = qrPairError(err);
    }
  }
  if (isLocalHost()) return { gate: 'ready', pairError: null };
  if (!currentToken()) return { gate: 'pair', pairError };
  try {
    await api('GET', '/api/health');
    return { gate: 'ready', pairError: null };
  } catch (err) {
    if (err instanceof ApiError && err.needsPairing) {
      clearDeviceToken();
      return { gate: 'pair', pairError };
    }
    // the server is down or busy: open the deck, it reconnects on its own
    return { gate: 'ready', pairError: null };
  }
}

let started: Promise<BootResult> | null = null;

/** `boot()` once per page load: StrictMode runs effects twice, and a pairing code works only once. */
export function bootOnce(): Promise<BootResult> {
  started ??= boot();
  return started;
}
