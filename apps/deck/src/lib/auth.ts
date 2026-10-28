/**
 * Device pairing. On this PC (localhost) the deck needs no token. Phones and tablets on the local
 * network open the QR code URL (`/dock/?pair=CODE`), trade the one-time code for a device token and
 * keep it in localStorage. The token goes in the `x-stream95-token` header and in the WebSocket URL.
 */

const KEY = 'stream95.deviceToken';

export function getDeviceToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setDeviceToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // private mode: the token lives only for this page load
    memoryToken = token;
  }
}

export function clearDeviceToken(): void {
  memoryToken = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

let memoryToken: string | null = null;

export function currentToken(): string | null {
  return getDeviceToken() ?? memoryToken;
}

/** A readable name for the device list ("iPhone · Safari"), built from the user agent. */
export function deviceName(ua = navigator.userAgent): string {
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X/.test(ua)
            ? 'Mac'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Aparelho';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Navegador';
  return `${os} · ${browser}`;
}

/** Reads `?pair=CODE` from the URL (and removes it, so a reload does not retry a used code). */
export function takePairCode(): string | null {
  const url = new URL(location.href);
  const code = url.searchParams.get('pair');
  if (!code) return null;
  url.searchParams.delete('pair');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
  return code.trim().toUpperCase();
}

/** True when the page was opened on this PC (no pairing needed). */
export function isLocalHost(hostname = location.hostname): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}
