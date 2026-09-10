import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { useMemo } from 'react';

import { edgeKey } from '../lib/maze/graph';
import type { Maze } from '../lib/maze/types';

interface MazeCanvasProps {
  maze: Maze;
  width: number;
  height: number;
}

export function MazeCanvas({ maze, width, height }: MazeCanvasProps) {
  const cellSize = Math.min(width / maze.width, height / maze.height);
  const offsetX = (width - cellSize * maze.width) / 2;
  const offsetY = (height - cellSize * maze.height) / 2;

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

  const markerRadius = cellSize * 0.28;

  return (
    <Canvas style={{ width, height }}>
      <Path path={wallsPath} color="#1c1a17" style="stroke" strokeWidth={3} strokeJoin="round" />
      <Circle
        cx={offsetX + (maze.start.x + 0.5) * cellSize}
        cy={offsetY + (maze.start.y + 0.5) * cellSize}
        r={markerRadius}
        color="#22d3ee"
      />
      <Circle
        cx={offsetX + (maze.end.x + 0.5) * cellSize}
        cy={offsetY + (maze.end.y + 0.5) * cellSize}
        r={markerRadius}
        color="#dc2626"
      />
    </Canvas>
  );
}
