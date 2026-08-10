/**
 * The Gantt chart as a picture, for pasting into a document.
 *
 * This is deliberately *not* a screenshot of the view. What works on screen —
 * hover actions, weekend shading, day numbers, the theme's colours, a chart
 * you scroll — works badly at the size a chart ends up on a landscape page,
 * where the reader gets one look and no way to interact. So the export is its
 * own drawing of the same plan, and it drops everything that does not survive
 * that trip:
 *
 * - the whole timeline is fitted to the page width, so nothing is off the edge
 * - one light ink, one bar colour per status, one accent for today and for the
 *   critical path — four colours in total, all chosen for white paper
 * - no weekend bands, no day ticks, no row buttons, no selection or highlight
 *   state; month rules and a today line are all the grid a reader needs
 * - the parts that carry the meaning are made *bigger*, not smaller: a title,
 *   the span it covers, group headings, milestone names and a legend that only
 *   lists what the chart actually uses
 *
 * The output is an SVG string with the geometry baked in, so rasterising it at
 * two, three or four device pixels per unit gives a crisp PNG at any size (see
 * `gantt-export-modal.ts`). Nothing here touches the DOM, which is what lets
 * the layout be tested.
 */

import { TaskStatus } from "../types/task";
import { addDays, diffDays, inclusiveDayCount } from "./date-utils";

/** Page shapes worth exporting for. The number is the layout width in px. */
export type GanttExportPaper = "a4" | "a3" | "slide";

export const GANTT_EXPORT_PAPERS: GanttExportPaper[] = ["a4", "a3", "slide"];

/**
 * Layout size in CSS pixels, i.e. the paper at 96dpi. The pixel ratio below
 * multiplies it, so A4 at 3× lands at roughly 288dpi — print quality.
 */
const PAPER_WIDTH: Record<GanttExportPaper, number> = {
  a4: 1123,
  a3: 1587,
  slide: 1280,
};

/** How tall the page is, which is what decides when rows have to be squeezed. */
const PAPER_HEIGHT: Record<GanttExportPaper, number> = {
  a4: 794,
  a3: 1123,
  slide: 720,
};

/** Device pixels per layout pixel. 3 is the default: A4 at ~288dpi. */
export const GANTT_EXPORT_RATIOS = [2, 3, 4];

export const DEFAULT_EXPORT_RATIO = 3;

