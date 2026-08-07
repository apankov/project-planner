import { BaseTask } from "src/types/base-task";

/**
 * Keeping a chain intact when a task in the middle of it goes.
 *
 * Deleting B from A → B → C used to leave A and C unconnected, silently
 * breaking the plan: C no longer waited for anything and the run of work
 * fell apart. Removing a task now hands its blockers to the tasks that were
 * waiting on it, so A → C survives.
 */

export interface HealingLink {
  /** Task that must finish first. */
  fromId: string;
  toId: string;
}

/** Tasks that are waiting on this one. */
export function findDependents(taskId: string, tasks: BaseTask[]): BaseTask[] {
  return tasks.filter((task) => task.incomingLinks.includes(taskId));
}

/**
 * The connections needed to close the gap a deleted task leaves behind: each
 * of its blockers joined to each task that was waiting on it.
 *
 * Links that already exist are left out, as is any pairing of a task with
 * itself — which a cycle through the deleted task would otherwise produce.
 */
export function planChainHealing(
  taskId: string,
  tasks: BaseTask[]
): HealingLink[] {
  const removed = tasks.find((task) => task.id === taskId);
  if (!removed) return [];

  const dependents = findDependents(taskId, tasks);
  if (dependents.length === 0) return [];

  const blockerIds = removed.incomingLinks.filter((id) => id !== taskId);
  const links: HealingLink[] = [];

  for (const blockerId of blockerIds) {
    // A blocker that is no longer in the graph cannot be reconnected
    if (!tasks.some((task) => task.id === blockerId)) continue;

    for (const dependent of dependents) {
      if (dependent.id === blockerId) continue;
      if (dependent.incomingLinks.includes(blockerId)) continue;
      links.push({ fromId: blockerId, toId: dependent.id });
    }
  }

  return links;
}
