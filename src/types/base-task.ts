import { App, Vault } from "obsidian";
import { TaskStatus } from "./task";
import { TaskDateProperty } from "../lib/task-dates";
import { EMPTY_TASK_FINANCE, TaskFinance } from "../lib/task-finance";
import { EMPTY_TASK_PROGRESS, TaskProgress } from "../lib/task-progress";

export type TaskInsertPosition = "before" | "after";

/**
 * Dates to write to a task. A `null` value clears that date; an absent key
 * leaves it untouched.
 */
export interface TaskDateUpdate {
  start?: string | null;
  due?: string | null;
  scheduled?: string | null;
}

/**
 * Abstract base class for tasks.
 * Each task type (dataview, note) extends this class and implements its own behavior.
 */
export abstract class BaseTask {
  id: string;
  abstract readonly type: "dataview" | "note";
  summary: string;
  text: string;
  tags: string[];
  status: TaskStatus;
  priority: string;
  link: string;
  incomingLinks: string[];
  starred: boolean;
  projects: string[];
  /** Dates carried by the task, from the task line or from frontmatter. */
  dates: TaskDateProperty[];
  /** Hours, people and expenses, from the task line or from frontmatter. */
  finance: TaskFinance;
  /** How far along the task is, from the task line or from frontmatter. */
  progress: TaskProgress;

  constructor(data: {
    id: string;
    summary: string;
    text: string;
    tags: string[];
    status: TaskStatus;
    priority: string;
    link: string;
    incomingLinks: string[];
    starred: boolean;
    projects?: string[];
    dates?: TaskDateProperty[];
    finance?: TaskFinance;
    progress?: TaskProgress;
  }) {
    this.id = data.id;
    this.summary = data.summary;
    this.text = data.text;
    this.tags = data.tags;
    this.status = data.status;
    this.priority = data.priority;
    this.link = data.link;
    this.incomingLinks = data.incomingLinks;
    this.starred = data.starred;
    this.projects = data.projects ?? [];
    this.dates = data.dates ?? [];
    this.finance = data.finance ?? EMPTY_TASK_FINANCE;
    this.progress = data.progress ?? EMPTY_TASK_PROGRESS;
  }

  /**
   * Update the task's status in the vault
   */
  abstract updateStatus(_newStatus: TaskStatus, _app: App): Promise<void>;

  /**
   * Add a new task line to the vault
   */
  abstract addTaskLine(
    _newTaskLine: string,
    _app: App,
    _position?: TaskInsertPosition
  ): Promise<void>;

  /**
   * Delete the task from the vault
   */
  abstract delete(_app: App): Promise<void>;

  /**
   * Add a star/favorite marker to the task
   */
  abstract addStar(_app: App): Promise<void>;

  /**
   * Remove the star/favorite marker from the task
   */
  abstract removeStar(_app: App): Promise<void>;

  /**
   * Add a tag to the task
   */
  abstract addTag(_tagToAdd: string, _app: App): Promise<void>;

  /**
   * Remove a tag from the task
   */
  abstract removeTag(_tagToRemove: string, _app: App): Promise<void>;

  /**
   * Write start/due/scheduled dates to the task, returning the updated task
   * so the caller can refresh its copy without a full reload.
   */
  abstract setDates(
    _dates: TaskDateUpdate,
    _app: App
  ): Promise<BaseTask | null>;

  /**
   * Write the task's hours, people and expenses, returning the updated task.
   * The finance given is the whole of it: anything absent is cleared, so one
   * call can also wipe a task's costing.
   */
  abstract setFinance(
    _finance: TaskFinance,
    _app: App
  ): Promise<BaseTask | null>;

  /**
   * Write how far along the task is, returning the updated task. A percentage
   * outside 0–100 is clamped; `null` clears the field entirely, so one call
   * can also take a task back to carrying no progress at all.
   */
  abstract setProgress(
    _progress: number | null,
    _app: App
  ): Promise<BaseTask | null>;

  /**
   * Add link metadata to this task (for creating dependencies)
   */
  abstract addLinkMetadata(
    _vault: Vault,
    _fromTask: BaseTask,
    _linkingStyle: "individual" | "csv" | "dataview"
  ): Promise<void>;

  /**
   * Remove link metadata from this task (for removing dependencies)
   */
  abstract removeLinkMetadata(_vault: Vault, _hash: string): Promise<void>;

  /**
   * Convert to plain object for serialization/compatibility
   */
  toPlainObject() {
    return {
      id: this.id,
      type: this.type,
      summary: this.summary,
      text: this.text,
      tags: this.tags,
      status: this.status,
      priority: this.priority,
      link: this.link,
      incomingLinks: this.incomingLinks,
      starred: this.starred,
      projects: this.projects,
      dates: this.dates,
      finance: this.finance,
      progress: this.progress,
    };
  }
}
