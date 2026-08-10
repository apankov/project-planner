<p align="center">
  <img src="https://raw.githubusercontent.com/HMIL1151/project-planner/main/.github/images/cover.svg" alt="Project Planner" width="100%" />
</p>

# Project Planner

**Project Planner** turns the tasks you already have in your Obsidian vault into
a plan you can run a project from — a dependency graph, a Gantt chart with a
real critical path, a kanban board, and time-and-materials costing.

Every task, date, dependency, person and cost is read from and written back to
plain Markdown, in the same Tasks and Dataview syntax you were already using.

![Project Planner Example](https://raw.githubusercontent.com/HMIL1151/project-planner/main/.github/images/example.png)

## Features

### Task sources

- **Dual task sources.** Inline `- [ ]` checkbox tasks via Dataview, and
  file-based note tasks — any note with `tags: [task]` in its frontmatter.
- **Both syntaxes everywhere.** Tasks-plugin emoji (`🆔`, `⛔`, `📅`, `🛫`) and
  Dataview inline fields (`[id:: …]`, `[dependsOn:: …]`) are both read, and
  whichever a line already uses is what gets written back.

### Graph

- **Dependency graph** on a pannable canvas with automatic dagre layout.
- **Critical path analysis** — float computed across the whole plan, so you can
  see which tasks actually move the delivery date.
- **Chain healing** — deleting a task hands its blockers to whatever was
  waiting on it, so the run of work survives.
- **Search with traversal** — pull the upstream or downstream chain of a match
  into view.
- **Filters and presets** by status, tag, file, folder and starred, saveable by
  name and insertable into notes.
- **Unlinked tasks panel** keeps unconnected tasks off the canvas until wanted.
- **Project groups** draw tasks sharing a project inside a labelled container.

### Gantt

- **Every task gets a bar**, dated or not — undated tasks are placed by their
  dependencies rather than dropped.
- **Suggested dates stay suggestions**, drawn dashed, written only when you
  accept them.
- **Drag to schedule**, with working-day scheduling and weekend skipping.
- **Milestones**, grouping, collapsing and date-order mode.
- **Schedule warnings** for overdue, stalled and backwards-dependency risks.
- **PNG export** laid out for paper rather than screen.

### Board

- **Seven groupings** — status, due date, person, tag, project, priority, note
  — each writing back the thing its columns stand for.

### Finance

- **Rate books** read from a note you own, not from plugin settings.
- **Per-task hours, people and materials**, with roll-ups by person, grade,
  project, tag, status and note.
- **Cost over time**, biggest costs, and a problems report that refuses to
  invent numbers.

### Throughout

- **Shared undo** across every view.
- **Companion notes**, with vault-wide retrofit.
- **Progress tracking**, parent/child hierarchy and per-edge style overrides.
- **Internationalization** — English, Dutch, Simplified Chinese.

![Project Planner Example Tasks](https://raw.githubusercontent.com/HMIL1151/project-planner/main/.github/images/example-tasks.png)
