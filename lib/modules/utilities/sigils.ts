import type { UtilityType } from './types';

export interface SigilPoint {
  x: number;
  y: number;
}

function lerpPoints(from: [number, number], to: [number, number], n: number): SigilPoint[] {
  const pts: SigilPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push({ x: from[0] + (to[0] - from[0]) * t, y: from[1] + (to[1] - from[1]) * t });
  }
  return pts;
}

function polyline(corners: [number, number][], perSegment = 10): SigilPoint[] {
  const pts: SigilPoint[] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const seg = lerpPoints(corners[i], corners[i + 1], perSegment);
    pts.push(...(i === 0 ? seg : seg.slice(1)));
  }
  return pts;
}

function arc(cx: number, cy: number, r: number, startDeg: number, endDeg: number, n = 24): SigilPoint[] {
  const pts: SigilPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const deg = startDeg + (endDeg - startDeg) * t;
    const rad = (deg * Math.PI) / 180;
    pts.push({ x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) });
  }
  return pts;
}

function spiral(cx: number, cy: number, turns: number, maxR: number, n = 40): SigilPoint[] {
  const pts: SigilPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const rad = t * turns * 2 * Math.PI;
    const r = t * maxR;
    pts.push({ x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) });
  }
  return pts;
}

function wisp(n = 40): SigilPoint[] {
  // A single lazy S-curve — evokes "slipping through" rather than a hard-edged shape.
  const pts: SigilPoint[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push({ x: t * 100, y: 50 + 35 * Math.sin(t * 2 * Math.PI) });
  }
  return pts;
}

/**
 * One canonical single-stroke shape per utility, in an arbitrary local coordinate space (the
 * recognizer normalizes scale/rotation/position, so absolute units here don't matter — only the
 * relative shape does). Each is drawable in under a second: 2-4 direction changes, no pen lifts.
 */
export const SIGIL_TEMPLATES: Record<UtilityType, SigilPoint[]> = {
  phase: wisp(),
  destroy: polyline([
    [0, 20],
    [30, 80],
    [50, 30],
    [70, 90],
    [100, 40],
  ]),
  scramble: spiral(50, 50, 1.4, 45),
  dash: polyline([
    [10, 90],
    [55, 55],
    [35, 55],
    [90, 10],
  ]),
  shield: arc(50, 20, 45, 200, -20),
  trap: [...lerpPoints([50, 0], [50, 45], 12), ...arc(35, 45, 15, 0, 300, 20).slice(1)],
};
