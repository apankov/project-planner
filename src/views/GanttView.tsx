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
import { getAllTasks } from "src/lib/utils";
import { diffDays, todayIso } from "src/lib/date-utils";
import { getTimelineRange, resizeBar, shiftBar } from "src/lib/gantt-schedule";
import {
  GanttRow,
  buildGanttRows,
  getDependencies,
  getInferredRows,
} from "src/lib/gantt-rows";
import {
  GANTT_SCALES,
  GanttChart,
  GanttScale,
  ROW_HEIGHT,
} from "src/components/gantt-chart";
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

  const rows = useMemo(
    () => buildGanttRows(visibleTasks, { today }),
    [visibleTasks, today]
  );

  const dependencies = useMemo(() => getDependencies(rows), [rows]);
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
      />

      {rows.length === 0 ? (
        <div className="tasks-map-gantt-empty">
          {tasks.length === 0 ? t("gantt.empty") : t("gantt.empty_filtered")}
        </div>
      ) : (
        <GanttChart
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
          savingTaskIds={savingTaskIds}
          onSelect={setSelectedTaskId}
          onCommit={(result) => void handleCommit(result)}
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
