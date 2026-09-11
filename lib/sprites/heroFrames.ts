export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Exact pixel bounding boxes for each frame, measured directly from the source
 * PNGs (alpha-channel column scan) rather than assumed from equal-width grid
 * slicing — the sheets aren't on a rigid grid, frame widths vary a few px.
 * Vertical bounds exclude transparent padding and share one baseline per sheet.
 */
export const HERO_SHEETS = {
  idle: {
    asset: require('../../assets/stand.png'),
    imageWidth: 848,
    imageHeight: 294,
    frames: [
      { x: 24, y: 5, width: 132, height: 266 },
      { x: 186, y: 5, width: 128, height: 266 },
      { x: 344, y: 5, width: 124, height: 266 },
      { x: 502, y: 5, width: 126, height: 266 },
      { x: 661, y: 5, width: 127, height: 266 },
    ] satisfies FrameRect[],
  },
  up: {
    asset: require('../../assets/up.png'),
    imageWidth: 725,
    imageHeight: 155,
    frames: [
      { x: 12, y: 7, width: 91, height: 134 },
      { x: 177, y: 7, width: 95, height: 134 },
      { x: 333, y: 7, width: 85, height: 134 },
      { x: 478, y: 7, width: 87, height: 134 },
      { x: 623, y: 7, width: 83, height: 134 },
    ] satisfies FrameRect[],
  },
  down: {
    asset: require('../../assets/down.png'),
    imageWidth: 720,
    imageHeight: 155,
    frames: [
      { x: 11, y: 8, width: 83, height: 122 },
      { x: 172, y: 8, width: 83, height: 122 },
      { x: 315, y: 8, width: 84, height: 122 },
      { x: 465, y: 8, width: 80, height: 122 },
      { x: 616, y: 8, width: 81, height: 122 },
    ] satisfies FrameRect[],
  },
  left: {
    asset: require('../../assets/left.png'),
    imageWidth: 780,
    imageHeight: 160,
    frames: [
      { x: 21, y: 18, width: 111, height: 134 },
      { x: 191, y: 18, width: 99, height: 134 },
      { x: 333, y: 18, width: 111, height: 134 },
      { x: 482, y: 18, width: 103, height: 134 },
      { x: 631, y: 18, width: 109, height: 134 },
    ] satisfies FrameRect[],
  },
  right: {
    // 8-frame replacement (up from 5) specifically for a smoother right-run cycle.
    asset: require('../../assets/right_new.png'),
    imageWidth: 2170,
    imageHeight: 725,
    frames: [
      { x: 15, y: 237, width: 240, height: 280 },
      { x: 280, y: 237, width: 248, height: 280 },
      { x: 548, y: 237, width: 253, height: 280 },
      { x: 817, y: 237, width: 251, height: 280 },
      { x: 1100, y: 237, width: 246, height: 280 },
      { x: 1367, y: 237, width: 236, height: 280 },
      { x: 1628, y: 237, width: 245, height: 280 },
      { x: 1901, y: 237, width: 240, height: 280 },
    ] satisfies FrameRect[],
  },
} as const;

export type HeroAnimationName = keyof typeof HERO_SHEETS;
