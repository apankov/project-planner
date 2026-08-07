import { App, Modal, Setting } from "obsidian";
import { t } from "../i18n";

/**
 * Fallback for entering a new task when the Tasks plugin is not installed.
 *
 * Task creation used to route entirely through the Tasks plugin's modal and
 * simply did nothing when that plugin was missing, which looked like a broken
 * button. This asks for the task text directly and returns a task line.
 */
export class TaskLineModal extends Modal {
  private value = "";
  private resolved = false;
  private readonly resolve: (_taskLine: string | null) => void;

  constructor(app: App, resolve: (_taskLine: string | null) => void) {
    super(app);
    this.resolve = resolve;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: t("task_create.modal_title") });

    new Setting(contentEl)
      .setName(t("task_create.modal_field"))
      .addText((text) => {
        text.setPlaceholder(t("task_create.modal_placeholder"));
        text.onChange((value) => {
          this.value = value;
        });
        text.inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
          if (event.key === "Enter") {
            event.preventDefault();
            this.submit();
          }
        });
        window.setTimeout(() => text.inputEl.focus(), 0);
      });

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText(t("task_create.modal_submit"))
          .setCta()
          .onClick(() => this.submit())
      )
      .addButton((button) =>
        button
          .setButtonText(t("task_create.modal_cancel"))
          .onClick(() => this.close())
      );
  }

  private submit(): void {
    const text = this.value.trim();
    if (!text) return;
    this.resolved = true;
    this.resolve(`- [ ] ${text}`);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.resolved) this.resolve(null);
  }
}

/**
 * Asks for a new task line, preferring the Tasks plugin's own modal so its
 * date and priority pickers are available, and falling back to a plain
 * prompt when that plugin is absent.
 */
export async function promptForTaskLine(
  app: App,
  // eslint-disable-next-line no-unused-vars -- injected so utils stays untouched
  createWithTasksPlugin: (() => Promise<string | undefined>) | null
): Promise<string | null> {
  if (createWithTasksPlugin) {
    const line = await createWithTasksPlugin();
    return line?.trim() ? line : null;
  }

  return new Promise<string | null>((resolve) => {
    new TaskLineModal(app, resolve).open();
  });
}
