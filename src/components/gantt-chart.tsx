import React, { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { App } from "obsidian";
import {
  addDays,
  diffDays,
  inclusiveDayCount,
  isFirstOfMonth,
  isWeekend,
  dayOfWeek,
} from "src/lib/date-utils";
import { GanttDependency, GanttRow } from "src/lib/gantt-rows";
import { useSummaryRenderer } from "src/hooks/use-summary-renderer";
import { GanttBar, BarDragResult } from "./gantt-bar";
import { LinkButton } from "./link-button";
import { Tag } from "./tag";
import { TagColorOverrides, TagColorPalette } from "src/lib/tag-color-manager";
import { t } from "../i18n";

export const ROW_HEIGHT = 34;

export const MIN_LABEL_WIDTH = 140;
export const MAX_LABEL_WIDTH = 720;

export interface GanttScale {
  id: "days" | "weeks" | "months";
  dayWidth: number;
}

export const GANTT_SCALES: GanttScale[] = [
  { id: "days", dayWidth: 32 },
  { id: "weeks", dayWidth: 12 },
  { id: "months", dayWidth: 5 },
];

interface GanttChartProps {
  rows: GanttRow[];
  dependencies: GanttDependency[];
  timelineStart: string;
  timelineEnd: string;
  today: string;
  scale: GanttScale;
  app: App;
  palette: TagColorPalette;
  colorOverrides: TagColorOverrides;
  showTags: boolean;
  selectedTaskId: string | null;
  savingTaskIds: Set<string>;
  onSelect: (_taskId: string) => void;
  onCommit: (_result: BarDragResult) => void;
  scrollRef: React.MutableRefObject<HTMLDivElement | null>;
  labelWidth: number;
  onLabelWidthChange: (_width: number) => void;
}

/**
 * Task text rendered through the shared summary renderer, so `[[wikilinks]]`
 * become real links into the vault. Lives in its own component because the
 * hook cannot be called inside the row loop.
 */
function GanttLabelText({ summary, app }: { summary: string; app: App }) {
  const ref = useSummaryRenderer(summary, app);
  return (
    <span className="tasks-map-gantt__label-text" title={summary} ref={ref} />
  );
}

interface TickMark {
  iso: string;
  offset: number;
  label: string;
  major: boolean;
}

const MONTH_LABEL_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  year: "numeric",
};

function formatMonth(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(
    undefined,
    MONTH_LABEL_OPTIONS
  );
}

/**
 * Column ticks for the header. Day columns are only readable when zoomed in,
 * so coarser scales fall back to one tick per week.
 */
function buildTicks(
  timelineStart: string,
  totalDays: number,
  scale: GanttScale
): TickMark[] {
  const ticks: TickMark[] = [];

  for (let offset = 0; offset < totalDays; offset++) {
    const iso = addDays(timelineStart, offset);

    if (scale.id === "days") {
      ticks.push({
        iso,
        offset,
        label: iso.slice(8),
        major: isFirstOfMonth(iso),
      });
      continue;
    }

    // Mondays anchor the coarser scales
    if (dayOfWeek(iso) !== 1) continue;
    ticks.push({
      iso,
      offset,
      label: scale.id === "weeks" ? iso.slice(5) : "",
      major: false,
    });
  }

  return ticks;
}

function buildMonthBands(
  timelineStart: string,
  totalDays: number
): Array<{ iso: string; offset: number; days: number }> {
  const bands: Array<{ iso: string; offset: number; days: number }> = [];

  for (let offset = 0; offset < totalDays; offset++) {
    const iso = addDays(timelineStart, offset);
    if (offset === 0 || isFirstOfMonth(iso)) {
      bands.push({ iso, offset, days: 0 });
    }
    bands[bands.length - 1].days += 1;
  }

  return bands;
}

