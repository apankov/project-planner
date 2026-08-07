import React from "react";
import { TaskStatus } from "src/types/task";
import { t } from "../i18n";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "canceled"];

/** Explains what the bar colours and the dashed outline mean. */
export function GanttLegend() {
  return (
    <div className="tasks-map-gantt-legend">
      {STATUSES.map((status) => (
        <span key={status} className="tasks-map-gantt-legend__item">
          <span
            className={`tasks-map-gantt-legend__swatch tasks-map-gantt-legend__swatch--${status}`}
          />
          {t(`gantt.legend_${status}`)}
        </span>
      ))}
      <span className="tasks-map-gantt-legend__item">
        <span className="tasks-map-gantt-legend__swatch tasks-map-gantt-legend__swatch--inferred" />
        {t("gantt.legend_suggested")}
      </span>
      <span className="tasks-map-gantt-legend__item">
        <span className="tasks-map-gantt-legend__swatch tasks-map-gantt-legend__swatch--today" />
        {t("gantt.legend_today")}
      </span>
    </div>
  );
}
