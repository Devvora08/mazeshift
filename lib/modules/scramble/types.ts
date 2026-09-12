export interface ScrambleConfig {
  enabled: boolean;
  /** Randomized interval range, in seconds, between scrambles. */
  minIntervalSec: number;
  maxIntervalSec: number;
  /** Chance (0-1) that a scramble "tell" plays but nothing actually changes — keeps players honest. */
  falseAlarmChance: number;
  /** Target fraction of eligible interior connections changed in every block.
   * Permanent/in-use edges are excluded; full connectivity takes priority. */
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
