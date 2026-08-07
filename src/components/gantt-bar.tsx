import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { BaseTask } from "src/types/base-task";
import { diffDays, inclusiveDayCount } from "src/lib/date-utils";
import { ScheduledBar } from "src/lib/gantt-schedule";
import { plainTaskText } from "src/lib/task-text";
import { t } from "../i18n";

export type BarDragMode = "move" | "resize-start" | "resize-end";

export interface BarDragResult {
  taskId: string;
  mode: BarDragMode;
  days: number;
}

/** How far the pointer must travel vertically before a drag reorders. */
const VERTICAL_INTENT_PX = 12;

interface GanttBarProps {
  task: BaseTask;
  bar: ScheduledBar;
  inferred: boolean;
  /** First day of the chart, used as the origin for bar offsets. */
  timelineStart: string;
  dayWidth: number;
  onCommit: (_result: BarDragResult) => void;
  /** Dragging a bar up or down reorders it, like dragging its row. */
  onVerticalPreview: (_clientY: number | null) => void;
  onVerticalDrop: (_taskId: string, _clientY: number) => void;
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
  onVerticalPreview,
  onVerticalDrop,
  selected,
  saving,
}: GanttBarProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    mode: BarDragMode;
    startX: number;
    startY: number;
    days: number;
    pointerId: number;
    vertical: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const label = plainTaskText(task.summary);
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

      dragRef.current = {
        mode,
        startX: event.clientX,
        startY: event.clientY,
        days: 0,
        pointerId: event.pointerId,
        vertical: false,
      };
      setDragging(true);
      barRef.current?.setPointerCapture(event.pointerId);
    },
    [saving]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;

      // Only a whole-bar drag can reorder, and only once the pointer has
      // clearly committed to moving up or down rather than sideways
      if (
        drag.mode === "move" &&
        !drag.vertical &&
        Math.abs(dy) > VERTICAL_INTENT_PX &&
        Math.abs(dy) > Math.abs(dx)
      ) {
        drag.vertical = true;
        // Put the bar back where it started: this drag is about order now
        applyPreview("move", 0);
      }

      if (drag.vertical) {
        onVerticalPreview(event.clientY);
        return;
      }

      const days = Math.round(dx / dayWidth);
      if (days === drag.days) return;

      drag.days = days;
      applyPreview(drag.mode, days);
    },
    [applyPreview, dayWidth, onVerticalPreview]
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      dragRef.current = null;
      setDragging(false);
      barRef.current?.releasePointerCapture(event.pointerId);

      if (drag.vertical) {
        onVerticalPreview(null);
        onVerticalDrop(task.id, event.clientY);
        return;
      }

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
    [
      applyPreview,
      inferred,
      onCommit,
      onVerticalDrop,
      onVerticalPreview,
      spanDays,
      task.id,
    ]
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

  const tooltip = inferred
    ? t("gantt.bar_inferred_tooltip", { start: bar.start, end: bar.end })
    : t("gantt.bar_tooltip", { start: bar.start, end: bar.end });

  return (
    <div
      ref={barRef}
      className={classNames}
      title={tooltip}
      aria-label={`${label} — ${tooltip}`}
      onPointerDown={handlePointerDown("move")}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span
        className="tasks-map-gantt-bar__handle tasks-map-gantt-bar__handle--start"
        onPointerDown={handlePointerDown("resize-start")}
      />
      <span className="tasks-map-gantt-bar__label">{label}</span>
      <span
        className="tasks-map-gantt-bar__handle tasks-map-gantt-bar__handle--end"
        onPointerDown={handlePointerDown("resize-end")}
      />
    </div>
  );
}
