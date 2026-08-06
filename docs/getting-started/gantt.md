# Gantt View

The Gantt view puts the same tasks the map shows onto a timeline, so you can
plan when work happens rather than just how it connects.

Open it from the **Gantt chart** ribbon icon, or with the **Open Gantt view**
command.

## Every task gets a bar

Most tasks in a real vault have no dates, and a chart that only drew dated
tasks would be nearly empty. So every task gets a bar:

- A task with a start date (🛫, or ⏳ scheduled as a fallback) and a due date
  (📅) is drawn between them.
- A task with only a start date runs for one day.
- A task with only a due date is drawn from the day its blockers finish up to
  the deadline, showing the window available for the work.
- A task with **no** dates is placed by its dependencies: it starts the day
  after the last task blocking it finishes, and lasts one day. A task with no
  dated blockers sits on today.

Because inference follows the dependency graph, a chain of undated tasks
spreads out day by day in the order the map says they have to happen.

## Suggested dates are proposals

Bars whose dates were inferred are drawn as **dashed outlines**, and nothing is
written to your notes while they stay that way. To turn a proposal into a real
date:

- **Drag or resize the bar** — writes that one task, or
- **Apply suggested dates** in the toolbar — writes every dashed bar at once,
  reporting how many notes were updated.

## Editing the timeline

| Action                     | Result                                          |
| -------------------------- | ----------------------------------------------- |
| Drag a bar sideways        | Moves start and due together, keeping its length |
| Drag the left edge         | Changes the start date                          |
| Drag the right edge        | Changes the due date                            |
| Click a task name          | Selects the row                                 |
| Click the arrow button     | Opens the note the task lives in                |

Dragging snaps to whole days. A bar can never be shorter than one day.

Edits are written straight into your notes: inline tasks get `🛫`/`📅` (or
Dataview `[start:: …]` style if that is what the line already uses), and
note-based tasks get `start` and `due` frontmatter keys.

## Dependencies

Arrows join each blocker to the task it blocks, using the same `⛔` / `🆔`
relationships as the map. Arrows are only drawn between tasks that are both
visible, so filtering hides the arrows to tasks that dropped out.

## Toolbar

| Control              | Purpose                                                     |
| -------------------- | ------------------------------------------------------------ |
| Days / Weeks / Months | Zoom level of the timeline                                  |
| Today                | Scrolls the timeline back to today                          |
| Search               | Filters rows by task text or tag                            |
| Hide completed       | Removes done and canceled tasks from the chart              |
| Apply suggested dates | Writes every dashed bar to its note                        |
| Reload               | Re-reads tasks from the vault                               |

The red vertical line marks today, and weekends are shaded at the day zoom
level.
