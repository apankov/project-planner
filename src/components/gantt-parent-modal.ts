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
    this.settle({ parentId: choice.id });
  }

  /**
   * Closing settles as a cancel, but only if a choice has not beaten it to it,
   * and only after the current task has run.
   *
   * A suggest modal closes itself around the moment it hands the choice back,
   * and the two do not arrive in a guaranteed order — resolving the cancel
   * inline meant a pick could be thrown away by the close that the pick itself
   * caused, which looked from the outside like the button doing nothing at
   * all. Deferring by a tick lets `onChooseItem` land first whichever way the
   * ordering falls; a real cancel has nothing to lose the race to.
   */
  onClose(): void {
    super.onClose();
    window.setTimeout(() => this.settle(null), 0);
  }

  /** The promise is settled once; whatever gets here first wins. */
  private settle(result: ParentModalResult): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolve(result);
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
