import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { App } from "obsidian";
import { GripVertical } from "lucide-react";
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
import { GanttGroup } from "src/lib/gantt-order";
import {
  ConnectionHighlight,
  connectionKey,
  isHighlightActive,
} from "src/lib/connection-highlight";
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

export type RowPlacement = "before" | "after";

export interface RowReorder {
  movedId: string;
  targetId: string;
  placement: RowPlacement;
}

/** A rendered line is either a group heading or a task row. */
type ChartLine =
  | { kind: "header"; key: string; label: string; count: number }
  | { kind: "row"; key: string; row: GanttRow };

function buildLines(groups: GanttGroup[]): ChartLine[] {
  const lines: ChartLine[] = [];

  for (const group of groups) {
    if (group.label) {
      lines.push({
        kind: "header",
        key: `group:${group.key}`,
        label: group.label,
        count: group.rows.length,
      });
    }
    for (const row of group.rows) {
      lines.push({ kind: "row", key: row.task.id, row });
    }
  }

  return lines;
}

interface GanttChartProps {
  groups: GanttGroup[];
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
  highlight: ConnectionHighlight;
  savingTaskIds: Set<string>;
  onSelect: (_taskId: string) => void;
  onCommit: (_result: BarDragResult) => void;
  onReorder: (_reorder: RowReorder) => void;
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

/** The contents of a task row in the left column. */
function RowLabel({
  row,
  app,
  palette,
  colorOverrides,
  showTags,
}: {
  row: GanttRow;
  app: App;
  palette: TagColorPalette;
  colorOverrides: TagColorOverrides;
  showTags: boolean;
}) {
  return (
    <>
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
      <LinkButton link={row.task.link} app={app} taskStatus={row.task.status} />
    </>
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
  groups,
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
  highlight,
  savingTaskIds,
  onSelect,
  onCommit,
  onReorder,
  scrollRef,
  labelWidth,
  onLabelWidthChange,
}: GanttChartProps) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const labelsRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ movedId: string; pointerId: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    placement: RowPlacement;
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const lines = useMemo(() => buildLines(groups), [groups]);

  /** Which row the pointer is over, and which side of it. */
  const resolveDropTarget = useCallback(
    (clientY: number): { id: string; placement: RowPlacement } | null => {
      const container = labelsRef.current;
      if (!container) return null;

      // The label header spans two timeline header rows plus its border
      const headerHeight = ROW_HEIGHT * 2 + 1;
      const offset =
        clientY - container.getBoundingClientRect().top - headerHeight;
      const index = Math.floor(offset / ROW_HEIGHT);
      if (index < 0) {
        const first = lines.find((line) => line.kind === "row");
        return first?.kind === "row"
          ? { id: first.row.task.id, placement: "before" }
          : null;
      }

      const clamped = Math.min(index, lines.length - 1);
      // Headers are not drop targets; fall back to the row above them
      let line = lines[clamped];
      for (let i = clamped; i >= 0 && line?.kind !== "row"; i--) {
        line = lines[i];
      }
      if (!line || line.kind !== "row") return null;

      const withinRow = offset - clamped * ROW_HEIGHT;
      return {
        id: line.row.task.id,
        placement: withinRow < ROW_HEIGHT / 2 ? "before" : "after",
      };
    },
    [lines]
  );

