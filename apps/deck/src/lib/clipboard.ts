/**
 * Copies text and says whether it really worked.
 *
 * Phones open the deck at http://<PC IP>:1995, which is not a secure context: there the browser has
 * no `navigator.clipboard` (only the stand-in of `installClipboardFallback`). Then the text goes
 * through a hidden textarea and `document.execCommand('copy')`, which browsers still allow during a
 * tap. Call this straight from the click handler: on that path nothing is awaited before the copy,
 * so the tap still counts.
 */
export async function copyText(text: string): Promise<boolean> {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (clipboard?.writeText && globalThis.isSecureContext !== false) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // denied (unfocused document, permissions policy): try the old way below
    }
  }
  return legacyCopy(text);
}

/** `execCommand('copy')` on a hidden, read-only textarea. True only when the browser says it copied. */
export function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function' || !document.body) return false;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const area = document.createElement('textarea');
  area.value = text;
  // read-only: no keyboard on phones; 16 px: iOS does not zoom; fixed at the top: the page does not scroll
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.tabIndex = -1;
  Object.assign(area.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '1px',
    height: '1px',
    padding: '0',
    border: '0',
    margin: '0',
    opacity: '0',
    fontSize: '16px',
    pointerEvents: 'none',
  });
  document.body.appendChild(area);
  let copied = false;
  try {
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, text.length);
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    area.remove();
    active?.focus({ preventScroll: true });
  }
  return copied;
}

/**
 * Where the browser has no Clipboard API (the plain-HTTP address phones use), adds a
 * `navigator.clipboard.writeText` that copies with `legacyCopy` and rejects when nothing was copied.
 * Code that calls the API itself, like the Motion UI CopyButton, then copies for real there too.
 */
export function installClipboardFallback(): void {
  if (typeof navigator === 'undefined' || navigator.clipboard) return;
  const writeText = (text: string): Promise<void> =>
    legacyCopy(String(text)) ? Promise.resolve() : Promise.reject(new DOMException('Copy failed', 'NotAllowedError'));
  try {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, enumerable: true, value: { writeText } });
  } catch {
    // a locked navigator: copy buttons keep working where the real API exists
  }
}