export interface GanttExportOptions {
  paper: GanttExportPaper;
  pixelRatio: number;
  /**
   * Whether to draw the dependency arrows. Off by default: on a page-wide
   * chart they are the first thing to turn into noise, and the reader of a
   * plan usually wants the dates rather than the wiring.
   */
  showDependencies: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: GanttExportOptions = {
  paper: "a4",
  pixelRatio: DEFAULT_EXPORT_RATIO,
  showDependencies: false,
};

/** One task, already reduced to what the picture needs to draw it. */
export interface GanttExportTask {
  kind: "task";
  id: string;
  label: string;
  /** Indent level; 0 for a top-level task. */
  depth: number;
  start: string;
  end: string;
  status: TaskStatus;
  /** Whole percent, or null when the task carries no progress. */
  percent: number | null;
  /** Dates the chart proposed rather than read from the note. */
  inferred: boolean;
  /** A parent whose bar is rolled up from its children. */
  rollup: boolean;
  critical: boolean;
}

export interface GanttExportHeading {
  kind: "heading";
  label: string;
  count: number;
}

export interface GanttExportMilestoneLine {
  kind: "milestone";
  label: string;
  date: string;
}

/** A line of the chart, in the order it is drawn. */
export type GanttExportLine =
  GanttExportTask | GanttExportHeading | GanttExportMilestoneLine;

/** A milestone marked across the whole chart rather than filed in the list. */
export interface GanttExportMilestone {
  label: string;
  date: string;
}

export interface GanttExportDependency {
  fromId: string;
  toId: string;
}

/**
 * Every user-facing word the picture needs, already translated. The layout
 * decides which of them appear — a legend entry for a status nothing uses is
 * exactly the sort of clutter this export exists to avoid.
 */
export interface GanttExportLabels {
  today: string;
  statuses: Record<TaskStatus, string>;
  suggested: string;
  summary: string;
  milestone: string;
  critical: string;
}

export interface GanttExportInput {
  title: string;
  /** The one line under the title: what this covers, and over what span. */
  subtitle: string;
  /** The small print at the foot of the page. */
  footer: string;
  lines: GanttExportLine[];
  laneMilestones: GanttExportMilestone[];
  dependencies: GanttExportDependency[];
  timelineStart: string;
  timelineEnd: string;
  today: string;
  labels: GanttExportLabels;
  /** For month names; the platform default when absent. */
  locale?: string;
  options: GanttExportOptions;
}

export interface GanttExportImage {
  svg: string;
  /** Layout size. The PNG is this multiplied by the pixel ratio. */
  width: number;
  height: number;
}

/* -------------------------------------------------------------------------- */
/* The palette                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Fixed, and light whatever theme Obsidian is in. An export follows the
 * document it is going into, not the app it came from, and a dark screenshot
 * dropped into a report is the commonest way a chart like this goes wrong.
 */
const PAPER = "#ffffff";
const INK = "#1f2933";
const MUTED = "#6b7280";
const RULE = "#e4e7ec";
const BAND = "#f6f7f9";
/** A shade past the row banding, so a heading is never read as just a row. */
const HEADING_BAND = "#e9ecf1";
const ACCENT = "#b4472f";

const BAR_FILL: Record<TaskStatus, string> = {
  todo: "#b7c1d0",
  in_progress: "#3f6fa8",
  done: "#7fa98c",
  canceled: "#dfe2e7",
};

/** The done part of a bar somebody is partway through. */
const PROGRESS_FILL = "#27527f";

/** A rolled-up parent: darker and slimmer than a task of its own. */
const ROLLUP_FILL = "#4b5563";

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, " +
  "Arial, sans-serif";

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

const MARGIN = 36;
/** Title, subtitle and the air under them. */
const TITLE_BLOCK = 50;
const TITLE_SIZE = 21;
const SUBTITLE_SIZE = 11;
const AXIS_HEIGHT = 34;
/** The strip lane milestones put their names in, when there are any. */
const MILESTONE_BAND = 22;
const LEGEND_HEIGHT = 30;
const FOOTER_HEIGHT = 22;
const MAX_ROW_HEIGHT = 26;
const MIN_ROW_HEIGHT = 15;
const MIN_LABEL_WIDTH = 180;

interface Layout {
  width: number;
  height: number;
  rowHeight: number;
  fontSize: number;
  barHeight: number;
  labelX: number;
  labelWidth: number;
  plotX: number;
  plotWidth: number;
  dayWidth: number;
  totalDays: number;
  axisTop: number;
  bandTop: number;
  bandHeight: number;
  plotTop: number;
  plotHeight: number;
  legendTop: number;
  footerY: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** SVG coordinates, rounded: two decimals is under half a device pixel. */
function num(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Roughly how wide a run of text is.
 *
 * There is no way to measure text without a DOM, and the layout has to be
 * decided before anything is drawn. 0.55em per character is a little wide for
 * a humanist sans, which is the safe direction to be wrong in: a label that
 * had room to spare only ever loses a character it did not need.
 */
function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.55;
}

function truncate(text: string, maxWidth: number, fontSize: number): string {
  if (textWidth(text, fontSize) <= maxWidth) return text;

  const room = Math.floor(maxWidth / (fontSize * 0.55)) - 1;
  if (room <= 0) return "";
  return `${text.slice(0, room).trimEnd()}…`;
}

/** How far in a line's text starts, which is also what it costs the column. */
function lineIndent(line: GanttExportLine): number {
  if (line.kind === "task") return line.depth * 13 + 12;
  return line.kind === "milestone" ? 12 : 0;
}

/**
 * A line's text as the column has to fit it — including what is printed at the
 * far end of the column, since a heading's count and a milestone's date take
 * room from the name whether or not they are part of it.
 */
function lineText(line: GanttExportLine): string {
  if (line.kind === "heading") return `${line.label}  ${line.count}`;
  if (line.kind === "milestone") return `${line.label}  ${line.date}`;
  return line.label;
}

/**
 * The page, worked out from the plan it has to hold.
 *
 * Rows keep a comfortable height until there are too many to fit the page,
 * then they tighten to a floor and the picture grows taller instead. Squeezing
 * to nothing would be worse than a tall image: a plan nobody can read is not
 * an export, and a tall one still pastes and still scales.
 */
function buildLayout(input: GanttExportInput): Layout {
  const { options } = input;
  const width = PAPER_WIDTH[options.paper] ?? PAPER_WIDTH.a4;
  const pageHeight = PAPER_HEIGHT[options.paper] ?? PAPER_HEIGHT.a4;

  const lineCount = Math.max(1, input.lines.length);
  const bandHeight = input.laneMilestones.length > 0 ? MILESTONE_BAND : 0;
  const chrome =
    MARGIN * 2 +
    TITLE_BLOCK +
    AXIS_HEIGHT +
    bandHeight +
    LEGEND_HEIGHT +
    FOOTER_HEIGHT;

  const rowHeight = clamp(
    Math.floor((pageHeight - chrome) / lineCount),
    MIN_ROW_HEIGHT,
    MAX_ROW_HEIGHT
  );
  const fontSize = clamp(Math.round(rowHeight * 0.46), 9, 12);
  const barHeight = clamp(rowHeight - 12, 7, 14);

  // The column is as wide as its longest name wants to be, within reason: a
  // third of the page is the most a list of names may take from the timeline
  const widest = input.lines.reduce(
    (largest, line) =>
      Math.max(largest, lineIndent(line) + textWidth(lineText(line), fontSize)),
    0
  );
  const labelWidth = clamp(widest + 14, MIN_LABEL_WIDTH, width * 0.34);

  const labelX = MARGIN;
  const plotX = labelX + labelWidth + 12;
  const plotWidth = width - MARGIN - plotX;
  const totalDays = Math.max(
    1,
    inclusiveDayCount(input.timelineStart, input.timelineEnd)
  );

  const axisTop = MARGIN + TITLE_BLOCK;
  const bandTop = axisTop + AXIS_HEIGHT;
  const plotTop = bandTop + bandHeight;
  const plotHeight = input.lines.length * rowHeight;
  const legendTop = plotTop + plotHeight + 18;
  const footerY = legendTop + LEGEND_HEIGHT;

  return {
    width,
    height: footerY + FOOTER_HEIGHT + MARGIN - 12,
    rowHeight,
    fontSize,
    barHeight,
    labelX,
    labelWidth,
    plotX,
    plotWidth,
    dayWidth: plotWidth / totalDays,
    totalDays,
    axisTop,
    bandTop,
    bandHeight,
    plotTop,
    plotHeight,
    legendTop,
    footerY,
  };
}

/** Where a day falls, measured from the left edge of the timeline. */
function dayX(layout: Layout, timelineStart: string, iso: string): number {
  return layout.plotX + diffDays(timelineStart, iso) * layout.dayWidth;
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                    */
/* -------------------------------------------------------------------------- */

interface TextOptions {
  fill?: string;
  size?: number;
  weight?: number;
  anchor?: "start" | "middle" | "end";
  strike?: boolean;
}

function text(
  x: number,
  y: number,
  value: string,
  options: TextOptions = {}
): string {
  const attrs = [
    `x="${num(x)}"`,
    `y="${num(y)}"`,
    `fill="${options.fill ?? INK}"`,
    `font-size="${options.size ?? 11}"`,
  ];
  if (options.weight) attrs.push(`font-weight="${options.weight}"`);
  if (options.anchor) attrs.push(`text-anchor="${options.anchor}"`);
  if (options.strike) attrs.push(`text-decoration="line-through"`);

  return `<text ${attrs.join(" ")}>${escapeXml(value)}</text>`;
}

function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  attrs: string
): string {
  return `<rect x="${num(x)}" y="${num(y)}" width="${num(
    Math.max(0, width)
  )}" height="${num(Math.max(0, height))}" ${attrs} />`;
}

function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  attrs: string
): string {
  return `<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(
    y2
  )}" ${attrs} />`;
}

/** A milestone's mark: a small diamond standing on the day it falls. */
function diamond(x: number, y: number, size: number, fill: string): string {
  const half = size / 2;
  const points = [
    `${num(x)},${num(y - half)}`,
    `${num(x + half)},${num(y)}`,
    `${num(x)},${num(y + half)}`,
    `${num(x - half)},${num(y)}`,
  ].join(" ");
  return `<polygon points="${points}" fill="${fill}" />`;
}

/**
 * The months across the top, with a rule down the page at each boundary.
 *
 * Month names shorten and then disappear as the plan gets longer, but the
 * rules never do: a reader can always see where one month ends even on a chart
 * too dense to name them, and a year-long plan with a label on every month
 * would be a wall of text nobody reads.
 */
function drawAxis(input: GanttExportInput, layout: Layout): string {
  const parts: string[] = [];
  const monthLabelY = layout.axisTop + 14;
  const axisBottom = layout.axisTop + AXIS_HEIGHT;

  parts.push(
    line(
      layout.plotX,
      axisBottom,
      layout.plotX + layout.plotWidth,
      axisBottom,
      `stroke="${RULE}" stroke-width="1"`
    ),
    // Where the names stop and the time starts. The bars are far enough from
    // the names to be read without it, but the eye still wants the edge
    line(
      layout.plotX,
      axisBottom,
      layout.plotX,
      layout.plotTop + layout.plotHeight,
      `stroke="${RULE}" stroke-width="1"`
    )
  );

  const formatter = new Intl.DateTimeFormat(input.locale, {
    month: "short",
    timeZone: "UTC",
  });

  let cursor = input.timelineStart;
  while (diffDays(cursor, input.timelineEnd) >= 0) {
    const [year, month] = cursor.split("-").map(Number);
    const monthStart = `${cursor.slice(0, 7)}-01`;
    const nextMonth =
      month === 12
        ? `${year + 1}-01-01`
        : `${cursor.slice(0, 4)}-${String(month + 1).padStart(2, "0")}-01`;

    const from =
      diffDays(input.timelineStart, cursor) < 0 ? input.timelineStart : cursor;
    const startX = dayX(layout, input.timelineStart, from);
    const endDay =
      diffDays(nextMonth, input.timelineEnd) >= 0
        ? nextMonth
        : addDays(input.timelineEnd, 1);
    const endX = dayX(layout, input.timelineStart, endDay);

    // A boundary rule, run the whole way down so a bar can be read against it
    if (startX > layout.plotX + 0.5) {
      parts.push(
        line(
          startX,
          layout.axisTop + 18,
          startX,
          layout.plotTop + layout.plotHeight,
          `stroke="${RULE}" stroke-width="1"`
        )
      );
    }

    const short = formatter.format(new Date(`${monthStart}T00:00:00Z`));
    const long = `${short} ${year}`;
    const band = endX - startX;
    const label =
      textWidth(long, 10) + 10 < band
        ? long
        : textWidth(short, 10) + 6 < band
          ? short
          : "";

    if (label) {
      parts.push(
        text(startX + band / 2, monthLabelY, label, {
          fill: MUTED,
          size: 10,
          anchor: "middle",
        })
      );
    }

    cursor = nextMonth;
  }

  return parts.join("");
}

/** The today line, drawn over the grid and under the bars. */
function drawToday(input: GanttExportInput, layout: Layout): string {
  const offset = diffDays(input.timelineStart, input.today);
  if (offset < 0 || offset >= layout.totalDays) return "";

  const x = dayX(layout, input.timelineStart, input.today);
  const bottom = layout.plotTop + layout.plotHeight;

  return [
    line(
      x,
      layout.axisTop + 18,
      x,
      bottom,
      `stroke="${ACCENT}" stroke-width="1.2" stroke-dasharray="4 3"`
    ),
    text(x, layout.axisTop + 30, input.labels.today, {
      fill: ACCENT,
      size: 9,
      weight: 600,
      anchor: "middle",
    }),
  ].join("");
}

/**
 * Milestones marked across the whole chart: a named guide line rather than a
 * row of their own. Their names sit in a strip of their own above the rows, so
 * a long one never lands on top of a bar.
 */
function drawLaneMilestones(input: GanttExportInput, layout: Layout): string {
  if (input.laneMilestones.length === 0) return "";

  const bottom = layout.plotTop + layout.plotHeight;
  const markY = layout.bandTop + layout.bandHeight / 2;

  return input.laneMilestones
    .flatMap((milestone) => {
      const offset = diffDays(input.timelineStart, milestone.date);
      if (offset < 0 || offset >= layout.totalDays) return [];

      const x = dayX(layout, input.timelineStart, milestone.date);
      // Names run to the right of their mark, and to the left once there is no
      // room left on the page for them
      const room = layout.plotX + layout.plotWidth - x - 10;
      const flip = textWidth(milestone.label, 9) > room;

      return [
        line(
          x,
          markY,
          x,
          bottom,
          `stroke="${INK}" stroke-width="0.8" stroke-dasharray="2 3" opacity="0.35"`
        ),
        diamond(x, markY, 8, INK),
        text(flip ? x - 7 : x + 7, markY + 3, milestone.label, {
          fill: INK,
          size: 9,
          weight: 600,
          anchor: flip ? "end" : "start",
        }),
      ];
    })
    .join("");
}

/** One task's bar, plus whatever the task's state adds to it. */
function drawBar(
  task: GanttExportTask,
  input: GanttExportInput,
  layout: Layout,
  top: number
): string {
  const x = dayX(layout, input.timelineStart, task.start);
  const endX = dayX(layout, input.timelineStart, addDays(task.end, 1));
  const width = Math.max(2, endX - x);
  const y = top + (layout.rowHeight - layout.barHeight) / 2;

  // A rolled-up parent reads as a span, not as work: a slim bar with a tick at
  // each end, the way summary rows are drawn everywhere else
  if (task.rollup) {
    const height = Math.max(4, layout.barHeight - 6);
    const barY = top + (layout.rowHeight - height) / 2;
    return [
      rect(x, barY, width, height, `fill="${ROLLUP_FILL}" rx="1"`),
      rect(x, barY, 2, height + 4, `fill="${ROLLUP_FILL}"`),
      rect(endX - 2, barY, 2, height + 4, `fill="${ROLLUP_FILL}"`),
    ].join("");
  }

  // Dates the chart guessed are drawn as an outline: they are a proposal, and
  // a filled bar would claim the note says something it does not
  if (task.inferred) {
    return rect(
      x + 0.5,
      y + 0.5,
      width - 1,
      layout.barHeight - 1,
      `fill="none" stroke="${MUTED}" stroke-width="1" stroke-dasharray="4 3" rx="2"`
    );
  }

  const parts = [
    rect(
      x,
      y,
      width,
      layout.barHeight,
      `fill="${BAR_FILL[task.status]}" rx="2"`
    ),
  ];

  // How far along, as a darker length of the same bar. Only while the work is
  // still open — a percentage on a finished task says nothing new
  const percent = task.percent ?? 0;
  if (percent > 0 && task.status !== "done" && task.status !== "canceled") {
    parts.push(
      rect(
        x,
        y,
        (width * Math.min(100, percent)) / 100,
        layout.barHeight,
        `fill="${PROGRESS_FILL}" rx="2"`
      )
    );
  }

  if (task.critical) {
    parts.push(
      rect(
        x + 0.75,
        y + 0.75,
        width - 1.5,
        layout.barHeight - 1.5,
        `fill="none" stroke="${ACCENT}" stroke-width="1.5" rx="2"`
      )
    );
  }

  return parts.join("");
}

/** The name column and the row it belongs to, for every line in turn. */
function drawRows(input: GanttExportInput, layout: Layout): string {
  const parts: string[] = [];
  const textOffset = layout.rowHeight / 2 + layout.fontSize / 3;
  const rowWidth = layout.width - MARGIN * 2;
  // Counted rather than taken from the index, so a heading dropped into the
  // middle of a group does not flip the banding underneath it
  let banded = 0;

  input.lines.forEach((entry, index) => {
    const top = layout.plotTop + index * layout.rowHeight;
    const baseline = top + textOffset;
    const nameWidth = layout.labelWidth - lineIndent(entry) - 6;

    if (entry.kind === "heading") {
      // A heading earns a band of its own, darker than the row banding so the
      // two are never mistaken for each other: it is the one line that is
      // about the list rather than in it
      parts.push(
        rect(
          layout.labelX,
          top,
          rowWidth,
          layout.rowHeight,
          `fill="${HEADING_BAND}"`
        )
      );
      parts.push(
        text(
          layout.labelX + 4,
          baseline,
          truncate(entry.label, nameWidth - 30, layout.fontSize),
          {
            size: layout.fontSize,
            weight: 700,
          }
        )
      );
      parts.push(
        text(
          layout.labelX + layout.labelWidth - 4,
          baseline,
          String(entry.count),
          {
            fill: MUTED,
            size: layout.fontSize - 1,
            anchor: "end",
          }
        )
      );
      return;
    }

    // Every other row alternates, faintly. It is the one thing that lets a bar
    // three quarters of the way across a page be traced back to its name
    banded += 1;
    if (banded % 2 === 0) {
      parts.push(
        rect(layout.labelX, top, rowWidth, layout.rowHeight, `fill="${BAND}"`)
      );
    }

    if (entry.kind === "milestone") {
      const x = layout.labelX + lineIndent(entry);
      parts.push(diamond(x - 6, top + layout.rowHeight / 2, 7, INK));
      // The date, where a group heading puts its count. A milestone is a date
      // before it is anything else, and the axis alone makes the reader
      // measure it off the page
      parts.push(
        text(layout.labelX + layout.labelWidth - 4, baseline, entry.date, {
          fill: MUTED,
          size: layout.fontSize - 1,
          anchor: "end",
        })
      );
      parts.push(
        text(
          x + 2,
          baseline,
          truncate(
            entry.label,
            nameWidth - textWidth(entry.date, layout.fontSize - 1) - 10,
            layout.fontSize
          ),
          {
            size: layout.fontSize,
            weight: 600,
          }
        )
      );

      const offset = diffDays(input.timelineStart, entry.date);
      if (offset >= 0 && offset < layout.totalDays) {
        parts.push(
          diamond(
            dayX(layout, input.timelineStart, entry.date),
            top + layout.rowHeight / 2,
            9,
            INK
          )
        );
      }
      return;
    }

    const x = layout.labelX + lineIndent(entry);
    parts.push(
      `<circle cx="${num(x - 7)}" cy="${num(top + layout.rowHeight / 2)}" r="3" fill="${BAR_FILL[entry.status]}" />`
    );
    parts.push(
      text(x, baseline, truncate(entry.label, nameWidth, layout.fontSize), {
        size: layout.fontSize,
        fill: entry.status === "canceled" ? MUTED : INK,
        weight: entry.rollup ? 600 : 400,
        strike: entry.status === "canceled",
      })
    );
    parts.push(drawBar(entry, input, layout, top));
  });

  return parts.join("");
}

/**
 * Dependency arrows, when asked for: elbows from the end of a blocker to the
 * start of what it blocks. Drawn under the bars and in a light grey, so on a
 * busy plan they read as a background texture rather than fighting the bars.
 */
function drawDependencies(input: GanttExportInput, layout: Layout): string {
  if (!input.options.showDependencies) return "";

  const rows = new Map<string, { index: number; task: GanttExportTask }>();
  input.lines.forEach((entry, index) => {
    if (entry.kind === "task") rows.set(entry.id, { index, task: entry });
  });

  const paths = input.dependencies.flatMap((dependency) => {
    const from = rows.get(dependency.fromId);
    const to = rows.get(dependency.toId);
    if (!from || !to) return [];

    const fromX = dayX(layout, input.timelineStart, addDays(from.task.end, 1));
    const fromY = layout.plotTop + (from.index + 0.5) * layout.rowHeight;
    const toX = dayX(layout, input.timelineStart, to.task.start);
    const toY = layout.plotTop + (to.index + 0.5) * layout.rowHeight;

    const gutter = Math.max(6, layout.dayWidth / 2);
    const midX = toX - gutter > fromX ? toX - gutter : fromX + gutter;
    const d = `M ${num(fromX)} ${num(fromY)} H ${num(midX)} V ${num(toY)} H ${num(toX - 4)}`;

    return [
      `<path d="${d}" fill="none" stroke="${MUTED}" stroke-width="0.9" opacity="0.55" marker-end="url(#tasks-map-export-arrow)" />`,
    ];
  });

  if (paths.length === 0) return "";

  return [
    `<defs><marker id="tasks-map-export-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" fill="${MUTED}" opacity="0.55" /></marker></defs>`,
    ...paths,
  ].join("");
}

interface LegendEntry {
  label: string;
  /** How the swatch is drawn, which is how that thing is drawn in the chart. */
  swatch: "fill" | "outline" | "rollup" | "critical" | "today" | "milestone";
  fill?: string;
}

/**
 * The key, listing only what the chart in front of the reader actually uses.
 *
 * A legend is where an export quietly turns into a wall: five statuses, three
 * line styles and a marker, most of them explaining something that is not on
 * the page. So every entry has to be earned by a line above it.
 */
function legendEntries(input: GanttExportInput): LegendEntry[] {
  const entries: LegendEntry[] = [];
  const tasks = input.lines.filter(
    (entry): entry is GanttExportTask => entry.kind === "task"
  );

  const statuses: TaskStatus[] = ["todo", "in_progress", "done", "canceled"];
  for (const status of statuses) {
    if (!tasks.some((task) => task.status === status && !task.inferred)) {
      continue;
    }
    entries.push({
      label: input.labels.statuses[status],
      swatch: "fill",
      fill: BAR_FILL[status],
    });
  }

  if (tasks.some((task) => task.rollup)) {
    entries.push({ label: input.labels.summary, swatch: "rollup" });
  }
  if (tasks.some((task) => task.inferred)) {
    entries.push({ label: input.labels.suggested, swatch: "outline" });
  }
  if (tasks.some((task) => task.critical)) {
    entries.push({ label: input.labels.critical, swatch: "critical" });
  }
  if (
    input.laneMilestones.length > 0 ||
    input.lines.some((entry) => entry.kind === "milestone")
  ) {
    entries.push({ label: input.labels.milestone, swatch: "milestone" });
  }

  const todayOffset = diffDays(input.timelineStart, input.today);
  if (
    todayOffset >= 0 &&
    todayOffset < inclusiveDayCount(input.timelineStart, input.timelineEnd)
  ) {
    entries.push({ label: input.labels.today, swatch: "today" });
  }

  return entries;
}

function drawLegend(input: GanttExportInput, layout: Layout): string {
  const entries = legendEntries(input);
  if (entries.length === 0) return "";

  const parts: string[] = [
    line(
      layout.labelX,
      layout.legendTop - 8,
      layout.width - MARGIN,
      layout.legendTop - 8,
      `stroke="${RULE}" stroke-width="1"`
    ),
  ];

  const y = layout.legendTop + 10;
  let x = layout.labelX;

  for (const entry of entries) {
    switch (entry.swatch) {
      case "fill":
        parts.push(rect(x, y - 6, 16, 8, `fill="${entry.fill}" rx="2"`));
        break;
      case "rollup":
        parts.push(rect(x, y - 5, 16, 5, `fill="${ROLLUP_FILL}" rx="1"`));
        break;
      case "outline":
        parts.push(
          rect(
            x + 0.5,
            y - 5.5,
            15,
            7,
            `fill="none" stroke="${MUTED}" stroke-width="1" stroke-dasharray="3 2" rx="2"`
          )
        );
        break;
      case "critical":
        parts.push(
          rect(
            x + 0.75,
            y - 5.25,
            14.5,
            6.5,
            `fill="none" stroke="${ACCENT}" stroke-width="1.5" rx="2"`
          )
        );
        break;
      case "today":
        parts.push(
          line(
            x + 8,
            y - 8,
            x + 8,
            y + 3,
            `stroke="${ACCENT}" stroke-width="1.2" stroke-dasharray="3 2"`
          )
        );
        break;
      case "milestone":
        parts.push(diamond(x + 8, y - 2, 9, INK));
        break;
    }

    parts.push(text(x + 22, y, entry.label, { fill: MUTED, size: 10 }));
    x += 22 + textWidth(entry.label, 10) + 20;
  }

  return parts.join("");
}

/* -------------------------------------------------------------------------- */
/* The picture                                                                */
/* -------------------------------------------------------------------------- */

/** The whole chart as one self-contained SVG document. */
export function buildGanttSvg(input: GanttExportInput): GanttExportImage {
  const layout = buildLayout(input);

  const body = [
    rect(0, 0, layout.width, layout.height, `fill="${PAPER}"`),
    text(MARGIN, MARGIN + 18, input.title, { size: TITLE_SIZE, weight: 700 }),
    text(MARGIN, MARGIN + 36, input.subtitle, {
      fill: MUTED,
      size: SUBTITLE_SIZE,
    }),
    drawAxis(input, layout),
    drawDependencies(input, layout),
    drawRows(input, layout),
    drawToday(input, layout),
    drawLaneMilestones(input, layout),
    line(
      layout.plotX,
      layout.plotTop + layout.plotHeight,
      layout.plotX + layout.plotWidth,
      layout.plotTop + layout.plotHeight,
      `stroke="${RULE}" stroke-width="1"`
    ),
    drawLegend(input, layout),
    text(MARGIN, layout.footerY + 12, input.footer, { fill: MUTED, size: 9 }),
  ].join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(layout.width)}" ` +
    `height="${num(layout.height)}" viewBox="0 0 ${num(layout.width)} ${num(
      layout.height
    )}" font-family="${FONT_STACK}">${body}</svg>`;

  return { svg, width: layout.width, height: layout.height };
}

/** A date as the title block writes it: "3 Jun 2026". */
export function formatExportDate(iso: string, locale?: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A file name that sorts by date and cannot collide with a note. */
export function exportFileName(title: string, today: string): string {
  const stem =
    title
      .replace(/[\\/:*?"<>|#^[\]]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "gantt";
  return `${stem} ${today}.png`;
}
