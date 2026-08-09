import React from "react";
import {
  WorkspaceLeaf,
  Plugin,
  TFile,
  FuzzySuggestModal,
  MarkdownRenderChild,
} from "obsidian";
import { createRoot } from "react-dom/client";

import TaskMapGraphItemView, { VIEW_TYPE } from "./views/TaskMapGraphItemView";
import TasksMapGanttItemView, {
  GANTT_VIEW_TYPE,
} from "./views/TasksMapGanttItemView";
import TasksMapFinanceItemView, {
  FINANCE_VIEW_TYPE,
} from "./views/TasksMapFinanceItemView";
import TaskMapGraphEmbedView, {
  TaskMapEmbedError,
  filterStateFromSource,
} from "./views/TaskMapGraphEmbedView";
import {
  TasksMapSettings,
  DEFAULT_SETTINGS,
  FilterPreset,
} from "./types/settings";
import { TasksMapSettingTab } from "./settings/settings-tab";
import { initI18n, changeLanguage, t } from "./i18n";
import { FilterState, DEFAULT_FILTER_STATE } from "./types/filter-state";
import { EmbedConfig, DEFAULT_EMBED_CONFIG } from "./types/embed-config";
import { Notice } from "obsidian";
import { checkDataviewPlugin, getAllTasks } from "./lib/utils";
import {
  findTasksNeedingNotes,
  retrofitCompanionNotes,
} from "./lib/companion-note-retrofit";
import { confirm } from "./components/confirm-modal";
import { requestTaskFocus } from "./lib/view-focus";
import { UndoHistory } from "./lib/undo-history";
import { ensureRateNote } from "./lib/rate-book-note";
import { EdgeStyleOverrides } from "./lib/edge-style-manager";

const EMBED_CODE_BLOCK = "tasks-map";

class NoteSuggestModal extends FuzzySuggestModal<TFile> {
  private onChoose: (_file: TFile) => void;

  constructor(
    app: InstanceType<typeof Plugin>["app"],
    onChoose: (_file: TFile) => void
  ) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder(t("embed.pick_note_placeholder"));
  }

  getItems(): TFile[] {
    return this.app.vault.getMarkdownFiles();
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}

export default class TasksMapPlugin extends Plugin {
  settings: TasksMapSettings = {
    ...DEFAULT_SETTINGS,
    filterPresets: [...DEFAULT_SETTINGS.filterPresets],
  };

  /** Shared by both views, so either can take back the other's edits. */
  readonly undoHistory = new UndoHistory();

