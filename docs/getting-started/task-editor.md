# The Task Editor

Double-click a task anywhere — a bar on the timeline, a card on the board, a
node on the map — and the same dialog opens. It holds the whole of a task:

| Field            | What it is                                                          |
| ---------------- | ------------------------------------------------------------------- |
| Task name        | The words on the task line. Locked for a task that *is* a note.      |
| Note             | The note the task's properties live in, with a button to open it.    |
| Status           | Todo, in progress, done or cancelled.                                |
| Start / End      | The two dates the timeline draws the bar from.                       |
| Progress         | How far along, 0–100.                                                |
| Owner            | The one person answerable for the task.                              |
| Contributors     | Who does the work, at what share, with hours and cost as you type.   |
| Total hours      | An explicit figure, or left blank to work it out from the bar.       |
| Part of          | The task this one sits inside.                                       |
| Waits for        | The tasks that must finish first — the arrows the map draws.         |
| Tags             | The task's tags.                                                     |
| Costs            | Materials and expenses booked against the task.                      |

The people and costs sections only appear when **Finance** is switched on in
settings.

Owner and contributors answer different questions. A task is often owned by one
person and worked by three: costing reads the contributors and their shares, and
anything grouped by owner reads the owner. Shares are used exactly as written —
if they come to 90%, the dialog says so rather than quietly scaling them up to
100%, because that would hide a typo and inflate the plan.

## Where the properties live

A checkbox line has nowhere to put detail, so a task keeps its properties in the
note its line links to:

```markdown
<!-- Task list.md -->
- [ ] [[Ship the exporter]] [id:: a1b2c3] 🛫 2026-08-17 📅 2026-09-04
```

```yaml
# Tasks/Ship the exporter.md
---
task-note: true
status: in-progress
start: 2026-08-17
due: 2026-09-04
owner: Alice
people:
  - person: Alice
    share: 60
  - person: Bob
    share: 40
hours: 48
progress: 35
parent: d4e5f6
dependsOn: [x9y8z7]
tags: [export]
---
```

Open that note and every property is in Obsidian's own properties panel, where
you can edit it directly and where Dataview can query it.

Two things deliberately stay on the task line:

- **The checkbox.** Ticking a box in your task list is the fastest edit there
  is, and it should not depend on a note being rewritten first. The checkbox
  wins: the note's `status` follows it, never the other way round.
- **The dates.** They are written to the note *and* mirrored onto the line in
  the Tasks plugin's emoji notation, so Tasks queries filtering on due dates
  keep working. If the two ever disagree, the note wins.

A note is only treated as a task's property store when it carries
`task-note: true`. Without that marker nothing is written to it — so a task
whose text happens to link to a design doc will never start writing hours into
that doc. A note tagged `task` is refused too: the plugin already reads that as
a task in its own right.

A task with no note keeps everything on its line, exactly as before, and the
editor works the same way. **Create note** in the dialog gives it one.

## Moving existing tasks over

Run **Create notes for existing tasks** from the command palette. It creates a
note for every inline task that does not have one, points the task line at it,
and moves the properties off the line into the note. It is safe to run twice,
and it asks before it touches anything.
