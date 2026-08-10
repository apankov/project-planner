# Finance

Planning here is time and materials. A task consumes hours, those hours are
worked by named people in some proportion, each person sits at a grade with a
chargeout rate, and on top of the labour sit any materials the task has to buy.

Finance is off by default. Turn it on under **Settings → Project Planner → Finance**,
which adds the **Task finance** view, its ribbon icon and command, and a
**Finance…** entry on each task's menu in the map.

## The rates note

Rates live in a note you own rather than in plugin settings, so you can link to
them, keep them under version control and edit them like anything else. The
default path is `Finance/People and rates.md`; **Create the rates note** in
settings writes a starter one.

It holds two tables:

```markdown
# Rates

| Grade      | Rate |
| ---------- | ---- |
| Principal  | 145  |
| Senior     | 110  |
| Engineer   | 85   |

# People

| Person      | Grade     | Rate |
| ----------- | --------- | ---- |
| Alice Smith | Principal |      |
| Bob Jones   | Engineer  |      |
| Cara Diaz   | Senior    | 130  |
```

Rates are per hour, as plain numbers — the currency comes from settings.
Splitting them into two tables keeps them normalised: putting a whole grade on
a new rate is one edit rather than one per person.

The tables are found by their **column headers**, not by the headings above
them, so you can retitle the headings, reorder the tables, and write whatever
prose and extra tables you like around them.

- The rates table needs a `Grade` column and a rate column (`Rate`,
  `Chargeout`, `Hourly rate`, …).
- The people table needs a person column (`Person`, `Name`, `Who`, …) and a
  `Grade` column.
- The people table's optional third `Rate` column overrides that person's grade
  rate — Cara above is billed at 130 rather than her grade's 110.

Nothing is guessed at. A row that cannot be read is dropped and reported, with
its line number, in the dashboard's **Problems** section — and the settings tab
reports what it read back (`4 grades, 3 people, 1 problem`), so a mistyped
header shows up there rather than as a silently empty dashboard.

## Putting finance on a task

The easiest way is **Finance…** on a task's menu in the map. It shows the
task's hours, who is on it and anything it has to buy, with running totals that
update as you type — which is what catches a 60/30 split before it reaches a
report.

Both task kinds store it in the vault, in whatever style they already use for
dates and dependencies.

### Inline (checkbox) tasks

Four Dataview fields on the task line:

```markdown
- [ ] Fit the sensor loom [hoursPerDay:: 6] [people:: Alice Smith 60%, Bob Jones 40%] [costs:: Loom kit 240, Travel 85] 🛫 2026-03-02 📅 2026-03-06 🆔 a1b2c3
- [ ] Write the FAT report [hours:: 12] [people:: Alice Smith 100%] 🆔 d4e5f6
```

| Field           | Meaning                                        |
| --------------- | ---------------------------------------------- |
| `hours`         | explicit total hours — wins over everything     |
| `hoursPerDay`   | per-task override of the global default         |
| `people`        | who is on it, and their share                   |
| `costs`         | materials and expenses                          |

`totalHours` and `estimatedHours` are read as `hours`; `allocations` and `who`
as `people`; `expenses` and `materials` as `costs`. Parentheses work as well as
brackets. Whatever you write, the plugin writes back the canonical spelling.

A share can be `60%`, `60` or `0.6` — they all mean the same. A name on its own
means the whole task. Entries are separated by commas, or by semicolons if you
need a comma inside a label. Person names may be wiki-links.

A task with three people and two expenses makes for a long line. It stays valid
and it still parses, but materials in particular read better on a note-task —
the modal will say so once a task gets crowded.

### Note-based tasks

The same four, as frontmatter:

```yaml
---
tags:
  - task
start: 2026-03-02
due: 2026-03-06
hoursPerDay: 6
people:
  - person: Alice Smith
    share: 60
  - person: Bob Jones
    share: 40
costs:
  - description: Loom kit
    amount: 240
---
```

The compact string forms (`people: "Alice 60%, Bob 40%"`) are read too, so you
can paste between the two kinds.

## How the cost is worked out

**Hours.** If the task names a total, that is used. Otherwise it is the length
of the task's bar multiplied by its hours-per-day, falling back to the default
in settings (8). The length is the same number the Gantt draws from, so the
money and the chart can never disagree — including whether weekends count. The
dashboard shows a **Working days** / **Calendar days** chip so you can see which
mode is in force, since toggling it in the Gantt moves every figure.

**Rates.** A person's own rate first, then their grade's, and otherwise
nothing. Names match on meaning, not on typing: `Alice Smith`, `alice  smith`
and `[[Alice Smith]]` are one person.

**Totals.** Each person's hours are their share of the task's hours, costed at
their rate. Materials are added on top.

### When something is missing

Nothing is invented, and nothing is quietly rounded into shape:

- Somebody not in the rates note costs **nothing**, and their hours are
  reported as unpriced rather than counted as free.
- **Shares that do not total 100% are used exactly as written.** Scaling
  60% + 30% up to 100% would hide a typo and inflate the plan, so the dashboard
  reports "*N tasks whose shares do not total 100%*" instead. Shares over 100%
  are fine — two people full-time on an 8-hour day really is 16 person-hours.
- An expense with no amount is dropped; a negative one is kept, as a credit.

### Tasks without dates

This is the one worth understanding. Every task gets a bar on the Gantt whether
or not it has dates — undated ones are placed after their blockers and given a
day. That is useful for planning, but it means a vault full of undated tasks
with people on them would otherwise read as a large and entirely invented cost.

So cost resting on suggested dates is always counted separately. The total tile
says how much of itself is a guess, and **Include suggested dates** in the
toolbar (and in settings) leaves it out — the figure is never wrong without
saying so.

## The dashboard

**Task finance** in the ribbon, or the *Open task finance* command.

- **Headline tiles** — total, labour, materials, hours, tasks priced, tasks
  with no finance set, with the caveats above.
- **Labour and materials** — the split.
- **Breakdown** — by person, grade, project, tag, status or note. Under *by
  person* and *by grade*, materials sit under "not attributed to anyone", since
  a bag of cement belongs to a task rather than to a timesheet, and dropping it
  would stop the parts adding up.
- **Cost over time** — by week or month. A task's cost spreads evenly across
  the days of its bar. Real spend is lumpier than that, but nothing in the data
  says when, so a flat spread is at least honest about being an estimate.
- **Biggest costs** — the top ten, each clickable to jump to it in the Gantt.
- **Problems** — everything that could not be worked out, including rows in the
  rates note that could not be read.

A task filed under several tags is counted under one of them, matching how the
Gantt groups rows — counting it under each would make the parts add up to more
than the whole.
