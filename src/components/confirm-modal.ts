import { App, Modal, Setting } from "obsidian";
import { t } from "../i18n";

/**
 * A yes/no gate for actions that touch many notes at once.
 *
 * Bulk edits are hard to unpick, so anything that rewrites a pile of task
 * lines says how many and waits for a deliberate yes.
 */
export class ConfirmModal extends Modal {
  private confirmed = false;
  private readonly title: string;
  private readonly body: string;
  private readonly confirmLabel: string;
  private readonly resolve: (_confirmed: boolean) => void;

  constructor(
    app: App,
    options: { title: string; body: string; confirmLabel: string },
    resolve: (_confirmed: boolean) => void
  ) {
    super(app);
    this.title = options.title;
    this.body = options.body;
    this.confirmLabel = options.confirmLabel;
    this.resolve = resolve;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });
    contentEl.createEl("p", { text: this.body });

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText(this.confirmLabel)
          .setCta()
          .onClick(() => {
            this.confirmed = true;
            this.close();
          })
      )
      .addButton((button) =>
        button
          .setButtonText(t("task_create.modal_cancel"))
          .onClick(() => this.close())
      );
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve(this.confirmed);
  }
}

export function confirm(
  app: App,
  options: { title: string; body: string; confirmLabel: string }
): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmModal(app, options, resolve).open();
  });
}
