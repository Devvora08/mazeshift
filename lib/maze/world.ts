import { generateMaze } from './generate';
import { posKey } from './graph';
import { createRng, type Rng } from './rng';
import { generateShapeMask, type ShapeType } from './shapes';
import type { Maze, Position } from './types';

export interface BlockPlan {
  width: number;
  height: number;
  shape: ShapeType;
}

export interface MazeBlock {
  id: string;
  index: number;
  maze: Maze;
  /** Top-left of this block's bounding box, in cell units, within the level's shared world space. */
  worldOffsetX: number;
  worldOffsetY: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export const DIRECTION_DELTAS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export interface Gateway {
  fromBlockId: string;
  fromCell: Position;
  toBlockId: string;
  toCell: Position;
  /** Which way the player must move from `fromCell` to use this gateway. */
  direction: Direction;
}

export interface MazeWorld {
  blocks: MazeBlock[];
  /** Outgoing gateways keyed by blockId (each gateway also appears reversed under its target block). */
  gatewaysByBlock: Map<string, Gateway[]>;
  startBlockId: string;
  endBlockId: string;
  worldWidth: number;
  worldHeight: number;
}

const ROW_SIZE = 2;
const BLOCK_GAP = 3;
const GATEWAYS_PER_LINK = 4;

function layoutBlocks(plans: BlockPlan[]): { worldOffsetX: number; worldOffsetY: number }[] {
  const numCols = ROW_SIZE;
  const numRows = Math.ceil(plans.length / numCols);

  const colSlot = (i: number) => {
    const row = Math.floor(i / numCols);
    const posInRow = i % numCols;
    const goingRight = row % 2 === 0;
    return goingRight ? posInRow : numCols - 1 - posInRow;
  };
  const rowOf = (i: number) => Math.floor(i / numCols);

  const colWidths = new Array(numCols).fill(0);
  const rowHeights = new Array(numRows).fill(0);
  for (let i = 0; i < plans.length; i++) {
    colWidths[colSlot(i)] = Math.max(colWidths[colSlot(i)], plans[i].width);
    rowHeights[rowOf(i)] = Math.max(rowHeights[rowOf(i)], plans[i].height);
  }

  const colX: number[] = [];
  for (let c = 0, acc = 0; c < numCols; c++) {
    colX.push(acc);
    acc += colWidths[c] + BLOCK_GAP;
  }
  const rowY: number[] = [];
  for (let r = 0, acc = 0; r < numRows; r++) {
    rowY.push(acc);
    acc += rowHeights[r] + BLOCK_GAP;
  }

  return plans.map((_, i) => ({ worldOffsetX: colX[colSlot(i)], worldOffsetY: rowY[rowOf(i)] }));
}

function boundaryByRow(mask: ReadonlySet<string>, width: number, height: number, side: 'left' | 'right') {
  const map = new Map<number, number>();
  for (let y = 0; y < height; y++) {
    const xs = side === 'left' ? range(0, width) : range(width - 1, -1, -1);
    for (const x of xs) {
      if (mask.has(posKey({ x, y }))) {
        map.set(y, x);
        break;
      }
    }
  }
  return map;
}

function boundaryByCol(mask: ReadonlySet<string>, width: number, height: number, side: 'top' | 'bottom') {
  const map = new Map<number, number>();
  for (let x = 0; x < width; x++) {
    const ys = side === 'top' ? range(0, height) : range(height - 1, -1, -1);
    for (const y of ys) {
      if (mask.has(posKey({ x, y }))) {
        map.set(x, y);
        break;
      }
    }
  }
  return map;
}

function range(start: number, end: number, step = 1): number[] {
  const out: number[] = [];
  if (step > 0) for (let i = start; i < end; i += step) out.push(i);
  else for (let i = start; i > end; i += step) out.push(i);
  return out;
}

function pickEvenlySpaced<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  if (count <= 1) return [items[Math.floor(items.length / 2)]];
  const picked: T[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i * (items.length - 1)) / (count - 1));
    picked.push(items[idx]);
  }
  return picked;
}

type LinkDirection = 'right' | 'left' | 'down';

function directionBetween(
  a: { worldOffsetX: number; worldOffsetY: number },
  b: { worldOffsetX: number; worldOffsetY: number }
): LinkDirection {
  if (a.worldOffsetY === b.worldOffsetY) return b.worldOffsetX > a.worldOffsetX ? 'right' : 'left';
  return 'down';
}

function opposite(direction: LinkDirection): Direction {
  if (direction === 'right') return 'left';
  if (direction === 'left') return 'right';
  return 'up';
}

function findGatewayPairs(
  maskA: ReadonlySet<string>,
  widthA: number,
  heightA: number,
  maskB: ReadonlySet<string>,
  widthB: number,
  heightB: number,
  direction: LinkDirection
): [Position, Position][] {
  let pairs: [Position, Position][] = [];

  if (direction === 'right' || direction === 'left') {
    const aSide = direction === 'right' ? 'right' : 'left';
    const bSide = direction === 'right' ? 'left' : 'right';
    const aBoundary = boundaryByRow(maskA, widthA, heightA, aSide);
    const bBoundary = boundaryByRow(maskB, widthB, heightB, bSide);
    for (const [y, ax] of aBoundary) {
      const bx = bBoundary.get(y);
      if (bx !== undefined) pairs.push([{ x: ax, y }, { x: bx, y }]);
    }
    if (pairs.length === 0) {
      pairs = fallbackCenterPair(aBoundary, bBoundary, 'row');
    }
  } else {
    const aBoundary = boundaryByCol(maskA, widthA, heightA, 'bottom');
    const bBoundary = boundaryByCol(maskB, widthB, heightB, 'top');
    for (const [x, ay] of aBoundary) {
      const by = bBoundary.get(x);
      if (by !== undefined) pairs.push([{ x, y: ay }, { x, y: by }]);
    }
    if (pairs.length === 0) {
      pairs = fallbackCenterPair(aBoundary, bBoundary, 'col');
    }
  }

  return pickEvenlySpaced(pairs, GATEWAYS_PER_LINK);
}

