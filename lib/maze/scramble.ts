import { edgeKey, isReachable } from './graph';
import { shuffle, type Rng } from './rng';
import type { Maze, Position } from './types';

export interface ScrambleResult {
  maze: Maze;
  /** How many wall toggles actually landed (closing a wall can be rejected if it would cut off the exit). */
  changedEdges: number;
}

function allAdjacentPairs(width: number, height: number): [Position, Position][] {
  const pairs: [Position, Position][] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = { x, y };
      const right = { x: x + 1, y };
      const down = { x, y: y + 1 };
      if (right.x < width) pairs.push([cell, right]);
      if (down.y < height) pairs.push([cell, down]);
    }
  }
  return pairs;
}

/**
 * Randomly toggles walls to reshuffle the maze while guaranteeing start -> end stays reachable.
 * Opening a wall is always safe (adding edges never disconnects). Closing a wall is only
 * committed if, after the change, `end` is still reachable from `start` — this is the
 * "controlled chaos, not random chaos" constraint from the design brief.
 */
export function scrambleMaze(maze: Maze, rng: Rng, intensity: number): ScrambleResult {
  const openEdges = new Set(maze.openEdges);
  const candidates = shuffle(rng, allAdjacentPairs(maze.width, maze.height));

  let changedEdges = 0;
  for (const [a, b] of candidates) {
    if (changedEdges >= intensity) break;

    const key = edgeKey(a, b);
    const isOpen = openEdges.has(key);

    if (isOpen) {
      // Closing a wall: only allowed if the exit is still reachable afterward.
      openEdges.delete(key);
      if (!isReachable(openEdges, maze.width, maze.height, maze.start, maze.end)) {
        openEdges.add(key); // revert
        continue;
      }
    } else {
      // Opening a wall is always safe.
      openEdges.add(key);
    }

    changedEdges++;
  }

  return { maze: { ...maze, openEdges }, changedEdges };
}

/** Dev-time safety net: every scrambled maze must still connect start to end and every cell to the start. */
export function assertMazeIsFair(maze: Maze): void {
  if (!isReachable(maze.openEdges, maze.width, maze.height, maze.start, maze.end)) {
    throw new Error('Scrambled maze disconnected start from end — this must never happen.');
  }
}
