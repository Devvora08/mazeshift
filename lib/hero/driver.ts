import type { Direction } from '../maze/world';
import type { WorldCell } from '../modules/monsters/types';
import type { UtilityType } from '../modules/utilities/types';

/**
 * The on-screen hero is moved by a UI-thread engine (components/heroMotion), so
 * held movement never waits on JavaScript. The store reaches it through this
 * driver for moves it initiates itself (Dash, Phase). With no driver attached —
 * headless tests, or before the canvas mounts — the store moves the hero itself.
 */
export interface ForcedSteps {
  /** The cell the hero must still be standing on; otherwise the command is rejected. */
  from: WorldCell;
  steps: WorldCell[];
  direction: Direction;
  stepMs: number;
  /** Returned to the inventory if the command is rejected. */
  refund: UtilityType;
}

export interface HeroDriver {
  force(command: ForcedSteps): void;
}

let driver: HeroDriver | null = null;

export function attachHeroDriver(next: HeroDriver): () => void {
  driver = next;
  return () => { if (driver === next) driver = null; };
}

export function heroDriver(): HeroDriver | null {
  return driver;
}
