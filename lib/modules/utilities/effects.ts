import { touches } from '../monsters/logic';
import type { Monster, WorldCell } from '../monsters/types';

export const SHIELD_MS = 5000;
export const TRAP_LIFETIME_MS = 15000;
export const TRAP_HOLD_MS = 4000;
export const DASH_STEPS = 3;
export const DASH_STEP_MS = 80;
export interface PlacedTrap { id: string; location: WorldCell; expiresAt: number }

/** Resolve trap contact before lethal contact, including a monster arriving on
 * the hero's trapped cell. Triggered traps are single-use; held monsters cannot
 * move, bomb, broadcast or deal contact damage until their hold expires. */
export function triggerTraps(monsters: Monster[], traps: PlacedTrap[], start: number, end: number) {
  let nextMonsters = monsters;
  const remaining: PlacedTrap[] = [];
  for (const trap of traps) {
    const contactEnd = Math.min(end, trap.expiresAt - 0.001);
    const index = contactEnd >= start ? nextMonsters.findIndex(m => (m.stunnedUntil ?? 0) <= start
      && touches(m.location, m.travel, trap.location, null, start, contactEnd)) : -1;
    if (index >= 0) {
      if (nextMonsters === monsters) nextMonsters = monsters.slice();
      nextMonsters[index] = { ...nextMonsters[index], location: trap.location, travel: null, bomb: null,
        mode: 'stunned', stunnedUntil: end + TRAP_HOLD_MS };
    } else if (trap.expiresAt > end) remaining.push(trap);
  }
  return { monsters: nextMonsters, traps: remaining.length === traps.length ? traps : remaining };
}
