import React from "react";
import { CalendarCheck, RefreshCw, Search, Wand2 } from "lucide-react";
import { GANTT_SCALES, GanttScale } from "./gantt-chart";
import { t } from "../i18n";

interface GanttToolbarProps {
  scale: GanttScale;
  onScaleChange: (_scale: GanttScale) => void;
  onScrollToToday: () => void;
  onReload: () => void;
  onApplyInferred: () => void;
  inferredCount: number;
  applying: boolean;
  searchQuery: string;
  onSearch: (_query: string) => void;
  hideCompleted: boolean;
  onHideCompletedChange: (_hide: boolean) => void;
  taskCount: number;
}

export function GanttToolbar({
  scale,
  onScaleChange,
  onScrollToToday,
  onReload,
  onApplyInferred,
  inferredCount,
  applying,
  searchQuery,
  onSearch,
  hideCompleted,
  onHideCompletedChange,
  taskCount,
}: GanttToolbarProps) {
  return (
    <div className="tasks-map-gantt-toolbar">
      <div className="tasks-map-gantt-toolbar__group">
        {GANTT_SCALES.map((option) => (
          <button
            key={option.id}
            className={`tasks-map-gantt-toolbar__scale ${
              option.id === scale.id
                ? "tasks-map-gantt-toolbar__scale--active"
                : ""
            }`}
            onClick={() => onScaleChange(option)}
          >
            {t(`gantt.scale_${option.id}`)}
          </button>
        ))}
      </div>

      <button
        className="tasks-map-gantt-toolbar__button"
        onClick={onScrollToToday}
        title={t("gantt.jump_to_today")}
      >
        <CalendarCheck size={14} />
        <span>{t("gantt.today")}</span>
      </button>

      <div className="tasks-map-gantt-toolbar__search">
        <Search size={14} />
        <input
          type="text"
          value={searchQuery}
          placeholder={t("gantt.search_placeholder")}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>

      <label className="tasks-map-gantt-toolbar__toggle">
        <input
          type="checkbox"
          checked={hideCompleted}
          onChange={(event) => onHideCompletedChange(event.target.checked)}
        />
        <span>{t("gantt.hide_completed")}</span>
      </label>

      <span className="tasks-map-gantt-toolbar__count">
        {t("gantt.task_count", { n: taskCount })}
      </span>

      <div className="tasks-map-gantt-toolbar__spacer" />

      {inferredCount > 0 && (
        <button
          className="tasks-map-gantt-toolbar__button tasks-map-gantt-toolbar__button--accent"
          onClick={onApplyInferred}
          disabled={applying}
          title={t("gantt.apply_inferred_desc")}
        >
          <Wand2 size={14} />
          <span>{t("gantt.apply_inferred", { n: inferredCount })}</span>
        </button>
      )}

      <button
        className="tasks-map-gantt-toolbar__button"
        onClick={onReload}
        title={t("gantt.reload")}
      >
        <RefreshCw size={14} />
      </button>
    </div>
  );
}
