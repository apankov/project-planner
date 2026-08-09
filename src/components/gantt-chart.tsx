import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { App } from "obsidian";
import {
  AlertTriangle,
  Coins,
  GripVertical,
  Link2,
  Network,
  Plus,
  TagIcon,
} from "lucide-react";
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
  highlightDirection,
  isHighlightActive,
} from "src/lib/connection-highlight";
import { GanttMilestone, milestoneStatus } from "src/lib/gantt-milestones";
import { ScheduleRisk } from "src/lib/schedule-risk";
import { plainTaskText } from "src/lib/task-text";
import { GanttBar, BarDragResult } from "./gantt-bar";
import { GanttMilestoneMarker, MilestoneDragResult } from "./gantt-milestone";
import { TagInput } from "./tag-input";
import { LinkButton } from "./link-button";
import { Tag } from "./tag";
import { TagColorOverrides, TagColorPalette } from "src/lib/tag-color-manager";
import { t } from "../i18n";

export const ROW_HEIGHT = 34;

/** Stable empty set, so switching the critical path off is not a new prop. */
const EMPTY_KEYS: Set<string> = new Set();

/** Header lanes above the rows: the month band and the day ticks. */
const BASE_HEADER_ROWS = 2;

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
  /** Tasks with no slack, and the links joining them, from the analysis. */
  criticalIds: Set<string>;
  criticalEdgeKeys: Set<string>;
  floatByTaskId: Map<string, number>;
  /** Whether the user has asked to see the critical path at all. */
  showCriticalPath: boolean;
  /** Tasks whose dates do not add up, keyed by task ID. */
  risksByTaskId: Map<string, ScheduleRisk[]>;
  /** Every selected task; dragging one bar moves all of them. */
  selectedTaskIds: Set<string>;
  highlight: ConnectionHighlight;
  savingTaskIds: Set<string>;
  /** `toggle` clears the selection when the same task is picked again; a
      drag selects without toggling, so releasing keeps the task selected. */
  onSelect: (_taskId: string, _toggle?: boolean, _additive?: boolean) => void;
  onCommit: (_result: BarDragResult) => void;
  onReorder: (_reorder: RowReorder) => void;
  onAddTaskAfter: (_taskId: string) => void;
  onStartLink: (_taskId: string) => void;
  onShowInMap: (_taskId: string) => void;
  /** Absent when finance is switched off, which hides the button. */
  onEditFinance?: (_taskId: string) => void;
  onAddTag: (_taskId: string, _tag: string) => void;
  onRemoveTag: (_taskId: string, _tag: string) => void;
  /** Named days marked across the timeline. */
  milestones: GanttMilestone[];
  onMoveMilestone: (_result: MilestoneDragResult) => void;
  onEditMilestone: (_milestoneId: string) => void;
  /** Every tag in use, most common first, for the tag picker. */
  allTags: string[];
  /** Task a link is being drawn from, if any. */
  linkingFromId: string | null;
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

/**
 * One line per problem, naming the blocker a conflict is with so the message
 * says which of several links is the broken one.
 */
function describeRisks(
  risks: ScheduleRisk[],
  nameById: Map<string, string>
): string[] {
  return risks.map((risk) => {
    if (risk.kind !== "conflict") return t(`gantt.risk_${risk.kind}`);
    return t("gantt.risk_conflict", {
      blocker: (risk.blockerId && nameById.get(risk.blockerId)) ?? "",
    });
  });
}

/** The warning marker on a row whose dates do not add up. */
function RiskBadge({ messages }: { messages: string[] }) {
  const title = messages.join("\n");
  return (
    <span
      className="tasks-map-gantt__risk"
      title={title}
      aria-label={title}
      role="img"
    >
      <AlertTriangle size={12} />
    </span>
  );
}

