import { LOGICAL, UI_SCALE } from '@stream95/shared';
import type { CSSProperties, ReactNode } from 'react';

/**
 * The 960x540 logical canvas, zoomed 2x to fill a 1920x1080 OBS browser source.
 * Integer zoom keeps React95's pixel fonts and bevels crisp. `?scale=1` previews at 1x.
 */
export function Stage({
  children,
  background,
  className,
}: {
  children: ReactNode;
  background?: string;
  className?: string;
}) {
  const params = new URLSearchParams(location.search);
  const scale = Number(params.get('scale') ?? UI_SCALE) || UI_SCALE;
  const checker = params.has('checker') && !background;
  const style: CSSProperties = {
    position: 'relative',
    width: LOGICAL.w,
    height: LOGICAL.h,
    overflow: 'hidden',
    zoom: scale,
    // ?checker paints a checkerboard where the scene is transparent (previews only)
    background: checker ? undefined : (background ?? 'transparent'),
  };
  return (
    <div className={`s95-stage${className ? ` ${className}` : ''}${checker ? ' s95-checker' : ''}`} style={style}>
      {children}
    </div>
  );
}
