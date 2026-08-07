import { BaseTask } from "src/types/base-task";
import { traverseGraph } from "./traverse-graph";

/**
 * Everything a single task is connected to.
 *
 * Selecting a task highlights the whole chain it sits on — every task that
 * has to happen before it, and everything waiting on it — so the knock-on
 * effects of a change are visible at a glance.
 */
export interface ConnectionHighlight {
  /** The selected task plus every task upstream or downstream of it. */
  taskIds: Set<string>;
  /** Connections between two highlighted tasks, keyed source->target. */
  edgeKeys: Set<string>;
  /** Tasks that must happen before the selected one. */
  upstreamIds: Set<string>;
  /** Tasks waiting on the selected one. */
  downstreamIds: Set<string>;
  /** Connections on the way in, and on the way out. */
  upstreamEdgeKeys: Set<string>;
  downstreamEdgeKeys: Set<string>;
}

export const EMPTY_HIGHLIGHT: ConnectionHighlight = {
  taskIds: new Set(),
  edgeKeys: new Set(),
  upstreamIds: new Set(),
  downstreamIds: new Set(),
  upstreamEdgeKeys: new Set(),
  downstreamEdgeKeys: new Set(),
};

/** Which side of the selected task a connection sits on. */
export type HighlightDirection = "upstream" | "downstream" | null;

export function highlightDirection(
  highlight: ConnectionHighlight,
  fromId: string,
  toId: string
): HighlightDirection {
  const key = connectionKey(fromId, toId);
  if (highlight.upstreamEdgeKeys.has(key)) return "upstream";
  if (highlight.downstreamEdgeKeys.has(key)) return "downstream";
  return null;
}

export function connectionKey(fromId: string, toId: string): string {
  return `${fromId}->${toId}`;
}

/**
 * @param seedId the selected task, or null when nothing is selected
 * @param tasks the tasks currently on screen; links to anything else are
 *   ignored, so a filtered-out task never pulls in an invisible chain
 */
export function getConnectionHighlight(
  seedId: string | null,
  tasks: BaseTask[]
): ConnectionHighlight {
  if (!seedId) return EMPTY_HIGHLIGHT;

  const allowedIds = new Set(tasks.map((task) => task.id));
  if (!allowedIds.has(seedId)) return EMPTY_HIGHLIGHT;

  const taskIds = new Set(traverseGraph([seedId], tasks, allowedIds, "both"));
  const upstreamIds = new Set(
    traverseGraph([seedId], tasks, allowedIds, "upstream")
  );
  const downstreamIds = new Set(
    traverseGraph([seedId], tasks, allowedIds, "downstream")
  );

  // A connection counts as part of the chain when both of its ends do. An
  // edge joining two upstream tasks is still upstream work, so it lights up
  // too; an edge to a task off the chain does not.
  const edgeKeys = new Set<string>();
  const upstreamEdgeKeys = new Set<string>();
  const downstreamEdgeKeys = new Set<string>();

  for (const task of tasks) {
    if (!taskIds.has(task.id)) continue;
    for (const blockerId of task.incomingLinks) {
      if (!taskIds.has(blockerId)) continue;

      const key = connectionKey(blockerId, task.id);
      edgeKeys.add(key);

      // Work feeding into the selected task is upstream; work waiting on it
      // is downstream. The seed itself belongs to both sets, so the other end
      // decides which way a connection points.
      if (upstreamIds.has(blockerId) && upstreamIds.has(task.id)) {
        upstreamEdgeKeys.add(key);
      } else if (downstreamIds.has(blockerId) && downstreamIds.has(task.id)) {
        downstreamEdgeKeys.add(key);
      }
    }
  }

  return {
    taskIds,
    edgeKeys,
    upstreamIds,
    downstreamIds,
    upstreamEdgeKeys,
    downstreamEdgeKeys,
  };
}

export function isHighlightActive(highlight: ConnectionHighlight): boolean {
  return highlight.taskIds.size > 0;
}
