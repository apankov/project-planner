import React, { useCallback, useLayoutEffect, useRef, useState } from "react";
import { GanttMilestone, MilestoneStatus } from "src/lib/gantt-milestones";
import { t } from "../i18n";

export interface MilestoneDragResult {
  milestoneId: string;
  days: number;
}

interface GanttMilestoneMarkerProps {
  milestone: GanttMilestone;
  status: MilestoneStatus;
  /** Days from the first day of the chart to the milestone. */
  offsetDays: number;
  dayWidth: number;
  onMove: (_result: MilestoneDragResult) => void;
  onEdit: (_milestoneId: string) => void;
}

/**
 * The flag and guide line for one milestone.
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

  const handlePointerDown = useCallback(
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

  const handlePointerMove = useCallback(
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

      // A flag that never moved was a click, which opens it for editing
      if (drag.days === 0) {
        markerRef.current?.style.setProperty(
          "--milestone-offset",
          String(offsetDays)
        );
        onEdit(milestone.id);
        return;
      }

      onMove({ milestoneId: milestone.id, days: drag.days });
    },
    [milestone.id, offsetDays, onEdit, onMove]
  );

  const className = [
    "tasks-map-gantt__milestone",
    `tasks-map-gantt__milestone--${status}`,
    dragging ? "tasks-map-gantt__milestone--dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={markerRef} className={className}>
      <button
        className="tasks-map-gantt__milestone-flag"
        title={t("gantt.milestone_tooltip", {
          label: milestone.label,
          date: milestone.date,
        })}
        aria-label={t("gantt.milestone_tooltip", {
          label: milestone.label,
          date: milestone.date,
        })}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
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
