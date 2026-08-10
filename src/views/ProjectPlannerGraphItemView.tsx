import React, { useState, useEffect, useCallback } from "react";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import { ReactFlowProvider } from "reactflow";
import { AppContext } from "src/contexts/context";
import GraphView from "./GraphView";
import { checkDataviewPlugin } from "../lib/utils";
import ProjectPlannerPlugin from "../main";
import { ProjectPlannerSettings } from "src/types/settings";
import { FilterState, DEFAULT_FILTER_STATE } from "src/types/filter-state";
import { MAP_VIEW_TYPE } from "src/lib/view-focus";
import { t } from "../i18n";

// Wrapper component that manages settings updates and filter state for the graph view
function GraphWrapper({
  pluginSettings,
  plugin,
  onFilterStateChange,
}: {
  pluginSettings: ProjectPlannerSettings;
  plugin: ProjectPlannerPlugin;
  onFilterStateChange: (_state: FilterState) => void;
}) {
  const [settings, setSettings] = useState<ProjectPlannerSettings>({
    ...pluginSettings,
  });

  useEffect(() => {
    const handler = () => setSettings({ ...plugin.settings });
    window.addEventListener("project-planner:settings-changed", handler);
    return () =>
      window.removeEventListener("project-planner:settings-changed", handler);
  }, [plugin]);

  const [filterState, setFilterState] = useState<FilterState>({
    ...DEFAULT_FILTER_STATE,
  });

  const handleSetFilterState = useCallback(
    (state: FilterState | ((_prev: FilterState) => FilterState)) => {
      setFilterState((prev) => {
        const next = typeof state === "function" ? state(prev) : state;
        onFilterStateChange(next);
        return next;
      });
    },
    [onFilterStateChange]
  );

  return (
    <ReactFlowProvider>
      <GraphView
        settings={settings}
        filterState={filterState}
        setFilterState={handleSetFilterState}
        plugin={plugin}
      />
    </ReactFlowProvider>
  );
}

export const VIEW_TYPE = MAP_VIEW_TYPE;

export default class ProjectPlannerGraphItemView extends ItemView {
  root: Root | null = null;
  private filterState: FilterState = { ...DEFAULT_FILTER_STATE };

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE;
  }

  getDisplayText() {
    return t("view.title");
  }

  /** Returns the current filter state of the open graph view. */
  getFilterState(): FilterState {
    return structuredClone(this.filterState);
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
            <p className="project-planner-message-description">
              {t("view.visit_community_plugins")}
            </p>
          </div>
        </div>
      );
      return;
    }

    // Get the plugin instance to access settings
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
        <GraphWrapper
          pluginSettings={plugin.settings}
          plugin={plugin}
          onFilterStateChange={(state) => {
            this.filterState = state;
          }}
        />
      </AppContext.Provider>
    );
  }

  async onClose() {
    this.root?.unmount();
  }
}