  const handleReorderDown = useCallback(
    (movedId: string) => (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      dragRef.current = { movedId, pointerId: event.pointerId };
      setDraggingId(movedId);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    []
  );

  const handleReorderMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      setDropTarget(resolveDropTarget(event.clientY));
    },
    [resolveDropTarget]
  );

  const handleReorderUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      setDraggingId(null);

      const target = resolveDropTarget(event.clientY);
      setDropTarget(null);
      if (!target || target.id === drag.movedId) return;

      onReorder({
        movedId: drag.movedId,
        targetId: target.id,
        placement: target.placement,
      });
    },
    [onReorder, resolveDropTarget]
  );

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

  // Arrows are positioned by rendered line, so group headings push them down
  const lineIndexById = useMemo(() => {
    const index = new Map<string, number>();
    lines.forEach((line, position) => {
      if (line.kind === "row") index.set(line.row.task.id, position);
    });
    return index;
  }, [lines]);

  const rowByTaskId = useMemo(() => {
    const map = new Map<string, GanttRow>();
    rows.forEach((row) => map.set(row.task.id, row));
    return map;
  }, [rows]);

  const arrowPaths = useMemo(
    () =>
      buildArrowPaths(
        rowByTaskId,
        lineIndexById,
        dependencies,
        timelineStart,
        scale.dayWidth,
        highlight
      ),
    [
      rowByTaskId,
      lineIndexById,
      dependencies,
      timelineStart,
      scale.dayWidth,
      highlight,
    ]
  );

  const highlighting = isHighlightActive(highlight);

  const rowClassName = (row: GanttRow, base: string) =>
    [
      base,
      selectedTaskId === row.task.id ? `${base}--selected` : "",
      draggingId === row.task.id ? `${base}--dragging` : "",
      dropTarget?.id === row.task.id
        ? `${base}--drop-${dropTarget.placement}`
        : "",
      highlighting && highlight.taskIds.has(row.task.id)
        ? `${base}--connected`
        : "",
      highlighting && !highlight.taskIds.has(row.task.id)
        ? `${base}--dimmed`
        : "",
    ]
      .filter(Boolean)
      .join(" ");

  return (
    <div className="tasks-map-gantt" ref={gridRef}>
      {/* One scroll container for both panes: vertical scrolling keeps the
          labels aligned with their rows, and the label column stays pinned
          during horizontal scrolling via `position: sticky`. */}
      <div className="tasks-map-gantt__scroll" ref={scrollRef}>
        <div className="tasks-map-gantt__labels" ref={labelsRef}>
          <div className="tasks-map-gantt__labels-header">
            {t("gantt.column_task")}
          </div>
          {lines.map((line) =>
            line.kind === "header" ? (
              <div key={line.key} className="tasks-map-gantt__group-header">
                <span className="tasks-map-gantt__group-label">
                  {line.label}
                </span>
                <span className="tasks-map-gantt__group-count">
                  {line.count}
                </span>
              </div>
            ) : (
              <div
                key={line.key}
                className={rowClassName(line.row, "tasks-map-gantt__label")}
                onClick={() => onSelect(line.row.task.id)}
              >
                <span
                  className="tasks-map-gantt__grip"
                  title={t("gantt.reorder_hint")}
                  onPointerDown={handleReorderDown(line.row.task.id)}
                  onPointerMove={handleReorderMove}
                  onPointerUp={handleReorderUp}
                  onPointerCancel={handleReorderUp}
                >
                  <GripVertical size={12} />
                </span>
                <RowLabel
                  row={line.row}
                  app={app}
                  palette={palette}
                  colorOverrides={colorOverrides}
                  showTags={showTags}
                />
              </div>
            )
          )}
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
              height={Math.max(lines.length, 1) * ROW_HEIGHT}
            >
              {arrowPaths.map((path) => (
                <path
                  key={path.key}
                  d={path.d}
                  className={`tasks-map-gantt__arrow ${path.className}`}
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

            {lines.map((line) =>
              line.kind === "header" ? (
                <div
                  key={line.key}
                  className="tasks-map-gantt__group-spacer"
                  aria-hidden="true"
                />
              ) : (
                <div
                  key={line.key}
                  className={rowClassName(line.row, "tasks-map-gantt__row")}
                >
                  <GanttBar
                    task={line.row.task}
                    bar={line.row.bar}
                    inferred={line.row.inferred}
                    timelineStart={timelineStart}
                    dayWidth={scale.dayWidth}
                    onCommit={onCommit}
                    onSelect={onSelect}
                    selected={selectedTaskId === line.row.task.id}
                    saving={savingTaskIds.has(line.row.task.id)}
                  />
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ArrowPath {
  key: string;
  d: string;
  className: string;
}

/**
 * Elbow connectors from the end of a blocker to the start of the task it
 * blocks, routed around the rows in between.
 */
function buildArrowPaths(
  rowByTaskId: Map<string, GanttRow>,
  lineIndexById: Map<string, number>,
  dependencies: GanttDependency[],
  timelineStart: string,
  dayWidth: number,
  highlight: ConnectionHighlight
): ArrowPath[] {
  const highlighting = isHighlightActive(highlight);
  return dependencies.flatMap((dependency) => {
    const from = rowByTaskId.get(dependency.fromId);
    const to = rowByTaskId.get(dependency.toId);
    const fromLine = lineIndexById.get(dependency.fromId);
    const toLine = lineIndexById.get(dependency.toId);
    if (!from || !to || fromLine === undefined || toLine === undefined) {
      return [];
    }

    const fromX = (diffDays(timelineStart, from.bar.end) + 1) * dayWidth;
    const fromY = fromLine * ROW_HEIGHT + ROW_HEIGHT / 2;
    const toX = diffDays(timelineStart, to.bar.start) * dayWidth;
    const toY = toLine * ROW_HEIGHT + ROW_HEIGHT / 2;

    const gutter = Math.max(8, dayWidth / 2);
    const midX = toX - gutter > fromX ? toX - gutter : fromX + gutter;

    const d = `M ${fromX} ${fromY} H ${midX} V ${toY} H ${toX}`;

    const key = connectionKey(dependency.fromId, dependency.toId);
    const className = !highlighting
      ? ""
      : highlight.edgeKeys.has(key)
        ? "tasks-map-gantt__arrow--connected"
        : "tasks-map-gantt__arrow--dimmed";

    return [{ key, d, className }];
  });
}