  async onload() {
    // Load settings
    await this.loadSettings();

    // Initialize i18n with saved language
    await initI18n(this.settings.language);

    // Always register the view - it will handle the Dataview check internally
    this.registerView(
      VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new TaskMapGraphItemView(leaf)
    );

    this.registerView(
      GANTT_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new TasksMapGanttItemView(leaf)
    );

    this.registerView(
      FINANCE_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new TasksMapFinanceItemView(leaf)
    );

    this.addSettingTab(new TasksMapSettingTab(this.app, this));

    this.addCommand({
      id: "open-tasks-map-view",
      name: t("commands.open_map_view"),
      callback: () => {
        void this.activateViewInMainArea();
      },
    });

    this.addCommand({
      id: "open-tasks-map-gantt-view",
      name: t("commands.open_gantt_view"),
      callback: () => {
        void this.activateGanttViewInMainArea();
      },
    });

    // Finance is off by default, so its command, ribbon icon and menu entries
    // stay out of the way until somebody turns it on
    if (this.settings.financeEnabled) {
      this.addCommand({
        id: "open-tasks-map-finance-view",
        name: t("commands.open_finance_view"),
        callback: () => {
          void this.activateFinanceViewInMainArea();
        },
      });

      this.addCommand({
        id: "create-tasks-map-rate-note",
        name: t("commands.create_rate_note"),
        callback: () => {
          void this.createRateNote();
        },
      });

      this.addRibbonIcon("coins", t("ribbon.open_tasks_finance"), () => {
        void this.activateFinanceViewInMainArea();
      });
    }

    this.addCommand({
      id: "create-notes-for-existing-tasks",
      name: t("commands.retrofit_companion_notes"),
      callback: () => {
        void this.createNotesForExistingTasks();
      },
    });

    this.addCommand({
      id: "insert-filter-as-code-block",
      name: t("commands.insert_filter_as_code_block"),
      callback: () => {
        this.insertFilterIntoActiveNote(null);
      },
    });

    this.addRibbonIcon("map", t("ribbon.open_tasks_map"), () => {
      void this.activateViewInMainArea();
    });

    this.addRibbonIcon("gantt-chart", t("ribbon.open_tasks_gantt"), () => {
      void this.activateGanttViewInMainArea();
    });

    // Register the tasks-map fenced code block processor
    this.registerMarkdownCodeBlockProcessor(
      EMBED_CODE_BLOCK,
      (source, el, ctx) => {
        const dataviewCheck = checkDataviewPlugin(this.app);

        const root = createRoot(el);

        // Register cleanup via MarkdownRenderChild so the root is unmounted
        // when the embed is removed or the preview re-renders
        const child = new MarkdownRenderChild(el);
        child.onunload = () => root.unmount();
        ctx.addChild(child);

        if (!dataviewCheck.isReady) {
          root.render(
            <TaskMapEmbedError message={t("embed.dataview_required")} />
          );
          return;
        }

        const parsed = filterStateFromSource(source);

        if (parsed.kind === "invalid") {
          root.render(<TaskMapEmbedError message={t("embed.invalid_json")} />);
          return;
        }

        if (parsed.kind === "legacy") {
          root.render(<TaskMapEmbedError message={t("embed.legacy_format")} />);
          return;
        }

        root.render(
          <TaskMapGraphEmbedView
            plugin={this}
            initialFilter={parsed.filter}
            embedConfig={parsed.config}
          />
        );
      }
    );
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // Update language when settings change
    changeLanguage(this.settings.language);
    // Notify open views of settings change
    window.dispatchEvent(new Event("tasks-map:settings-changed"));
  }

  /**
   * Gives every existing inline task a note and rewrites it as a link, the
   * same shape new tasks get. Bulk-rewrites task lines, so it asks first.
   */
  async createNotesForExistingTasks(): Promise<void> {
    const tasks = getAllTasks(this.app);
    const targets = findTasksNeedingNotes(tasks);

    if (targets.length === 0) {
      new Notice(t("retrofit.nothing_to_do"));
      return;
    }

    const proceed = await confirm(this.app, {
      title: t("retrofit.title"),
      body: t("retrofit.body", {
        n: targets.length,
        folder: this.settings.companionNoteFolder,
      }),
      confirmLabel: t("retrofit.confirm"),
    });
    if (!proceed) return;

    const result = await retrofitCompanionNotes(this.app, tasks, {
      enabled: true,
      folder: this.settings.companionNoteFolder,
    });

    new Notice(
      result.failed === 0 && result.skipped === 0
        ? t("retrofit.done", { n: result.linked })
        : t("retrofit.done_partial", {
            n: result.linked,
            skipped: result.skipped + result.failed,
          })
    );
  }

  /** Persists the Gantt task-column width after a resize drag. */
  async setGanttLabelWidth(width: number): Promise<void> {
    this.settings.ganttLabelWidth = width;
    await this.saveSettings();
  }

  /** Persists the Gantt's manual row order. */
  async setGanttTaskOrder(order: string[]): Promise<void> {
    this.settings.ganttTaskOrder = order;
    await this.saveSettings();
  }

  /** Persists the Gantt's working-days toggle. */
  async setGanttSkipWeekends(skip: boolean): Promise<void> {
    this.settings.ganttSkipWeekends = skip;
    await this.saveSettings();
  }

  /** Persists the critical-path toggle, which the map and Gantt share. */
  async setShowCriticalPath(show: boolean): Promise<void> {
    this.settings.showCriticalPath = show;
    await this.saveSettings();
  }

  /** Persists per-connection line styles. */
  async setEdgeStyleOverrides(overrides: EdgeStyleOverrides): Promise<void> {
    this.settings.edgeStyleOverrides = overrides;
    await this.saveSettings();
  }

  async savePreset(name: string, filter: FilterState): Promise<void> {
    const preset: FilterPreset = {
      id: crypto.randomUUID(),
      name: name.trim(),
      filter,
    };
    this.settings.filterPresets = [...this.settings.filterPresets, preset];
    await this.saveSettings();
  }

