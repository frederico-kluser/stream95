import { SCENES, toReal } from '@stream95/shared';
import { describe, expect, it } from 'vitest';
import { BROWSERS, buildCollection } from '../../../obs/build-scene-collection';

type Item = {
  name: string;
  pos: { x: number; y: number };
  bounds: { x: number; y: number };
  bounds_type: number;
  bounds_crop: boolean;
};
type Src = {
  name: string;
  id: string;
  uuid: string;
  settings: Record<string, unknown> & { items?: Item[] };
  monitoring_type: number;
};

describe('OBS scene collection generator', () => {
  const col = buildCollection({
    name: 'stream95',
    url: 'http://localhost:1995/',
    browser: 'brave',
    camera: { video_device_id: 'cam' },
  }) as {
    sources: Src[];
    scene_order: { name: string }[];
  };
  const byName = new Map(col.sources.map((s) => [s.name, s]));

  it('creates one OBS scene per layout, in order, with Ctrl+Alt hotkeys', () => {
    expect(col.scene_order.map((s) => s.name)).toEqual(SCENES.map((s) => `${s.hotkey}. ${s.name}`));
  });

  it('places the camera and capture exactly under the overlay holes', () => {
    for (const spec of SCENES) {
      const scene = byName.get(`${spec.hotkey}. ${spec.name}`)!;
      const items = scene.settings.items!;
      const cam = items.find((i) => i.name === 'stream95 · Câmera');
      if (spec.cam) {
        const real = toReal(spec.cam);
        expect(cam?.pos).toEqual({ x: real.x, y: real.y });
        expect(cam?.bounds).toEqual({ x: real.w, y: real.h });
        expect(cam?.bounds_type).toBe(3);
        expect(cam?.bounds_crop).toBe(true);
      } else {
        expect(cam).toBeUndefined();
      }
      // overlay above the camera, audio on top
      const names = items.map((i) => i.name);
      expect(names.at(-1)).toBe('stream95 · Áudio (TTS + jingles)');
      expect(names.indexOf(`stream95 · Overlay ${spec.name}`)).toBeGreaterThan(
        cam ? names.indexOf('stream95 · Câmera') : -1,
      );
    }
  });

  it('wires URLs, audio routing and the chosen browser capture', () => {
    const audio = byName.get('stream95 · Áudio (TTS + jingles)')!;
    expect(audio.settings.url).toBe('http://localhost:1995/overlay/audio');
    expect(audio.settings.reroute_audio).toBe(true);
    expect(audio.monitoring_type).toBe(2);
    expect(byName.get('stream95 · Captura do navegador')!.settings.window).toBe(BROWSERS.brave);
    expect(byName.get('stream95 · Câmera')!.settings.video_device_id).toBe('cam');
    const uuids = new Set(col.sources.map((s) => s.uuid));
    expect(uuids.size).toBe(col.sources.length);
  });
});
