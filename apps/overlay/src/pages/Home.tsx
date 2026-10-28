import { Button, Fieldset, Frame } from '@react95/core';
import { Computer } from '@react95/icons/Computer';
import { Mplayer10 } from '@react95/icons/Mplayer10';
import { CANVAS, SCENES, toReal } from '@stream95/shared';
import { useState } from 'react';
import { useStream } from '../lib/stream';

type Entry = { path: string; title: string; size: string; note: string };

const OVERLAYS: Entry[] = [
  {
    path: '/overlay/audio',
    title: 'Áudio (voz, jingles e sons)',
    size: '400x60',
    note: 'Toca a voz, os jingles e os sons do painel. Adicione UMA vez em todas as cenas, com "Controlar áudio via OBS".',
  },
  {
    path: '/overlay/all',
    title: 'Tudo flutuante',
    size: '1920x1080',
    note: 'Chat, enquete, barra, Clippy, balões e alertas numa fonte só.',
  },
  {
    path: '/overlay/chat',
    title: 'Só o chat',
    size: '1920x1080',
    note: 'Posicione com ?x=&y=&w=&h= (px lógicos, 960x540).',
  },
  { path: '/overlay/alerts', title: 'Só alertas', size: '1920x1080', note: 'Diálogos, tela azul e balões.' },
  { path: '/overlay/clippy', title: 'Só o Clippy', size: '1920x1080', note: 'Posição com ?x=&y=.' },
  {
    path: '/overlay/taskbar',
    title: 'Barra de tarefas',
    size: '1920x1080',
    note: 'Iniciar, ticker do GitHub, pomodoro, contadores e relógio.',
  },
  { path: '/overlay/poll', title: 'Enquete', size: '1920x1080', note: 'Aparece só quando há enquete.' },
];

function CopyUrl({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${location.origin}${path}`;
  return (
    <span className="s95-url">
      <a href={path} target="_blank" rel="noreferrer">
        {url}
      </a>
      <Button
        onClick={() => {
          void navigator.clipboard?.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? 'Copiado!' : 'Copiar'}
      </Button>
    </span>
  );
}

/** Setup page: every browser-source URL with its size and where the camera/capture goes. */
export function Home() {
  const { connected, settings } = useStream();
  return (
    <Frame className="s95-home" bgColor="$material">
      <h1>
        <Computer variant="32x32_4" /> stream95 <small>overlays Windows 95 para o OBS</small>
      </h1>
      <p>
        Servidor {connected ? 'conectado' : 'desconectado'} · canal <b>twitch.tv/{settings.channel}</b>
      </p>
      <p>
        Painel de controle: <CopyUrl path="/dock/" />
        <br />
        No OBS, adicione em Docks → Docks de navegador personalizados. No celular, leia o QR code que aparece no
        terminal ao iniciar o servidor.
      </p>
      <Fieldset legend={`Cenas completas (fonte de navegador ${CANVAS.w}x${CANVAS.h})`}>
        <table className="s95-table">
          <thead>
            <tr>
              <th>Cena</th>
              <th>URL</th>
              <th>Câmera (x, y, largura x altura)</th>
              <th>Captura</th>
            </tr>
          </thead>
          <tbody>
            {SCENES.map((s) => {
              const cam = s.cam ? toReal(s.cam) : null;
              const content = s.content ? toReal(s.content) : null;
              return (
                <tr key={s.id}>
                  <td>
                    <b>{s.name}</b>
                    <div className="s95-muted">{s.description}</div>
                  </td>
                  <td>
                    <CopyUrl path={`/scene/${s.id}`} />
                  </td>
                  <td>{cam ? `${cam.x}, ${cam.y} · ${cam.w}x${cam.h}` : '—'}</td>
                  <td>{content ? `${s.capture}: ${content.x}, ${content.y} · ${content.w}x${content.h}` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="s95-muted">
          A câmera/captura fica ABAIXO da fonte de navegador, exatamente no retângulo indicado. O gerador{' '}
          <code>npm run obs:collection</code> monta a coleção de cenas do OBS pronta.
        </p>
      </Fieldset>
      <Fieldset legend="Overlays avulsos">
        <table className="s95-table">
          <tbody>
            {OVERLAYS.map((o) => (
              <tr key={o.path}>
                <td>
                  <Mplayer10 variant="16x16_4" /> <b>{o.title}</b>
                  <div className="s95-muted">{o.note}</div>
                </td>
                <td>
                  <CopyUrl path={o.path} />
                </td>
                <td>{o.size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Fieldset>
      <p className="s95-muted">
        Dica: acrescente <code>?checker</code> a qualquer URL para ver as áreas transparentes, ou <code>?scale=1</code>{' '}
        para ver em 960x540.
      </p>
    </Frame>
  );
}
