import { describe, expect, it } from 'vitest';
import {
  CLIPPY_FRAME,
  frameAround,
  LOGICAL,
  POLL_GAP,
  pollLayout,
  pollRowsSpace,
  type Rect,
  rectsOverlap,
  SCENES,
  TASKBAR_H,
  WIDGETS,
} from '../src/index.js';

const isFull = (r: Rect) => r.w >= LOGICAL.w && r.h >= LOGICAL.h;
const inside = (r: Rect) => r.x >= 0 && r.y >= 0 && r.x + r.w <= LOGICAL.w && r.y + r.h <= LOGICAL.h;
const widgetsOf = (id: string): Record<string, Rect> => (WIDGETS as Record<string, Record<string, Rect>>)[id] ?? {};

describe('scene layout', () => {
  it('keeps every hole and widget inside the 960x540 canvas', () => {
    for (const s of SCENES) {
      for (const r of [s.cam, s.content]) if (r) expect(inside(r), s.id).toBe(true);
      for (const [name, r] of Object.entries(widgetsOf(s.id))) expect(inside(r), `${s.id}.${name}`).toBe(true);
    }
  });

  it('never lets Clippy cover the camera, a capture, another window or the taskbar', () => {
    for (const s of SCENES) {
      const { clippy, ...others } = widgetsOf(s.id);
      if (!clippy) continue;
      const size = clippy.w / CLIPPY_FRAME.w;
      expect([0.5, 1], `${s.id}: integer pixel scale keeps the sprite crisp`).toContain(size);
      expect(Math.abs(clippy.h - CLIPPY_FRAME.h * size), `${s.id}: aspect ratio`).toBeLessThanOrEqual(1);
      expect(clippy.y + clippy.h, `${s.id}: above the taskbar`).toBeLessThanOrEqual(LOGICAL.h - TASKBAR_H);
      const blockers = [s.cam, s.content].filter((r): r is Rect => r !== undefined && !isFull(r)).map(frameAround);
      blockers.push(...Object.values(others));
      for (const b of blockers)
        expect(rectsOverlap(clippy, b), `${s.id}: Clippy over ${JSON.stringify(b)}`).toBe(false);
    }
  });

  it('fits polls with 2 to 9 options in every poll slot', () => {
    for (const rect of [WIDGETS.main.links, WIDGETS.fullcam.poll]) {
      for (let n = 2; n <= 9; n++) {
        const { cols, row } = pollLayout(rect, n);
        const rows = Math.ceil(n / cols);
        expect(rows * row + (rows - 1) * POLL_GAP, `${rect.w}x${rect.h}, ${n} options`).toBeLessThanOrEqual(
          pollRowsSpace(rect),
        );
        expect(row).toBeGreaterThanOrEqual(12);
      }
    }
  });
});
