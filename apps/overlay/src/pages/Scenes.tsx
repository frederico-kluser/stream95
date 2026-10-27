import { Button, ProgressBar } from '@react95/core';
import { Camera } from '@react95/icons/Camera';
import { Computer } from '@react95/icons/Computer';
import { Mplayer10 } from '@react95/icons/Mplayer10';
import { Notepad } from '@react95/icons/Notepad';
import { Wordpad } from '@react95/icons/Wordpad';
import { frameAround, type Rect, type SceneId, sceneById, WIDGETS } from '@stream95/shared';
import { useEffect, useState } from 'react';
import { AlertStage } from '../components/AlertStage';
import { BsodLayer } from '../components/Bsod';
import { ChatWindow } from '../components/ChatLog';
import { ClippyStage } from '../components/ClippyStage';
import { Stage } from '../components/Stage';
import { Taskbar } from '../components/Taskbar';
import { ToastLayer } from '../components/Toasts';
import { Desktop, LinksWindow, PollWindow, Starfield } from '../components/Widgets';
import { Win } from '../components/Win';
import { mmss } from '../lib/format';
import { useStream } from '../lib/stream';

/** Alerts, blue screens, balloon tips and Clippy — shared by every "live" scene. */
function LiveLayers({ clippy, toastBottom }: { clippy?: Rect; toastBottom?: number }) {
  return (
    <>
      <ClippyStage {...(clippy ? { rect: clippy } : {})} />
      <ToastLayer {...(toastBottom !== undefined ? { bottom: toastBottom } : {})} />
      <AlertStage />
      <BsodLayer />
    </>
  );
}

/** OBS-source rectangles of a scene (camera and capture) that must stay transparent. */
function holesOf(scene: SceneId): Rect[] {
  const s = sceneById(scene);
  return [s?.cam, s?.content].filter((r): r is Rect => Boolean(r));
}

function CamWindow({ scene, title = 'webcam.exe' }: { scene: SceneId; title?: string }) {
  const hole = sceneById(scene)?.cam;
  if (!hole) return null;
  return <Win rect={frameAround(hole)} hole={hole} title={title} icon={<Camera variant="16x16_4" />} />;
}

function ContentWindow({ scene, title, icon }: { scene: SceneId; title: string; icon: React.ReactElement }) {
  const hole = sceneById(scene)?.content;
  if (!hole) return null;
  return <Win rect={frameAround(hole)} hole={hole} title={title} icon={icon} />;
}

// ---------------------------------------------------------------- starting

const STEPS = [
  'Copiando arquivos de café...',
  'Desfragmentando o código...',
  'Discando para o provedor (tuuu-iiii-krrrr)...',
  'Instalando drivers de bom humor...',
  'Compilando piadas ruins...',
  'Atualizando o Winamp... ele realmente chicoteia a llama.',
  'Aquecendo o monitor CRT...',
  'Verificando se o Clippy está acordado...',
];

function useCountdown(minutes: number): number {
  const [end] = useState(() => {
    const fromUrl = Number(new URLSearchParams(location.search).get('min'));
    return Date.now() + (fromUrl > 0 ? fromUrl : minutes) * 60_000;
  });
  const [left, setLeft] = useState(end - Date.now());
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, end - Date.now())), 250);
    return () => clearInterval(t);
  }, [end]);
  return left;
}

