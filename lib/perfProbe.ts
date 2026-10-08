import { UNLOCK_ALL_LEVELS } from './devUnlock';

/** Test-build JS cost accounting, read once per second by PerformanceReadout.
 * Release builds without the test flag skip all timing. */
const enabled = UNLOCK_ALL_LEVELS;
const totals = new Map<string, { total: number; worst: number }>();

export function measure<T>(name: string, fn: () => T): T {
  if (!enabled) return fn();
  const start = performance.now();
  try {
    return fn();
  } finally {
    const ms = performance.now() - start;
    const entry = totals.get(name);
    if (entry) { entry.total += ms; if (ms > entry.worst) entry.worst = ms; }
    else totals.set(name, { total: ms, worst: ms });
  }
}

/** Top consumers since the last call, as "name total/worst" in ms. */
export function drainMeasurements(limit = 3): string {
  const top = [...totals.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, limit)
    .map(([name, { total, worst }]) => `${name} ${Math.round(total)}/${Math.round(worst)}`);
  totals.clear();
  return top.join(' · ');
}

const counts = new Map<string, number>();

/** Occurrences per second, e.g. React renders of the game screen. */
export function count(name: string) {
  if (enabled) counts.set(name, (counts.get(name) ?? 0) + 1);
}

export function drainCounts(): string {
  const text = [...counts.entries()].map(([name, n]) => `${name} ${n}/s`).join(' · ');
  counts.clear();
  return text;
}