/** No aligned row/col at all (very pointy, mismatched shapes) — connect the two boundary cells closest to center anyway. */
function fallbackCenterPair(
  aBoundary: Map<number, number>,
  bBoundary: Map<number, number>,
  axis: 'row' | 'col'
): [Position, Position][] {
  if (aBoundary.size === 0 || bBoundary.size === 0) return [];
  const aKeys = [...aBoundary.keys()];
  const bKeys = [...bBoundary.keys()];
  const aMid = aKeys[Math.floor(aKeys.length / 2)];
  const bMid = bKeys[Math.floor(bKeys.length / 2)];
  const a = aBoundary.get(aMid)!;
  const b = bBoundary.get(bMid)!;
  const cellA = axis === 'row' ? { x: a, y: aMid } : { x: aMid, y: a };
  const cellB = axis === 'row' ? { x: b, y: bMid } : { x: bMid, y: b };
  return [[cellA, cellB]];
}

/** Active cell farthest (Manhattan) from `from` — used to place the level's true exit away from its block's entry. */
function farthestActiveCell(mask: ReadonlySet<string>, from: Position): Position {
  let best = from;
  let bestDist = -1;
  for (const key of mask) {
    const [x, y] = key.split(',').map(Number);
    const dist = Math.abs(x - from.x) + Math.abs(y - from.y);
    if (dist > bestDist) {
      bestDist = dist;
      best = { x, y };
    }
  }
  return best;
}

function nearestActiveCellToOrigin(mask: ReadonlySet<string>): Position {
  let best: Position = { x: 0, y: 0 };
  let bestDist = Infinity;
  for (const key of mask) {
    const [x, y] = key.split(',').map(Number);
    const dist = x + y;
    if (dist < bestDist) {
      bestDist = dist;
      best = { x, y };
    }
  }
  return best;
}

export function generateWorld(plans: BlockPlan[], seed: number, braidRatio = 0.15): MazeWorld {
  const layout = layoutBlocks(plans);

  const masks = plans.map((plan, i) => {
    const maskRng: Rng = createRng(seed + (i + 1) * 104729);
    return generateShapeMask(plan.width, plan.height, plan.shape, maskRng);
  });

  // Gateways between each consecutive pair, using the pre-computed masks (before walls exist).
  const linkGateways: [Position, Position][][] = [];
  const linkDirections: LinkDirection[] = [];
  for (let i = 0; i < plans.length - 1; i++) {
    const direction = directionBetween(layout[i], layout[i + 1]);
    const pairs = findGatewayPairs(
      masks[i],
      plans[i].width,
      plans[i].height,
      masks[i + 1],
      plans[i + 1].width,
      plans[i + 1].height,
      direction
    );
    linkGateways.push(pairs);
    linkDirections.push(direction);
  }

  const blocks: MazeBlock[] = [];
  const gatewaysByBlock = new Map<string, Gateway[]>();

  for (let i = 0; i < plans.length; i++) {
    const id = `b${i}`;
    const isFirst = i === 0;
    const isLast = i === plans.length - 1;

    const localStart = isFirst
      ? nearestActiveCellToOrigin(masks[i])
      : linkGateways[i - 1][0][1]; // this block's side of the incoming link's first gateway

    const localEnd = isLast
      ? farthestActiveCell(masks[i], localStart)
      : linkGateways[i][0][0]; // this block's side of the outgoing link's first gateway

    const maze = generateMaze({
      width: plans[i].width,
      height: plans[i].height,
      seed: seed + (i + 1) * 104729,
      activeCells: masks[i],
      start: localStart,
      end: localEnd,
      braidRatio,
    });

    blocks.push({
      id,
      index: i,
      maze,
      worldOffsetX: layout[i].worldOffsetX,
      worldOffsetY: layout[i].worldOffsetY,
    });
    gatewaysByBlock.set(id, []);
  }

  for (let i = 0; i < plans.length - 1; i++) {
    const fromId = `b${i}`;
    const toId = `b${i + 1}`;
    const direction = linkDirections[i];
    for (const [cellA, cellB] of linkGateways[i]) {
      gatewaysByBlock
        .get(fromId)!
        .push({ fromBlockId: fromId, fromCell: cellA, toBlockId: toId, toCell: cellB, direction });
      gatewaysByBlock
        .get(toId)!
        .push({ fromBlockId: toId, fromCell: cellB, toBlockId: fromId, toCell: cellA, direction: opposite(direction) });
    }
  }

  const worldWidth = Math.max(...blocks.map((b) => b.worldOffsetX + b.maze.width));
  const worldHeight = Math.max(...blocks.map((b) => b.worldOffsetY + b.maze.height));

  return {
    blocks,
    gatewaysByBlock,
    startBlockId: blocks[0].id,
    endBlockId: blocks[blocks.length - 1].id,
    worldWidth,
    worldHeight,
  };
}
