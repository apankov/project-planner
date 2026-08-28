import React, { useCallback, useLayoutEffect, useRef } from "react";
import { App } from "obsidian";
import {
  CalendarClock,
  Circle,
  CircleCheck,
  CircleDot,
  CircleX,
} from "lucide-react";
import { BaseTask } from "src/types/base-task";
import { TaskStatus } from "src/types/task";
import { diffDays } from "src/lib/date-utils";
import { taskDueDate } from "src/lib/kanban-buckets";
import { TagColorOverrides, TagColorPalette } from "src/lib/tag-color-manager";
import { useSummaryRenderer } from "src/hooks/use-summary-renderer";
import { Tag } from "./tag";
import { LinkButton } from "./link-button";
import { TaskPriority } from "./task-priority";
import { t } from "../i18n";

/**
 * The dataTransfer key a card carries.
 *
 * A named key rather than "text/plain" so a column can tell one of our cards
 * from a file dragged in off the desktop before it lights up as a drop target:
 * the payload cannot be read during a dragover, only the type list can.
 */
export const CARD_DRAG_KEY = "application/project-planner-card-id";

export type DropPlacement = "before" | "after";

const STATUS_ICONS: Record<TaskStatus, React.ReactElement> = {
  todo: <Circle size={15} />,
  in_progress: <CircleDot size={15} />,
  done: <CircleCheck size={15} />,
  canceled: <CircleX size={15} />,
};

/** Initials for the avatar: "Alice Smith" reads as AS, "Bob" as B. */
function initialsOf(person: string): string {
  return person
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** How a due date should read: late, due now, or simply a date. */
function dueTone(due: string, today: string): "overdue" | "today" | "ahead" {
  const delta = diffDays(today, due);
  if (delta < 0) return "overdue";
  if (delta === 0) return "today";
  return "ahead";
}

/**
 * Everything a card reports, in one object so a column can pass the set on
 * without restating it card by card.
 */
export interface CardCallbacks {
  onSelect: (_taskId: string) => void;
  onOpen: (_taskId: string) => void;
  onCycleStatus: (_taskId: string) => void;
  onDragStart: (_taskId: string) => void;
  onDragEnd: () => void;
  onDragOverCard: (_taskId: string, _placement: DropPlacement) => void;
  onDropOnCard: (_taskId: string, _placement: DropPlacement) => void;
  onRemoveTag: (_taskId: string, _tag: string) => void;
}

/** How every card on a board looks, as against what any one of them says. */
export interface CardAppearance {
  showTags: boolean;
  palette: TagColorPalette;
  colorOverrides: TagColorOverrides;
}

export interface KanbanCardProps extends CardCallbacks, CardAppearance {
  task: BaseTask;
  app: App;
  today: string;
  selected: boolean;
  /** A vault write is in flight for this task. */
  saving: boolean;
  dragging: boolean;
  /** Where a card being dragged would land relative to this one. */
  dropPlacement: DropPlacement | null;
}

/**
 * One task, drawn as a card.
 *
 * The card reports what happened and writes nothing itself: the board owns the
 * vault writes so that a status cycled here and a card dragged to another
 * column land on the same undo stack.
 */
export function KanbanCard({
  task,
  app,
  today,
  selected,
  saving,
  dragging,
  dropPlacement,
  showTags,
  palette,
  colorOverrides,
  onSelect,
  onOpen,
  onCycleStatus,
  onDragStart,
  onDragEnd,
  onDragOverCard,
  onDropOnCard,
  onRemoveTag,
}: KanbanCardProps) {
  const summaryRef = useSummaryRenderer(task.summary, app);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const percent = task.progress.percent;
  const due = taskDueDate(task);

  // Custom properties cannot be set from JSX, where inline styles are banned
  useLayoutEffect(() => {
    progressRef.current?.style.setProperty(
      "--project-planner-card-progress",
      `${percent ?? 0}%`
    );
  }, [percent]);

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.dataTransfer.setData(CARD_DRAG_KEY, task.id);
      event.dataTransfer.effectAllowed = "move";
      onDragStart(task.id);
    },
    [onDragStart, task.id]
  );

  /** Above the midpoint drops in front of this card, below it after. */
  const placementFor = useCallback(
    (event: React.DragEvent<HTMLDivElement>): DropPlacement => {
      const box = event.currentTarget.getBoundingClientRect();
      return event.clientY < box.top + box.height / 2 ? "before" : "after";
    },
    []
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer.types.includes(CARD_DRAG_KEY)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      onDragOverCard(task.id, placementFor(event));
    },
    [onDragOverCard, placementFor, task.id]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer.types.includes(CARD_DRAG_KEY)) return;
      event.preventDefault();
      event.stopPropagation();
      onDropOnCard(task.id, placementFor(event));
    },
    [onDropOnCard, placementFor, task.id]
  );

  const classNames = [
    "project-planner-kanban-card",
    `project-planner-kanban-card--${task.status}`,
    selected ? "project-planner-kanban-card--selected" : "",
    dragging ? "project-planner-kanban-card--dragging" : "",
    saving ? "project-planner-kanban-card--saving" : "",
    dropPlacement ? `project-planner-kanban-card--drop-${dropPlacement}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classNames}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => onSelect(task.id)}
      onDoubleClick={() => onOpen(task.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen(task.id);
      }}
      title={t("kanban.card_hint")}
    >
      <div className="project-planner-kanban-card__header">
        <span
          className="project-planner-kanban-card__status"
          role="button"
          tabIndex={0}
          title={t("kanban.cycle_status")}
          onClick={(event) => {
            event.stopPropagation();
            onCycleStatus(task.id);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.stopPropagation();
            onCycleStatus(task.id);
          }}
        >
          {STATUS_ICONS[task.status]}
        </span>

        <span
          ref={summaryRef}
          className="project-planner-kanban-card__summary"
        />

        {task.priority && <TaskPriority priority={task.priority} />}
        {task.starred && (
          <span
            className="project-planner-kanban-card__star"
            title={t("kanban.starred")}
          >
            ⭐
          </span>
        )}
        <LinkButton link={task.link} app={app} taskStatus={task.status} />
      </div>

      {percent !== null && (
        <div
          ref={progressRef}
          className="project-planner-kanban-card__progress"
          title={t("kanban.progress", { n: percent })}
        >
          <div className="project-planner-kanban-card__progress-fill" />
        </div>
      )}

      {showTags && task.tags.length > 0 && (
        <div className="project-planner-kanban-card__tags">
          {task.tags.map((tag) => (
            <Tag
              key={tag}
              tag={tag}
              palette={palette}
              colorOverrides={colorOverrides}
              onRemove={(removed) => onRemoveTag(task.id, removed)}
            />
          ))}
        </div>
      )}

      <div className="project-planner-kanban-card__footer">
        {due && (
          <span
            className={`project-planner-kanban-card__due project-planner-kanban-card__due--${dueTone(
              due,
              today
            )}`}
            title={t("kanban.due_on", { date: due })}
          >
            <CalendarClock size={12} />
            {due}
          </span>
        )}

        {task.finance.allocations.length > 0 && (
          <span className="project-planner-kanban-card__people">
            {task.finance.allocations.map(({ person }) => (
              <span
                key={person}
                className="project-planner-kanban-card__avatar"
                title={person}
              >
                {initialsOf(person)}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
