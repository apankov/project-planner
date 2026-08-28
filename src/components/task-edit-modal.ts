import { App, Modal, TFile } from "obsidian";
import { createElement } from "react";
import { Root, createRoot } from "react-dom/client";
import { TaskEditDraft } from "src/lib/task-edit-draft";
import { TaskEditForm, TaskEditFormOptions } from "./task-edit-form";

/** Cancelling returns null. */
export type TaskEditModalResult = {
  action: "save";
  draft: TaskEditDraft;
} | null;

export interface TaskEditModalOptions extends TaskEditFormOptions {
  initial: TaskEditDraft;
  /** The note the task's properties live in, for the Open note button. */
  noteFile: TFile | null;
  /** Makes the task a note when it has none. Null when that is not on offer. */
  onCreateNote: (() => void) | null;
}

/**
 * The one task editor, in an Obsidian modal.
 *
 * The shell is thin on purpose: it owns the React root and the promise, and the
 * form owns everything the user actually looks at. That split is the same one
 * the views use — an `ItemView` that calls `createRoot`, and a component that
 * does not know it is in Obsidian — and it is what lets the fields be built out
 * of the pickers the plugin already has rather than out of Obsidian's `Setting`
 * rows, which cannot do a live contributor table.
 */
export class TaskEditModal extends Modal {
  private root: Root | null = null;
  private resolved = false;

  private readonly options: TaskEditModalOptions;
  private readonly resolve: (_result: TaskEditModalResult) => void;

  constructor(
    app: App,
    options: TaskEditModalOptions,
    resolve: (_result: TaskEditModalResult) => void
  ) {
    super(app);
    this.options = options;
    this.resolve = resolve;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("project-planner-task-edit-modal");
    this.modalEl.addClass("project-planner-task-edit-modal-frame");

    this.root = createRoot(contentEl);
    this.root.render(
      createElement(TaskEditForm, {
        initial: this.options.initial,
        options: this.options,
        onSave: (draft: TaskEditDraft) =>
          this.settle({ action: "save", draft }),
        onCancel: () => this.close(),
        onOpenNote: this.options.noteFile ? () => this.openNote() : null,
        onCreateNote: this.options.onCreateNote
          ? () => {
              this.options.onCreateNote?.();
              this.close();
            }
          : null,
      })
    );
  }

  /** Opens the task's note, leaving the dialog behind — the note is the point. */
  private openNote(): void {
    const file = this.options.noteFile;
    if (!file) return;

    this.close();
    void this.app.workspace.getLeaf(false).openFile(file);
  }

  private settle(result: TaskEditModalResult): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolve(result);
    this.close();
  }

  onClose(): void {
    // Unmounted on a later tick: React will not let a root be torn down from
    // inside its own event handler, which is exactly where a save lands
    const root = this.root;
    this.root = null;
    window.setTimeout(() => root?.unmount(), 0);

    this.contentEl.empty();
    if (!this.resolved) {
      this.resolved = true;
      this.resolve(null);
    }
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
