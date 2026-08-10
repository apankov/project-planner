import React, { useEffect, useState } from "react";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { AppContext } from "src/contexts/context";
import { TasksMapSettings } from "src/types/settings";
import { KANBAN_VIEW_TYPE } from "src/lib/view-focus";
import { checkDataviewPlugin } from "../lib/utils";
import TasksMapPlugin from "../main";
import KanbanView from "./KanbanView";
import { t } from "../i18n";

export { KANBAN_VIEW_TYPE };

/** Keeps the board in step with the settings tab, like the other views do. */
function KanbanViewWrapper({ plugin }: { plugin: TasksMapPlugin }) {
  const [settings, setSettings] = useState<TasksMapSettings>({
    ...plugin.settings,
  });

  useEffect(() => {
    const handler = () => setSettings({ ...plugin.settings });
    window.addEventListener("tasks-map:settings-changed", handler);
    return () =>
      window.removeEventListener("tasks-map:settings-changed", handler);
  }, [plugin]);

  return <KanbanView settings={settings} plugin={plugin} />;
}

export default class TasksMapKanbanItemView extends ItemView {
  root: Root | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return KANBAN_VIEW_TYPE;
  }

  getDisplayText() {
    return t("kanban.view_title");
  }

  getIcon() {
    return "columns-3";
  }

  async onOpen() {
    const dataviewCheck = checkDataviewPlugin(this.app);

    this.root = createRoot(this.containerEl.children[1]);

    if (!dataviewCheck.isReady) {
      this.root.render(
        <div className="tasks-map-centered-message-container">
          <div className="tasks-map-centered-message-content">
            <div className="tasks-map-message-icon">⚠️</div>
            <h3 className="tasks-map-message-title">
              {t("view.dataview_required")}
            </h3>
            <p className="tasks-map-message-description">
              {dataviewCheck.getMessage()}
            </p>
          </div>
        </div>
      );
      return;
    }

    const plugin = (
      this.app as unknown as {
        plugins: { plugins: Record<string, TasksMapPlugin> };
      }
    ).plugins.plugins["tasks-map"];

    if (!plugin) {
      this.root.render(
        <div className="tasks-map-centered-message-container">
          <div className="tasks-map-centered-message-content">
            <div className="tasks-map-message-icon">⚠️</div>
            <h3 className="tasks-map-message-title">
              {t("view.plugin_not_found")}
            </h3>
            <p className="tasks-map-message-description">
              {t("view.plugin_not_found_description")}
            </p>
          </div>
        </div>
      );
      return;
    }

    this.root.render(
      <AppContext.Provider value={this.app}>
        <KanbanViewWrapper plugin={plugin} />
      </AppContext.Provider>
    );
  }

  async onClose() {
    this.root?.unmount();
  }
}
