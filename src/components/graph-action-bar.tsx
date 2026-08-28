import React from "react";
import {
  Coins,
  Columns3,
  GanttChartSquare,
  Maximize2,
  RefreshCw,
  Undo2,
} from "lucide-react";
import { t } from "../i18n";

interface GraphActionBarProps {
  reloadTasks: () => void;
  fitView: () => void;
  onUndo: () => void;
  canUndo: boolean;
  /** What pressing undo would reverse, for the tooltip. */
  undoLabel: string | null;
  /** Omitted in embeds, where opening another view would be surprising. */
  onOpenGantt?: () => void;
  onOpenKanban?: () => void;
  /** Omitted unless finance is switched on, matching the command palette. */
  onOpenFinance?: () => void;
}

/**
 * The handful of actions that stay on screen whatever the panels are doing.
 *
 * The filter, presets and view panels all start collapsed, so anything worth
 * reaching for without opening a panel first lives here instead of inside one.
 */
export default function GraphActionBar({
  reloadTasks,
  fitView,
  onUndo,
  canUndo,
  undoLabel,
  onOpenGantt,
  onOpenKanban,
  onOpenFinance,
}: GraphActionBarProps) {
  return (
    <div
      className="project-planner-action-bar"
      role="toolbar"
      aria-label={t("controls.actions")}
    >
      <button
        className="project-planner-action-bar__button"
        onClick={reloadTasks}
        title={t("controls.reload_desc")}
        aria-label={t("filters.reload_tasks")}
      >
        <RefreshCw size={14} />
        <span className="project-planner-action-bar__label">
          {t("filters.reload_tasks")}
        </span>
      </button>

      <button
        className="project-planner-action-bar__button"
        onClick={fitView}
        title={t("controls.fit_view_desc")}
        aria-label={t("controls.fit_view")}
      >
        <Maximize2 size={14} />
        <span className="project-planner-action-bar__label">
          {t("controls.fit_view")}
        </span>
      </button>

      <button
        className="project-planner-action-bar__button"
        onClick={onUndo}
        disabled={!canUndo}
        title={undoLabel ?? t("controls.undo_desc")}
        aria-label={t("controls.undo")}
      >
        <Undo2 size={14} />
        <span className="project-planner-action-bar__label">
          {t("controls.undo")}
        </span>
      </button>

      {onOpenGantt && (
        <button
          className="project-planner-action-bar__button"
          onClick={onOpenGantt}
          title={t("controls.open_gantt_desc")}
          aria-label={t("controls.open_gantt")}
        >
          <GanttChartSquare size={14} />
          <span className="project-planner-action-bar__label">
            {t("controls.open_gantt")}
          </span>
        </button>
      )}

      {onOpenKanban && (
        <button
          className="project-planner-action-bar__button"
          onClick={onOpenKanban}
          title={t("controls.open_kanban_desc")}
          aria-label={t("controls.open_kanban")}
        >
          <Columns3 size={14} />
          <span className="project-planner-action-bar__label">
            {t("controls.open_kanban")}
          </span>
        </button>
      )}

      {onOpenFinance && (
        <button
          className="project-planner-action-bar__button"
          onClick={onOpenFinance}
          title={t("controls.open_finance_desc")}
          aria-label={t("controls.open_finance")}
        >
          <Coins size={14} />
          <span className="project-planner-action-bar__label">
            {t("controls.open_finance")}
          </span>
        </button>
      )}
    </div>
  );
}
