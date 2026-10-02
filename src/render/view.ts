import { WORLD } from '../game/config.ts';

/**
 * Maps the fixed 360×640 world onto any screen. The world frame is fitted
 * (never cropped), and whatever screen is left over shows more backdrop
 * around it: extra sky/wall on tall phones, a dimmed surround on wide
 * screens. Physics never sees any of this.
 */
export interface View {
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  /** CSS pixels per world unit. */
  scale: number;
  /** CSS position of the world origin. */
  offsetX: number;
  offsetY: number;
  /** Visible world bounds (may extend past the 360×640 frame). */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function computeView(cssWidth: number, cssHeight: number, dpr: number): View {
  const scale = Math.min(cssWidth / WORLD.width, cssHeight / WORLD.height);
  const offsetX = (cssWidth - WORLD.width * scale) / 2;
  const offsetY = (cssHeight - WORLD.height * scale) / 2;
  return {
    cssWidth, cssHeight, dpr, scale, offsetX, offsetY,
    left: -offsetX / scale,
    right: (cssWidth - offsetX) / scale,
    top: -offsetY / scale,
    bottom: (cssHeight - offsetY) / scale,
  };
}
