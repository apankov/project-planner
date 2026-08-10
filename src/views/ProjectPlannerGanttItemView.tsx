import React, { useEffect, useState } from "react";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { AppContext } from "src/contexts/context";
import { ProjectPlannerSettings } from "src/types/settings";
import { checkDataviewPlugin } from "../lib/utils";
import ProjectPlannerPlugin from "../main";
import GanttView from "./GanttView";
import { GANTT_VIEW_TYPE } from "src/lib/view-focus";
import { t } from "../i18n";

export { GANTT_VIEW_TYPE };

/** Keeps the chart in step with the settings tab, like the graph view does. */
function GanttViewWrapper({ plugin }: { plugin: ProjectPlannerPlugin }) {
  const [settings, setSettings] = useState<ProjectPlannerSettings>({
    ...plugin.settings,
  });

  useEffect(() => {
    const handler = () => setSettings({ ...plugin.settings });
    window.addEventListener("project-planner:settings-changed", handler);
    return () =>
      window.removeEventListener("project-planner:settings-changed", handler);
  }, [plugin]);

  return <GanttView settings={settings} plugin={plugin} />;
}

export default class ProjectPlannerGanttItemView extends ItemView {
  root: Root | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return GANTT_VIEW_TYPE;
  }

  getDisplayText() {
    return t("gantt.view_title");
  }

  getIcon() {
    return "gantt-chart";
  }

  async onOpen() {
    const dataviewCheck = checkDataviewPlugin(this.app);

    this.root = createRoot(this.containerEl.children[1]);

    if (!dataviewCheck.isReady) {
      this.root.render(
        <div className="project-planner-centered-message-container">
          <div className="project-planner-centered-message-content">
            <div className="project-planner-message-icon">⚠️</div>
            <h3 className="project-planner-message-title">
              {t("view.dataview_required")}
            </h3>
            <p className="project-planner-message-description">
              {dataviewCheck.getMessage()}
            </p>
          </div>
        </div>
      );
      return;
    }

    const plugin = (
      this.app as unknown as {
        plugins: { plugins: Record<string, ProjectPlannerPlugin> };
      }
    ).plugins.plugins["project-planner"];

    if (!plugin) {
      this.root.render(
        <div className="project-planner-centered-message-container">
          <div className="project-planner-centered-message-content">
            <div className="project-planner-message-icon">⚠️</div>
            <h3 className="project-planner-message-title">
              {t("view.plugin_not_found")}
            </h3>
            <p className="project-planner-message-description">
              {t("view.plugin_not_found_description")}
            </p>
          </div>
        </div>
      );
      return;
    }

    this.root.render(
      <AppContext.Provider value={this.app}>
        <GanttViewWrapper plugin={plugin} />
      </AppContext.Provider>
    );
  }

  async onClose() {
    this.root?.unmount();
  }
}
