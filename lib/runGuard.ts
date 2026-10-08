/**
 * The game store outlives the game screen, so a newly opened level screen can
 * briefly see the previous level's run (its win, death and clock). Progress may
 * only be recorded for the run this screen itself loaded.
 */
export function screenOwnsRun(
  game: { runId: number; level: { id: number } | null },
  loadedRunId: number | null,
  levelId: number,
): boolean {
  return loadedRunId !== null && game.runId === loadedRunId && game.level?.id === levelId;
}
