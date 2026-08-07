import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Events, Notice } from "obsidian";
import { useApp } from "src/hooks/hooks";
import { AppWithPlugins } from "src/types/obsidian-internals";
import { BaseTask } from "src/types/base-task";
import {
  addLinkSignsBetweenTasks,
  removeLinkSignsBetweenTasks,
  addSignToTaskInFile,
  addTagToTaskInVault,
  removeTagFromTaskInVault,
  addTaskLineToVault,
  appendTaskLineToFile,
  getAllTasks,
  getTasksApi,
  parseTaskLine,
  resolveDefaultTaskFile,
} from "src/lib/utils";
import { promptForTaskLine } from "src/components/task-line-modal";
import { withCompanionNote } from "src/lib/companion-note";
import { diffDays, todayIso } from "src/lib/date-utils";
import { getTimelineRange, resizeBar, shiftBar } from "src/lib/gantt-schedule";
import {
  GanttRow,
  buildGanttRows,
  getDependencies,
  getInferredRows,
} from "src/lib/gantt-rows";
import {
  GanttGroupBy,
  applyOrder,
  groupRows,
  moveRelativeTo,
  normalizeOrder,
  orderByDate,
} from "src/lib/gantt-order";
import {
  GANTT_SCALES,
  GanttChart,
  GanttScale,
  ROW_HEIGHT,
  RowReorder,
} from "src/components/gantt-chart";
import { getConnectionHighlight } from "src/lib/connection-highlight";
import { GanttToolbar } from "src/components/gantt-toolbar";
import { BarDragResult } from "src/components/gantt-bar";
import { TasksMapSettings } from "src/types/settings";
import { GanttLegend } from "src/components/gantt-legend";
import { useUndoHistory } from "src/hooks/use-undo-history";
import { findTaskDate } from "src/lib/task-dates";
import TasksMapPlugin from "../main";
import {
  FOCUS_TASK_EVENT,
  GANTT_VIEW_TYPE,
  focusTargetFor,
} from "src/lib/view-focus";
import { t } from "../i18n";

interface GanttViewProps {
  settings: TasksMapSettings;
  plugin: TasksMapPlugin;
}

