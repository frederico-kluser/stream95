import type { AlertKind } from '@stream95/shared';

// Original chiptune jingles synthesized with WebAudio — no copyrighted Windows sounds shipped.
type Note = [freq: number, start: number, dur: number, wave?: OscillatorType];

const N = (name: string): number => {
  const map: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) return 440;
  const semis = (map[m[1]!] ?? 0) + (m[2] ? 1 : 0) + (Number(m[3]) - 4) * 12;
  return 440 * 2 ** (semis / 12);
};

const JINGLES: Record<string, Note[]> = {
  follow: [
    [N('C5'), 0, 0.09],
    [N('E5'), 0.09, 0.09],
    [N('G5'), 0.18, 0.18],
  ],
  sub: [
    [N('C5'), 0, 0.08],
    [N('E5'), 0.08, 0.08],
    [N('G5'), 0.16, 0.08],
    [N('C6'), 0.24, 0.3, 'triangle'],
  ],
  resub: [
    [N('G4'), 0, 0.08],
    [N('C5'), 0.08, 0.08],
    [N('E5'), 0.16, 0.08],
    [N('G5'), 0.24, 0.08],
    [N('C6'), 0.32, 0.3, 'triangle'],
  ],
  giftsub: [
    [N('E5'), 0, 0.07],
    [N('G5'), 0.07, 0.07],
    [N('E6'), 0.14, 0.07],
    [N('C6'), 0.21, 0.07],
    [N('D6'), 0.28, 0.07],
    [N('G6'), 0.35, 0.25],
  ],
  raid: [
    [N('G4'), 0, 0.12, 'sawtooth'],
    [N('G4'), 0.14, 0.06, 'sawtooth'],
    [N('C5'), 0.22, 0.12, 'sawtooth'],
    [N('E5'), 0.36, 0.12, 'sawtooth'],
    [N('G5'), 0.5, 0.4, 'sawtooth'],
  ],
  cheer: [
    [N('B5'), 0, 0.06],
    [N('E6'), 0.06, 0.25],
  ],
  redeem: [
    [N('A5'), 0, 0.06],
    [N('A6'), 0.08, 0.12],
  ],
  donation: [
    [N('C6'), 0, 0.08],
    [N('G6'), 0.08, 0.08],
    [N('C7'), 0.16, 0.25],
  ],
  custom: [
    [N('E5'), 0, 0.1],
    [N('A5'), 0.1, 0.2],
  ],
  notify: [
    [N('A5'), 0, 0.05],
    [N('E6'), 0.07, 0.08],
  ],
  error: [
    [N('C4'), 0, 0.15, 'sawtooth'],
    [N('C3'), 0.15, 0.3, 'sawtooth'],
  ],
  bsod: [
    [N('C3'), 0, 0.5, 'square'],
    [N('G2'), 0.1, 0.5, 'square'],
  ],
  pomodoro: [
    [N('E6'), 0, 0.1],
    [N('E6'), 0.2, 0.1],
    [N('E6'), 0.4, 0.2],
  ],
};

let ctx: AudioContext | null = null;

export function audioContext(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

export function playJingle(kind: AlertKind | keyof typeof JINGLES, volume = 0.18): void {
  const notes = JINGLES[kind] ?? JINGLES.notify!;
  const ac = audioContext();
  if (ac.state === 'suspended') void ac.resume();
  const t0 = ac.currentTime + 0.02;
  for (const [freq, start, dur, wave = 'square'] of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0 + start);
    gain.gain.linearRampToValueAtTime(volume, t0 + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0 + start);
    osc.stop(t0 + start + dur + 0.05);
  }
}
