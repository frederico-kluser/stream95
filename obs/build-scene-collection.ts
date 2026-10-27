/**
 * Generates an OBS Studio scene collection (JSON) for stream95:
 * one scene per layout, each with the camera / capture placed exactly under the
 * transparent holes of the overlay, the overlay browser source on top and the
 * single audio browser source shared by every scene.
 *
 *   npm run obs:collection -- [--out obs/stream95.json] [--name stream95]
 *                             [--url http://localhost:1995]
 *                             [--camera-from <existing collection .json>]
 *                             [--capture-from <existing collection .json>]
 *                             [--browser chrome|brave|edge|firefox]
 *                             [--install [--force]]  # copy into OBS's scenes folder (never activates it)
 */
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CANVAS, type Rect, SCENES, type SceneSpec, toReal } from '@stream95/shared';

type Json = Record<string, unknown>;

export type BuildOptions = {
  name: string;
  url: string;
  camera?: Json;
  /** Settings to reuse for the monitor/window captures (e.g. the monitor id of this machine). */
  monitor?: Json;
  window?: Json;
  browser?: keyof typeof BROWSERS;
};

/** Window-capture match strings ("title:class:exe"); priority 2 = match by executable, any title. */
export const BROWSERS = {
  chrome: 'Chrome:Chrome_WidgetWin_1:chrome.exe',
  brave: 'Brave:Chrome_WidgetWin_1:brave.exe',
  edge: 'Edge:Chrome_WidgetWin_1:msedge.exe',
  firefox: 'Firefox:MozillaWindowClass:firefox.exe',
} as const;

const BROWSER_CSS = 'body { background-color: rgba(0, 0, 0, 0); margin: 0px auto; overflow: hidden; }';

function source(name: string, id: string, settings: Json, extra: Json = {}): Json {
  return {
    name,
    uuid: randomUUID(),
    id,
    versioned_id: id,
    settings,
    mixers: 255,
    sync: 0,
    flags: 0,
    volume: 1.0,
    balance: 0.5,
    enabled: true,
    muted: false,
    'push-to-mute': false,
    'push-to-mute-delay': 0,
    'push-to-talk': false,
    'push-to-talk-delay': 0,
    hotkeys: {},
    deinterlace_mode: 0,
    deinterlace_field_order: 0,
    monitoring_type: 0,
    private_settings: {},
    ...extra,
  };
}

/** Scene item. Absolute coordinates only (OBS derives the relative ones on load). */
function item(src: Json, id: number, rect: Rect | null, opts: { visible?: boolean; fill?: boolean } = {}): Json {
  const bounds = rect && opts.fill;
  return {
    name: src.name,
    source_uuid: src.uuid,
    visible: opts.visible ?? true,
    locked: false,
    rot: 0.0,
    align: 5,
    bounds_type: bounds ? 3 : 0, // 3 = scale to outer bounds (fills the hole, crops the excess)
    bounds_align: 0,
    bounds_crop: Boolean(bounds),
    crop_left: 0,
    crop_top: 0,
    crop_right: 0,
    crop_bottom: 0,
    id,
    group_item_backup: false,
    pos: { x: rect?.x ?? 0, y: rect?.y ?? 0 },
    scale: { x: 1.0, y: 1.0 },
    bounds: { x: bounds ? rect.w : 0, y: bounds ? rect.h : 0 },
    scale_filter: bounds ? 'lanczos' : 'disable',
    blend_method: 'default',
    blend_type: 'normal',
    show_transition: { duration: 0 },
    hide_transition: { duration: 0 },
    private_settings: {},
  };
}

