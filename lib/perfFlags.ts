import { useSyncExternalStore } from 'react';

/**
 * Test-build switches for isolating performance costs on a device. Each turns one
 * subsystem off while playing; the PERF readout shows the effect. Defaults keep
 * the game unchanged, and nothing here is reachable without the test flag.
 */
export const PERF_FLAGS = ['monsterAI', 'monsterDraw', 'scramble', 'pickups', 'audio'] as const;
export type PerfFlag = typeof PERF_FLAGS[number];

let disabled: ReadonlySet<PerfFlag> = new Set();
const listeners = new Set<() => void>();

export function isDisabled(flag: PerfFlag): boolean {
  return disabled.has(flag);
}

export function toggleFlag(flag: PerfFlag) {
  const next = new Set(disabled);
  if (next.has(flag)) next.delete(flag); else next.add(flag);
  disabled = next;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useDisabledFlags(): ReadonlySet<PerfFlag> {
  return useSyncExternalStore(subscribe, () => disabled);
}
