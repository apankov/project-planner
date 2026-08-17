/**
 * The handover pack, written out as one HTML document.
 *
 * This is the whole deliverable. Chromium turns it into the PDF, so everything
 * about how the pack reads on paper is decided here — and because it is real
 * markup rather than a picture of a page, every word in it lands in the PDF as
 * *text*: searchable, selectable, copyable by someone who has never heard of
 * Obsidian. That is the entire point of the exercise, and it is why nothing in
 * this file rasterises anything.
 *
 * Four things follow from "the reader does not have the vault":
 *
 * - **Every reference has to resolve inside the document.** A wikilink to a
 *   note is only useful if that note is in the appendix and the link goes to
 *   it; one that points at a note nobody exported is worse than plain text,
 *   because it looks clickable. So links are rewritten against the notes
 *   actually present, and the rest are flattened.
 *
 * - **Every guess has to be labelled.** The plugin infers dates for tasks that
 *   have none, and those dates flow into the chart, the float and the costs.
 *   On screen they are drawn as outlines and nobody is misled. In a document
 *   being handed to someone who cannot check, they need saying in words.
 *
 * - **Headings are the navigation.** Chromium builds the PDF outline from the
 *   heading levels, so `h1`/`h2` are load-bearing structure, not styling — the
 *   bookmark tree the recipient navigates by is exactly this document's
 *   heading tree.
 *
 * - **It has to print.** Fixed light palette, A4, tables that do not split a
 *   row across a page, and headings that never end a page on their own.
 */

import { TaskStatus } from "../../types/task";
import {
  PAPER_ACCENT,
  PAPER_BAND,
  PAPER_FONT_STACK,
  PAPER_HEADING_BAND,
  PAPER_INK,
  PAPER_MONO_STACK,
  PAPER_MUTED,
  PAPER_RULE,
  PAPER_STATUS_FILL,
  PAPER_WHITE,
  escapeXml,
} from "./handover-theme";
import { HandoverPack, HandoverTaskRow, taskAnchor } from "./handover-model";

/**
 * Every user-facing word the document needs, already translated.
 *
 * Passed in whole rather than reached for with `t()` so the writer stays pure
 * and the tests can assert on layout without booting i18next.
 */
export interface HandoverLabels {
  contents: string;
  generatedOn: string;
  vault: string;
  preparedWith: string;
  section: {
    overview: string;
    plan: string;
    register: string;
    dependencies: string;
    finance: string;
    questions: string;
    notes: string;
  };
  overview: {
    tasks: string;
    span: string;
    critical: string;
    inferred: string;
    overdue: string;
    unowned: string;
    milestones: string;
    openQuestions: string;
    answeredQuestions: string;
    notes: string;
    statusHeading: string;
    inferredWarning: string;
    howToRead: string;
    howToReadBody: string;
  };
  register: {
    id: string;
    task: string;
    status: string;
    owner: string;
    start: string;
    finish: string;
    progress: string;
    dependsOn: string;
    blocks: string;
    float: string;
    hours: string;
    cost: string;
    note: string;
    empty: string;
    suggested: string;
    overdue: string;
    criticalMark: string;
    days: string;
  };
  dependencies: {
    chain: string;
    chainOf: string;
    isolated: string;
    isolatedDesc: string;
    legendCritical: string;
    legendLoop: string;
    empty: string;
  };
  milestones: {
    heading: string;
    date: string;
    name: string;
    past: string;
  };
  finance: {
    total: string;
    labour: string;
    materials: string;
    hours: string;
    byPerson: string;
    byProject: string;
    topCosts: string;
    issues: string;
    person: string;
    project: string;
    taskCount: string;
    priced: string;
    unpriced: string;
    noFinance: string;
    inferredNote: string;
    unassigned: string;
    empty: string;
  };
  questions: {
    open: string;
    answered: string;
    answeredOn: string;
    noAnswer: string;
    raisedIn: string;
    empty: string;
  };
  notes: {
    rootFolder: string;
    empty: string;
    emptyNote: string;
  };
  statuses: Record<TaskStatus, string>;
  none: string;
}

