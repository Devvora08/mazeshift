import { posKey } from './graph';
import type { Rng } from './rng';
import type { Position } from './types';

export type ShapeType = 'rect' | 'plus' | 'diamond' | 'octagon' | 'lShape';

function keepAll(width: number, height: number): boolean[][] {
  return Array.from({ length: height }, () => Array<boolean>(width).fill(true));
}

function shapeGrid(width: number, height: number, shape: ShapeType, rng: Rng): boolean[][] {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;

  switch (shape) {
    case 'rect':
      return keepAll(width, height);

    case 'plus': {
      const grid = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
      const armX = [Math.round(width * 0.32), Math.round(width * 0.68)];
      const armY = [Math.round(height * 0.32), Math.round(height * 0.68)];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const inHorizontalArm = y >= armY[0] && y <= armY[1];
          const inVerticalArm = x >= armX[0] && x <= armX[1];
          grid[y][x] = inHorizontalArm || inVerticalArm;
        }
      }
      return grid;
    }

    case 'diamond': {
      const grid = Array.from({ length: height }, () => Array<boolean>(width).fill(false));
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const nx = Math.abs(x - cx) / (width / 2);
          const ny = Math.abs(y - cy) / (height / 2);
          grid[y][x] = nx + ny <= 1.05;
        }
      }
      return grid;
    }

    case 'octagon': {
      const grid = keepAll(width, height);
      const cut = Math.round(Math.min(width, height) * 0.28);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const fromLeft = x;
          const fromRight = width - 1 - x;
          const fromTop = y;
          const fromBottom = height - 1 - y;
          if (fromLeft + fromTop < cut) grid[y][x] = false;
          else if (fromRight + fromTop < cut) grid[y][x] = false;
          else if (fromLeft + fromBottom < cut) grid[y][x] = false;
          else if (fromRight + fromBottom < cut) grid[y][x] = false;
        }
      }
      return grid;
    }

    case 'lShape': {
      const grid = keepAll(width, height);
      const notchW = Math.round(width * 0.45);
      const notchH = Math.round(height * 0.45);
      // Remove a random corner quadrant to form an L / bent shape.
      const corner = Math.floor(rng() * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const inNotchX = corner % 2 === 0 ? x >= width - notchW : x < notchW;
          const inNotchY = corner < 2 ? y < notchH : y >= height - notchH;
          if (inNotchX && inNotchY) grid[y][x] = false;
        }
      }
      return grid;
    }
  }
}

/** Keeps only the largest 4-connected region so the maze generator always sees one connected shape. */
function largestConnectedComponent(grid: boolean[][], width: number, height: number): Set<string> {
  const visited = new Set<string>();
  let best: Position[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!grid[y][x]) continue;
      const startKey = posKey({ x, y });
      if (visited.has(startKey)) continue;

      const component: Position[] = [];
      const queue: Position[] = [{ x, y }];
      visited.add(startKey);

      while (queue.length > 0) {
        const p = queue.pop()!;
        component.push(p);
        const dirs = [
          { x: p.x, y: p.y - 1 },
          { x: p.x + 1, y: p.y },
          { x: p.x, y: p.y + 1 },
          { x: p.x - 1, y: p.y },
        ];
        for (const n of dirs) {
          if (n.x < 0 || n.x >= width || n.y < 0 || n.y >= height) continue;
          if (!grid[n.y][n.x]) continue;
          const key = posKey(n);
          if (visited.has(key)) continue;
          visited.add(key);
          queue.push(n);
        }
      }

      if (component.length > best.length) best = component;
    }
  }

  return new Set(best.map(posKey));
}

export function generateShapeMask(
  width: number,
  height: number,
  shape: ShapeType,
  rng: Rng
): Set<string> {
  const grid = shapeGrid(width, height, shape, rng);
  return largestConnectedComponent(grid, width, height);
}
