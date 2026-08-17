import { App, Modal, Setting } from "obsidian";
import { t } from "../i18n";

export interface HandoverDraft {
  /** The name on the cover. */
  title: string;
  /** Render every note in the vault into the appendix. */
  includeNotes: boolean;
  /** Add the finance section. Ignored entirely when finance is switched off. */
  includeFinance: boolean;
  /** Mark today on the chart. Off for a plan being handed over before it runs. */
  markToday: boolean;
}

export const DEFAULT_HANDOVER_DRAFT: Omit<HandoverDraft, "title"> = {
  includeNotes: true,
  includeFinance: true,
  markToday: true,
};

/**
 * Asks what the pack should contain.
 *
 * Deliberately short. The pack's job is to be the whole project, so the
 * default answer to every question here is "yes" and the questions exist only
 * for the two cases where a sensible person wants otherwise: a handover of the
 * plan alone without the vault's prose behind it, and a plan being sent to
 * somebody before it starts, where a "today" line is a claim about a day that
 * has not happened yet.
 */
export class HandoverExportModal extends Modal {
  private draft: HandoverDraft;
  private readonly financeAvailable: boolean;
  private readonly resolve: (_draft: HandoverDraft | null) => void;
  private resolved = false;

  constructor(
    app: App,
    initial: HandoverDraft,
    financeAvailable: boolean,
    resolve: (_draft: HandoverDraft | null) => void
  ) {
    super(app);
    this.draft = { ...initial };
    this.financeAvailable = financeAvailable;
    this.resolve = resolve;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: t("handover.modal_title") });
    contentEl.createEl("p", {
      text: t("handover.modal_desc"),
      cls: "project-planner-handover-modal__desc",
    });

    new Setting(contentEl)
      .setName(t("handover.modal_heading"))
      .setDesc(t("handover.modal_heading_desc"))
      .addText((input) => {
        input.setValue(this.draft.title);
        input.setPlaceholder(t("handover.modal_heading_placeholder"));
        input.onChange((value) => {
          this.draft.title = value;
        });
        input.inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          this.submit();
        });
        window.setTimeout(() => input.inputEl.focus(), 0);
      });

    new Setting(contentEl)
      .setName(t("handover.modal_notes"))
      .setDesc(t("handover.modal_notes_desc"))
      .addToggle((toggle) => {
        toggle.setValue(this.draft.includeNotes);
        toggle.onChange((value) => {
          this.draft.includeNotes = value;
        });
      });

    if (this.financeAvailable) {
      new Setting(contentEl)
        .setName(t("handover.modal_finance"))
        .setDesc(t("handover.modal_finance_desc"))
        .addToggle((toggle) => {
          toggle.setValue(this.draft.includeFinance);
          toggle.onChange((value) => {
            this.draft.includeFinance = value;
          });
        });
    }

    new Setting(contentEl)
      .setName(t("handover.modal_today"))
      .setDesc(t("handover.modal_today_desc"))
      .addToggle((toggle) => {
        toggle.setValue(this.draft.markToday);
        toggle.onChange((value) => {
          this.draft.markToday = value;
        });
      });

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText(t("handover.modal_confirm"))
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
    this.resolved = true;
    this.resolve({ ...this.draft, title: this.draft.title.trim() });
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.resolved) this.resolve(null);
  }
}

export function promptForHandover(
  app: App,
  initial: HandoverDraft,
  financeAvailable: boolean
): Promise<HandoverDraft | null> {
  return new Promise((resolve) => {
    new HandoverExportModal(app, initial, financeAvailable, resolve).open();
  });
}
