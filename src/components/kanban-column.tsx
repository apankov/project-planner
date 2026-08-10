import React, { useCallback } from "react";
import { App } from "obsidian";
import { ChevronDown, ChevronRight, Lock, Plus } from "lucide-react";
import { KanbanBucket } from "src/lib/kanban-buckets";
import {
  CARD_DRAG_KEY,
  CardAppearance,
  CardCallbacks,
  DropPlacement,
  KanbanCard,
} from "./kanban-card";
import { t } from "../i18n";

export interface KanbanColumnProps extends CardAppearance {
  bucket: KanbanBucket;
  app: App;
  today: string;
  collapsed: boolean;
  /** A card is in the air, so columns show whether they would take it. */
  draggingTaskId: string | null;
  /** The card the pointer is over, when it is over one in this column. */
  dropTargetId: string | null;
  dropPlacement: DropPlacement | null;
  /** True while the pointer is over this column but not over a card. */
  dropAtEnd: boolean;
  selectedTaskId: string | null;
  savingTaskIds: Set<string>;
  cardCallbacks: CardCallbacks;
  onToggleCollapse: (_bucketKey: string) => void;
  onAddCard: (_bucketKey: string) => void;
  onDragOverColumn: (_bucketKey: string) => void;
  onDropOnColumn: (_bucketKey: string) => void;
}

/**
 * One bucket of the board.
 *
 * A column that has nothing to write — the note a task lives in, its project —
 * still holds cards and still reorders them, but refuses cards from other
 * columns rather than pretending to move something it cannot. It says so with
 * a padlock in its header instead of silently swallowing the drop.
 */
export function KanbanColumn({
  bucket,
  app,
  today,
  collapsed,
  draggingTaskId,
  dropTargetId,
  dropPlacement,
  dropAtEnd,
  selectedTaskId,
  savingTaskIds,
  cardCallbacks,
  showTags,
  palette,
  colorOverrides,
  onToggleCollapse,
  onAddCard,
  onDragOverColumn,
  onDropOnColumn,
}: KanbanColumnProps) {
  const locked = bucket.change === null;

  /** Whether the card in the air could land here at all. */
  const accepts = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!event.dataTransfer.types.includes(CARD_DRAG_KEY)) return false;
      if (!locked) return true;
      // A locked column still reorders its own cards
      return bucket.tasks.some((task) => task.id === draggingTaskId);
    },
    [bucket.tasks, draggingTaskId, locked]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!accepts(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      onDragOverColumn(bucket.key);
    },
    [accepts, bucket.key, onDragOverColumn]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!accepts(event)) return;
      event.preventDefault();
      onDropOnColumn(bucket.key);
    },
    [accepts, bucket.key, onDropOnColumn]
  );

  if (collapsed) {
    return (
      <div className="tasks-map-kanban-column tasks-map-kanban-column--collapsed">
        <button
          className="tasks-map-kanban-column__collapsed-handle"
          onClick={() => onToggleCollapse(bucket.key)}
          title={t("kanban.expand_column")}
        >
          <ChevronRight size={14} />
          <span className="tasks-map-kanban-column__collapsed-label">
            {bucket.label} ({bucket.tasks.length})
          </span>
        </button>
      </div>
    );
  }

  const classNames = [
    "tasks-map-kanban-column",
    draggingTaskId ? "tasks-map-kanban-column--droppable" : "",
    draggingTaskId && locked ? "tasks-map-kanban-column--locked" : "",
    dropAtEnd ? "tasks-map-kanban-column--over" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames} onDragOver={handleDragOver} onDrop={handleDrop}>
      <div className="tasks-map-kanban-column__header">
        <button
          className="tasks-map-kanban-column__collapse"
          onClick={() => onToggleCollapse(bucket.key)}
          title={t("kanban.collapse_column")}
        >
          <ChevronDown size={14} />
        </button>

        <span className="tasks-map-kanban-column__title" title={bucket.label}>
          {bucket.label}
        </span>

        <span className="tasks-map-kanban-column__count">
          {bucket.tasks.length}
        </span>

        {locked ? (
          <span
            className="tasks-map-kanban-column__lock"
            title={t("kanban.column_read_only")}
          >
            <Lock size={12} />
          </span>
        ) : (
          <button
            className="tasks-map-kanban-column__add"
            onClick={() => onAddCard(bucket.key)}
            title={t("kanban.add_card_here")}
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      <div className="tasks-map-kanban-column__body">
        {bucket.tasks.length === 0 ? (
          <div className="tasks-map-kanban-column__empty">
            {locked ? t("kanban.column_empty") : t("kanban.column_drop_hint")}
          </div>
        ) : (
          bucket.tasks.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              app={app}
              today={today}
              selected={task.id === selectedTaskId}
              saving={savingTaskIds.has(task.id)}
              dragging={task.id === draggingTaskId}
              dropPlacement={task.id === dropTargetId ? dropPlacement : null}
              showTags={showTags}
              palette={palette}
              colorOverrides={colorOverrides}
              {...cardCallbacks}
            />
          ))
        )}
      </div>
    </div>
  );
}
