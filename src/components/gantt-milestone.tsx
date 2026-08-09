import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { GanttMilestone, MilestoneStatus } from "src/lib/gantt-milestones";
import { t } from "../i18n";

export interface MilestoneDragResult {
  milestoneId: string;
  days: number;
}

interface MilestoneDragOptions {
  milestoneId: string;
  /** Days from the first day of the chart to the milestone. */
  offsetDays: number;
  dayWidth: number;
  onMove: (_result: MilestoneDragResult) => void;
  onEdit: (_milestoneId: string) => void;
}

/**
 * Sideways dragging for a milestone, wherever it is drawn.
 *
 * The offset is written to a CSS custom property on the wrapper rather than
 * held in state, which is the same trick the bars use: a drag mutates one
 * variable instead of re-rendering the chart once per day crossed. A pointer
 * that never moved was a click, which opens the milestone for editing —
 * identical in the lane and in the list, so the flag and the row behave the
 * same way for the same gesture.
 */
function useMilestoneDrag({
  milestoneId,
  offsetDays,
  dayWidth,
  onMove,
  onEdit,
}: MilestoneDragOptions) {
  const markerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    days: number;
    pointerId: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Positioned before paint so a marker never flashes at the timeline origin
  useLayoutEffect(() => {
    const el = markerRef.current;
    if (!el || dragRef.current) return;
    el.style.setProperty("--milestone-offset", String(offsetDays));
  }, [offsetDays]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      dragRef.current = {
        startX: event.clientX,
        days: 0,
        pointerId: event.pointerId,
      };
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    []
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const days = Math.round((event.clientX - drag.startX) / dayWidth);
      if (days === drag.days) return;

      drag.days = days;
      markerRef.current?.style.setProperty(
        "--milestone-offset",
        String(offsetDays + days)
      );
    },
    [dayWidth, offsetDays]
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      dragRef.current = null;
      setDragging(false);
      event.currentTarget.releasePointerCapture(event.pointerId);

      // A marker that never moved was a click, which opens it for editing
      if (drag.days === 0) {
        markerRef.current?.style.setProperty(
          "--milestone-offset",
          String(offsetDays)
        );
        onEdit(milestoneId);
        return;
      }

      onMove({ milestoneId, days: drag.days });
    },
    [milestoneId, offsetDays, onEdit, onMove]
  );

  return {
    markerRef,
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}

interface GanttMilestoneMarkerProps extends Omit<
  MilestoneDragOptions,
  "milestoneId"
> {
  milestone: GanttMilestone;
  status: MilestoneStatus;
}

/**
 * The flag and guide line for one milestone in the lane above the chart.
 *
 * Both are children of a single positioned wrapper, so a drag moves them
 * together by writing one CSS custom property — the same trick the bars use to
 * stay cheap, and the reason the whole chart does not re-render per day.
 */
export function GanttMilestoneMarker({
  milestone,
  status,
  offsetDays,
  dayWidth,
  onMove,
  onEdit,
}: GanttMilestoneMarkerProps) {
  const { markerRef, dragging, handlers } = useMilestoneDrag({
    milestoneId: milestone.id,
    offsetDays,
    dayWidth,
    onMove,
    onEdit,
  });

  const className = [
    "tasks-map-gantt__milestone",
    `tasks-map-gantt__milestone--${status}`,
    dragging ? "tasks-map-gantt__milestone--dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const tooltip = t("gantt.milestone_tooltip", {
    label: milestone.label,
    date: milestone.date,
  });

  return (
    <div ref={markerRef} className={className}>
      <button
        className="tasks-map-gantt__milestone-flag"
        title={tooltip}
        aria-label={tooltip}
        {...handlers}
      >
        <span className="tasks-map-gantt__milestone-diamond" />
        <span className="tasks-map-gantt__milestone-label">
          {milestone.label}
        </span>
      </button>
      <div className="tasks-map-gantt__milestone-line" aria-hidden="true" />
    </div>
  );
}

/**
 * The diamond a row milestone shows on its own line of the timeline.
 *
 * Deliberately not a bar: a milestone is one day, has no length to resize and
 * nothing to depend on it, so there is no body to grab and no handles. The one
 * gesture it has is the flag's — drag sideways to move the day, click to edit.
 */
export function GanttMilestoneRow({
  milestone,
  status,
  offsetDays,
  dayWidth,
  onMove,
  onEdit,
}: GanttMilestoneMarkerProps) {
  const { markerRef, dragging, handlers } = useMilestoneDrag({
    milestoneId: milestone.id,
    offsetDays,
    dayWidth,
    onMove,
    onEdit,
  });

  const className = [
    "tasks-map-gantt__milestone-point",
    `tasks-map-gantt__milestone-point--${status}`,
    dragging ? "tasks-map-gantt__milestone-point--dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const tooltip = t("gantt.milestone_tooltip", {
    label: milestone.label,
    date: milestone.date,
  });

  return (
    <div ref={markerRef} className={className}>
      <button
        className="tasks-map-gantt__milestone-handle"
        title={tooltip}
        aria-label={tooltip}
        {...handlers}
      >
        <span className="tasks-map-gantt__milestone-diamond" />
      </button>
    </div>
  );
}
