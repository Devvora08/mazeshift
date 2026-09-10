export interface Position {
  x: number;
  y: number;
}

export interface Maze {
  width: number;
  height: number;
  start: Position;
  end: Position;
  /** Canonical edge keys ("x1,y1-x2,y2") for adjacent cell pairs with no wall between them. */
  openEdges: Set<string>;
  /** posKeys of cells that actually exist within the width x height bounding box — lets a maze be a non-rectangular shape. */
  activeCells: Set<string>;
}
