import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyButton } from '@/components/copy-button';
import { CopyButton as VendorCopyButton } from '@/components/motion-ui/copy-button';
import { copyText, installClipboardFallback } from '@/lib/clipboard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Without `animate`, Motion runs its own JS animations (happy-dom's Web Animations reject on cancel).
vi.hoisted(() => Reflect.deleteProperty(Element.prototype, 'animate'));

type WriteText = (text: string) => Promise<void>;

/** navigator.clipboard as the page sees it: `undefined` on plain-HTTP LAN addresses. */
function setClipboard(writeText: WriteText | undefined): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  });
}

/** document.execCommand('copy') answering `result` (and recording what was selected). */
function setExecCommand(result: boolean | 'throws') {
  const copied: string[] = [];
  const exec = vi.fn((command: string) => {
    if (result === 'throws') throw new Error('blocked');
    const area = document.activeElement;
    if (command === 'copy' && area instanceof HTMLTextAreaElement) copied.push(area.value);
    return result;
  });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: exec });
  return { exec, copied };
}

beforeEach(() => {
  vi.stubGlobal('isSecureContext', true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(document, 'execCommand');
});

describe('copyText', () => {
  it('uses the clipboard API when the page has it', async () => {
    const writeText = vi.fn<WriteText>(async () => {});
    setClipboard(writeText);
    const { exec } = setExecCommand(true);
    await expect(copyText('npm run sfx:pack')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('npm run sfx:pack');
    expect(exec).not.toHaveBeenCalled();
  });

  it('falls back to a hidden textarea on plain-HTTP pages (no navigator.clipboard)', async () => {
    setClipboard(undefined);
    const { exec, copied } = setExecCommand(true);
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    await expect(copyText('K7M2Q9XA')).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
    expect(copied).toEqual(['K7M2Q9XA']);
    // the helper textarea is gone and the focus is back where it was
    expect(document.querySelector('textarea')).toBeNull();
    expect(document.activeElement).toBe(before);
    before.remove();
  });

  it('copies synchronously on the fallback path, while the tap still counts', () => {
    setClipboard(undefined);
    const { exec } = setExecCommand(true);
    void copyText('x');
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('does not trust the clipboard API outside a secure context', async () => {
    vi.stubGlobal('isSecureContext', false);
    const writeText = vi.fn<WriteText>(async () => {});
    setClipboard(writeText);
    const { exec } = setExecCommand(true);
    await expect(copyText('x')).resolves.toBe(true);
    expect(writeText).not.toHaveBeenCalled();
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('tries the old way when the clipboard API refuses', async () => {
    setClipboard(async () => {
      throw new DOMException('Document is not focused.', 'NotAllowedError');
    });
    const { exec } = setExecCommand(true);
    await expect(copyText('x')).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('reports failure when nothing could copy', async () => {
    setClipboard(undefined);
    setExecCommand(false);
    await expect(copyText('x')).resolves.toBe(false);
    setExecCommand('throws');
    await expect(copyText('x')).resolves.toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });
});

describe('installClipboardFallback', () => {
  let root: Root | null = null;
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host.remove();
  });

  it('gives plain-HTTP pages a writeText that really copies', async () => {
    setClipboard(undefined);
    const { copied } = setExecCommand(true);
    installClipboardFallback();
    await expect(navigator.clipboard.writeText('K7M2Q9XA')).resolves.toBeUndefined();
    expect(copied).toEqual(['K7M2Q9XA']);
  });

  it('rejects when the browser did not copy', async () => {
    setClipboard(undefined);
    setExecCommand(false);
    installClipboardFallback();
    await expect(navigator.clipboard.writeText('x')).rejects.toThrow();
  });

  it('keeps the real Clipboard API where the page has it', () => {
    const writeText = vi.fn<WriteText>(async () => {});
    setClipboard(writeText);
    installClipboardFallback();
    expect(navigator.clipboard.writeText).toBe(writeText);
  });

  it('makes the Motion UI CopyButton copy for real on plain-HTTP pages', async () => {
    setClipboard(undefined);
    const { copied } = setExecCommand(true);
    installClipboardFallback();
    root = createRoot(host);
    act(() =>
      root?.render(
        <VendorCopyButton value="http://192.168.0.50:1995/dock/" label="Copiar endereço" copiedLabel="Endereço copiado">
          Copiar
        </VendorCopyButton>,
      ),
    );
    await act(async () => host.querySelector('button')?.click());
    expect(copied).toEqual(['http://192.168.0.50:1995/dock/']);
  });
});

describe('CopyButton', () => {
  let root: Root | null = null;
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host.remove();
  });

  function render(onCopy = vi.fn()) {
    root = createRoot(host);
    act(() =>
      root?.render(
        <CopyButton
          value="K7M2Q9XA"
          label="Copiar código"
          copiedLabel="Código copiado"
          copiedText="Copiado"
          onCopy={onCopy}
        >
          Copiar
        </CopyButton>,
      ),
    );
    const button = host.querySelector('button');
    if (!button) throw new Error('no button');
    return { button, onCopy };
  }

  it('confirms only a copy that happened', async () => {
    setClipboard(undefined);
    setExecCommand(true);
    const { button, onCopy } = render();
    expect(button.getAttribute('aria-label')).toBe('Copiar código');
    await act(async () => button.click());
    expect(button.getAttribute('aria-label')).toBe('Código copiado');
    expect(button.textContent).toContain('Copiado');
    expect(onCopy).toHaveBeenCalledWith('K7M2Q9XA');
  });

  it('says it did not copy, and how to copy by hand, when the browser refuses', async () => {
    setClipboard(undefined);
    setExecCommand(false);
    const { button, onCopy } = render();
    await act(async () => button.click());
    expect(button.getAttribute('aria-label')).toMatch(/^Não copiou: /);
    expect(button.textContent).toContain('Não copiou');
    expect(button.textContent).not.toContain('Copiado');
    expect(host.querySelector('[aria-live]')?.textContent).toMatch(/^Não copiou: /);
    expect(onCopy).not.toHaveBeenCalled();
  });

  it('goes back to rest after the confirmation', async () => {
    vi.useFakeTimers();
    try {
      setClipboard(async () => {});
      const { button } = render();
      await act(async () => button.click());
      expect(button.getAttribute('aria-label')).toBe('Código copiado');
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      expect(button.getAttribute('aria-label')).toBe('Copiar código');
    } finally {
      vi.useRealTimers();
    }
  });
});
