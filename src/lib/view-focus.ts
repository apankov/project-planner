/**
 * Showing the same task in the other view.
 *
 * The view ids and the focus event live here, in a module that imports
 * nothing, because both views and the plugin entry point need them. Reading
 * them from `main` instead would form an import cycle — the plugin imports
 * the views, so the views cannot import the plugin for a runtime value.
 */

export const MAP_VIEW_TYPE = "project-planner-graph-view";
export const GANTT_VIEW_TYPE = "project-planner-gantt-view";
export const FINANCE_VIEW_TYPE = "project-planner-finance-view";
export const KANBAN_VIEW_TYPE = "project-planner-kanban-view";
export const OPEN_QUESTIONS_VIEW_TYPE = "project-planner-open-questions-view";

export const FOCUS_TASK_EVENT = "project-planner:focus-task";

export interface FocusTaskDetail {
  viewType: string;
  taskId: string;
}

/** Asks whichever view owns `viewType` to reveal a task. */
export function requestTaskFocus(viewType: string, taskId: string): void {
  window.dispatchEvent(
    new CustomEvent<FocusTaskDetail>(FOCUS_TASK_EVENT, {
      detail: { viewType, taskId },
    })
  );
}

/** The task id in a focus event, when it is meant for this view. */
export function focusTargetFor(event: Event, viewType: string): string | null {
  const detail = (event as CustomEvent<FocusTaskDetail>).detail;
  if (!detail || detail.viewType !== viewType) return null;
  return detail.taskId;
}
