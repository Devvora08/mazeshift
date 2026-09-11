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

/** Pickup markers render these instead of plain dots — one commissioned image per spell,
 *  matching the gesture each sigil draws (see sigils.ts / the recognizer templates). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SPELL_ICONS: Record<UtilityType, any> = {
  phase: require('../../../assets/spells/spell1.png'),
  destroy: require('../../../assets/spells/spell2.png'),
  scramble: require('../../../assets/spells/spell3.png'),
  dash: require('../../../assets/spells/spell4.png'),
  shield: require('../../../assets/spells/spell5.png'),
  trap: require('../../../assets/spells/spell6.png'),
};
