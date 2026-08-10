import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { t } from "../i18n";

/**
 * The view toggles. The actions that used to sit at the bottom of this panel
 * (reload, fit, undo, open another view) now live in `GraphActionBar`, which
 * stays on screen while this panel is collapsed.
 */
interface ControlsPanelProps {
  showTags: boolean;
  hideTags: boolean;
  setHideTags: () => void;
  showUnlinkedPanel: boolean;
  hideUnlinkedTasks: boolean;
  setHideUnlinkedTasks: (_val: boolean) => void;
  showGroupByProject: boolean;
  groupByProject: boolean;
  setGroupByProject: (_val: boolean) => void;
  showCriticalPath: boolean;
  setShowCriticalPath: (_val: boolean) => void;
}

export default function ControlsPanel({
  showTags,
  hideTags,
  setHideTags,
  showUnlinkedPanel,
  hideUnlinkedTasks,
  setHideUnlinkedTasks,
  showGroupByProject,
  groupByProject,
  setGroupByProject,
  showCriticalPath,
  setShowCriticalPath,
}: ControlsPanelProps) {
  // Collapsed on open: the canvas is the point, the panels are on request
  const [isMinimized, setIsMinimized] = useState(true);

  const toggleMinimized = () => {
    setIsMinimized((prev) => !prev);
  };

  return (
    <div
      className={`project-planner-filter-panel ${isMinimized ? "project-planner-filter-panel--minimized" : ""}`}
    >
      <div className="project-planner-filter-panel__header">
        <span className="project-planner-filter-panel__title">
          {t("controls.title")}
        </span>
        <button
          className="project-planner-filter-panel__header-icon"
          onClick={toggleMinimized}
          aria-label={
            isMinimized ? t("controls.expand") : t("controls.minimize")
          }
          title={isMinimized ? t("controls.expand") : t("controls.minimize")}
        >
          {isMinimized ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {!isMinimized && (
        <div className="project-planner-filter-panel__content">
          <div className="project-planner-filter-section">
            {showUnlinkedPanel && (
              <div className="project-planner-filter-item">
                <label className="project-planner-gui-overlay-checkbox-label">
                  <input
                    type="checkbox"
                    checked={hideUnlinkedTasks}
                    onChange={(e) => setHideUnlinkedTasks(e.target.checked)}
                    className="project-planner-gui-overlay-checkbox-input"
                  />
                  <span className="project-planner-gui-overlay-checkbox-text">
                    {t("filters.hide_unlinked_tasks")}
                  </span>
                </label>
              </div>
            )}

            {showTags && (
              <div className="project-planner-filter-item">
                <label className="project-planner-gui-overlay-checkbox-label">
                  <input
                    type="checkbox"
                    checked={hideTags}
                    onChange={setHideTags}
                    className="project-planner-gui-overlay-checkbox-input"
                  />
                  <span className="project-planner-gui-overlay-checkbox-text">
                    {t("filters.hide_tags_on_nodes")}
                  </span>
                </label>
              </div>
            )}

            {showGroupByProject && (
              <div className="project-planner-filter-item">
                <label className="project-planner-gui-overlay-checkbox-label">
                  <input
                    type="checkbox"
                    checked={groupByProject}
                    onChange={(e) => setGroupByProject(e.target.checked)}
                    className="project-planner-gui-overlay-checkbox-input"
                  />
                  <span className="project-planner-gui-overlay-checkbox-text">
                    {t("controls.group_by_project")}
                  </span>
                </label>
              </div>
            )}

            <div className="project-planner-filter-item">
              <label
                className="project-planner-gui-overlay-checkbox-label"
                title={t("gantt.critical_path_desc")}
              >
                <input
                  type="checkbox"
                  checked={showCriticalPath}
                  onChange={(e) => setShowCriticalPath(e.target.checked)}
                  className="project-planner-gui-overlay-checkbox-input"
                />
                <span className="project-planner-gui-overlay-checkbox-text">
                  {t("gantt.critical_path")}
                </span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
