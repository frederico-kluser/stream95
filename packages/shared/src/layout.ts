/**
 * Scene geometry — the single source of truth shared by the overlay (which draws
 * Windows 95 windows with transparent "holes") and the OBS scene-collection
 * generator (which places the camera / captures exactly under those holes).
 *
 * Overlays are drawn on a 960x540 LOGICAL canvas and zoomed 2x, so React95's
 * pixel fonts stay crisp on a 1920x1080 browser source. Every number below is
 * in logical px; multiply by UI_SCALE for real OBS pixels.
 */

export const UI_SCALE = 2;
export const LOGICAL = { w: 960, h: 540 } as const;
export const CANVAS = { w: LOGICAL.w * UI_SCALE, h: LOGICAL.h * UI_SCALE } as const;
export const TASKBAR_H = 28;

/** Clippy's sprite frame at normal size: 124x93 sprite px, one sprite px per logical px. */
export const CLIPPY_FRAME = { w: 124, h: 93 } as const;

export type Rect = { x: number; y: number; w: number; h: number };

export const toReal = (r: Rect): Rect => ({
  x: r.x * UI_SCALE,
  y: r.y * UI_SCALE,
  w: r.w * UI_SCALE,
  h: r.h * UI_SCALE,
});

export type SceneId = 'starting' | 'main' | 'fullcam' | 'react' | 'code' | 'gaming' | 'brb' | 'ending';

export type SceneSpec = {
  id: SceneId;
  name: string;
  description: string;
  /** Where the OBS camera goes (logical px). */
  cam?: Rect;
  /** Where the screen/window/game capture goes (logical px). */
  content?: Rect;
  /** Kind of capture expected under `content`. */
  capture?: 'window' | 'monitor' | 'game';
  /** Hotkey number suggested for OBS (Ctrl+Alt+N). */
  hotkey: number;
  chat: boolean;
  alerts: boolean;
};

const FULL: Rect = { x: 0, y: 0, w: LOGICAL.w, h: LOGICAL.h };

export const SCENES: readonly SceneSpec[] = [
  {
    id: 'starting',
    name: 'Abertura',
    description: 'Instalador do Windows 95 com contagem regressiva, chat e redes',
    hotkey: 1,
    chat: true,
    alerts: true,
  },
  {
    id: 'main',
    name: 'Eu + Chat',
    description: 'Webcam numa janela, chat ao lado, links e alertas',
    cam: { x: 20, y: 36, w: 576, h: 324 },
    hotkey: 2,
    chat: true,
    alerts: true,
  },
  {
    id: 'fullcam',
    name: 'Só Eu + Chat',
    description: 'Webcam em tela cheia com chat flutuante e barra de tarefas',
    cam: FULL,
    hotkey: 3,
    chat: true,
    alerts: true,
  },
  {
    id: 'react',
    name: 'Reagindo (Limpo)',
    description: 'Conteúdo grande + webcam, sem chat e sem alertas',
    content: { x: 12, y: 34, w: 704, h: 396 },
    cam: { x: 728, y: 34, w: 224, h: 126 },
    capture: 'window',
    hotkey: 4,
    chat: false,
    alerts: false,
  },
  {
    id: 'code',
    name: 'Codando',
    description: 'Tela do monitor (16:10) + webcam + chat + pomodoro',
    content: { x: 12, y: 34, w: 640, h: 400 },
    cam: { x: 672, y: 34, w: 280, h: 158 },
    capture: 'monitor',
    hotkey: 5,
    chat: true,
    alerts: true,
  },
  {
    id: 'gaming',
    name: 'Jogando',
    description: 'Jogo em tela cheia com webcam pequena',
    content: FULL,
    cam: { x: 12, y: 404, w: 208, h: 117 },
    capture: 'game',
    hotkey: 6,
    chat: false,
    alerts: true,
  },
  {
    id: 'brb',
    name: 'Volto Já',
    description: 'Proteção de tela com chat',
    hotkey: 7,
    chat: true,
    alerts: true,
  },
  {
    id: 'ending',
    name: 'Encerramento',
    description: '"Agora você pode desligar o computador com segurança"',
    hotkey: 8,
    chat: false,
    alerts: true,
  },
];

