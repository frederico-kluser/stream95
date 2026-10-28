import type { SfxColor } from '@stream95/shared';

export type Tone = {
  /** Color name for screen readers and tooltips. */
  name: string;
  /** Resting tile: tinted surface and border. */
  tile: string;
  /** Tile while a play is on its way to the PC. */
  pressed: string;
  /** Short flash when the PC confirms the play. */
  flash: string;
  /** Solid swatch (color picker, list markers). */
  swatch: string;
  /** Icon tint when the button has no emoji. */
  icon: string;
};

// Complete class names on purpose: Tailwind only generates classes it can read in the source.
export const TONES: Record<SfxColor, Tone> = {
  slate: {
    name: 'Cinza',
    tile: 'border-sfx-slate/40 bg-sfx-slate/15',
    pressed: 'border-sfx-slate/80 bg-sfx-slate/30 ring-2 ring-sfx-slate/50',
    flash: 'bg-sfx-slate/35',
    swatch: 'bg-sfx-slate',
    icon: 'text-sfx-slate',
  },
  red: {
    name: 'Vermelho',
    tile: 'border-sfx-red/40 bg-sfx-red/15',
    pressed: 'border-sfx-red/80 bg-sfx-red/30 ring-2 ring-sfx-red/50',
    flash: 'bg-sfx-red/35',
    swatch: 'bg-sfx-red',
    icon: 'text-sfx-red',
  },
  orange: {
    name: 'Laranja',
    tile: 'border-sfx-orange/40 bg-sfx-orange/15',
    pressed: 'border-sfx-orange/80 bg-sfx-orange/30 ring-2 ring-sfx-orange/50',
    flash: 'bg-sfx-orange/35',
    swatch: 'bg-sfx-orange',
    icon: 'text-sfx-orange',
  },
  amber: {
    name: 'Âmbar',
    tile: 'border-sfx-amber/40 bg-sfx-amber/15',
    pressed: 'border-sfx-amber/80 bg-sfx-amber/30 ring-2 ring-sfx-amber/50',
    flash: 'bg-sfx-amber/35',
    swatch: 'bg-sfx-amber',
    icon: 'text-sfx-amber',
  },
  green: {
    name: 'Verde',
    tile: 'border-sfx-green/40 bg-sfx-green/15',
    pressed: 'border-sfx-green/80 bg-sfx-green/30 ring-2 ring-sfx-green/50',
    flash: 'bg-sfx-green/35',
    swatch: 'bg-sfx-green',
    icon: 'text-sfx-green',
  },
  teal: {
    name: 'Turquesa',
    tile: 'border-sfx-teal/40 bg-sfx-teal/15',
    pressed: 'border-sfx-teal/80 bg-sfx-teal/30 ring-2 ring-sfx-teal/50',
    flash: 'bg-sfx-teal/35',
    swatch: 'bg-sfx-teal',
    icon: 'text-sfx-teal',
  },
  blue: {
    name: 'Azul',
    tile: 'border-sfx-blue/40 bg-sfx-blue/15',
    pressed: 'border-sfx-blue/80 bg-sfx-blue/30 ring-2 ring-sfx-blue/50',
    flash: 'bg-sfx-blue/35',
    swatch: 'bg-sfx-blue',
    icon: 'text-sfx-blue',
  },
  violet: {
    name: 'Violeta',
    tile: 'border-sfx-violet/40 bg-sfx-violet/15',
    pressed: 'border-sfx-violet/80 bg-sfx-violet/30 ring-2 ring-sfx-violet/50',
    flash: 'bg-sfx-violet/35',
    swatch: 'bg-sfx-violet',
    icon: 'text-sfx-violet',
  },
  pink: {
    name: 'Rosa',
    tile: 'border-sfx-pink/40 bg-sfx-pink/15',
    pressed: 'border-sfx-pink/80 bg-sfx-pink/30 ring-2 ring-sfx-pink/50',
    flash: 'bg-sfx-pink/35',
    swatch: 'bg-sfx-pink',
    icon: 'text-sfx-pink',
  },
};

/** Unknown colors (an older buttons file) fall back to slate. */
export const toneOf = (color: string): Tone => TONES[color as SfxColor] ?? TONES.slate;
