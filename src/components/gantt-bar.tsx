import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { BaseTask } from "src/types/base-task";
import { diffDays, inclusiveDayCount } from "src/lib/date-utils";
import { ScheduledBar } from "src/lib/gantt-schedule";
import { t } from "../i18n";

export type BarDragMode = "move" | "resize-start" | "resize-end";

export interface BarDragResult {
  taskId: string;
  mode: BarDragMode;
  days: number;
}

interface GanttBarProps {
  task: BaseTask;
  bar: ScheduledBar;
  inferred: boolean;
  /** First day of the chart, used as the origin for bar offsets. */
  timelineStart: string;
  dayWidth: number;
  onCommit: (_result: BarDragResult) => void;
  onSelect: (_taskId: string) => void;
  selected: boolean;
  saving: boolean;
}

/**
 * A single timeline bar.
 *
 * Position and length are driven by CSS custom properties rather than inline
 * styles (inline styles are forbidden by ESLint, and custom properties also
 * keep dragging cheap: a drag mutates two variables instead of re-rendering
 * the row). The pending drag offset lives in a ref for the same reason and is
 * only lifted into React state when the pointer is released.
 */
export function GanttBar({
  task,
  bar,
  inferred,
  timelineStart,
  dayWidth,
  onCommit,
  onSelect,
  selected,
  saving,
}: GanttBarProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    mode: BarDragMode;
    startX: number;
    days: number;
    pointerId: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const offsetDays = diffDays(timelineStart, bar.start);
  const spanDays = inclusiveDayCount(bar.start, bar.end);

  // Positioned before paint so a bar never flashes at the timeline origin
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el || dragRef.current) return;
    el.style.setProperty("--bar-offset", String(offsetDays));
    el.style.setProperty("--bar-span", String(spanDays));
  }, [offsetDays, spanDays]);

  const applyPreview = useCallback(
    (mode: BarDragMode, days: number) => {
      const el = barRef.current;
      if (!el) return;

      if (mode === "move") {
        el.style.setProperty("--bar-offset", String(offsetDays + days));
        el.style.setProperty("--bar-span", String(spanDays));
        return;
      }

      if (mode === "resize-start") {
        // Never drag the start past the end: the bar bottoms out at one day
        const clamped = Math.min(days, spanDays - 1);
        el.style.setProperty("--bar-offset", String(offsetDays + clamped));
        el.style.setProperty("--bar-span", String(spanDays - clamped));
        return;
      }

      const clamped = Math.max(days, -(spanDays - 1));
      el.style.setProperty("--bar-offset", String(offsetDays));
      el.style.setProperty("--bar-span", String(spanDays + clamped));
    },
    [offsetDays, spanDays]
  );

  const handlePointerDown = useCallback(
    (mode: BarDragMode) => (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || saving) return;
      event.preventDefault();
      event.stopPropagation();

      onSelect(task.id);

      dragRef.current = {
        mode,
        startX: event.clientX,
        days: 0,
        pointerId: event.pointerId,
      };
      setDragging(true);
      barRef.current?.setPointerCapture(event.pointerId);
    },
    [onSelect, saving, task.id]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const days = Math.round((event.clientX - drag.startX) / dayWidth);
      if (days === drag.days) return;

      drag.days = days;
      applyPreview(drag.mode, days);
    },
    [applyPreview, dayWidth]
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      dragRef.current = null;
      setDragging(false);
      barRef.current?.releasePointerCapture(event.pointerId);

      const { mode, days } = drag;

      // A click with no movement still counts as a click, not an edit. An
      // inferred bar is the exception: committing it as-is turns the proposed
      // dates into real ones.
      if (days === 0 && !(mode === "move" && inferred)) {
        applyPreview(mode, 0);
        return;
      }

      const clamped =
        mode === "resize-start"
          ? Math.min(days, spanDays - 1)
          : mode === "resize-end"
            ? Math.max(days, -(spanDays - 1))
            : days;

      onCommit({ taskId: task.id, mode, days: clamped });
    },
    [applyPreview, inferred, onCommit, spanDays, task.id]
  );

  const classNames = [
    "tasks-map-gantt-bar",
    `tasks-map-gantt-bar--${task.status}`,
    inferred ? "tasks-map-gantt-bar--inferred" : "",
    dragging ? "tasks-map-gantt-bar--dragging" : "",
    selected ? "tasks-map-gantt-bar--selected" : "",
    saving ? "tasks-map-gantt-bar--saving" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const label = inferred
    ? t("gantt.bar_inferred_tooltip", { start: bar.start, end: bar.end })
    : t("gantt.bar_tooltip", { start: bar.start, end: bar.end });

  return (
    <div
      ref={barRef}
      className={classNames}
      title={label}
      aria-label={`${task.summary} — ${label}`}
      onPointerDown={handlePointerDown("move")}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span
        className="tasks-map-gantt-bar__handle tasks-map-gantt-bar__handle--start"
        onPointerDown={handlePointerDown("resize-start")}
      />
      <span className="tasks-map-gantt-bar__label">{task.summary}</span>
      <span
        className="tasks-map-gantt-bar__handle tasks-map-gantt-bar__handle--end"
        onPointerDown={handlePointerDown("resize-end")}
      />
    </div>
  );
}
