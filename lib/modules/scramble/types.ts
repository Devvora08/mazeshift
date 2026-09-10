export interface ScrambleConfig {
  enabled: boolean;
  /** Randomized interval range, in seconds, between scrambles. */
  minIntervalSec: number;
  maxIntervalSec: number;
  /** Chance (0-1) that a scramble "tell" plays but nothing actually changes — keeps players honest. */
  falseAlarmChance: number;
  /** Fraction of the *current block's* active cells attempted as wall toggles per scramble (0-1). */
  intensityRatio: number;
}

/** Composes into a LevelConfig to turn the scramble module off for that level (e.g. levels 1-2). */
export const NO_SCRAMBLE: ScrambleConfig = {
  enabled: false,
  minIntervalSec: 0,
  maxIntervalSec: 0,
  falseAlarmChance: 0,
  intensityRatio: 0,
};
