# Board View

The board puts the same tasks the map and the Gantt show into columns you can
drag cards between. Where the Gantt answers *when*, the board answers *what
state is this in* — and moving a card is what changes the answer.

Open it from the **Board** ribbon icon, or with the **Open board view**
command.

## One question, one set of columns

**Group by** picks the question the columns answer. Every task is one card, and
every card sits in exactly one column.

| Group by      | Columns                                                            | Dragging writes         |
| ------------- | ------------------------------------------------------------------ | ----------------------- |
| Status        | To do, In progress, Done, Cancelled                                 | The task's checkbox      |
| Due date      | Late, Today, Tomorrow, Rest of this week, Next week, Later, No date | The 📅 due date          |
| Start date    | Late start, and the same days ahead                                 | The 🛫 start date        |
| Person        | One per name in `[people:: ...]`, plus Unassigned                   | The task's people        |
| Tag           | One per tag in use, plus No tag                                     | The task's tags          |
| Project       | One per project                                                     | *nothing — read only*    |
| Priority      | 🔺 ⏫ 🔼 🔽 ⏬, plus No priority                                       | *nothing — read only*    |
| Note          | One per note holding tasks                                          | *nothing — read only*    |

Status and date columns are always drawn, even when empty, because they are the
answers the question has whether or not anything is sitting there yet. The
other groupings only draw the columns their tasks actually use.

**Late** is the exception at the other end: it only appears when something is
overdue, and it takes no cards — nobody drags a card to make it late. Grouping
by start date works the same way, on the 🛫 date instead, with **Late start**
holding the work that should already have begun.

### Read-only groupings

Project, priority and note have nothing behind them the board can write, so
their columns show a padlock and refuse cards from other columns. Cards can
still be **reordered inside** them, and everything else on a card still works.

## What a date column writes

Dropping a card into a date column writes a real date, so the card stays where
you put it. A due date is a deadline, so a column covering a range writes its
**last** day; a start date is when work begins, so the same column writes its
**first** day:

| Column            | Due date written           | Start date written         |
| ----------------- | -------------------------- | -------------------------- |
| Today             | today                      | today                      |
| Tomorrow          | tomorrow                   | tomorrow                   |
| Rest of this week | Sunday of this week        | the day after tomorrow     |
| Next week         | Sunday of next week        | Monday of next week        |
| Later             | the Monday after that      | the Monday after that      |
| No date           | clears the due date        | clears the start date      |

"Rest of this week" disappears on a Saturday, when the only day left in the
week is tomorrow and already has a column of its own.

## Person columns

People come from the same `[people:: Alice 60%, Bob 40%]` field the finance
view uses. A task shared between several people is filed under the first one,
so it is drawn as one card rather than one per person.

Dropping a card into someone's column makes it **theirs alone** — the previous
split is replaced by that one person at 100%. Dropping it into **Unassigned**
takes the people off entirely. Both are undoable, so a share you did not mean
to flatten is one **Undo** away.

## Cards

A card shows the task's words, its state, its tags, its due date, how far along
it is, and who has it.

| Gesture              | What it does                                       |
| -------------------- | -------------------------------------------------- |
| Drag                 | Moves the card to another column, or up and down    |
| Click the circle     | Cycles to do → in progress → done                   |
| Double-click         | Opens the task editor                               |
| Click the arrow      | Opens the note the task lives in                    |
| Hover a tag, click ✕ | Removes that tag                                    |

Due dates are tinted: red once they are past, amber on the day itself.

## Order

Cards keep the order you drag them into, and that order is one list for the
whole board — so a card dragged to another column keeps the place you dropped
it in, and changing the grouping does not throw your arrangement away.

**Sort by due date** reorders every column earliest first, with undated cards
after the dated ones. Like every other change on the board it can be taken back
with **Undo**, which shares its history with the map and the Gantt: either view
can undo the other's edits.

## Columns

Use the chevron in a column header to fold it away, or **Collapse all** to fold
the lot. Folded columns are remembered per grouping, so collapsing "Done" while
grouped by status does not also collapse something that happens to share the
name elsewhere.

The **+** in a column header adds a task and gives it whatever that column
stands for — a card added under "Tomorrow" is due tomorrow without a second
dialog.
