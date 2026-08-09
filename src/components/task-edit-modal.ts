import { App, DropdownComponent, Modal, Setting } from "obsidian";
import { toEpochDay } from "src/lib/date-utils";
import {
  MAX_PROGRESS,
  MIN_PROGRESS,
  effectiveTaskStatus,
} from "src/lib/task-progress";
import { TaskStatus } from "src/types/task";
import { t } from "../i18n";

/** Everything this modal can change about a task. */
export interface TaskEditDraft {
  /** The words on the task line, with its metadata already taken off. */
  text: string;
  status: TaskStatus;
  /** `null` clears the date. */
  start: string | null;
  due: string | null;
  /** Whole percent, or `null` for a task carrying no progress at all. */
  progress: number | null;
}

/** Cancelling returns null. */
export type TaskEditModalResult = {
  action: "save";
  draft: TaskEditDraft;
} | null;

export interface TaskEditModalOptions {
  initial: TaskEditDraft;
  /**
   * The bar's dates when they were suggested rather than written. Pre-filled
   * into the empty date fields, so accepting a suggested bar is still one
   * gesture — see the click handling in `gantt-bar`.
   */
  suggested: { start: string; due: string } | null;
  /**
   * A parent's bar is the span of its children, so its own dates are not what
   * the chart draws. The fields are shown but locked, for the same reason
   * dragging and resizing a summary bar is blocked.
   */
  summary: boolean;
  /** Note-based tasks are named by their file, which is not ours to rename. */
  canEditText: boolean;
}

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "canceled"];

/** A percentage typed into a field, or null when the field is empty. */
function readProgressInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number.parseFloat(trimmed.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(parsed)) return null;

  return Math.round(Math.min(MAX_PROGRESS, Math.max(MIN_PROGRESS, parsed)));
}

/**
 * Asks what a task should say.
 *
 * There was no general task editor before this: the Tasks plugin's own modal
 * covers text and dates when that plugin is installed, the finance modal
 * covers costing, and progress had no UI at all. This is the one place that
 * covers the four things the Gantt actually shows — the words, the state, the
 * two dates the bar is drawn from, and how far along it is — without needing
 * another plugin present.
 *
 * Nothing here writes to the vault. It collects a draft and hands it back, so
 * the view stays the only place that touches notes and the same optimistic
 * update and undo entry cover every field at once.
 */
export class TaskEditModal extends Modal {
  private text: string;
  private status: TaskStatus;
  private start: string;
  private due: string;
  private progress: number | null;

  private readonly options: TaskEditModalOptions;
  private readonly resolve: (_result: TaskEditModalResult) => void;
  private resolved = false;
  private errorEl: HTMLElement | null = null;
  /** Held so a change to the percentage can move the status with it. */
  private statusDropdown: DropdownComponent | null = null;

  constructor(
    app: App,
    options: TaskEditModalOptions,
    resolve: (_result: TaskEditModalResult) => void
  ) {
    super(app);
    this.options = options;
    this.text = options.initial.text;
    this.status = options.initial.status;
    // A suggested bar fills the empty fields, never overwrites a real date
    this.start = options.initial.start ?? options.suggested?.start ?? "";
    this.due = options.initial.due ?? options.suggested?.due ?? "";
    this.progress = options.initial.progress;
    this.resolve = resolve;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("tasks-map-task-edit-modal");
    contentEl.createEl("h3", { text: t("task_edit.modal_title") });

    this.renderText(contentEl);
    this.renderStatus(contentEl);
    this.renderDates(contentEl);
    this.renderProgress(contentEl);

    this.errorEl = contentEl.createEl("p", {
      cls: "tasks-map-task-edit-modal__error",
    });
    this.errorEl.hide();

    this.renderButtons(contentEl);
  }

  /* ---------------------------------------------------------------------- */

