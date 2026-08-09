import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { BaseTask } from "src/types/base-task";
import { diffDays, inclusiveDayCount } from "src/lib/date-utils";
import { ScheduledBar } from "src/lib/gantt-schedule";
import { plainTaskText } from "src/lib/task-text";
import { effectiveTaskStatus } from "src/lib/task-progress";
import { t } from "../i18n";

export type BarDragMode = "move" | "resize-start" | "resize-end";

export interface BarDragResult {
  taskId: string;
  mode: BarDragMode;
  days: number;
}

/** How far the pointer must travel vertically before a drag reorders. */
const VERTICAL_INTENT_PX = 12;

/** What the schedule analysis has to say about one bar. */
export interface BarAnalysis {
  /** No slack: this bar is one of the ones deciding the finish date. */
  critical: boolean;
  /** Days it could slip before the plan does, or null when not being shown. */
  slackDays: number | null;
  /** Overdue, never started, or contradicting one of its blockers. */
  atRisk: boolean;
}

export const NO_BAR_ANALYSIS: BarAnalysis = {
  critical: false,
  slackDays: null,
  atRisk: false,
};

interface GanttBarProps {
  task: BaseTask;
  bar: ScheduledBar;
  inferred: boolean;
  analysis: BarAnalysis;
  /** First day of the chart, used as the origin for bar offsets. */
  timelineStart: string;
  dayWidth: number;
  /**
   * A rollup of the task's children rather than work in its own right. Drawn
   * slimmer and end-capped, and neither draggable nor resizable: its dates are
   * its children's, so a drag could only write dates the chart would then
   * ignore. It is still clickable — a parent is a task, and its words, its
   * status and its progress are all still its own.
   */
  summary?: boolean;
  onCommit: (_result: BarDragResult) => void;
  /** A click that moved nothing: open this task for editing. */
  onOpen: (_taskId: string) => void;
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
  analysis,
  timelineStart,
  dayWidth,
  summary = false,
  onCommit,
  onOpen,
  onVerticalPreview,
  onVerticalDrop,
  selected,
  saving,
}: GanttBarProps) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLSpanElement | null>(null);
  const dragRef = useRef<{
    mode: BarDragMode;
    startX: number;
    startY: number;
    days: number;
    pointerId: number;
    vertical: boolean;
    /** A summary bar: it can be clicked, but it cannot be moved. */
    readOnly: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const label = plainTaskText(task.summary);
  const offsetDays = diffDays(timelineStart, bar.start);
  const spanDays = inclusiveDayCount(bar.start, bar.end);
  /** How much of the task is done, or null when it carries no progress. */
  const percent = task.progress.percent;

  // Positioned before paint so a bar never flashes at the timeline origin
  useLayoutEffect(() => {
    const el = barRef.current;
    if (!el || dragRef.current) return;
    el.style.setProperty("--bar-offset", String(offsetDays));
    el.style.setProperty("--bar-span", String(spanDays));
  }, [offsetDays, spanDays]);

  // The fill is its own element, so a task with no progress renders nothing
  // extra at all — the ref is null and this does not run
  useLayoutEffect(() => {
    const el = progressRef.current;
    if (!el) return;
    el.style.setProperty("--bar-progress", `${percent ?? 0}%`);
  }, [percent]);

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

      // A summary bar still takes the pointer, but only so a click on it can
      // open the task. It is never dragged or resized: its dates come from its
      // children, so a drag could only write dates the chart would ignore.
      const readOnly = summary;
      if (readOnly && mode !== "move") return;

      event.preventDefault();
      event.stopPropagation();

      dragRef.current = {
        mode,
        startX: event.clientX,
        startY: event.clientY,
        days: 0,
        pointerId: event.pointerId,
        vertical: false,
        readOnly,
      };
      if (!readOnly) setDragging(true);
      barRef.current?.setPointerCapture(event.pointerId);
    },
    [saving, summary]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId || drag.readOnly) return;

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

      // A summary bar never moved, so this is always a click
      if (drag.readOnly) {
        onOpen(task.id);
        return;
      }

      if (drag.vertical) {
        onVerticalPreview(null);
        onVerticalDrop(task.id, event.clientY);
        return;
      }

      const { mode, days } = drag;

      // A click with no movement is not an edit — it opens the task.
      //
      // This used to be where an *inferred* bar committed its suggested dates
      // straight to the note, and that is deliberately not gone: the editor
      // opens with those suggested dates already filled in, so accepting them
      // is still this one click plus the save button, only now with the dates
      // visible before they are written. The toolbar's "apply suggested dates"
      // is untouched and remains the way to accept them in bulk.
      //
      // Only a click on the bar's body opens the task. One that landed on a
      // resize handle was a grab that went nowhere, and means nothing.
      if (days === 0) {
        applyPreview(mode, 0);
        if (mode === "move") onOpen(task.id);
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
      onCommit,
      onOpen,
      onVerticalDrop,
      onVerticalPreview,
      spanDays,
      task.id,
    ]
  );

  const classNames = [
    "tasks-map-gantt-bar",
    `tasks-map-gantt-bar--${effectiveTaskStatus(task.status, task.progress)}`,
    summary ? "tasks-map-gantt-bar--summary" : "",
    inferred && !summary ? "tasks-map-gantt-bar--inferred" : "",
    dragging ? "tasks-map-gantt-bar--dragging" : "",
    selected ? "tasks-map-gantt-bar--selected" : "",
    saving ? "tasks-map-gantt-bar--saving" : "",
    analysis.critical ? "tasks-map-gantt-bar--critical" : "",
    analysis.atRisk ? "tasks-map-gantt-bar--at-risk" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // How much room the task has is the first thing anyone asks after seeing
  // the dates, so it goes on the same tooltip rather than behind another hover
  const slack =
    analysis.slackDays === null
      ? null
      : analysis.slackDays < 0
        ? t("gantt.tooltip_behind", { n: -analysis.slackDays })
        : analysis.critical
          ? t("gantt.tooltip_critical")
          : t("gantt.tooltip_slack", { n: analysis.slackDays });

  const tooltip = [
    summary
      ? t("gantt.bar_summary_tooltip", { start: bar.start, end: bar.end })
      : inferred
        ? t("gantt.bar_inferred_tooltip", { start: bar.start, end: bar.end })
        : t("gantt.bar_tooltip", { start: bar.start, end: bar.end }),
    percent === null ? null : t("gantt.tooltip_progress", { n: percent }),
    slack,
    t("gantt.tooltip_click_edit"),
  ]
    .filter(Boolean)
    .join("\n");

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
      {percent === null || summary ? null : (
        <span ref={progressRef} className="tasks-map-gantt-bar__progress" />
      )}
      {/* A summary spans its children rather than holding dates of its own,
          so there is nothing for a resize handle to write */}
      {!summary && (
        <span
          className="tasks-map-gantt-bar__handle tasks-map-gantt-bar__handle--start"
          onPointerDown={handlePointerDown("resize-start")}
        />
      )}
      <span className="tasks-map-gantt-bar__label">{label}</span>
      {!summary && (
        <span
          className="tasks-map-gantt-bar__handle tasks-map-gantt-bar__handle--end"
          onPointerDown={handlePointerDown("resize-end")}
        />
      )}
    </div>
  );
}