  async renamePreset(id: string, name: string): Promise<void> {
    this.settings.filterPresets = this.settings.filterPresets.map((p) =>
      p.id === id ? { ...p, name: name.trim() } : p
    );
    await this.saveSettings();
  }

  async deletePreset(id: string): Promise<void> {
    this.settings.filterPresets = this.settings.filterPresets.filter(
      (p) => p.id !== id
    );
    await this.saveSettings();
  }

  insertPresetIntoNote(preset: FilterPreset): void {
    new NoteSuggestModal(this.app, (file) => {
      void this.appendCodeBlockToFile(
        file,
        preset.filter,
        DEFAULT_EMBED_CONFIG
      );
    }).open();
  }

  insertFilterIntoActiveNote(filter: FilterState | null): void {
    const activeFile = this.app.workspace.getActiveFile();
    const filterToInsert = filter ?? this.getCurrentFilterState();

    if (activeFile) {
      void this.appendCodeBlockToFile(
        activeFile,
        filterToInsert,
        DEFAULT_EMBED_CONFIG
      );
    } else {
      new NoteSuggestModal(this.app, (file) => {
        void this.appendCodeBlockToFile(
          file,
          filterToInsert,
          DEFAULT_EMBED_CONFIG
        );
      }).open();
    }
  }

  private getCurrentFilterState(): FilterState {
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (leaf?.view instanceof TaskMapGraphItemView) {
      return leaf.view.getFilterState();
    }
    // Fall back to an empty filter if no active Tasks Map view is found
    return { ...DEFAULT_FILTER_STATE };
  }

  private async appendCodeBlockToFile(
    file: TFile,
    filter: FilterState,
    config: EmbedConfig
  ): Promise<void> {
    const payload = JSON.stringify({ filter, config }, null, 2);
    const block = `\n\`\`\`${EMBED_CODE_BLOCK}\n${payload}\n\`\`\`\n`;
    await this.app.vault.process(file, (content) => content + block);
  }

  async activateViewInMainArea() {
    const leaf = this.app.workspace.getLeaf(true); // true = main area
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    void this.app.workspace.revealLeaf(leaf);
  }

  /**
   * Opens a view and points it at one task.
   *
   * The views listen for this rather than reading a shared field, so a view
   * that is already open reacts too instead of only picking it up on mount.
   */
  private async focusTaskInView(
    viewType: string,
    taskId: string
  ): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(viewType)[0];
    const leaf = existing ?? this.app.workspace.getLeaf(true);

    if (!existing) {
      await leaf.setViewState({ type: viewType, active: true });
    }
    void this.app.workspace.revealLeaf(leaf);
    this.app.workspace.setActiveLeaf(leaf, { focus: true });

    // After the view has had a chance to mount
    window.setTimeout(() => requestTaskFocus(viewType, taskId), 50);
  }

  /** Shows a task on the map, opening it if necessary. */
  async focusTaskInMap(taskId: string): Promise<void> {
    await this.focusTaskInView(VIEW_TYPE, taskId);
  }

  /** Shows a task on the timeline, opening it if necessary. */
  async focusTaskInGantt(taskId: string): Promise<void> {
    await this.focusTaskInView(GANTT_VIEW_TYPE, taskId);
  }

  async activateGanttViewInMainArea() {
    const leaf = this.app.workspace.getLeaf(true); // true = main area
    await leaf.setViewState({ type: GANTT_VIEW_TYPE, active: true });
    void this.app.workspace.revealLeaf(leaf);
  }

  async activateFinanceViewInMainArea() {
    const leaf = this.app.workspace.getLeaf(true); // true = main area
    await leaf.setViewState({ type: FINANCE_VIEW_TYPE, active: true });
    void this.app.workspace.revealLeaf(leaf);
  }

  /** Creates the rates note if it is missing, then opens it either way. */
  async createRateNote(): Promise<void> {
    const file = await ensureRateNote(
      this.app,
      this.settings.financeRateNotePath
    );

    if (!file) {
      new Notice(t("finance.rate_note_failed"));
      return;
    }

    await this.app.workspace.getLeaf(true).openFile(file);
  }

  onunload(): void {
    // Embed roots are cleaned up individually via MarkdownRenderChild
  }
}
