import type { ShapeType } from '../maze/shapes';
import type { BlockPlan } from '../maze/world';

/** Shape variety unlocked per chapter — chapter 1 stays near-rectangular, later chapters get wilder silhouettes. */
const SHAPES_BY_CHAPTER: Record<1 | 2 | 3 | 4, ShapeType[]> = {
  1: ['rect', 'octagon'],
  2: ['rect', 'plus', 'octagon'],
  3: ['rect', 'plus', 'diamond', 'octagon', 'lShape'],
  4: ['plus', 'diamond', 'octagon', 'lShape', 'rect'],
};

/**
 * More blocks per level means each individual block shrinks a bit (so total playtime stays
 * reasonable) but overall complexity still climbs sharply — see mazeshift-level-plan memory.
 */
function perBlockSizeFactor(numBlocks: number): number {
  return 0.55 + 0.45 / numBlocks;
}

export function buildBlockPlans(
  numBlocks: number,
  levelWidth: number,
  levelHeight: number,
  levelId: number,
  chapter: 1 | 2 | 3 | 4
): BlockPlan[] {
  const factor = perBlockSizeFactor(numBlocks);
  const baseWidth = Math.round(levelWidth * factor);
  const baseHeight = Math.round(levelHeight * factor);
  const shapes = SHAPES_BY_CHAPTER[chapter];

  const plans: BlockPlan[] = [];
  for (let i = 0; i < numBlocks; i++) {
    // Deterministic mild size variance so consecutive blocks don't look identical.
    const variance = 1 + (((levelId * 13 + i * 7) % 5) - 2) * 0.06;
    const width = Math.max(8, Math.round(baseWidth * variance));
    const height = Math.max(8, Math.round(baseHeight * variance));
    // First block of every level stays a plain rectangle — a gentle, unmistakable starting room.
    const shape: ShapeType = i === 0 ? 'rect' : shapes[(levelId + i) % shapes.length];
    plans.push({ width, height, shape });
  }
  return plans;
}
