import { QrCode, RefreshCw, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, type ErrorParts, splitError } from '@/lib/api';
import { deviceName, setDeviceToken } from '@/lib/auth';
import { getClient } from '@/lib/store';

/** Codes are 8 letters and digits; people type them with spaces, dashes or lowercase. */
const cleanCode = (raw: string) => raw.replace(/[\s-]/g, '').toUpperCase();

/** What went wrong and what to do, as two lines. */
function Problem({ error }: { error: ErrorParts }) {
  return (
    <>
      <span className="block font-medium">{error.title}</span>
      {error.fix && <span className="block text-muted-foreground">{error.fix}</span>}
    </>
  );
}

/**
 * Shown on a phone or tablet that is not paired yet (the server answered 401). Pairing happens by
 * scanning the QR code printed in the terminal (or shown on the PC deck), or by typing the code.
 * `initialError` says why the QR code just scanned did not work.
 */
export function PairingScreen({
  onPaired,
  removed = false,
  initialError = null,
}: {
  onPaired: () => void;
  removed?: boolean;
  initialError?: ErrorParts | null;
}) {
  const [code, setCode] = useState('');
  const ready = cleanCode(code).length === 8;
  const [qrError, setQrError] = useState(initialError);
  const [error, setError] = useState<ErrorParts | null>(null);
  const [busy, setBusy] = useState(false);

  const pair = async () => {
    setBusy(true);
    setError(null);
    setQrError(null);
    try {
      const r = await api<{ token: string }>('POST', '/api/devices/pair', {
        code: cleanCode(code),
        name: deviceName(),
      });
      setDeviceToken(r.token);
      getClient().reconnect();
      onPaired();
    } catch (err) {
      setError(splitError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 pt-safe pb-safe">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-brand/15 text-brand">
        <Smartphone className="size-6" aria-hidden />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-balance">Conecte este aparelho ao stream95</h1>
        {removed && (
          <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            Este aparelho foi desconectado no PC. Para voltar a usar o painel aqui, conecte de novo.
          </p>
        )}
        {qrError && (
          <p role="alert" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <Problem error={qrError} />
          </p>
        )}
        <p className="text-muted-foreground">
          Escaneie o QR code que aparece no terminal do PC (ou em Config → Aparelhos, no painel do PC). Se preferir,
          digite o código de 8 letras e números.
        </p>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !busy) void pair();
        }}
      >
        <label htmlFor="pair-code" className="text-sm font-medium">
          Código de pareamento
        </label>
        <Input
          id="pair-code"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="one-time-code"
          placeholder="ex.: K7M2Q9XA"
          maxLength={12}
          aria-describedby="pair-code-help"
          aria-invalid={error ? true : undefined}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="h-12 text-center font-mono text-lg tracking-[0.3em] uppercase"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            <Problem error={error} />
          </p>
        )}
        <p id="pair-code-help" className="text-xs text-muted-foreground">
          8 caracteres. Maiúsculas, espaços e traços não importam.
        </p>
        <Button type="submit" size="lg" disabled={busy || !ready} className="h-12">
          {busy ? <RefreshCw className="size-4 animate-spin" aria-hidden /> : <QrCode className="size-4" aria-hidden />}
          Conectar
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        O código vale por 10 minutos. Depois de conectado, este aparelho continua liberado até você removê-lo em Config.
      </p>
    </main>
  );
}
