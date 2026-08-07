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
  addSignToTaskInFile,
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
import TasksMapPlugin from "../main";
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
  const [groupBy, setGroupBy] = useState<GanttGroupBy>("none");
  // Previous orders, newest last, so a sort or a drag can be taken back
  const [orderHistory, setOrderHistory] = useState<string[][]>([]);
  // Task a dependency is being drawn from; the next row clicked receives it
  const [linkingFromId, setLinkingFromId] = useState<string | null>(null);
  const [savingTaskIds, setSavingTaskIds] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
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
    () => buildGanttRows(visibleTasks, { today }),
    [visibleTasks, today]
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

  useEffect(() => {
    if (!linkingFromId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLinkingFromId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [linkingFromId]);

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

  const handleCommit = useCallback(
    async ({ taskId, mode, days }: BarDragResult) => {
      const row = rows.find((candidate) => candidate.task.id === taskId);
      if (!row) return;

      const next =
        mode === "move"
          ? shiftBar(row.bar, days)
          : resizeBar(row.bar, mode === "resize-start" ? "start" : "end", days);

      markSaving(taskId, true);
      try {
        const ok = await writeRowDates(row, next.start, next.end);
        if (!ok)
          new Notice(t("gantt.write_failed", { task: row.task.summary }));
      } catch (error) {
        console.error("Failed to write task dates", error);
        new Notice(t("gantt.write_failed", { task: row.task.summary }));
      } finally {
        markSaving(taskId, false);
      }
    },
    [markSaving, rows, writeRowDates]
  );

  const handleLabelWidthChange = useCallback(
    (width: number) => {
      void plugin.setGanttLabelWidth(width);
    },
    [plugin]
  );

  const commitOrder = useCallback(
    (nextOrder: string[]) => {
      setOrderHistory((previous) => [
        ...previous,
        normalizeOrder(rows, settings.ganttTaskOrder),
      ]);
      void plugin.setGanttTaskOrder(nextOrder);
    },
    [plugin, rows, settings.ganttTaskOrder]
  );

  const handleReorder = useCallback(
    ({ movedId, targetId, placement }: RowReorder) => {
      const current = normalizeOrder(rows, settings.ganttTaskOrder);
      commitOrder(moveRelativeTo(current, movedId, targetId, placement));
    },
    [commitOrder, rows, settings.ganttTaskOrder]
  );

  const handleSortByDate = useCallback(() => {
    commitOrder(orderByDate(rows));
  }, [commitOrder, rows]);

  const handleUndoOrder = useCallback(() => {
    setOrderHistory((previous) => {
      const restored = previous[previous.length - 1];
      if (!restored) return previous;
      void plugin.setGanttTaskOrder(restored);
      return previous.slice(0, -1);
    });
  }, [plugin]);

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
    [app.vault, linkingFromId, settings.linkingStyle, tasks]
  );

  const handleSelect = useCallback(
    (taskId: string, toggle = false) => {
      if (linkingFromId) {
        void completeLink(taskId);
        return;
      }
      setSelectedTaskId((previous) =>
        toggle && previous === taskId ? null : taskId
      );
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
        taskCount={rows.length}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        onSortByDate={handleSortByDate}
        onAddTask={() => void addTask(null)}
        onUndoOrder={handleUndoOrder}
        canUndoOrder={orderHistory.length > 0}
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
          selectedTaskId={selectedTaskId}
          highlight={highlight}
          savingTaskIds={savingTaskIds}
          onSelect={handleSelect}
          onCommit={(result) => void handleCommit(result)}
          onReorder={handleReorder}
          onAddTaskAfter={(taskId) => void addTask(taskId)}
          onStartLink={handleStartLink}
          linkingFromId={linkingFromId}
          scrollRef={scrollRef}
          labelWidth={settings.ganttLabelWidth}
          onLabelWidthChange={handleLabelWidthChange}
        />
      )}

      <div className="tasks-map-gantt-footer">
        <GanttLegend />
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