export function buildCollection(opts: BuildOptions): Json {
  const base = opts.url.replace(/\/+$/, '');
  const audio = source(
    'stream95 · Áudio (TTS + jingles)',
    'browser_source',
    {
      url: `${base}/overlay/audio`,
      width: 400,
      height: 60,
      fps: 30,
      shutdown: false,
      restart_when_active: false,
      reroute_audio: true,
      css: BROWSER_CSS,
    },
    { monitoring_type: 2 }, // monitor and output: you hear TTS/alerts and so does the stream
  );
  const camera = source('stream95 · Câmera', 'dshow_input', opts.camera ?? {});
  const captures: Record<NonNullable<SceneSpec['capture']>, Json> = {
    window: source('stream95 · Captura do navegador', 'window_capture', {
      window: BROWSERS[opts.browser ?? 'chrome'],
      method: 2, // Windows Graphics Capture: required for hardware-accelerated browsers
      priority: 2,
      cursor: true,
      client_area: true,
      capture_audio: false,
      ...(opts.window ?? {}),
    }),
    // Without a monitor_id OBS 32 selects no display; reuse one with --capture-from or pick it in OBS.
    monitor: source('stream95 · Captura da tela', 'monitor_capture', {
      method: 0,
      capture_cursor: true,
      ...(opts.monitor ?? {}),
    }),
    game: source('stream95 · Captura de jogo', 'game_capture', {
      capture_mode: 'any_fullscreen',
      capture_cursor: true,
      anti_cheat_hook: true,
    }),
  };

  const sources: Json[] = [audio, camera, ...Object.values(captures)];
  const sceneSources: Json[] = [];

  for (const spec of SCENES) {
    const overlay = source(`stream95 · Overlay ${spec.name}`, 'browser_source', {
      url: `${base}/scene/${spec.id}`,
      width: CANVAS.w,
      height: CANVAS.h,
      fps: 60,
      fps_custom: true,
      shutdown: false,
      restart_when_active: false,
      reroute_audio: false,
      css: BROWSER_CSS,
    });
    sources.push(overlay);
    const items: Json[] = [];
    let n = 0;
    if (spec.content && spec.capture)
      items.push(item(captures[spec.capture], ++n, toReal(spec.content), { fill: true }));
    if (spec.cam) items.push(item(camera, ++n, toReal(spec.cam), { fill: true }));
    items.push(item(overlay, ++n, null));
    items.push(item(audio, ++n, { x: 0, y: 0, w: 400, h: 60 }));
    sceneSources.push(
      source(
        `${spec.hotkey}. ${spec.name}`,
        'scene',
        { custom_size: false, id_counter: n, items },
        {
          mixers: 0,
          hotkeys: { 'OBSBasic.SelectScene': [{ key: `OBS_KEY_${spec.hotkey}`, control: true, alt: true }] },
          canvas_uuid: '6c69626f-6273-4c00-9d88-c5136d61696e',
        },
      ),
    );
  }

  return {
    name: opts.name,
    current_scene: sceneSources[0]?.name,
    current_program_scene: sceneSources[0]?.name,
    scene_order: sceneSources.map((s) => ({ name: s.name })),
    sources: [...sources, ...sceneSources],
    groups: [],
    transitions: [],
    transition_duration: 300,
    quick_transitions: [],
    saved_projectors: [],
    preview_locked: false,
    scaling_enabled: false,
    modules: {},
  };
}

type Collection = { sources?: { id: string; settings: Json }[] };
const readCollection = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as Collection;

/** Copy the first webcam (dshow_input) settings from an existing collection, so the camera works on first open. */
export function cameraFrom(file: string): Json | undefined {
  return readCollection(file).sources?.find((s) => s.id === 'dshow_input')?.settings;
}

/** Copy the configured monitor (monitor_id) and window from existing captures of this machine. */
export function capturesFrom(file: string): { monitor?: Json; window?: Json } {
  const sources = readCollection(file).sources ?? [];
  const monitor = sources.find((s) => s.id === 'monitor_capture' && s.settings?.monitor_id)?.settings;
  const window = sources.find((s) => s.id === 'window_capture' && s.settings?.window)?.settings;
  return {
    ...(monitor ? { monitor: { monitor_id: monitor.monitor_id } } : {}),
    ...(window ? { window: { window: window.window } } : {}),
  };
}

function arg(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function obsScenesDir(): string | null {
  if (process.platform === 'win32' && process.env.APPDATA)
    return path.join(process.env.APPDATA, 'obs-studio', 'basic', 'scenes');
  if (process.platform === 'darwin' && process.env.HOME)
    return path.join(process.env.HOME, 'Library', 'Application Support', 'obs-studio', 'basic', 'scenes');
  if (process.env.HOME) return path.join(process.env.HOME, '.config', 'obs-studio', 'basic', 'scenes');
  return null;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join('obs', 'build-scene-collection.ts'));
if (isMain) {
  const args = process.argv.slice(2);
  const name = arg(args, '--name') ?? 'stream95';
  const url = arg(args, '--url') ?? 'http://localhost:1995';
  const camFile = arg(args, '--camera-from');
  const captureFile = arg(args, '--capture-from');
  const browser = (arg(args, '--browser') ?? 'chrome') as keyof typeof BROWSERS;
  if (!(browser in BROWSERS)) {
    console.error(`Erro: navegador desconhecido "${browser}" — Solução: use ${Object.keys(BROWSERS).join(', ')}`);
    process.exit(2);
  }
  const out = arg(args, '--out') ?? path.join('obs', `${name}.json`);
  const camera = camFile ? cameraFrom(camFile) : undefined;
  if (camFile && !camera)
    console.warn(`Aviso: nenhuma webcam (dshow_input) em ${camFile} — escolha o dispositivo no OBS.`);
  const captures = captureFile ? capturesFrom(captureFile) : {};
  const collection = buildCollection({ name, url, browser, ...(camera ? { camera } : {}), ...captures });
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(collection, null, 2)}\n`);
  console.log(`✔ coleção "${name}" gerada em ${out} (${SCENES.length} cenas)`);
  if (args.includes('--install')) {
    const dir = obsScenesDir();
    if (!dir || !existsSync(dir)) {
      console.error(
        'Erro: pasta de cenas do OBS não encontrada — Solução: abra o OBS uma vez ou importe o arquivo manualmente',
      );
      process.exit(4);
    }
    const target = path.join(dir, `${name}.json`);
    if (existsSync(target)) {
      if (!args.includes('--force')) {
        console.error(`Erro: ${target} já existe — Solução: use --force (faz backup .bak) ou --name outro-nome`);
        process.exit(1);
      }
      copyFileSync(target, `${target}.${Date.now()}.bak`);
    }
    writeFileSync(target, `${JSON.stringify(collection, null, 2)}\n`);
    console.log(`✔ instalada em ${target}. No OBS: menu Coleção de cenas → ${name}`);
  }
}
