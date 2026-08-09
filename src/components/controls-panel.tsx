import React, { useState } from "react";
import { ChevronDown, ChevronUp, GanttChartSquare, Undo2 } from "lucide-react";
import { t } from "../i18n";

interface ControlsPanelProps {
  showTags: boolean;
  hideTags: boolean;
  setHideTags: () => void;
  reloadTasks: () => void;
  showUnlinkedPanel: boolean;
  hideUnlinkedTasks: boolean;
  setHideUnlinkedTasks: (_val: boolean) => void;
  showGroupByProject: boolean;
  groupByProject: boolean;
  setGroupByProject: (_val: boolean) => void;
  showCriticalPath: boolean;
  setShowCriticalPath: (_val: boolean) => void;
  /** Omitted in embeds, where opening another view would be surprising. */
  onOpenGantt?: () => void;
  onUndo: () => void;
  canUndo: boolean;
  /** What pressing undo would reverse, for the tooltip. */
  undoLabel: string | null;
}

export default function ControlsPanel({
  showTags,
  hideTags,
  setHideTags,
  reloadTasks,
  showUnlinkedPanel,
  hideUnlinkedTasks,
  setHideUnlinkedTasks,
  showGroupByProject,
  groupByProject,
  setGroupByProject,
  showCriticalPath,
  setShowCriticalPath,
  onOpenGantt,
  onUndo,
  canUndo,
  undoLabel,
}: ControlsPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);

  const toggleMinimized = () => {
    setIsMinimized((prev) => !prev);
  };

  return (
    <div
      className={`tasks-map-filter-panel ${isMinimized ? "tasks-map-filter-panel--minimized" : ""}`}
    >
      <div className="tasks-map-filter-panel__header">
        <span className="tasks-map-filter-panel__title">
          {t("controls.title")}
        </span>
        <button
          className="tasks-map-filter-panel__header-icon"
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
        <div className="tasks-map-filter-panel__content">
          <div className="tasks-map-filter-section">
            {showUnlinkedPanel && (
              <div className="tasks-map-filter-item">
                <label className="tasks-map-gui-overlay-checkbox-label">
                  <input
                    type="checkbox"
                    checked={hideUnlinkedTasks}
                    onChange={(e) => setHideUnlinkedTasks(e.target.checked)}
                    className="tasks-map-gui-overlay-checkbox-input"
                  />
                  <span className="tasks-map-gui-overlay-checkbox-text">
                    {t("filters.hide_unlinked_tasks")}
                  </span>
                </label>
              </div>
            )}

            {showTags && (
              <div className="tasks-map-filter-item">
                <label className="tasks-map-gui-overlay-checkbox-label">
                  <input
                    type="checkbox"
                    checked={hideTags}
                    onChange={setHideTags}
                    className="tasks-map-gui-overlay-checkbox-input"
                  />
                  <span className="tasks-map-gui-overlay-checkbox-text">
                    {t("filters.hide_tags_on_nodes")}
                  </span>
                </label>
              </div>
            )}

            {showGroupByProject && (
              <div className="tasks-map-filter-item">
                <label className="tasks-map-gui-overlay-checkbox-label">
                  <input
                    type="checkbox"
                    checked={groupByProject}
                    onChange={(e) => setGroupByProject(e.target.checked)}
                    className="tasks-map-gui-overlay-checkbox-input"
                  />
                  <span className="tasks-map-gui-overlay-checkbox-text">
                    {t("controls.group_by_project")}
                  </span>
                </label>
              </div>
            )}

            <div className="tasks-map-filter-item">
              <label
                className="tasks-map-gui-overlay-checkbox-label"
                title={t("gantt.critical_path_desc")}
              >
                <input
                  type="checkbox"
                  checked={showCriticalPath}
                  onChange={(e) => setShowCriticalPath(e.target.checked)}
                  className="tasks-map-gui-overlay-checkbox-input"
                />
                <span className="tasks-map-gui-overlay-checkbox-text">
                  {t("gantt.critical_path")}
                </span>
              </label>
            </div>
          </div>

          <div className="tasks-map-filter-actions">
            <button
              onClick={reloadTasks}
              className="tasks-map-gui-overlay-reload-button"
            >
              {t("filters.reload_tasks")}
            </button>
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="tasks-map-gui-overlay-reload-button tasks-map-open-gantt-button"
              title={undoLabel ?? t("controls.undo_desc")}
            >
              <Undo2 size={14} />
              <span>{t("controls.undo")}</span>
            </button>
            {onOpenGantt && (
              <button
                onClick={onOpenGantt}
                className="tasks-map-gui-overlay-reload-button tasks-map-open-gantt-button"
                title={t("controls.open_gantt_desc")}
              >
                <GanttChartSquare size={14} />
                <span>{t("controls.open_gantt")}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
