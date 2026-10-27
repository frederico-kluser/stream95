import { Frame, TitleBar } from '@react95/core';
import type { Rect } from '@stream95/shared';
import type { CSSProperties, ReactElement, ReactNode } from 'react';

/** clip-path that keeps the window but punches a transparent hole (evenodd polygon). */
export function holeClipPath(win: Rect, hole: Rect): string {
  const x = hole.x - win.x;
  const y = hole.y - win.y;
  return `polygon(evenodd, 0 0, ${win.w}px 0, ${win.w}px ${win.h}px, 0 ${win.h}px, 0 0, ${x}px ${y}px, ${x}px ${y + hole.h}px, ${x + hole.w}px ${y + hole.h}px, ${x + hole.w}px ${y}px, ${x}px ${y}px)`;
}

export type WinProps = {
  rect: Rect;
  title: string;
  icon?: ReactElement;
  /** Transparent area (absolute, same coordinate space as `rect`) where an OBS source shows through. */
  hole?: Rect;
  active?: boolean;
  /** Draw the classic minimize/maximize/close buttons. */
  controls?: boolean;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  bodyStyle?: CSSProperties;
};

/**
 * A Windows 95 window built from React95's Frame + TitleBar. Unlike Modal it is
 * not draggable and does not join the global focus bus, so several windows can
 * show an active (blue) title bar at once — what an overlay needs.
 */
export function Win({
  rect,
  title,
  icon,
  hole,
  active = true,
  controls = true,
  children,
  className,
  style,
  bodyStyle,
}: WinProps) {
  return (
    <Frame
      className={`s95-win${className ? ` ${className}` : ''}`}
      boxShadow="$out"
      bgColor="$material"
      p="$3"
      style={{
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        ...(hole ? { clipPath: holeClipPath(rect, hole) } : {}),
        ...style,
      }}
    >
      <TitleBar active={active} title={title} icon={icon} className="s95-titlebar">
        {controls && (
          <TitleBar.OptionsBox>
            <TitleBar.Minimize />
            <TitleBar.Maximize />
            <TitleBar.Close />
          </TitleBar.OptionsBox>
        )}
      </TitleBar>
      {hole ? (
        <div
          className="s95-hole-bevel"
          style={{
            position: 'absolute',
            left: hole.x - rect.x - 2,
            top: hole.y - rect.y - 2,
            width: hole.w + 4,
            height: hole.h + 4,
          }}
        />
      ) : (
        <div className="s95-win-body" style={bodyStyle}>
          {children}
        </div>
      )}
    </Frame>
  );
}
