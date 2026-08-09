import { App, FuzzySuggestModal } from "obsidian";
import { t } from "../i18n";

/** One task offered as a parent. */
export interface ParentChoice {
  /** Null for the entry that takes the task back out of its parent. */
  id: string | null;
  label: string;
}

/** Cancelling returns null; choosing returns the ID picked, or null for none. */
export type ParentModalResult = { parentId: string | null } | null;

/**
 * Asks which task a task should sit inside.
 *
 * A fuzzy picker rather than a dropdown because the answer is one row out of
 * however many the vault has, and the user already knows its name. The list
 * arrives filtered by the caller: a task cannot be its own parent, and it
 * cannot be put inside one of its own descendants, so neither is offered.
 *
 * "No parent" is always the first entry, so the same modal that nests a task
 * is the one that lifts it back out.
 */
export class GanttParentModal extends FuzzySuggestModal<ParentChoice> {
  private readonly choices: ParentChoice[];
  private readonly resolve: (_result: ParentModalResult) => void;
  private resolved = false;

  constructor(
    app: App,
    options: { taskLabel: string; choices: ParentChoice[] },
    resolve: (_result: ParentModalResult) => void
  ) {
    super(app);
    this.choices = [
      { id: null, label: t("gantt.parent_modal_none") },
      ...options.choices,
    ];
    this.resolve = resolve;
    this.setPlaceholder(
      t("gantt.parent_modal_placeholder", { task: options.taskLabel })
    );
  }

  getItems(): ParentChoice[] {
    return this.choices;
  }

  getItemText(choice: ParentChoice): string {
    return choice.label;
  }

  onChooseItem(choice: ParentChoice): void {
    this.resolved = true;
    this.resolve({ parentId: choice.id });
  }

  onClose(): void {
    super.onClose();
    if (!this.resolved) this.resolve(null);
  }
}

export function promptForParent(
  app: App,
  options: { taskLabel: string; choices: ParentChoice[] }
): Promise<ParentModalResult> {
  return new Promise((resolve) => {
    new GanttParentModal(app, options, resolve).open();
  });
}