export const sceneById = (id: string): SceneSpec | undefined => SCENES.find((s) => s.id === id);

/** Window frame drawn around a hole: border + title bar above it. */
export const FRAME = { side: 6, top: 28, bottom: 6 } as const;

export function frameAround(hole: Rect): Rect {
  return {
    x: hole.x - FRAME.side,
    y: hole.y - FRAME.top,
    w: hole.w + FRAME.side * 2,
    h: hole.h + FRAME.top + FRAME.bottom,
  };
}

/**
 * Overlay-only widgets per scene (logical px). `clippy` reserves the assistant's sprite
 * frame (CLIPPY_FRAME, or half of it in the compact size) so it never covers the camera,
 * a capture or another window — test/layout.test.ts enforces it.
 */
export const WIDGETS = {
  main: {
    chat: { x: 612, y: 8, w: 340, h: 496 },
    links: { x: 14, y: 374, w: 470, h: 130 },
    clippy: { x: 486, y: 406, w: 124, h: 93 },
  },
  fullcam: {
    chat: { x: 636, y: 236, w: 316, h: 268 },
    poll: { x: 8, y: 8, w: 330, h: 160 },
    clippy: { x: 500, y: 404, w: 124, h: 93 },
  },
  react: {
    status: { x: 6, y: 446, w: 716, h: 58 },
    badge: { x: 722, y: 172, w: 236, h: 332 },
  },
  code: {
    status: { x: 6, y: 448, w: 580, h: 56 },
    chat: { x: 666, y: 206, w: 286, h: 298 },
    // compact (half size): the 72px between the editor and the taskbar can't fit the full sprite
    clippy: { x: 594, y: 454, w: 62, h: 47 },
  },
  starting: {
    wizard: { x: 96, y: 72, w: 504, h: 330 },
    chat: { x: 632, y: 24, w: 308, h: 440 },
    clippy: { x: 440, y: 410, w: 124, h: 93 },
  },
  gaming: {
    clippy: { x: 820, y: 416, w: 124, h: 93 },
  },
  brb: {
    dialog: { x: 120, y: 150, w: 420, h: 190 },
    chat: { x: 632, y: 24, w: 308, h: 440 },
    clippy: { x: 500, y: 400, w: 124, h: 93 },
  },
} as const satisfies Record<string, Record<string, Rect>>;

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export type PollLayout = { cols: number; row: number; label: number; bar: number };

/** Gap between poll rows and the height of the question line (logical px). */
export const POLL_GAP = 3;
export const POLL_QUESTION_H = 16;

/** Body height left for poll rows inside a window of this size. */
export const pollRowsSpace = (rect: Rect): number => rect.h - FRAME.top - FRAME.bottom - 4 - POLL_QUESTION_H - POLL_GAP;

/**
 * Row height and column count so a poll with 2..9 options always fits its window:
 * rows shrink down to 12px, then the options split into two columns.
 */
export function pollLayout(rect: Rect, options: number): PollLayout {
  const space = pollRowsSpace(rect);
  const fit = (rows: number) => Math.floor((space - (rows - 1) * POLL_GAP) / rows);
  let cols = 1;
  let row = fit(options);
  if (row < 14 && options > 2) {
    cols = 2;
    row = fit(Math.ceil(options / 2));
  }
  row = Math.max(12, Math.min(20, row));
  const label = cols === 1 ? 90 : 64;
  const inner = rect.w - FRAME.side * 2 - 8;
  const colW = (inner - (cols - 1) * 10) / cols;
  return { cols, row, label, bar: Math.max(40, Math.floor(colW - label - 24 - 12)) };
}