/** The contents of a task row in the left column. */
function RowLabel({
  row,
  app,
  palette,
  colorOverrides,
  showTags,
  riskMessages,
  onRemoveTag,
}: {
  row: GanttRow;
  app: App;
  palette: TagColorPalette;
  colorOverrides: TagColorOverrides;
  showTags: boolean;
  riskMessages: string[];
  onRemoveTag: (_taskId: string, _tag: string) => void;
}) {
  return (
    <>
      <span
        className={`tasks-map-gantt__status tasks-map-gantt__status--${row.task.status}`}
      />
      {riskMessages.length > 0 && <RiskBadge messages={riskMessages} />}
      <GanttLabelText summary={row.task.summary} app={app} />
      {showTags && row.task.tags.length > 0 && (
        <span className="tasks-map-gantt__label-tags">
          {row.task.tags.slice(0, 2).map((tag) => (
            <Tag
              key={tag}
              tag={tag}
              palette={palette}
              colorOverrides={colorOverrides}
              onRemove={() => onRemoveTag(row.task.id, tag)}
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
  criticalIds,
  criticalEdgeKeys,
  floatByTaskId,
  showCriticalPath,
  risksByTaskId,
  selectedTaskIds,
  highlight,
  savingTaskIds,
  onSelect,
  onCommit,
  onReorder,
  onAddTaskAfter,
  onStartLink,
  onShowInMap,
  onEditFinance,
  onAddTag,
  onRemoveTag,
  milestones,
  onMoveMilestone,
  onEditMilestone,
  allTags,
  linkingFromId,
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
  const [taggingId, setTaggingId] = useState<string | null>(null);

  const lines = useMemo(() => buildLines(groups), [groups]);

  // Milestone flags get a lane of their own, but only once there is one to
  // draw — an empty band above every chart would be a strange default
  const headerRows =
    milestones.length > 0 ? BASE_HEADER_ROWS + 1 : BASE_HEADER_ROWS;

  /** Which row the pointer is over, and which side of it. */
  const resolveDropTarget = useCallback(
    (clientY: number): { id: string; placement: RowPlacement } | null => {
      const container = labelsRef.current;
      if (!container) return null;

      // The label header spans the timeline header lanes plus its border
      const headerHeight = ROW_HEIGHT * headerRows + 1;
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
    [headerRows, lines]
  );

  /** A bar dragged up or down shows the same drop indicator as a row drag. */
  const handleVerticalPreview = useCallback(
    (clientY: number | null) => {
      setDropTarget(clientY === null ? null : resolveDropTarget(clientY));
    },
    [resolveDropTarget]
  );

  const handleVerticalDrop = useCallback(
    (movedId: string, clientY: number) => {
      setDropTarget(null);
      const target = resolveDropTarget(clientY);
      if (!target || target.id === movedId) return;
      onReorder({ movedId, targetId: target.id, placement: target.placement });
    },
    [onReorder, resolveDropTarget]
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
    el.style.setProperty("--gantt-header-rows", String(headerRows));
  }, [headerRows, scale.dayWidth, totalDays, todayOffset]);

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

  // Blocker names for the conflict messages, without the metadata a task line
  // carries around with it
  const nameByTaskId = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row) =>
      map.set(row.task.id, plainTaskText(row.task.summary))
    );
    return map;
  }, [rows]);

  const riskMessagesByTaskId = useMemo(() => {
    const map = new Map<string, string[]>();
    risksByTaskId.forEach((risks, taskId) =>
      map.set(taskId, describeRisks(risks, nameByTaskId))
    );
    return map;
  }, [risksByTaskId, nameByTaskId]);

  const arrowPaths = useMemo(
    () =>
      buildArrowPaths(
        rowByTaskId,
        lineIndexById,
        dependencies,
        timelineStart,
        scale.dayWidth,
        highlight,
        showCriticalPath ? criticalEdgeKeys : EMPTY_KEYS
      ),
    [
      rowByTaskId,
      lineIndexById,
      dependencies,
      timelineStart,
      scale.dayWidth,
      highlight,
      showCriticalPath,
      criticalEdgeKeys,
    ]
  );

  /** What the analysis says about one row, for the bar to draw. */
  const analysisFor = useCallback(
    (taskId: string) => ({
      critical: showCriticalPath && criticalIds.has(taskId),
      slackDays: showCriticalPath ? (floatByTaskId.get(taskId) ?? null) : null,
      atRisk: risksByTaskId.has(taskId),
    }),
    [showCriticalPath, criticalIds, floatByTaskId, risksByTaskId]
  );

  const highlighting = isHighlightActive(highlight);

  const rowClassName = (row: GanttRow, base: string) =>
    [
      base,
      selectedTaskIds.has(row.task.id) ? `${base}--selected` : "",
      draggingId === row.task.id ? `${base}--dragging` : "",
      dropTarget?.id === row.task.id
        ? `${base}--drop-${dropTarget.placement}`
        : "",
      highlighting && highlight.taskIds.has(row.task.id)
        ? `${base}--connected`
        : "",
      highlighting && highlight.upstreamIds.has(row.task.id)
        ? `${base}--upstream`
        : "",
      highlighting && highlight.downstreamIds.has(row.task.id)
        ? `${base}--downstream`
        : "",
      highlighting && !highlight.taskIds.has(row.task.id)
        ? `${base}--dimmed`
        : "",
      linkingFromId === row.task.id ? `${base}--linking` : "",
      linkingFromId && linkingFromId !== row.task.id
        ? `${base}--link-target`
        : "",
      showCriticalPath && criticalIds.has(row.task.id)
        ? `${base}--critical`
        : "",
      risksByTaskId.has(row.task.id) ? `${base}--at-risk` : "",
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
                onClick={(event) =>
                  onSelect(
                    line.row.task.id,
                    true,
                    event.ctrlKey || event.metaKey
                  )
                }
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
                {taggingId === line.row.task.id ? (
                  <span
                    className="tasks-map-gantt__tag-input"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <TagInput
                      allTags={allTags}
                      existingTags={line.row.task.tags}
                      onAddTag={(tag) => {
                        setTaggingId(null);
                        onAddTag(line.row.task.id, tag);
                      }}
                      onCancel={() => setTaggingId(null)}
                    />
                  </span>
                ) : (
                  <RowLabel
                    row={line.row}
                    app={app}
                    palette={palette}
                    colorOverrides={colorOverrides}
                    showTags={showTags}
                    riskMessages={
                      riskMessagesByTaskId.get(line.row.task.id) ?? []
                    }
                    onRemoveTag={onRemoveTag}
                  />
                )}
                <span className="tasks-map-gantt__row-actions">
                  <button
                    className="tasks-map-gantt__row-action"
                    title={t("gantt.add_tag")}
                    aria-label={t("gantt.add_tag")}
                    onClick={(event) => {
                      event.stopPropagation();
                      setTaggingId((previous) =>
                        previous === line.row.task.id ? null : line.row.task.id
                      );
                    }}
                  >
                    <TagIcon size={12} />
                  </button>
                  <button
                    className="tasks-map-gantt__row-action"
                    title={t("gantt.show_in_map")}
                    aria-label={t("gantt.show_in_map")}
                    onClick={(event) => {
                      event.stopPropagation();
                      onShowInMap(line.row.task.id);
                    }}
                  >
                    <Network size={12} />
                  </button>
                  <button
                    className="tasks-map-gantt__row-action"
                    title={t("gantt.link_from")}
                    aria-label={t("gantt.link_from")}
                    onClick={(event) => {
                      event.stopPropagation();
                      onStartLink(line.row.task.id);
                    }}
                  >
                    <Link2 size={12} />
                  </button>
                  {onEditFinance && (
                    <button
                      className="tasks-map-gantt__row-action"
                      title={t("finance.menu_item")}
                      aria-label={t("finance.menu_item")}
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditFinance(line.row.task.id);
                      }}
                    >
                      <Coins size={12} />
                    </button>
                  )}
                  <button
                    className="tasks-map-gantt__row-action"
                    title={t("gantt.add_task_after")}
                    aria-label={t("gantt.add_task_after")}
                    onClick={(event) => {
                      event.stopPropagation();
                      onAddTaskAfter(line.row.task.id);
                    }}
                  >
                    <Plus size={12} />
                  </button>
                </span>
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
            {milestones.length > 0 && (
              <div
                className="tasks-map-gantt__milestone-lane"
                aria-hidden="true"
              />
            )}
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
                    analysis={analysisFor(line.row.task.id)}
                    timelineStart={timelineStart}
                    dayWidth={scale.dayWidth}
                    onCommit={onCommit}
                    onVerticalPreview={handleVerticalPreview}
                    onVerticalDrop={handleVerticalDrop}
                    selected={selectedTaskIds.has(line.row.task.id)}
                    saving={savingTaskIds.has(line.row.task.id)}
                  />
                </div>
              )
            )}
          </div>

          {/* Above both the header and the rows, so a milestone's flag stays
              in its lane while its guide line runs the length of the chart. */}
          {milestones.length > 0 && (
            <div className="tasks-map-gantt__milestones">
              {milestones.map((milestone) => (
                <GanttMilestoneMarker
                  key={milestone.id}
                  milestone={milestone}
                  status={milestoneStatus(milestone, today)}
                  offsetDays={diffDays(timelineStart, milestone.date)}
                  dayWidth={scale.dayWidth}
                  onMove={onMoveMilestone}
                  onEdit={onEditMilestone}
                />
              ))}
            </div>
          )}
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
  highlight: ConnectionHighlight,
  criticalEdgeKeys: Set<string>
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
    const direction = highlightDirection(
      highlight,
      dependency.fromId,
      dependency.toId
    );
    const highlightClass = !highlighting
      ? ""
      : direction
        ? `tasks-map-gantt__arrow--${direction}`
        : highlight.edgeKeys.has(key)
          ? "tasks-map-gantt__arrow--connected"
          : "tasks-map-gantt__arrow--dimmed";

    // The critical marking survives a selection dimming the rest of the chart:
    // it is the one thing worth seeing whatever else is going on
    const className = [
      highlightClass,
      criticalEdgeKeys.has(key) ? "tasks-map-gantt__arrow--critical" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return [{ key, d, className }];
  });
}
