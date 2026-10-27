import { useEffect, useState } from 'react';
import { useStreamEvent } from '../lib/stream';

export function BsodScreen({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="s95-bsod">
      <div className="s95-bsod-inner">
        <div className="s95-bsod-title"> {title} </div>
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
        <p className="s95-bsod-continue">
          Pressione qualquer tecla para continuar <span className="s95-blink">_</span>
        </p>
      </div>
    </div>
  );
}

/** The `!bsod` easter egg (mods) and dock button: a full blue screen for a few seconds. */
export function BsodLayer() {
  const [bsod, setBsod] = useState<{ title: string; message: string; at: number } | null>(null);
  useStreamEvent((e) => {
    if (e.type === 'bsod') setBsod({ title: e.title, message: e.message, at: Date.now() });
  });
  useEffect(() => {
    if (!bsod) return;
    const t = setTimeout(() => setBsod(null), 7000);
    return () => clearTimeout(t);
  }, [bsod]);
  if (!bsod) return null;
  return (
    <BsodScreen
      title={bsod.title}
      lines={[
        bsod.message,
        '* Pressione CTRL+ALT+DEL para reiniciar a live. Você vai perder todas as informações não salvas.',
      ]}
    />
  );
}
