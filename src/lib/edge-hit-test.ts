/**
 * Finding the connection a dragged node is hovering over.
 *
 * Dropping a task onto a link should splice it into that chain, which means
 * working out which line the node is over. Edges are drawn as curves, but the
 * straight line between the two node centres is close enough to pick the
 * intended one and avoids reading geometry back out of the DOM mid-drag.
 */

export interface Point {
  x: number;
  y: number;
}

export interface EdgeCandidate {
  id: string;
  sourceId: string;
  targetId: string;
  source: Point;
  target: Point;
}

/** Shortest distance from a point to a line segment. */
export function distanceToSegment(
  point: Point,
  start: Point,
  end: Point
): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  // How far along the segment the closest point sits, clamped to its ends
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared
    )
  );

  const closestX = start.x + t * dx;
  const closestY = start.y + t * dy;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

/**
 * The connection a node is being dragged over, or null.
 *
 * Connections that already touch the dragged node are ignored — inserting a
 * task into a chain it is already part of would just tie it to itself.
 */
export function findEdgeUnderPoint(
  point: Point,
  edges: EdgeCandidate[],
  draggedTaskId: string,
  threshold = 40
): EdgeCandidate | null {
  let best: EdgeCandidate | null = null;
  let bestDistance = threshold;

  for (const edge of edges) {
    if (edge.sourceId === draggedTaskId || edge.targetId === draggedTaskId) {
      continue;
    }

    const distance = distanceToSegment(point, edge.source, edge.target);
    if (distance < bestDistance) {
      best = edge;
      bestDistance = distance;
    }
  }

  return best;
}
