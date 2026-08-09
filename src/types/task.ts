import { Node, Edge } from "reactflow";
import { BaseTask } from "./base-task";
import { TagColorPalette, TagColorOverrides } from "../lib/tag-color-manager";
import { EdgeStyleOverride } from "../lib/edge-style-manager";
import { CompanionNoteOptions } from "../lib/companion-note";

export type TaskStatus = "todo" | "in_progress" | "canceled" | "done";
export type TaskType = "dataview" | "note";

export interface RawTask {
  status: string;
  text: string;
  link: { path: string };
}

// Re-export BaseTask for convenience
export { BaseTask };

export interface TaskNodeData {
  task: BaseTask;
  layoutDirection?: "Horizontal" | "Vertical";
  showPriorities?: boolean;
  showTags?: boolean;
  debugVisualization?: boolean;
  groupByProject?: boolean;
  tagColorPalette?: TagColorPalette;
  tagColorOverrides?: TagColorOverrides;
  companionNoteOptions?: CompanionNoteOptions;
  /** On the chain of the selected task. */
  connected?: boolean;
  /** Off the chain while some other task is selected. */
  dimmed?: boolean;
  /** On the chain of tasks with no slack, when that is being shown. */
  critical?: boolean;
  // eslint-disable-next-line no-unused-vars -- callback parameter convention
  onDeleteTask?: (taskId: string) => void;
  onRequestDelete?: (_task: BaseTask) => Promise<void>;
  // eslint-disable-next-line no-unused-vars -- callback parameter convention
  onTaskCreated?: (_newTask: BaseTask) => void;
  onTaskEdited?: (_taskId: string, _updatedTask: BaseTask) => void;
  onEditFinance?: (_task: BaseTask) => Promise<void>;
}

export interface TaskEdgeData {
  hash: string;
  layoutDirection?: "Horizontal" | "Vertical";
  debugVisualization?: boolean;
  edgeStyle?: "Bezier" | "Straight" | "SmoothStep";
  smoothStepRadius?: number;
  connected?: boolean;
  dimmed?: boolean;
  /** Joins two tasks with no slack between them. */
  critical?: boolean;
  /** Which side of the selected task this connection sits on. */
  direction?: "upstream" | "downstream" | null;
  /** A dragged task is hovering here, ready to be spliced in. */
  dropTarget?: boolean;
  style?: EdgeStyleOverride;
}

export type TaskNode = Node<TaskNodeData, "task">;
export type TaskEdge = Edge<TaskEdgeData>;
