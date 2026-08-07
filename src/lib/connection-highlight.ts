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
}

export const EMPTY_HIGHLIGHT: ConnectionHighlight = {
  taskIds: new Set(),
  edgeKeys: new Set(),
};

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

  // A connection counts as part of the chain when both of its ends do. An
  // edge joining two upstream tasks is still upstream work, so it lights up
  // too; an edge to a task off the chain does not.
  const edgeKeys = new Set<string>();
  for (const task of tasks) {
    if (!taskIds.has(task.id)) continue;
    for (const blockerId of task.incomingLinks) {
      if (!taskIds.has(blockerId)) continue;
      edgeKeys.add(connectionKey(blockerId, task.id));
    }
  }

  return { taskIds, edgeKeys };
}

export function isHighlightActive(highlight: ConnectionHighlight): boolean {
  return highlight.taskIds.size > 0;
}