export interface HandoverHtmlOptions {
  pack: HandoverPack;
  labels: HandoverLabels;
  /** Formats money in the pack's currency. */
  formatMoney: (_value: number) => string;
  /** Formats a `YYYY-MM-DD` day the way the document writes dates. */
  formatDate: (_iso: string) => string;
  /** Plugin name and version, for the colophon. */
  producer: string;
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

const esc = escapeXml;

function tag(name: string, attrs: string, body: string): string {
  return `<${name}${attrs ? ` ${attrs}` : ""}>${body}</${name}>`;
}

/** A number the way a table wants it: no decimals unless they mean something. */
function formatHours(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function statusPill(status: TaskStatus, label: string): string {
  return (
    `<span class="hp-pill hp-pill--${status.replace(/_/g, "-")}">` +
    `${esc(label)}</span>`
  );
}

/* -------------------------------------------------------------------------- */
/* Stylesheet                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The print stylesheet.
 *
 * Two page shapes, named so the wide sections can ask for the wide one: a task
 * register with dependencies on it does not fit A4 portrait at a size anybody
 * would read, and shrinking the type until it does is how a handover becomes
 * something nobody opens twice. Browsers that do not know named pages simply
 * print everything portrait, which is a worse register but still a correct one.
 */
function stylesheet(): string {
  return `
@page {
  size: A4 portrait;
  margin: 18mm 15mm;
}
@page wide {
  size: A4 landscape;
  margin: 14mm 12mm;
}
.hp-wide { page: wide; }

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: ${PAPER_FONT_STACK};
  font-size: 10.5pt;
  line-height: 1.5;
  color: ${PAPER_INK};
  background: ${PAPER_WHITE};
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

h1, h2, h3, h4 {
  color: ${PAPER_INK};
  line-height: 1.25;
  break-after: avoid;
  page-break-after: avoid;
  margin: 0 0 0.4em;
}
h1 { font-size: 19pt; letter-spacing: -0.01em; }
h2 { font-size: 13.5pt; margin-top: 1.4em; }
h3 { font-size: 11.5pt; margin-top: 1.2em; }
h4 { font-size: 10.5pt; margin-top: 1em; }
p { margin: 0 0 0.7em; }

a { color: ${PAPER_INK}; text-decoration: none; border-bottom: 1px solid ${PAPER_RULE}; }
a.hp-plain { border-bottom: none; }

.hp-section {
  break-before: page;
  page-break-before: always;
}
.hp-section:first-of-type { break-before: auto; page-break-before: auto; }

.hp-section > h1 {
  border-bottom: 2px solid ${PAPER_INK};
  padding-bottom: 6px;
  margin-bottom: 1em;
}

/* Cover ------------------------------------------------------------------ */

.hp-cover {
  height: 235mm;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.hp-cover h1 {
  font-size: 30pt;
  border: none;
  margin-bottom: 0.2em;
}
.hp-cover-rule {
  width: 64px;
  height: 4px;
  background: ${PAPER_ACCENT};
  margin: 14px 0 20px;
}
.hp-cover-meta { color: ${PAPER_MUTED}; font-size: 11pt; }
.hp-cover-meta div { margin-bottom: 3px; }

/* Contents --------------------------------------------------------------- */

.hp-toc { list-style: none; padding: 0; margin: 0; }
.hp-toc > li { margin-bottom: 6px; font-size: 11pt; }
.hp-toc ul { list-style: none; padding-left: 16px; margin: 4px 0 0; }
.hp-toc ul li { font-size: 10pt; color: ${PAPER_MUTED}; margin-bottom: 2px; }
.hp-toc a { border-bottom: none; }

/* Facts ------------------------------------------------------------------ */

.hp-facts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin: 0 0 1.2em;
}
.hp-fact {
  border: 1px solid ${PAPER_RULE};
  border-radius: 4px;
  padding: 8px 10px;
  break-inside: avoid;
}
.hp-fact-value { font-size: 16pt; font-weight: 700; line-height: 1.1; }
.hp-fact-label {
  font-size: 8.5pt;
  color: ${PAPER_MUTED};
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-top: 2px;
}

.hp-callout {
  border-left: 3px solid ${PAPER_ACCENT};
  background: ${PAPER_BAND};
  padding: 8px 12px;
  margin: 0 0 1.2em;
  font-size: 9.5pt;
  break-inside: avoid;
}
.hp-callout strong { display: block; margin-bottom: 2px; }

/* Tables ----------------------------------------------------------------- */

table.hp-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 8.8pt;
  margin: 0 0 1.2em;
}
table.hp-table th {
  text-align: left;
  background: ${PAPER_HEADING_BAND};
  font-weight: 700;
  font-size: 8pt;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 5px 6px;
  border-bottom: 1px solid ${PAPER_RULE};
}
table.hp-table td {
  padding: 4px 6px;
  border-bottom: 1px solid ${PAPER_RULE};
  vertical-align: top;
}
table.hp-table tbody tr:nth-child(even) { background: ${PAPER_BAND}; }
table.hp-table tr { break-inside: avoid; page-break-inside: avoid; }
table.hp-table thead { display: table-header-group; }
.hp-num { text-align: right; font-variant-numeric: tabular-nums; }
.hp-id { font-family: ${PAPER_MONO_STACK}; font-size: 8pt; white-space: nowrap; }
.hp-nowrap { white-space: nowrap; }
.hp-muted { color: ${PAPER_MUTED}; }
.hp-done td:nth-child(2) { text-decoration: line-through; color: ${PAPER_MUTED}; }
.hp-overdue { color: ${PAPER_ACCENT}; font-weight: 600; }
.hp-critical-mark { color: ${PAPER_ACCENT}; font-weight: 700; }

/* Status pills ----------------------------------------------------------- */

.hp-pill {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 7.5pt;
  font-weight: 600;
  white-space: nowrap;
  color: ${PAPER_INK};
}
.hp-pill--todo { background: ${PAPER_STATUS_FILL.todo}; }
.hp-pill--in-progress { background: ${PAPER_STATUS_FILL.in_progress}; color: ${PAPER_WHITE}; }
.hp-pill--done { background: ${PAPER_STATUS_FILL.done}; }
.hp-pill--canceled { background: ${PAPER_STATUS_FILL.canceled}; color: ${PAPER_MUTED}; }

/* Figures ---------------------------------------------------------------- */

.hp-figure { margin: 0 0 1.4em; break-inside: avoid; page-break-inside: avoid; }
.hp-figure svg { max-width: 100%; height: auto; display: block; }
.hp-figure figcaption {
  font-size: 8.5pt;
  color: ${PAPER_MUTED};
  margin-top: 5px;
}
.hp-legend {
  font-size: 8.5pt;
  color: ${PAPER_MUTED};
  margin: 0 0 1em;
}
.hp-legend span { margin-right: 16px; }

/* Questions -------------------------------------------------------------- */

.hp-question {
  border-left: 3px solid ${PAPER_RULE};
  padding: 2px 0 2px 12px;
  margin: 0 0 0.9em;
  break-inside: avoid;
}
.hp-question--open { border-left-color: ${PAPER_ACCENT}; }
.hp-question-text { font-weight: 600; margin-bottom: 2px; }
.hp-question-meta { font-size: 8.5pt; color: ${PAPER_MUTED}; }
.hp-question-answer {
  font-size: 9.5pt;
  margin-top: 4px;
  white-space: pre-wrap;
}

/* Notes appendix --------------------------------------------------------- */

.hp-note { break-before: page; page-break-before: always; }
.hp-note:first-of-type { break-before: auto; page-break-before: auto; }
.hp-note > h2 {
  margin-top: 0;
  border-bottom: 1px solid ${PAPER_RULE};
  padding-bottom: 4px;
}
.hp-note-path {
  font-family: ${PAPER_MONO_STACK};
  font-size: 8pt;
  color: ${PAPER_MUTED};
  margin: -2px 0 0.9em;
}
.hp-note-body { font-size: 10pt; }
.hp-note-body img, .hp-note-body svg { max-width: 100%; height: auto; }
.hp-note-body pre {
  background: ${PAPER_BAND};
  border: 1px solid ${PAPER_RULE};
  border-radius: 3px;
  padding: 7px 9px;
  font-family: ${PAPER_MONO_STACK};
  font-size: 8.5pt;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  break-inside: avoid;
}
.hp-note-body code {
  font-family: ${PAPER_MONO_STACK};
  font-size: 8.8pt;
  background: ${PAPER_BAND};
  padding: 0 3px;
  border-radius: 2px;
}
.hp-note-body pre code { background: none; padding: 0; }
.hp-note-body blockquote {
  margin: 0 0 0.7em;
  padding-left: 12px;
  border-left: 3px solid ${PAPER_RULE};
  color: ${PAPER_MUTED};
}
.hp-note-body table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
  margin: 0 0 0.8em;
}
.hp-note-body th, .hp-note-body td {
  border: 1px solid ${PAPER_RULE};
  padding: 4px 6px;
  text-align: left;
}
.hp-note-body th { background: ${PAPER_HEADING_BAND}; }
.hp-note-body ul, .hp-note-body ol { margin: 0 0 0.7em; padding-left: 20px; }
.hp-note-body hr { border: none; border-top: 1px solid ${PAPER_RULE}; margin: 1em 0; }

/* Obsidian's own renderer leaves these behind; they have to print sanely */
.hp-note-body .callout {
  border: 1px solid ${PAPER_RULE};
  border-left: 3px solid ${PAPER_MUTED};
  border-radius: 3px;
  padding: 7px 10px;
  margin: 0 0 0.8em;
  background: ${PAPER_BAND};
  break-inside: avoid;
}
.hp-note-body .callout-title { font-weight: 700; margin-bottom: 3px; }
.hp-note-body .callout-icon, .hp-note-body .callout-fold { display: none; }
.hp-note-body .tag {
  font-size: 8.5pt;
  color: ${PAPER_MUTED};
  border: 1px solid ${PAPER_RULE};
  border-radius: 8px;
  padding: 0 5px;
}
.hp-note-body .task-list-item-checkbox { margin-right: 5px; }
.hp-note-body .frontmatter, .hp-note-body .metadata-container,
.hp-note-body .frontmatter-container, .hp-note-body .mod-header,
.hp-note-body .mod-footer, .hp-note-body .collapse-indicator { display: none; }
.hp-note-body .internal-link.hp-dead {
  border-bottom: none;
  color: ${PAPER_MUTED};
}
.hp-note-body p:empty { display: none; }

.hp-colophon {
  margin-top: 2em;
  padding-top: 8px;
  border-top: 1px solid ${PAPER_RULE};
  font-size: 8.5pt;
  color: ${PAPER_MUTED};
}
`.trim();
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                   */
/* -------------------------------------------------------------------------- */

function coverAndContents(options: HandoverHtmlOptions): string {
  const { pack, labels } = options;
  const has = sectionsPresent(pack);

  const entries: Array<{ id: string; label: string; children?: string[] }> = [];
  entries.push({
    id: "overview",
    label: labels.section.overview,
  });
  if (has.plan) entries.push({ id: "plan", label: labels.section.plan });
  entries.push({ id: "register", label: labels.section.register });
  if (has.dependencies) {
    entries.push({ id: "dependencies", label: labels.section.dependencies });
  }
  if (has.finance)
    entries.push({ id: "finance", label: labels.section.finance });
  if (has.questions) {
    entries.push({ id: "questions", label: labels.section.questions });
  }
  if (has.notes) {
    entries.push({
      id: "notes",
      label: labels.section.notes,
      children: pack.notes.slice(0, 40).map((note) => note.title),
    });
  }

  const toc = entries
    .map((entry) => {
      const children = entry.children?.length
        ? tag(
            "ul",
            "",
            entry.children.map((child) => tag("li", "", esc(child))).join("")
          )
        : "";
      return tag(
        "li",
        "",
        `<a class="hp-plain" href="#${entry.id}">${esc(entry.label)}</a>` +
          children
      );
    })
    .join("");

  return (
    `<section class="hp-section hp-cover">` +
    `<h1>${esc(pack.title)}</h1>` +
    `<div class="hp-cover-rule"></div>` +
    `<div class="hp-cover-meta">` +
    `<div>${esc(labels.vault)}: ${esc(pack.vaultName)}</div>` +
    `<div>${esc(labels.generatedOn)}: ${esc(
      options.formatDate(pack.generatedOn)
    )}</div>` +
    `<div>${esc(labels.preparedWith)}: ${esc(options.producer)}</div>` +
    `</div></section>` +
    `<section class="hp-section">` +
    `<h1>${esc(labels.contents)}</h1>` +
    tag("ol", 'class="hp-toc"', toc) +
    `</section>`
  );
}

function sectionsPresent(pack: HandoverPack) {
  return {
    plan: pack.ganttSvg !== null || pack.milestones.length > 0,
    dependencies: pack.graphs.length > 0 || pack.isolatedTaskIds.length > 0,
    finance: pack.finance !== null,
    questions: pack.questions.length > 0,
    notes: pack.notes.length > 0,
  };
}

function overviewSection(options: HandoverHtmlOptions): string {
  const { pack, labels } = options;
  const { summary } = pack;

  const span =
    summary.start && summary.finish
      ? `${options.formatDate(summary.start)} – ${options.formatDate(
          summary.finish
        )}`
      : labels.none;

  const facts: Array<[string, string]> = [
    [String(summary.taskCount), labels.overview.tasks],
    [span, labels.overview.span],
    [String(summary.criticalCount), labels.overview.critical],
    [String(summary.overdueCount), labels.overview.overdue],
    [String(summary.unownedCount), labels.overview.unowned],
    [String(summary.milestoneCount), labels.overview.milestones],
    [String(summary.openQuestionCount), labels.overview.openQuestions],
    [String(summary.answeredQuestionCount), labels.overview.answeredQuestions],
    [String(summary.noteCount), labels.overview.notes],
  ];

  const factMarkup = facts
    .map(([value, label]) =>
      tag(
        "div",
        'class="hp-fact"',
        `<div class="hp-fact-value">${esc(value)}</div>` +
          `<div class="hp-fact-label">${esc(label)}</div>`
      )
    )
    .join("");

  const statusRows = summary.statusCounts
    .map((entry) =>
      tag(
        "tr",
        "",
        tag("td", "", statusPill(entry.status, labels.statuses[entry.status])) +
          tag("td", 'class="hp-num"', String(entry.count)) +
          tag(
            "td",
            'class="hp-num"',
            summary.taskCount === 0
              ? "—"
              : `${Math.round((entry.count / summary.taskCount) * 100)}%`
          )
      )
    )
    .join("");

  const inferredWarning =
    summary.inferredCount > 0
      ? tag(
          "div",
          'class="hp-callout"',
          `<strong>${esc(labels.overview.inferred)}</strong>` +
            esc(
              labels.overview.inferredWarning.replace(
                "{{n}}",
                String(summary.inferredCount)
              )
            )
        )
      : "";

  return (
    `<section class="hp-section" id="overview">` +
    `<h1>${esc(labels.section.overview)}</h1>` +
    tag("div", 'class="hp-facts"', factMarkup) +
    inferredWarning +
    tag(
      "div",
      'class="hp-callout"',
      `<strong>${esc(labels.overview.howToRead)}</strong>` +
        esc(labels.overview.howToReadBody)
    ) +
    `<h2>${esc(labels.overview.statusHeading)}</h2>` +
    tag(
      "table",
      'class="hp-table"',
      `<thead><tr><th>${esc(labels.register.status)}</th>` +
        `<th class="hp-num">${esc(labels.overview.tasks)}</th>` +
        `<th class="hp-num">%</th></tr></thead>` +
        tag("tbody", "", statusRows)
    ) +
    `</section>`
  );
}

function planSection(options: HandoverHtmlOptions): string {
  const { pack, labels } = options;
  if (pack.ganttSvg === null && pack.milestones.length === 0) return "";

  const chart = pack.ganttSvg
    ? tag("figure", 'class="hp-figure"', pack.ganttSvg)
    : "";

  const milestoneRows = pack.milestones
    .map((milestone) =>
      tag(
        "tr",
        "",
        tag(
          "td",
          'class="hp-nowrap"',
          esc(options.formatDate(milestone.date))
        ) +
          tag("td", "", esc(milestone.label)) +
          tag(
            "td",
            'class="hp-muted"',
            milestone.past ? esc(labels.milestones.past) : ""
          )
      )
    )
    .join("");

  const milestones =
    pack.milestones.length > 0
      ? `<h2>${esc(labels.milestones.heading)}</h2>` +
        tag(
          "table",
          'class="hp-table"',
          `<thead><tr><th>${esc(labels.milestones.date)}</th>` +
            `<th>${esc(labels.milestones.name)}</th><th></th></tr></thead>` +
            tag("tbody", "", milestoneRows)
        )
      : "";

  return (
    `<section class="hp-section hp-wide" id="plan">` +
    `<h1>${esc(labels.section.plan)}</h1>` +
    chart +
    milestones +
    `</section>`
  );
}

function registerRow(
  task: HandoverTaskRow,
  options: HandoverHtmlOptions,
  withFinance: boolean
): string {
  const { labels } = options;

  const indent = task.depth > 0 ? "&nbsp;".repeat(task.depth * 3) : "";
  const critical = task.critical
    ? ` <span class="hp-critical-mark" title="${esc(
        labels.register.criticalMark
      )}">▲</span>`
    : "";

  const dateClass = task.inferred
    ? 'class="hp-nowrap hp-muted"'
    : 'class="hp-nowrap"';
  const endClass = task.overdue ? 'class="hp-nowrap hp-overdue"' : dateClass;

  const cells = [
    tag("td", 'class="hp-id"', esc(task.id)),
    tag(
      "td",
      "",
      `${indent}<a class="hp-plain" id="${esc(
        taskAnchor(task.id)
      )}">${esc(task.summary)}</a>${critical}` +
        (task.inferred
          ? ` <span class="hp-muted">(${esc(labels.register.suggested)})</span>`
          : "")
    ),
    tag("td", "", statusPill(task.status, labels.statuses[task.status])),
    tag(
      "td",
      "",
      task.owner ? esc(task.owner) : `<span class="hp-muted">—</span>`
    ),
    tag("td", dateClass, esc(options.formatDate(task.start))),
    tag("td", endClass, esc(options.formatDate(task.end))),
    tag(
      "td",
      'class="hp-num"',
      task.percent === null ? "—" : `${task.percent}%`
    ),
    tag(
      "td",
      'class="hp-num"',
      task.floatDays === null ? "—" : String(task.floatDays)
    ),
    tag(
      "td",
      'class="hp-id"',
      task.dependsOn.length === 0
        ? `<span class="hp-muted">—</span>`
        : esc(task.dependsOn.join(", "))
    ),
    tag(
      "td",
      'class="hp-id"',
      task.blocks.length === 0
        ? `<span class="hp-muted">—</span>`
        : esc(task.blocks.join(", "))
    ),
  ];

  if (withFinance) {
    cells.push(
      tag(
        "td",
        'class="hp-num"',
        task.hours === null ? "—" : formatHours(task.hours)
      ),
      tag(
        "td",
        'class="hp-num"',
        task.cost === null || task.cost === 0
          ? "—"
          : esc(options.formatMoney(task.cost))
      )
    );
  }

  const rowClass = task.status === "done" ? ' class="hp-done"' : "";
  return `<tr${rowClass}>${cells.join("")}</tr>`;
}

function registerSection(options: HandoverHtmlOptions): string {
  const { pack, labels } = options;

  if (pack.tasks.length === 0) {
    return (
      `<section class="hp-section" id="register">` +
      `<h1>${esc(labels.section.register)}</h1>` +
      tag("p", 'class="hp-muted"', esc(labels.register.empty)) +
      `</section>`
    );
  }

  const withFinance = pack.finance !== null;

  const headers = [
    labels.register.id,
    labels.register.task,
    labels.register.status,
    labels.register.owner,
    labels.register.start,
    labels.register.finish,
    labels.register.progress,
    labels.register.float,
    labels.register.dependsOn,
    labels.register.blocks,
  ];
  if (withFinance) {
    headers.push(labels.register.hours, labels.register.cost);
  }

  const headerMarkup = headers
    .map((header, index) =>
      tag("th", index >= 6 && index <= 7 ? 'class="hp-num"' : "", esc(header))
    )
    .join("");

  const rows = pack.tasks
    .map((task) => registerRow(task, options, withFinance))
    .join("");

  const legend = tag(
    "p",
    'class="hp-legend"',
    `<span><span class="hp-critical-mark">▲</span> ${esc(
      labels.register.criticalMark
    )}</span>` +
      `<span class="hp-overdue">${esc(labels.register.overdue)}</span>` +
      `<span>${esc(labels.register.float)}: ${esc(labels.register.days)}</span>`
  );

  return (
    `<section class="hp-section hp-wide" id="register">` +
    `<h1>${esc(labels.section.register)}</h1>` +
    legend +
    tag(
      "table",
      'class="hp-table"',
      `<thead><tr>${headerMarkup}</tr></thead>` + tag("tbody", "", rows)
    ) +
    `</section>`
  );
}

function dependenciesSection(options: HandoverHtmlOptions): string {
  const { pack, labels } = options;
  if (pack.graphs.length === 0 && pack.isolatedTaskIds.length === 0) return "";

  const summaryById = new Map(
    pack.tasks.map((task) => [task.id, task.summary])
  );

  const legend = tag(
    "p",
    'class="hp-legend"',
    `<span>${esc(labels.dependencies.legendCritical)}</span>` +
      `<span>${esc(labels.dependencies.legendLoop)}</span>`
  );

  const figures = pack.graphs
    .map((graph, index) =>
      tag(
        "figure",
        'class="hp-figure"',
        graph.svg +
          tag(
            "figcaption",
            "",
            esc(
              labels.dependencies.chainOf
                .replace("{{n}}", String(index + 1))
                .replace("{{count}}", String(graph.nodeCount))
            )
          )
      )
    )
    .join("");

  const isolated =
    pack.isolatedTaskIds.length > 0
      ? `<h2>${esc(labels.dependencies.isolated)}</h2>` +
        tag("p", 'class="hp-muted"', esc(labels.dependencies.isolatedDesc)) +
        tag(
          "ul",
          "",
          pack.isolatedTaskIds
            .map((id) =>
              tag(
                "li",
                "",
                `<span class="hp-id">${esc(id)}</span> ${esc(
                  summaryById.get(id) ?? ""
                )}`
              )
            )
            .join("")
        )
      : "";

  return (
    `<section class="hp-section hp-wide" id="dependencies">` +
    `<h1>${esc(labels.section.dependencies)}</h1>` +
    (pack.graphs.length > 0
      ? legend + figures
      : tag("p", 'class="hp-muted"', esc(labels.dependencies.empty))) +
    isolated +
    `</section>`
  );
}

function financeSection(options: HandoverHtmlOptions): string {
  const { pack, labels } = options;
  const finance = pack.finance;
  if (!finance) return "";

  const facts: Array<[string, string]> = [
    [options.formatMoney(finance.total), labels.finance.total],
    [options.formatMoney(finance.labour), labels.finance.labour],
    [options.formatMoney(finance.materials), labels.finance.materials],
    [formatHours(finance.hours), labels.finance.hours],
    [String(finance.pricedTasks), labels.finance.priced],
    [String(finance.tasksWithoutFinance), labels.finance.noFinance],
  ];

  const factMarkup = facts
    .map(([value, label]) =>
      tag(
        "div",
        'class="hp-fact"',
        `<div class="hp-fact-value">${esc(value)}</div>` +
          `<div class="hp-fact-label">${esc(label)}</div>`
      )
    )
    .join("");

  const inferredNote =
    finance.inferredTaskCount > 0
      ? tag(
          "div",
          'class="hp-callout"',
          esc(
            labels.finance.inferredNote
              .replace("{{n}}", String(finance.inferredTaskCount))
              .replace("{{amount}}", options.formatMoney(finance.inferredTotal))
          )
        )
      : "";

  const groupTable = (
    heading: string,
    keyHeader: string,
    groups: typeof finance.byPerson
  ) => {
    if (groups.length === 0) return "";

    const rows = groups
      .map((group) =>
        tag(
          "tr",
          "",
          tag(
            "td",
            "",
            group.key
              ? esc(group.key)
              : `<span class="hp-muted">${esc(labels.finance.unassigned)}</span>`
          ) +
            tag("td", 'class="hp-num"', formatHours(group.hours)) +
            tag("td", 'class="hp-num"', String(group.taskCount)) +
            tag("td", 'class="hp-num"', esc(options.formatMoney(group.total)))
        )
      )
      .join("");

    return (
      `<h2>${esc(heading)}</h2>` +
      tag(
        "table",
        'class="hp-table"',
        `<thead><tr><th>${esc(keyHeader)}</th>` +
          `<th class="hp-num">${esc(labels.finance.hours)}</th>` +
          `<th class="hp-num">${esc(labels.finance.taskCount)}</th>` +
          `<th class="hp-num">${esc(labels.finance.total)}</th></tr></thead>` +
          tag("tbody", "", rows)
      )
    );
  };

  const drivers =
    finance.drivers.length > 0
      ? `<h2>${esc(labels.finance.topCosts)}</h2>` +
        tag(
          "table",
          'class="hp-table"',
          `<thead><tr><th>${esc(labels.register.id)}</th>` +
            `<th>${esc(labels.register.task)}</th>` +
            `<th class="hp-num">${esc(labels.finance.hours)}</th>` +
            `<th class="hp-num">${esc(labels.finance.total)}</th></tr></thead>` +
            tag(
              "tbody",
              "",
              finance.drivers
                .map((driver) =>
                  tag(
                    "tr",
                    "",
                    tag("td", 'class="hp-id"', esc(driver.id)) +
                      tag("td", "", esc(driver.summary)) +
                      tag("td", 'class="hp-num"', formatHours(driver.hours)) +
                      tag(
                        "td",
                        'class="hp-num"',
                        esc(options.formatMoney(driver.total))
                      )
                  )
                )
                .join("")
            )
        )
      : "";

  const issues =
    finance.issues.length > 0
      ? `<h2>${esc(labels.finance.issues)}</h2>` +
        tag(
          "ul",
          "",
          finance.issues
            .map((issue) =>
              tag(
                "li",
                "",
                `<span class="hp-id">${esc(issue.taskId)}</span> ` +
                  `${esc(issue.summary)} — ` +
                  `<span class="hp-muted">${esc(issue.issue)}</span>`
              )
            )
            .join("")
        )
      : "";

  return (
    `<section class="hp-section" id="finance">` +
    `<h1>${esc(labels.section.finance)}</h1>` +
    tag("div", 'class="hp-facts"', factMarkup) +
    inferredNote +
    groupTable(
      labels.finance.byPerson,
      labels.finance.person,
      finance.byPerson
    ) +
    groupTable(
      labels.finance.byProject,
      labels.finance.project,
      finance.byProject
    ) +
    drivers +
    issues +
    `</section>`
  );
}

function questionsSection(options: HandoverHtmlOptions): string {
  const { pack, labels } = options;
  if (pack.questions.length === 0) return "";

  // Open first: an unanswered question is the thing the recipient has to act
  // on, and burying it under a page of settled ones is how it gets missed
  const open = pack.questions.filter((question) => !question.resolved);
  const answered = pack.questions.filter((question) => question.resolved);

  const render = (question: (typeof pack.questions)[number]) => {
    const where = question.noteAnchor
      ? `<a class="hp-plain" href="#${esc(question.noteAnchor)}">${esc(
          question.noteName
        )}</a>`
      : esc(question.noteName);

    const answer = question.answer
      ? tag("div", 'class="hp-question-answer"', esc(question.answer))
      : tag(
          "div",
          'class="hp-question-answer hp-muted"',
          esc(labels.questions.noAnswer)
        );

    const on =
      question.resolved && question.resolvedOn
        ? ` · ${esc(labels.questions.answeredOn)} ${esc(
            options.formatDate(question.resolvedOn)
          )}`
        : "";

    return tag(
      "div",
      `class="hp-question${question.resolved ? "" : " hp-question--open"}"`,
      tag("div", 'class="hp-question-text"', esc(question.question)) +
        tag(
          "div",
          'class="hp-question-meta"',
          `${esc(labels.questions.raisedIn)} ${where}${on}`
        ) +
        answer
    );
  };

  const block = (heading: string, list: typeof pack.questions) =>
    list.length === 0
      ? ""
      : `<h2>${esc(heading)} (${list.length})</h2>` + list.map(render).join("");

  return (
    `<section class="hp-section" id="questions">` +
    `<h1>${esc(labels.section.questions)}</h1>` +
    block(labels.questions.open, open) +
    block(labels.questions.answered, answered) +
    `</section>`
  );
}

function notesSection(options: HandoverHtmlOptions): string {
  const { pack, labels } = options;
  if (pack.notes.length === 0) return "";

  let currentFolder: string | null = null;
  const parts: string[] = [];

  for (const note of pack.notes) {
    // A folder heading whenever the folder changes, so the appendix reads as
    // the vault's own shape rather than one long undifferentiated run
    if (note.folder !== currentFolder) {
      currentFolder = note.folder;
      parts.push(
        `<div class="hp-note"><h2>${esc(
          currentFolder || labels.notes.rootFolder
        )}</h2></div>`
      );
    }

    parts.push(
      `<article class="hp-note">` +
        `<h2 id="${esc(note.anchor)}">${esc(note.title)}</h2>` +
        `<div class="hp-note-path">${esc(note.path)}</div>` +
        `<div class="hp-note-body">${
          note.html.trim() ||
          `<p class="hp-muted">${esc(labels.notes.emptyNote)}</p>`
        }</div>` +
        `</article>`
    );
  }

  return (
    `<section class="hp-section" id="notes">` +
    `<h1>${esc(labels.section.notes)}</h1>` +
    parts.join("") +
    `</section>`
  );
}

/* -------------------------------------------------------------------------- */
/* The document                                                               */
/* -------------------------------------------------------------------------- */

/** The whole pack as one self-contained HTML document. */
export function buildHandoverHtml(options: HandoverHtmlOptions): string {
  const { pack } = options;

  const body = [
    coverAndContents(options),
    overviewSection(options),
    planSection(options),
    registerSection(options),
    dependenciesSection(options),
    financeSection(options),
    questionsSection(options),
    notesSection(options),
    tag(
      "div",
      'class="hp-colophon"',
      esc(`${options.producer} · ${pack.vaultName}`)
    ),
  ].join("");

  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width, initial-scale=1" />` +
    `<title>${esc(pack.title)}</title>` +
    `<style>${stylesheet()}</style></head><body>${body}</body></html>`
  );
}
