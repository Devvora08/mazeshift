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
 */
export const HERO_SHEETS = {
  idle: {
    asset: require('../../assets/stand.png'),
    imageWidth: 848,
    imageHeight: 294,
    frames: [
      { x: 24, y: 0, width: 132, height: 294 },
      { x: 186, y: 0, width: 128, height: 294 },
      { x: 344, y: 0, width: 124, height: 294 },
      { x: 502, y: 0, width: 126, height: 294 },
      { x: 661, y: 0, width: 127, height: 294 },
    ] satisfies FrameRect[],
  },
  up: {
    asset: require('../../assets/up.png'),
    imageWidth: 725,
    imageHeight: 155,
    frames: [
      { x: 12, y: 0, width: 91, height: 155 },
      { x: 177, y: 0, width: 95, height: 155 },
      { x: 333, y: 0, width: 85, height: 155 },
      { x: 478, y: 0, width: 87, height: 155 },
      { x: 623, y: 0, width: 83, height: 155 },
    ] satisfies FrameRect[],
  },
  down: {
    asset: require('../../assets/down.png'),
    imageWidth: 720,
    imageHeight: 155,
    frames: [
      { x: 11, y: 0, width: 83, height: 155 },
      { x: 172, y: 0, width: 83, height: 155 },
      { x: 315, y: 0, width: 84, height: 155 },
      { x: 465, y: 0, width: 80, height: 155 },
      { x: 616, y: 0, width: 81, height: 155 },
    ] satisfies FrameRect[],
  },
  left: {
    asset: require('../../assets/left.png'),
    imageWidth: 780,
    imageHeight: 160,
    frames: [
      { x: 21, y: 0, width: 111, height: 160 },
      { x: 191, y: 0, width: 99, height: 160 },
      { x: 333, y: 0, width: 111, height: 160 },
      { x: 482, y: 0, width: 103, height: 160 },
      { x: 631, y: 0, width: 109, height: 160 },
    ] satisfies FrameRect[],
  },
  right: {
    asset: require('../../assets/right.png'),
    imageWidth: 780,
    imageHeight: 165,
    frames: [
      { x: 8, y: 0, width: 104, height: 165 },
      { x: 169, y: 0, width: 107, height: 165 },
      { x: 310, y: 0, width: 112, height: 165 },
      { x: 457, y: 0, width: 109, height: 165 },
      { x: 604, y: 0, width: 107, height: 165 },
    ] satisfies FrameRect[],
  },
} as const;

export type HeroAnimationName = keyof typeof HERO_SHEETS;
