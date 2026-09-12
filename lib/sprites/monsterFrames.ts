import type { Direction } from '../maze/world';
import type { MonsterType } from '../modules/monsters/types';

export interface MonsterSheet {
  asset: number;
  imageWidth: number;
  imageHeight: number;
  sizeMultiplier?: number;
  frames: { x: number; y: number; width: number; height: number }[];
}

/** Alpha-measured, individually inspected strips, not assumed equal-width frames.
 * Keep one vertical crop/baseline and scale for the whole direction's cycle.
 * Padding around horizontal bounds retains antialiased edges. Authored poses
 * may change silhouette width; no per-frame stretching or height normalization.
 */
function sheet(asset: number, imageWidth: number, imageHeight: number, y: number, height: number,
  bounds: [number, number][], sizeMultiplier = 1): MonsterSheet {
  return { asset, imageWidth, imageHeight, sizeMultiplier,
    frames: bounds.map(([x, width]) => ({ x, y, width, height })) };
}

export const MONSTER_SHEETS: Record<MonsterType, Record<Direction, MonsterSheet>> = {
  hunter: {
    // Connected-body bounds exclude detached separator lines baked into these PNGs.
    down: sheet(require('../../assets/monsters/hunter/down_hunter.png'), 1362, 251, 0, 250,
      [[4,239],[276,246],[555,242],[829,244],[1117,229]]),
    up: sheet(require('../../assets/monsters/hunter/up_hunter.png'), 1365, 248, 2, 246,
      [[24,212],[300,198],[571,210],[853,202],[1127,210]]),
    left: sheet(require('../../assets/monsters/hunter/hunt_left.png'), 2172, 724, 27, 609,
      [[10,424],[434,434],[868,435],[1303,434],[1737,435]], 1.2),
    right: sheet(require('../../assets/monsters/hunter/hunt_right.png'), 2172, 724, 27, 609,
      [[0,434],[434,434],[868,435],[1303,434],[1737,425]], 1.2),
  },
  wraith: {
    down: sheet(require('../../assets/monsters/ghost/ghost_down.png'), 1359, 250, 0, 250,
      [[0,250],[267,259],[539,274],[817,264],[1088,271]]),
    up: sheet(require('../../assets/monsters/ghost/ghost_up.png'), 544, 100, 2, 98,
      [[8,86],[112,93],[222,91],[331,90],[438,96]]),
    left: sheet(require('../../assets/monsters/ghost/ghost_left.png'), 1387, 240, 0, 240,
      [[0,266],[284,269],[556,276],[833,274],[1110,277]]),
    right: sheet(require('../../assets/monsters/ghost/ghost_right.png'), 1372, 271, 0, 258,
      [[2,261],[270,276],[548,269],[823,268],[1097,275]]),
  },
  brute: {
    down: sheet(require('../../assets/monsters/brute_breakwalls/down_bomber.png'), 542, 106, 0, 106,
      [[7,70],[117,71],[230,70],[343,73],[461,69]]),
    up: sheet(require('../../assets/monsters/brute_breakwalls/up_bomber.png'), 555, 103, 2, 101,
      [[14,64],[124,63],[233,64],[349,65],[461,65]]),
    left: sheet(require('../../assets/monsters/brute_breakwalls/bomb_left.png'), 866, 288, 55, 181,
      [[24,127],[189,140],[386,107],[549,133],[731,125]]),
    right: sheet(require('../../assets/monsters/brute_breakwalls/bomb_right.png'), 866, 288, 55, 181,
      [[10,125],[184,133],[373,107],[537,140],[715,127]]),
  },
  stalker: {
    down: sheet(require('../../assets/monsters/stalker/down_stalker.png'), 1383, 282, 0, 282,
      [[27,247],[287,277],[568,265],[850,256],[1115,266]]),
    up: sheet(require('../../assets/monsters/stalker/up_stalker.png'), 1383, 291, 3, 288,
      [[0,276],[302,244],[559,265],[834,271],[1110,273]]),
    left: sheet(require('../../assets/monsters/stalker/stalk_left.png'), 866, 288, 63, 177,
      [[10,163],[173,171],[363,156],[529,163],[692,169]], 1.2),
    right: sheet(require('../../assets/monsters/stalker/stalk_right.png'), 866, 288, 63, 177,
      [[5,168],[173,164],[347,156],[522,170],[692,164]], 1.2),
  },
};