export function GanttChart({
  rows,
  dependencies,
  timelineStart,
  timelineEnd,
  today,
  scale,
  app,
  palette,
  colorOverrides,
  showTags,
  selectedTaskId,
  savingTaskIds,
  onSelect,
  onCommit,
  scrollRef,
  labelWidth,
  onLabelWidthChange,
}: GanttChartProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const totalDays = inclusiveDayCount(timelineStart, timelineEnd);
  const todayOffset = diffDays(timelineStart, today);
  const todayVisible = todayOffset >= 0 && todayOffset < totalDays;

  const ticks = useMemo(
    () => buildTicks(timelineStart, totalDays, scale),
    [timelineStart, totalDays, scale]
  );
  const months = useMemo(
    () => buildMonthBands(timelineStart, totalDays),
    [timelineStart, totalDays]
  );

  // Geometry the whole chart shares, as CSS variables on the scrolling grid
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    el.style.setProperty("--gantt-day-width", `${scale.dayWidth}px`);
    el.style.setProperty("--gantt-total-days", String(totalDays));
    el.style.setProperty("--gantt-row-height", `${ROW_HEIGHT}px`);
    el.style.setProperty("--gantt-today-offset", String(todayOffset));
  }, [scale.dayWidth, totalDays, todayOffset]);

  // Written separately from the geometry above so a resize drag can update it
  // without disturbing anything else
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el || resizeRef.current) return;
    el.style.setProperty("--gantt-label-width", `${labelWidth}px`);
  }, [labelWidth]);

  const clampLabelWidth = (width: number) =>
    Math.min(MAX_LABEL_WIDTH, Math.max(MIN_LABEL_WIDTH, Math.round(width)));

  const handleResizeDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      resizeRef.current = { startX: event.clientX, startWidth: labelWidth };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [labelWidth]
  );

  const handleResizeMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const resize = resizeRef.current;
      if (!resize) return;
      const next = clampLabelWidth(
        resize.startWidth + (event.clientX - resize.startX)
      );
      gridRef.current?.style.setProperty("--gantt-label-width", `${next}px`);
    },
    []
  );

  const handleResizeUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const resize = resizeRef.current;
      if (!resize) return;
      resizeRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);

      const next = clampLabelWidth(
        resize.startWidth + (event.clientX - resize.startX)
      );
      if (next !== labelWidth) onLabelWidthChange(next);
    },
    [labelWidth, onLabelWidthChange]
  );

  const setRowRef = useCallback(
    (offset: number, span: number) => (el: HTMLDivElement | null) => {
      if (!el) return;
      el.style.setProperty("--bar-offset", String(offset));
      el.style.setProperty("--bar-span", String(span));
    },
    []
  );

  const arrowPaths = useMemo(
    () => buildArrowPaths(rows, dependencies, timelineStart, scale.dayWidth),
    [rows, dependencies, timelineStart, scale.dayWidth]
  );

  return (
    <div className="tasks-map-gantt" ref={gridRef}>
      {/* One scroll container for both panes: vertical scrolling keeps the
          labels aligned with their rows, and the label column stays pinned
          during horizontal scrolling via `position: sticky`. */}
      <div className="tasks-map-gantt__scroll" ref={scrollRef}>
        <div className="tasks-map-gantt__labels">
          <div className="tasks-map-gantt__labels-header">
            {t("gantt.column_task")}
          </div>
          {rows.map((row) => (
            <div
              key={row.task.id}
              className={`tasks-map-gantt__label ${
                selectedTaskId === row.task.id
                  ? "tasks-map-gantt__label--selected"
                  : ""
              }`}
              onClick={() => onSelect(row.task.id)}
            >
              <span
                className={`tasks-map-gantt__status tasks-map-gantt__status--${row.task.status}`}
              />
              <GanttLabelText summary={row.task.summary} app={app} />
              {showTags && row.task.tags.length > 0 && (
                <span className="tasks-map-gantt__label-tags">
                  {row.task.tags.slice(0, 2).map((tag) => (
                    <Tag
                      key={tag}
                      tag={tag}
                      palette={palette}
                      colorOverrides={colorOverrides}
                    />
                  ))}
                </span>
              )}
              <LinkButton
                link={row.task.link}
                app={app}
                taskStatus={row.task.status}
              />
            </div>
          ))}
          <div
            className="tasks-map-gantt__resizer"
            onPointerDown={handleResizeDown}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeUp}
            onPointerCancel={handleResizeUp}
            title={t("gantt.resize_columns")}
          />
        </div>

        <div className="tasks-map-gantt__timeline">
          <div className="tasks-map-gantt__header">
            <div className="tasks-map-gantt__months">
              {months.map((month) => (
                <div
                  key={month.iso}
                  className="tasks-map-gantt__month"
                  ref={setRowRef(month.offset, month.days)}
                >
                  <span className="tasks-map-gantt__month-label">
                    {formatMonth(month.iso)}
                  </span>
                </div>
              ))}
            </div>
            <div className="tasks-map-gantt__ticks">
              {ticks.map((tick) => (
                <div
                  key={tick.iso}
                  className={`tasks-map-gantt__tick ${
                    tick.major ? "tasks-map-gantt__tick--major" : ""
                  } ${isWeekend(tick.iso) ? "tasks-map-gantt__tick--weekend" : ""}`}
                  ref={setRowRef(tick.offset, 1)}
                >
                  {tick.label}
                </div>
              ))}
            </div>
          </div>

          <div className="tasks-map-gantt__body">
            {scale.id === "days" &&
              Array.from({ length: totalDays }, (_, offset) => {
                const iso = addDays(timelineStart, offset);
                if (!isWeekend(iso)) return null;
                return (
                  <div
                    key={iso}
                    className="tasks-map-gantt__weekend"
                    ref={setRowRef(offset, 1)}
                  />
                );
              })}

            {todayVisible && <div className="tasks-map-gantt__today" />}

            <svg
              className="tasks-map-gantt__arrows"
              width={totalDays * scale.dayWidth}
              height={Math.max(rows.length, 1) * ROW_HEIGHT}
            >
              {arrowPaths.map((path) => (
                <path
                  key={path.key}
                  d={path.d}
                  className="tasks-map-gantt__arrow"
                  markerEnd="url(#tasks-map-gantt-arrowhead)"
                />
              ))}
              <defs>
                <marker
                  id="tasks-map-gantt-arrowhead"
                  markerWidth="6"
                  markerHeight="6"
                  refX="5"
                  refY="3"
                  orient="auto"
                >
                  <path
                    d="M0,0 L6,3 L0,6 z"
                    className="tasks-map-gantt__arrowhead"
                  />
                </marker>
              </defs>
            </svg>

            {rows.map((row) => (
              <div
                key={row.task.id}
                className={`tasks-map-gantt__row ${
                  selectedTaskId === row.task.id
                    ? "tasks-map-gantt__row--selected"
                    : ""
                }`}
              >
                <GanttBar
                  task={row.task}
                  bar={row.bar}
                  inferred={row.inferred}
                  timelineStart={timelineStart}
                  dayWidth={scale.dayWidth}
                  onCommit={onCommit}
                  onSelect={onSelect}
                  selected={selectedTaskId === row.task.id}
                  saving={savingTaskIds.has(row.task.id)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ArrowPath {
  key: string;
  d: string;
}

/**
 * Elbow connectors from the end of a blocker to the start of the task it
 * blocks, routed around the rows in between.
 */
function buildArrowPaths(
  rows: GanttRow[],
  dependencies: GanttDependency[],
  timelineStart: string,
  dayWidth: number
): ArrowPath[] {
  return dependencies.flatMap((dependency) => {
    const from = rows[dependency.fromRow];
    const to = rows[dependency.toRow];
    if (!from || !to) return [];

    const fromX = (diffDays(timelineStart, from.bar.end) + 1) * dayWidth;
    const fromY = dependency.fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
    const toX = diffDays(timelineStart, to.bar.start) * dayWidth;
    const toY = dependency.toRow * ROW_HEIGHT + ROW_HEIGHT / 2;

    const gutter = Math.max(8, dayWidth / 2);
    const midX = toX - gutter > fromX ? toX - gutter : fromX + gutter;

    const d = `M ${fromX} ${fromY} H ${midX} V ${toY} H ${toX}`;

    return [{ key: `${dependency.fromId}->${dependency.toId}`, d }];
  });
}