  private renderText(container: HTMLElement): void {
    const setting = new Setting(container).setName(t("task_edit.text"));
    if (!this.options.canEditText) {
      setting.setDesc(t("task_edit.text_locked"));
    }

    setting.addText((input) => {
      input.setPlaceholder(t("task_edit.text_placeholder"));
      input.setValue(this.text);
      input.setDisabled(!this.options.canEditText);
      input.onChange((value) => {
        this.text = value;
      });
      input.inputEl.addClass("tasks-map-task-edit-modal__text");
      input.inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        this.submit();
      });
      if (this.options.canEditText) {
        window.setTimeout(() => input.inputEl.focus(), 0);
      }
    });
  }

  private renderStatus(container: HTMLElement): void {
    new Setting(container)
      .setName(t("task_edit.status"))
      .addDropdown((dropdown) => {
        this.statusDropdown = dropdown;
        STATUSES.forEach((status) =>
          dropdown.addOption(status, t(`gantt.legend_${status}`))
        );
        dropdown.setValue(this.status);
        dropdown.onChange((value) => {
          this.status = (STATUSES as string[]).includes(value)
            ? (value as TaskStatus)
            : this.status;
        });
      });
  }

  private renderDates(container: HTMLElement): void {
    const locked = this.options.summary;

    const startSetting = new Setting(container).setName(t("task_edit.start"));
    if (locked) startSetting.setDesc(t("task_edit.dates_locked"));
    startSetting.addText((input) => {
      input.inputEl.type = "date";
      input.setValue(this.start);
      input.setDisabled(locked);
      input.onChange((value) => {
        this.start = value;
      });
    });

    new Setting(container).setName(t("task_edit.due")).addText((input) => {
      input.inputEl.type = "date";
      input.setValue(this.due);
      input.setDisabled(locked);
      input.onChange((value) => {
        this.due = value;
      });
    });

    if (!locked && this.options.suggested) {
      container.createEl("p", {
        cls: "tasks-map-task-edit-modal__hint",
        text: t("task_edit.dates_suggested", {
          start: this.options.suggested.start,
          end: this.options.suggested.due,
        }),
      });
    }
  }

  private renderProgress(container: HTMLElement): void {
    new Setting(container)
      .setName(t("task_edit.progress"))
      .setDesc(t("task_edit.progress_desc"))
      .addText((input) => {
        input.inputEl.type = "number";
        input.inputEl.addClass("tasks-map-task-edit-modal__progress");
        input.setPlaceholder(t("task_edit.progress_placeholder"));
        input.setValue(this.progress === null ? "" : String(this.progress));
        input.onChange((value) => {
          this.progress = readProgressInput(value);
          this.followProgressWithStatus();
        });
      });
  }

  /**
   * Typing a percentage moves a `todo` task to in progress.
   *
   * The chart already reads it that way, so leaving the dropdown behind would
   * mean saving a task that shows as underway while its checkbox still says it
   * has not been started. The dropdown is moved rather than the value being
   * forced at save time, so the change is on screen before the user commits to
   * it — and they can put it back, which is why this never runs twice over the
   * same edit.
   */
  private followProgressWithStatus(): void {
    const next = effectiveTaskStatus(this.status, { percent: this.progress });
    if (next === this.status) return;

    this.status = next;
    this.statusDropdown?.setValue(next);
  }

  private renderButtons(container: HTMLElement): void {
    new Setting(container)
      .addButton((button) =>
        button
          .setButtonText(t("task_edit.save"))
          .setCta()
          .onClick(() => this.submit())
      )
      .addButton((button) =>
        button
          .setButtonText(t("task_create.modal_cancel"))
          .onClick(() => this.close())
      );
  }

  /* ---------------------------------------------------------------------- */

  private submit(): void {
    const text = this.text.trim();
    const start = this.start.trim();
    const due = this.due.trim();

    if (this.options.canEditText && !text) {
      this.showError(t("task_edit.text_required"));
      return;
    }
    if (start && toEpochDay(start) === null) {
      this.showError(t("task_edit.date_invalid"));
      return;
    }
    if (due && toEpochDay(due) === null) {
      this.showError(t("task_edit.date_invalid"));
      return;
    }

    this.resolved = true;
    this.resolve({
      action: "save",
      draft: {
        text,
        status: this.status,
        // A parent's dates are its children's, so an edit to one never writes
        // dates: the fields were locked and whatever they hold is not an answer
        start: this.options.summary
          ? this.options.initial.start
          : start || null,
        due: this.options.summary ? this.options.initial.due : due || null,
        progress: this.progress,
      },
    });
    this.close();
  }

  private showError(message: string): void {
    if (!this.errorEl) return;
    this.errorEl.setText(message);
    this.errorEl.show();
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.resolved) this.resolve(null);
  }
}

export function promptForTaskEdit(
  app: App,
  options: TaskEditModalOptions
): Promise<TaskEditModalResult> {
  return new Promise((resolve) => {
    new TaskEditModal(app, options, resolve).open();
  });
}
