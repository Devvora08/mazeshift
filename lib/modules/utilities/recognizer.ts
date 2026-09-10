import { SIGIL_TEMPLATES, type SigilPoint } from './sigils';
import type { UtilityType } from './types';

const RESAMPLE_POINTS = 64;
const SQUARE_SIZE = 100;
/** Average per-point distance (in the 100x100 normalized square) below which a match counts. */
const MATCH_THRESHOLD = 32;
const MIN_RAW_POINTS = 8;

function dist(a: SigilPoint, b: SigilPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pathLength(points: SigilPoint[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i]);
  return len;
}

function resample(points: SigilPoint[], n: number): SigilPoint[] {
  const interval = pathLength(points) / (n - 1);
  if (interval === 0) return Array.from({ length: n }, () => ({ ...points[0] }));

  let pts = points.slice();
  const result: SigilPoint[] = [pts[0]];
  let accumulated = 0;

  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (accumulated + d >= interval) {
      const t = (interval - accumulated) / d;
      const q: SigilPoint = {
        x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x),
        y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y),
      };
      result.push(q);
      pts.splice(i, 0, q);
      accumulated = 0;
    } else {
      accumulated += d;
    }
  }

  while (result.length < n) result.push(pts[pts.length - 1]);
  return result.slice(0, n);
}

function centroid(points: SigilPoint[]): SigilPoint {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function rotateToZero(points: SigilPoint[]): SigilPoint[] {
  const c = centroid(points);
  const angle = Math.atan2(points[0].y - c.y, points[0].x - c.x);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  return points.map((p) => ({
    x: (p.x - c.x) * cos - (p.y - c.y) * sin + c.x,
    y: (p.x - c.x) * sin + (p.y - c.y) * cos + c.y,
  }));
}

function scaleToSquare(points: SigilPoint[], size: number): SigilPoint[] {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const width = Math.max(...xs) - Math.min(...xs) || 1;
  const height = Math.max(...ys) - Math.min(...ys) || 1;
  return points.map((p) => ({ x: (p.x * size) / width, y: (p.y * size) / height }));
}

function translateToOrigin(points: SigilPoint[]): SigilPoint[] {
  const c = centroid(points);
  return points.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

function normalize(points: SigilPoint[]): SigilPoint[] {
  let pts = resample(points, RESAMPLE_POINTS);
  pts = rotateToZero(pts);
  pts = scaleToSquare(pts, SQUARE_SIZE);
  pts = translateToOrigin(pts);
  return pts;
}

function pathDistance(a: SigilPoint[], b: SigilPoint[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i++) total += dist(a[i], b[i]);
  return total / a.length;
}

const NORMALIZED_TEMPLATES: Record<UtilityType, SigilPoint[]> = Object.fromEntries(
  Object.entries(SIGIL_TEMPLATES).map(([type, points]) => [type, normalize(points)])
) as Record<UtilityType, SigilPoint[]>;

export interface SigilMatch {
  type: UtilityType;
  /** 0 (no resemblance) to 1 (perfect match). */
  confidence: number;
}

/** Matches a raw finger-drawn stroke against the six sigil templates. Returns null if too short
 *  or if the best match isn't close enough (probably just a tap or an unrelated scribble). */
export function recognizeSigil(rawPoints: SigilPoint[]): SigilMatch | null {
  if (rawPoints.length < MIN_RAW_POINTS) return null;

  const candidate = normalize(rawPoints);
  let best: UtilityType | null = null;
  let bestDist = Infinity;

  for (const type of Object.keys(NORMALIZED_TEMPLATES) as UtilityType[]) {
    const d = pathDistance(candidate, NORMALIZED_TEMPLATES[type]);
    if (d < bestDist) {
      bestDist = d;
      best = type;
    }
  }

  if (best === null || bestDist > MATCH_THRESHOLD) return null;
  return { type: best, confidence: 1 - bestDist / MATCH_THRESHOLD };
}
