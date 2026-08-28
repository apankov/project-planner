import React from "react";
import {
  ArrowDownWideNarrow,
  ChevronsDownUp,
  ChevronsUpDown,
  Plus,
  RefreshCw,
  Search,
  Undo2,
} from "lucide-react";
import {
  KANBAN_GROUP_BY_OPTIONS,
  KanbanGroupBy,
  isKanbanGroupBy,
  isWritableGroupBy,
} from "src/lib/kanban-buckets";
import { t } from "../i18n";

interface KanbanToolbarProps {
  groupBy: KanbanGroupBy;
  onGroupByChange: (_groupBy: KanbanGroupBy) => void;
  searchQuery: string;
  onSearch: (_query: string) => void;
  hideCompleted: boolean;
  onHideCompletedChange: (_hide: boolean) => void;
  onSortByDue: () => void;
  onAddTask: () => void;
  onReload: () => void;
  onUndo: () => void;
  canUndo: boolean;
  /** What pressing undo would reverse, for the tooltip. */
  undoLabel: string | null;
  taskCount: number;
  anyCollapsed: boolean;
  onToggleAllColumns: () => void;
}

export function KanbanToolbar({
  groupBy,
  onGroupByChange,
  searchQuery,
  onSearch,
  hideCompleted,
  onHideCompletedChange,
  onSortByDue,
  onAddTask,
  onReload,
  onUndo,
  canUndo,
  undoLabel,
  taskCount,
  anyCollapsed,
  onToggleAllColumns,
}: KanbanToolbarProps) {
  return (
    <div className="project-planner-kanban-toolbar">
      <label className="project-planner-kanban-toolbar__toggle">
        <span>{t("kanban.group_by")}</span>
        <select
          value={groupBy}
          onChange={(event) => {
            const value = event.target.value;
            if (isKanbanGroupBy(value)) onGroupByChange(value);
          }}
        >
          {KANBAN_GROUP_BY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {t(`kanban.group_by_${option}`)}
            </option>
          ))}
        </select>
      </label>

      <button
        className="project-planner-kanban-toolbar__button project-planner-kanban-toolbar__button--accent"
        onClick={onAddTask}
        title={t("kanban.add_task_desc")}
      >
        <Plus size={14} />
        <span>{t("kanban.add_task")}</span>
      </button>

      <button
        className="project-planner-kanban-toolbar__button"
        onClick={onSortByDue}
        title={t("kanban.sort_by_due_desc")}
      >
        <ArrowDownWideNarrow size={14} />
        <span>{t("kanban.sort_by_due")}</span>
      </button>

      <button
        className="project-planner-kanban-toolbar__button"
        onClick={onUndo}
        disabled={!canUndo}
        title={undoLabel ?? t("kanban.undo_desc")}
      >
        <Undo2 size={14} />
        <span>{t("kanban.undo")}</span>
      </button>

      <button
        className="project-planner-kanban-toolbar__button"
        onClick={onToggleAllColumns}
        title={
          anyCollapsed
            ? t("kanban.expand_all_desc")
            : t("kanban.collapse_all_desc")
        }
      >
        {anyCollapsed ? (
          <ChevronsUpDown size={14} />
        ) : (
          <ChevronsDownUp size={14} />
        )}
        <span>
          {anyCollapsed ? t("kanban.expand_all") : t("kanban.collapse_all")}
        </span>
      </button>

      <div className="project-planner-kanban-toolbar__search">
        <Search size={14} />
        <input
          type="text"
          value={searchQuery}
          placeholder={t("kanban.search_placeholder")}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>

      <label className="project-planner-kanban-toolbar__toggle">
        <input
          type="checkbox"
          checked={hideCompleted}
          onChange={(event) => onHideCompletedChange(event.target.checked)}
        />
        <span>{t("kanban.hide_completed")}</span>
      </label>

      <span className="project-planner-kanban-toolbar__count">
        {t("kanban.task_count", { n: taskCount })}
      </span>

      <div className="project-planner-kanban-toolbar__spacer" />

      {!isWritableGroupBy(groupBy) && (
        <span className="project-planner-kanban-toolbar__note">
          {t("kanban.read_only_grouping")}
        </span>
      )}

      <button
        className="project-planner-kanban-toolbar__button"
        onClick={onReload}
        title={t("kanban.reload")}
      >
        <RefreshCw size={14} />
      </button>
    </div>
  );
}
