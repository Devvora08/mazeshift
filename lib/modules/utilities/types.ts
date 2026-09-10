export type UtilityType = 'phase' | 'destroy' | 'scramble' | 'dash' | 'shield' | 'trap';

/** Keep in sync with the `spell` colors in tailwind.config.js — Skia needs real hex strings, not
 *  Tailwind class names, so this is the JS-side source of truth for anything drawn on canvas. */
export const SPELL_COLORS: Record<UtilityType, string> = {
  phase: '#22d3ee',
  destroy: '#f97316',
  scramble: '#a3e635',
  dash: '#facc15',
  shield: '#38bdf8',
  trap: '#ef4444',
};