export default function GanttView({ settings, plugin }: GanttViewProps) {
  const app = useApp();
  const [tasks, setTasks] = useState<BaseTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [scale, setScale] = useState<GanttScale>(GANTT_SCALES[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  // Ctrl/Cmd-click builds a set; dragging any member moves them all together
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    new Set()
  );
  const [groupBy, setGroupBy] = useState<GanttGroupBy>("none");
  // Task a dependency is being drawn from; the next row clicked receives it
  const [linkingFromId, setLinkingFromId] = useState<string | null>(null);
  // Task another view asked us to reveal, cleared once it is on screen
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const [savingTaskIds, setSavingTaskIds] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Undo runs long after its action, so it reads tasks through a ref
  const tasksRef = useRef<BaseTask[]>([]);
  const hasCenteredRef = useRef(false);

  // Recomputed per render so a long-open view rolls over at midnight
  const today = todayIso();

  const loadTasks = useCallback(
    (options: { notify?: boolean } = {}) => {
      setIsLoading(true);
      window.setTimeout(() => {
        setTasks(getAllTasks(app));
        setIsLoading(false);
        if (options.notify) new Notice(t("gantt.reloaded"));
      }, 0);
    },
    [app]
  );

  useEffect(() => {
    const dataviewPlugin = (app as AppWithPlugins).plugins?.plugins?.[
      "dataview"
    ];

    if (dataviewPlugin?.index?.initialized) {
      loadTasks();
      return;
    }

    // `dataview:index-ready` is a custom event, so it comes off the generic
    // Events base type rather than MetadataCache's typed overloads.
    const metadataCache: Events = app.metadataCache;
    const eventRef = metadataCache.on("dataview:index-ready", () => {
      loadTasks();
    });

    return () => {
      metadataCache.offref(eventRef);
    };
  }, [app, loadTasks]);

  const visibleTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return tasks.filter((task) => {
      if (
        hideCompleted &&
        (task.status === "done" || task.status === "canceled")
      ) {
        return false;
      }
      if (!query) return true;
      return (
        task.summary.toLowerCase().includes(query) ||
        task.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    });
  }, [tasks, searchQuery, hideCompleted]);

  const scheduledRows = useMemo(
    () =>
      buildGanttRows(visibleTasks, {
        today,
        skipWeekends: settings.ganttSkipWeekends,
      }),
    [visibleTasks, today, settings.ganttSkipWeekends]
  );

  // The chart never re-sorts on its own: rows follow the saved order, and new
  // tasks are appended rather than slotted in by date.
  const rows = useMemo(
    () => applyOrder(scheduledRows, settings.ganttTaskOrder),
    [scheduledRows, settings.ganttTaskOrder]
  );

  const groups = useMemo(
    () =>
      groupRows(rows, groupBy, {
        untagged: t("gantt.group_untagged"),
        noProject: t("gantt.group_no_project"),
        status: (status) => t(`gantt.legend_${status}`),
      }),
    [rows, groupBy]
  );

  const dependencies = useMemo(() => getDependencies(rows), [rows]);

  // Selecting a row lights up everything it depends on and everything waiting
  // on it, using the same chain the map draws
  const highlight = useMemo(
    () => getConnectionHighlight(selectedTaskId, visibleTasks),
    [selectedTaskId, visibleTasks]
  );
  const inferredRows = useMemo(() => getInferredRows(rows), [rows]);

  const timeline = useMemo(
    () =>
      getTimelineRange(
        rows.map((row) => row.bar),
        { today }
      ),
    [rows, today]
  );

  const scrollToToday = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const offset = diffDays(timeline.start, today) * scale.dayWidth;
    el.scrollTo({ left: Math.max(0, offset - el.clientWidth / 3) });
  }, [scale.dayWidth, timeline.start, today]);

  // Centre on today the first time rows arrive, not on every reload
  useEffect(() => {
    if (hasCenteredRef.current || rows.length === 0) return;
    hasCenteredRef.current = true;
    scrollToToday();
  }, [rows.length, scrollToToday]);

  // Another view asking us to show a task: select it and scroll it into view
  useEffect(() => {
    const onFocusTask = (event: Event) => {
      const taskId = focusTargetFor(event, GANTT_VIEW_TYPE);
      if (!taskId) return;

      setSelectedTaskId(taskId);
      setSelectedTaskIds(new Set([taskId]));
      setPendingScrollId(taskId);
    };

    window.addEventListener(FOCUS_TASK_EVENT, onFocusTask);
    return () => window.removeEventListener(FOCUS_TASK_EVENT, onFocusTask);
  }, []);

  // Scroll once the row for the focused task exists
  useEffect(() => {
    if (!pendingScrollId) return;
    const row = rows.find((candidate) => candidate.task.id === pendingScrollId);
    if (!row) return;

    setPendingScrollId(null);
    const el = scrollRef.current;
    if (!el) return;

    const offset = diffDays(timeline.start, row.bar.start) * scale.dayWidth;
    el.scrollTo({ left: Math.max(0, offset - el.clientWidth / 3) });
  }, [pendingScrollId, rows, scale.dayWidth, timeline.start]);

  useEffect(() => {
    if (!linkingFromId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLinkingFromId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [linkingFromId]);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const applyTaskUpdate = useCallback((taskId: string, updated: BaseTask) => {
    setTasks((previous) =>
      previous.map((task) => (task.id === taskId ? updated : task))
    );
  }, []);

  const markSaving = useCallback((taskId: string, saving: boolean) => {
    setSavingTaskIds((previous) => {
      const next = new Set(previous);
      if (saving) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  }, []);

  const writeRowDates = useCallback(
    async (row: GanttRow, start: string, end: string): Promise<boolean> => {
      const updated = await row.task.setDates({ start, due: end }, app);
      if (!updated) return false;
      applyTaskUpdate(row.task.id, updated);
      return true;
    },
    [app, applyTaskUpdate]
  );

  /** The dates a task carries now, so an undo can put them back. */
  const capturePreviousDates = useCallback((row: GanttRow) => {
    return {
      taskId: row.task.id,
      start: findTaskDate(row.task.dates, "start"),
      due: findTaskDate(row.task.dates, "due"),
    };
  }, []);

  /** Restores the dates a set of tasks had before an edit. */
  const restoreDates = useCallback(
    async (
      snapshots: Array<{
        taskId: string;
        start: string | null;
        due: string | null;
      }>
    ) => {
      for (const snapshot of snapshots) {
        const task = tasksRef.current.find(
          (candidate) => candidate.id === snapshot.taskId
        );
        if (!task) continue;

        const updated = await task.setDates(
          { start: snapshot.start, due: snapshot.due },
          app
        );
        if (updated) applyTaskUpdate(snapshot.taskId, updated);
      }
    },
    [app, applyTaskUpdate]
  );

  /** Applies one bar edit and writes it, reporting failure to the user. */
  const commitRowDates = useCallback(
    async (row: GanttRow, mode: BarDragResult["mode"], days: number) => {
      const skipWeekends = settings.ganttSkipWeekends;
      const next =
        mode === "move"
          ? shiftBar(row.bar, days, skipWeekends)
          : resizeBar(
              row.bar,
              mode === "resize-start" ? "start" : "end",
              days,
              skipWeekends
            );

      markSaving(row.task.id, true);
      try {
        const ok = await writeRowDates(row, next.start, next.end);
        if (!ok) {
          new Notice(t("gantt.write_failed", { task: row.task.summary }));
        }
      } catch (error) {
        console.error("Failed to write task dates", error);
        new Notice(t("gantt.write_failed", { task: row.task.summary }));
      } finally {
        markSaving(row.task.id, false);
      }
    },
    [markSaving, settings.ganttSkipWeekends, writeRowDates]
  );

  const handleCommit = useCallback(
    async ({ taskId, mode, days }: BarDragResult) => {
      const row = rows.find((candidate) => candidate.task.id === taskId);
      if (!row) return;

      // Moving one of several selected bars carries the rest along, which is
      // how a slipped date gets pushed through the tasks that follow it
      const movingTogether =
        mode === "move" &&
        selectedTaskIds.size > 1 &&
        selectedTaskIds.has(taskId);

      const moving = movingTogether
        ? rows.filter((candidate) => selectedTaskIds.has(candidate.task.id))
        : [row];

      const snapshots = moving.map(capturePreviousDates);

      for (const target of moving) {
        await commitRowDates(target, mode, days);
      }

      plugin.undoHistory.push({
        label:
          moving.length > 1
            ? t("gantt.undo_move_many", { n: moving.length })
            : t("gantt.undo_move_one", { task: row.task.summary }),
        undo: () => restoreDates(snapshots),
      });

      if (moving.length > 1) {
        new Notice(t("gantt.moved_together", { n: moving.length }));
      }
    },
    [
      capturePreviousDates,
      commitRowDates,
      plugin,
      restoreDates,
      rows,
      selectedTaskIds,
    ]
  );

  const handleLabelWidthChange = useCallback(
    (width: number) => {
      void plugin.setGanttLabelWidth(width);
    },
    [plugin]
  );

  const commitOrder = useCallback(
    (nextOrder: string[], label: string) => {
      const previousOrder = normalizeOrder(rows, settings.ganttTaskOrder);
      plugin.undoHistory.push({
        label,
        undo: async () => {
          await plugin.setGanttTaskOrder(previousOrder);
        },
      });
      void plugin.setGanttTaskOrder(nextOrder);
    },
    [plugin, rows, settings.ganttTaskOrder]
  );

  const handleReorder = useCallback(
    ({ movedId, targetId, placement }: RowReorder) => {
      const current = normalizeOrder(rows, settings.ganttTaskOrder);
      commitOrder(
        moveRelativeTo(current, movedId, targetId, placement),
        t("gantt.undo_reorder")
      );
    },
    [commitOrder, rows, settings.ganttTaskOrder]
  );

  const handleSortByDate = useCallback(() => {
    commitOrder(orderByDate(rows), t("gantt.undo_sort"));
  }, [commitOrder, rows]);

  const {
    canUndo,
    label: undoLabel,
    undo,
  } = useUndoHistory(plugin.undoHistory);

  const handleUndo = useCallback(async () => {
    const undone = await undo();
    if (undone) new Notice(t("gantt.undone", { action: undone }));
  }, [undo]);

  const askForTaskLine = useCallback(async (): Promise<string | null> => {
    const tasksApi = getTasksApi(app);
    const rawLine = await promptForTaskLine(
      app,
      tasksApi ? () => tasksApi.createTaskLineModal() : null
    );
    if (!rawLine) return null;

    const draft = parseTaskLine(rawLine, "");
    if (!draft) {
      new Notice(t("task_create.could_not_read"));
      return null;
    }

    try {
      return await withCompanionNote(
        app,
        {
          enabled: settings.createCompanionNotes,
          folder: settings.companionNoteFolder,
        },
        rawLine,
        draft.summary
      );
    } catch (error) {
      console.error("Could not create companion note", error);
      return rawLine;
    }
  }, [app, settings.companionNoteFolder, settings.createCompanionNotes]);

  /** Writes the ID into the task line so links and ordering survive a reload. */
  const stampTaskId = useCallback(
    async (task: BaseTask) => {
      if (task.type !== "dataview") return;
      await addSignToTaskInFile(
        app.vault,
        task,
        "id",
        task.id,
        settings.linkingStyle
      );
    },
    [app.vault, settings.linkingStyle]
  );

  /**
   * Adds a task to the chart. With an anchor the line is written just below
   * it and the new row takes the next position; without one the task goes to
   * the end of the list.
   */
  const addTask = useCallback(
    async (anchorId: string | null) => {
      const anchorRow = anchorId
        ? rows.find((row) => row.task.id === anchorId)
        : undefined;

      const targetFile = anchorRow
        ? null
        : resolveDefaultTaskFile(app, visibleTasks);
      if (!anchorRow && !targetFile) {
        new Notice(t("task_create.no_target_note"));
        return;
      }

      const taskLine = await askForTaskLine();
      if (!taskLine) return;

      const linkPath = anchorRow ? anchorRow.task.link : targetFile!.path;
      const newTask = parseTaskLine(taskLine, linkPath);
      if (!newTask) {
        new Notice(t("task_create.could_not_read"));
        return;
      }

      try {
        if (anchorRow) {
          await addTaskLineToVault(anchorRow.task, taskLine, app, "after");
        } else {
          await appendTaskLineToFile(targetFile!, taskLine, app);
        }
        await stampTaskId(newTask);

        setTasks((previous) => [...previous, newTask]);

        // Slot the row in where the user asked for it rather than at the end
        const appended = [
          ...normalizeOrder(rows, settings.ganttTaskOrder),
          newTask.id,
        ];
        void plugin.setGanttTaskOrder(
          anchorRow
            ? moveRelativeTo(appended, newTask.id, anchorRow.task.id, "after")
            : appended
        );

        plugin.undoHistory.push({
          label: t("gantt.undo_create", { task: newTask.summary }),
          undo: async () => {
            await newTask.delete(app);
            setTasks((previous) =>
              previous.filter((candidate) => candidate.id !== newTask.id)
            );
          },
        });

        new Notice(t("gantt.task_added"));
      } catch (error) {
        console.error("Failed to add task from the Gantt", error);
        new Notice(t("task_create.failed"));
      }
    },
    [
      app,
      askForTaskLine,
      plugin,
      rows,
      settings.ganttTaskOrder,
      stampTaskId,
      visibleTasks,
    ]
  );

  /** Tags in use, most common first, so the picker suggests the usual ones. */
  const allTags = useMemo(() => {
    const frequency = new Map<string, number>();
    tasks.forEach((task) =>
      task.tags.forEach((tag) =>
        frequency.set(tag, (frequency.get(tag) ?? 0) + 1)
      )
    );
    return Array.from(frequency.keys()).sort((a, b) => {
      const byCount = (frequency.get(b) ?? 0) - (frequency.get(a) ?? 0);
      if (byCount !== 0) return byCount;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });
  }, [tasks]);

  /** Adds or removes a tag, updating the row without a full reload. */
  const changeTag = useCallback(
    async (taskId: string, tag: string, add: boolean) => {
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (!task) return;
      if (add && task.tags.includes(tag)) return;

      const nextTags = add
        ? [...task.tags, tag]
        : task.tags.filter((existing) => existing !== tag);

      // Optimistic: the vault write is slower than the eye
      setTasks((previous) =>
        previous.map((candidate) =>
          candidate.id === taskId
            ? (Object.assign(
                Object.create(Object.getPrototypeOf(candidate)),
                candidate,
                { tags: nextTags }
              ) as BaseTask)
            : candidate
        )
      );

      try {
        if (add) {
          await addTagToTaskInVault(task, tag, app);
        } else {
          await removeTagFromTaskInVault(task, tag, app);
        }

        plugin.undoHistory.push({
          label: add
            ? t("gantt.undo_tag_added", { tag })
            : t("gantt.undo_tag_removed", { tag }),
          undo: async () => {
            const current = tasksRef.current.find(
              (candidate) => candidate.id === taskId
            );
            if (!current) return;

            if (add) {
              await removeTagFromTaskInVault(current, tag, app);
            } else {
              await addTagToTaskInVault(current, tag, app);
            }

            setTasks((previous) =>
              previous.map((candidate) =>
                candidate.id === taskId
                  ? (Object.assign(
                      Object.create(Object.getPrototypeOf(candidate)),
                      candidate,
                      { tags: task.tags }
                    ) as BaseTask)
                  : candidate
              )
            );
          },
        });
      } catch (error) {
        console.error("Could not change the task's tags", error);
        new Notice(t("gantt.tag_failed"));
        setTasks((previous) =>
          previous.map((candidate) =>
            candidate.id === taskId
              ? (Object.assign(
                  Object.create(Object.getPrototypeOf(candidate)),
                  candidate,
                  { tags: task.tags }
                ) as BaseTask)
              : candidate
          )
        );
      }
    },
    [app, plugin, tasks]
  );

  const handleStartLink = useCallback((taskId: string) => {
    setLinkingFromId((previous) => (previous === taskId ? null : taskId));
  }, []);

  /**
   * Completes a dependency: the source must finish before the target starts.
   * Written with the same ⛔/🆔 metadata the map uses, so the link shows up
   * there too on its next reload.
   */
  const completeLink = useCallback(
    async (targetId: string) => {
      const fromId = linkingFromId;
      setLinkingFromId(null);
      if (!fromId || fromId === targetId) return;

      const fromTask = tasks.find((task) => task.id === fromId);
      const toTask = tasks.find((task) => task.id === targetId);
      if (!fromTask || !toTask) return;

      if (toTask.incomingLinks.includes(fromId)) {
        new Notice(t("gantt.link_exists"));
        return;
      }

      try {
        await addLinkSignsBetweenTasks(
          app.vault,
          fromTask,
          toTask,
          settings.linkingStyle
        );

        setTasks((previous) =>
          previous.map((task) =>
            task.id === targetId
              ? (Object.assign(
                  Object.create(Object.getPrototypeOf(task)),
                  task,
                  { incomingLinks: [...task.incomingLinks, fromId] }
                ) as BaseTask)
              : task
          )
        );

        plugin.undoHistory.push({
          label: t("gantt.undo_link", {
            from: fromTask.summary,
            to: toTask.summary,
          }),
          undo: async () => {
            await removeLinkSignsBetweenTasks(app.vault, toTask, fromId);
            setTasks((previous) =>
              previous.map((task) =>
                task.id === targetId
                  ? (Object.assign(
                      Object.create(Object.getPrototypeOf(task)),
                      task,
                      {
                        incomingLinks: task.incomingLinks.filter(
                          (id) => id !== fromId
                        ),
                      }
                    ) as BaseTask)
                  : task
              )
            );
          },
        });

        new Notice(
          t("gantt.link_created", {
            from: fromTask.summary,
            to: toTask.summary,
          })
        );
      } catch (error) {
        console.error("Failed to link tasks", error);
        new Notice(t("gantt.link_failed"));
      }
    },
    [app.vault, linkingFromId, plugin, settings.linkingStyle, tasks]
  );

  const handleSelect = useCallback(
    (taskId: string, toggle = false, additive = false) => {
      if (linkingFromId) {
        void completeLink(taskId);
        return;
      }

      if (additive) {
        setSelectedTaskIds((previous) => {
          const next = new Set(previous);
          if (next.has(taskId)) {
            next.delete(taskId);
          } else {
            next.add(taskId);
          }
          return next;
        });
        setSelectedTaskId(taskId);
        return;
      }

      setSelectedTaskId((previous) => {
        const cleared = toggle && previous === taskId;
        setSelectedTaskIds(cleared ? new Set() : new Set([taskId]));
        return cleared ? null : taskId;
      });
    },
    [completeLink, linkingFromId]
  );

  const handleApplyInferred = useCallback(async () => {
    if (inferredRows.length === 0 || applying) return;

    setApplying(true);
    let written = 0;
    let failed = 0;

    for (const row of inferredRows) {
      try {
        const ok = await writeRowDates(row, row.bar.start, row.bar.end);
        if (ok) {
          written += 1;
        } else {
          failed += 1;
        }
      } catch (error) {
        console.error("Failed to write inferred dates", error);
        failed += 1;
      }
    }

    setApplying(false);
    new Notice(
      failed === 0
        ? t("gantt.applied_inferred", { n: written })
        : t("gantt.applied_inferred_partial", { n: written, failed })
    );
  }, [applying, inferredRows, writeRowDates]);

  if (isLoading) {
    return (
      <div className="tasks-map-loading-container">
        <div className="tasks-map-spinner" />
        <div className="tasks-map-loading-text">{t("gantt.loading")}</div>
      </div>
    );
  }

  return (
    <div className="tasks-map-gantt-container">
      <GanttToolbar
        scale={scale}
        onScaleChange={setScale}
        onScrollToToday={scrollToToday}
        onReload={() => loadTasks({ notify: true })}
        onApplyInferred={() => void handleApplyInferred()}
        inferredCount={inferredRows.length}
        applying={applying}
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
        hideCompleted={hideCompleted}
        onHideCompletedChange={setHideCompleted}
        skipWeekends={settings.ganttSkipWeekends}
        onSkipWeekendsChange={(skip) => void plugin.setGanttSkipWeekends(skip)}
        taskCount={rows.length}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        onSortByDate={handleSortByDate}
        onAddTask={() => void addTask(null)}
        onUndoOrder={() => void handleUndo()}
        canUndoOrder={canUndo}
        undoLabel={undoLabel}
      />

      {linkingFromId && (
        <div className="tasks-map-gantt-linking">
          {t("gantt.linking_hint", {
            task:
              rows.find((row) => row.task.id === linkingFromId)?.task.summary ??
              "",
          })}
          <button
            className="tasks-map-gantt-linking__cancel"
            onClick={() => setLinkingFromId(null)}
          >
            {t("gantt.linking_cancel")}
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="tasks-map-gantt-empty">
          {tasks.length === 0 ? t("gantt.empty") : t("gantt.empty_filtered")}
        </div>
      ) : (
        <GanttChart
          groups={groups}
          rows={rows}
          dependencies={dependencies}
          timelineStart={timeline.start}
          timelineEnd={timeline.end}
          today={today}
          scale={scale}
          app={app}
          palette={settings.tagColorPalette}
          colorOverrides={settings.tagColorOverrides}
          showTags={settings.showTags}
          selectedTaskIds={selectedTaskIds}
          highlight={highlight}
          savingTaskIds={savingTaskIds}
          onSelect={handleSelect}
          onCommit={(result) => void handleCommit(result)}
          onReorder={handleReorder}
          onAddTaskAfter={(taskId) => void addTask(taskId)}
          onStartLink={handleStartLink}
          onShowInMap={(taskId) => void plugin.focusTaskInMap(taskId)}
          onAddTag={(taskId, tag) => void changeTag(taskId, tag, true)}
          onRemoveTag={(taskId, tag) => void changeTag(taskId, tag, false)}
          allTags={allTags}
          linkingFromId={linkingFromId}
          scrollRef={scrollRef}
          labelWidth={settings.ganttLabelWidth}
          onLabelWidthChange={handleLabelWidthChange}
        />
      )}

      <div className="tasks-map-gantt-footer">
        <GanttLegend />
        {selectedTaskIds.size > 1 && (
          <div className="tasks-map-gantt-hint">
            {t("gantt.moved_together_hint", { n: selectedTaskIds.size })}
          </div>
        )}
        {inferredRows.length > 0 && (
          <div className="tasks-map-gantt-hint">
            {t("gantt.inferred_hint", { n: inferredRows.length })}
          </div>
        )}
      </div>
    </div>
  );
}

export { ROW_HEIGHT };