export function StartingScene() {
  const { settings } = useStream();
  const minutes = settings.overlay.startingMinutes;
  const left = useCountdown(minutes);
  const total = minutes * 60_000;
  const percent = Math.min(100, Math.round(((total - left) / total) * 100));
  const step = STEPS[Math.floor((total - left) / 9000) % STEPS.length];
  const w = WIDGETS.starting;
  return (
    <Stage>
      <Desktop />
      <Win rect={w.wizard} title="Instalação do stream95" icon={<Computer variant="16x16_4" />} controls={false}>
        <div className="s95-wizard">
          <div className="s95-wizard-banner">
            <span>stream95</span>
          </div>
          <div className="s95-wizard-main">
            <h1 className="s95-wizard-title">{settings.overlay.startingTitle}</h1>
            <p>Bem-vindo à instalação da live de hoje. Pegue seu café e fique à vontade no chat.</p>
            <div className="s95-countdown">{left > 0 ? mmss(left) : 'Já já!'}</div>
            <div className="s95-muted">{left > 0 ? step : 'Instalação concluída. Iniciando...'}</div>
            <ProgressBar width="300px" percent={percent} />
            <div className="s95-wizard-socials">
              {settings.socials.map((s) => (
                <span key={s.label}>
                  <b>{s.label}:</b> {s.value}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="s95-wizard-buttons">
          <Button disabled>&lt; Voltar</Button>
          <Button className="s95-default-btn">Avançar &gt;</Button>
          <Button>Cancelar</Button>
        </div>
      </Win>
      <ChatWindow rect={w.chat} />
      <Taskbar sceneTitle="Instalação do stream95" />
      <LiveLayers clippy={w.clippy} />
    </Stage>
  );
}

// -------------------------------------------------------------------- main

export function MainScene() {
  const w = WIDGETS.main;
  return (
    <Stage>
      <Desktop icons={[]} holes={holesOf('main')} />
      <CamWindow scene="main" title="webcam.exe - ao vivo" />
      <PollOrLinks rect={w.links} />
      <ChatWindow rect={w.chat} />
      <Taskbar />
      <LiveLayers clippy={w.clippy} />
    </Stage>
  );
}

function PollOrLinks({ rect }: { rect: (typeof WIDGETS)['main']['links'] }) {
  const { poll } = useStream();
  return poll ? <PollWindow rect={rect} /> : <LinksWindow rect={rect} />;
}

// ----------------------------------------------------------------- fullcam

export function FullcamScene() {
  const { poll } = useStream();
  const w = WIDGETS.fullcam;
  return (
    <Stage>
      <ChatWindow rect={w.chat} title="Chat" />
      {poll && <PollWindow rect={w.poll} />}
      <Taskbar />
      <LiveLayers clippy={w.clippy} />
    </Stage>
  );
}

// ------------------------------------------------------------------- react

export function ReactScene() {
  const { settings } = useStream();
  const w = WIDGETS.react;
  const reacting = new URLSearchParams(location.search).get('title') ?? 'o que o chat mandar';
  return (
    <Stage>
      <Desktop icons={[]} holes={holesOf('react')} />
      <ContentWindow scene="react" title="Media Player - reagindo" icon={<Mplayer10 variant="16x16_4" />} />
      <CamWindow scene="react" />
      <Win rect={w.status} title="Agora" icon={<Notepad variant="16x16_4" />} controls={false}>
        <div className="s95-status-line">
          Reagindo a: <b>{reacting}</b>
        </div>
      </Win>
      <Win rect={w.badge} title="REAGINDO.EXE" icon={<Mplayer10 variant="16x16_4" />}>
        <div className="s95-react-badge">
          <div className="s95-react-big">REAGINDO</div>
          <div className="s95-muted">Sem chat e sem alertas nesta cena.</div>
          <div className="s95-react-socials">
            {settings.socials.map((s) => (
              <div key={s.label}>
                <b>{s.label}:</b> {s.value}
              </div>
            ))}
          </div>
        </div>
      </Win>
      <Taskbar sceneTitle="Reagindo" startEverySec={0} />
    </Stage>
  );
}

// -------------------------------------------------------------------- code

export function CodeScene() {
  const { pomodoro, github } = useStream();
  const w = WIDGETS.code;
  const last = github.at(-1);
  return (
    <Stage>
      <Desktop icons={[]} holes={holesOf('code')} />
      <ContentWindow scene="code" title="Visual Studio 97 - [stream95]" icon={<Wordpad variant="16x16_4" />} />
      <CamWindow scene="code" />
      <ChatWindow rect={w.chat} />
      <Win rect={w.status} title="Status do build" icon={<Computer variant="16x16_4" />} controls={false}>
        <div className="s95-status-line">
          {pomodoro.mode !== 'idle' ? (
            <span>
              Pomodoro <b>{pomodoro.mode === 'focus' ? 'foco' : 'pausa'}</b> #{pomodoro.cycle}
            </span>
          ) : (
            <span>Foco total no código</span>
          )}
          <span className="s95-sep" />
          {last ? (
            <span className="s95-ellipsis" title={last.title}>
              Último commit: <b>{last.title}</b>
            </span>
          ) : (
            <span>!clippy responde dúvidas de código</span>
          )}
        </div>
      </Win>
      <Taskbar />
      <LiveLayers clippy={w.clippy} />
    </Stage>
  );
}

// ------------------------------------------------------------------ gaming

export function GamingScene() {
  return (
    <Stage>
      <CamWindow scene="gaming" />
      <LiveLayers clippy={WIDGETS.gaming.clippy} toastBottom={8} />
    </Stage>
  );
}

// --------------------------------------------------------------------- brb

export function BrbScene() {
  const { settings } = useStream();
  const w = WIDGETS.brb;
  return (
    <Stage background="#000">
      <Starfield />
      <Win rect={w.dialog} title="Proteção de tela" icon={<Computer variant="16x16_4" />} controls={false}>
        <div className="s95-brb">
          <div className="s95-brb-title">{settings.overlay.brbTitle}</div>
          <p>A live entrou em modo de espera. Mexa no mouse (ou no chat) para acordar o streamer.</p>
          <div className="s95-muted">Enquanto isso: !clippy responde perguntas e !redes mostra os links.</div>
        </div>
      </Win>
      <ChatWindow rect={w.chat} />
      <LiveLayers clippy={w.clippy} toastBottom={8} />
    </Stage>
  );
}

// ------------------------------------------------------------------ ending

export function EndingScene() {
  const { settings } = useStream();
  return (
    <Stage background="#000">
      <div className="s95-shutdown">
        <div className="s95-shutdown-text">
          Agora você pode desligar
          <br />o computador com segurança.
        </div>
        <div className="s95-shutdown-sub">{settings.overlay.endingTitle}</div>
        <div className="s95-shutdown-socials">
          {settings.socials.map((s) => (
            <span key={s.label}>
              {s.label}: {s.value}
            </span>
          ))}
        </div>
      </div>
      <AlertStage />
    </Stage>
  );
}

export const SCENE_COMPONENTS: Record<SceneId, () => React.ReactElement> = {
  starting: StartingScene,
  main: MainScene,
  fullcam: FullcamScene,
  react: ReactScene,
  code: CodeScene,
  gaming: GamingScene,
  brb: BrbScene,
  ending: EndingScene,
};
