import { Atlas, Canvas, Circle, Path, Skia, rect, useImage } from '@shopify/react-native-skia';
import { useMemo } from 'react';

import { edgeKey } from '../lib/maze/graph';
import type { Maze } from '../lib/maze/types';
import { HERO_SHEETS } from '../lib/sprites/heroFrames';
import { useSpriteLoop } from '../hooks/useSpriteLoop';

interface MazeCanvasProps {
  maze: Maze;
  width: number;
  height: number;
}

/** Hero is drawn taller than one cell (typical for top-down adventure sprites), anchored feet-down. */
const HERO_HEIGHT_IN_CELLS = 1.7;
const IDLE_FPS = 6;

export function MazeCanvas({ maze, width, height }: MazeCanvasProps) {
  const cellSize = Math.min(width / maze.width, height / maze.height);
  const offsetX = (width - cellSize * maze.width) / 2;
  const offsetY = (height - cellSize * maze.height) / 2;

  const heroImage = useImage(HERO_SHEETS.idle.asset);
  const frameIndex = useSpriteLoop(HERO_SHEETS.idle.frames.length, IDLE_FPS);
  const heroFrame = HERO_SHEETS.idle.frames[frameIndex];

  const wallsPath = useMemo(() => {
    const pb = Skia.PathBuilder.Make();
    const w = maze.width;
    const h = maze.height;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const hasTopWall = y === 0 || !maze.openEdges.has(edgeKey({ x, y: y - 1 }, { x, y }));
        if (hasTopWall) {
          pb.moveTo(offsetX + x * cellSize, offsetY + y * cellSize);
          pb.lineTo(offsetX + (x + 1) * cellSize, offsetY + y * cellSize);
        }

        const hasLeftWall = x === 0 || !maze.openEdges.has(edgeKey({ x: x - 1, y }, { x, y }));
        if (hasLeftWall) {
          pb.moveTo(offsetX + x * cellSize, offsetY + y * cellSize);
          pb.lineTo(offsetX + x * cellSize, offsetY + (y + 1) * cellSize);
        }
      }
    }

    // Outer boundary's bottom and right edges aren't covered by any cell's top/left wall above.
    pb.moveTo(offsetX, offsetY + h * cellSize);
    pb.lineTo(offsetX + w * cellSize, offsetY + h * cellSize);
    pb.moveTo(offsetX + w * cellSize, offsetY);
    pb.lineTo(offsetX + w * cellSize, offsetY + h * cellSize);

    return pb.build();
  }, [maze, cellSize, offsetX, offsetY]);

  const exitMarkerRadius = cellSize * 0.24;
  const exitCx = offsetX + (maze.end.x + 0.5) * cellSize;
  const exitCy = offsetY + (maze.end.y + 0.5) * cellSize;

  const heroScale = (cellSize * HERO_HEIGHT_IN_CELLS) / heroFrame.height;
  const heroCellCx = offsetX + (maze.start.x + 0.5) * cellSize;
  const heroCellBottom = offsetY + (maze.start.y + 1) * cellSize;
  const heroDestX = heroCellCx - (heroFrame.width * heroScale) / 2;
  const heroDestY = heroCellBottom - heroFrame.height * heroScale;

  return (
    <Canvas style={{ width, height }}>
      <Path path={wallsPath} color="#111111" style="stroke" strokeWidth={2.5} strokeJoin="round" />
      <Circle cx={exitCx} cy={exitCy} r={exitMarkerRadius} color="#111111" style="stroke" strokeWidth={2} />
      <Circle cx={exitCx} cy={exitCy} r={exitMarkerRadius * 0.35} color="#111111" />
      {heroImage && (
        <Atlas
          image={heroImage}
          sprites={[rect(heroFrame.x, heroFrame.y, heroFrame.width, heroFrame.height)]}
          transforms={[Skia.RSXform(heroScale, 0, heroDestX, heroDestY)]}
        />
      )}
    </Canvas>
  );
}
