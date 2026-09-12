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
    asset: require('../../assets/hero_left.png'),
    imageWidth: 866,
    imageHeight: 288,
    frames: [
      { x: 9, y: 65, width: 159, height: 178 },
      { x: 183, y: 65, width: 163, height: 178 },
      { x: 346, y: 65, width: 173, height: 178 },
      { x: 547, y: 65, width: 145, height: 178 },
      { x: 715, y: 65, width: 144, height: 178 },
    ] satisfies FrameRect[],
  },
  right: {
    asset: require('../../assets/hero_right.png'),
    imageWidth: 866,
    imageHeight: 288,
    frames: [
      { x: 7, y: 65, width: 144, height: 178 },
      { x: 174, y: 65, width: 145, height: 178 },
      { x: 347, y: 65, width: 172, height: 178 },
      { x: 519, y: 65, width: 164, height: 178 },
      { x: 698, y: 65, width: 159, height: 178 },
    ] satisfies FrameRect[],
  },
} as const;

export type HeroAnimationName = keyof typeof HERO_SHEETS;
