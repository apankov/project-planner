import React, { useState, useRef, useEffect } from "react";
import { MoreVertical, Trash2 } from "lucide-react";
import { App, Notice } from "obsidian";
import { BaseTask } from "src/types/task";
import { CirclePlus, SquarePen } from "lucide-react";
import {
  addTaskLineToVault,
  deleteTaskFromVault,
  editTaskWithTasksModal,
  getTasksApi,
  parseTaskLine,
} from "../lib/utils";
import { CompanionNoteOptions, withCompanionNote } from "../lib/companion-note";
import { promptForTaskLine } from "./task-line-modal";
import { t } from "../i18n";

interface TaskMenuProps {
  task: BaseTask;
  app: App;
  companionNoteOptions: CompanionNoteOptions;
  onTaskDeleted?: () => void;
  /** Provided by the view, which knows the chain the task sits in. */
  onRequestDelete?: (_task: BaseTask) => Promise<void>;
  onTaskCreated?: (_newTask: BaseTask) => void;
  onTaskEdited?: (_taskId: string, _updatedTask: BaseTask) => void;
}

const TaskMenu = ({
  task,
  app,
  companionNoteOptions,
  onTaskDeleted,
  onRequestDelete,
  onTaskCreated,
  onTaskEdited,
}: TaskMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      // Use capture phase to catch clicks before ReactFlow handles them
      activeDocument.addEventListener("mousedown", handleClickOutside, true);
      activeDocument.addEventListener("pointerdown", handleClickOutside, true);
    }

    return () => {
      activeDocument.removeEventListener("mousedown", handleClickOutside, true);
      activeDocument.removeEventListener(
        "pointerdown",
        handleClickOutside,
        true
      );
    };
  }, [isOpen]);

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleCreate = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsOpen(false);

    const tasksApi = getTasksApi(app);
    const rawTaskLine = await promptForTaskLine(
      app,
      tasksApi ? () => tasksApi.createTaskLineModal() : null
    );
    if (!rawTaskLine) return;

    const draft = parseTaskLine(rawTaskLine, task.link);
    if (!draft) {
      new Notice(t("task_create.could_not_read"));
      return;
    }

    let taskLine = rawTaskLine;
    try {
      taskLine = await withCompanionNote(
        app,
        companionNoteOptions,
        rawTaskLine,
        draft.summary
      );
    } catch (error) {
      console.error("Could not create companion note", error);
    }

    try {
      await addTaskLineToVault(task, taskLine, app);
    } catch (error) {
      console.error("Failed to create task:", error);
      new Notice(t("task_create.failed"));
      return;
    }

    const newTask = parseTaskLine(taskLine, task.link) ?? draft;
    onTaskCreated?.(newTask);
  };

  const handleEdit = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsOpen(false);

    const updatedTask = await editTaskWithTasksModal(task, app);
    if (updatedTask) {
      onTaskEdited?.(task.id, updatedTask);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      if (onRequestDelete) {
        // The view reconnects whatever this task was standing between
        await onRequestDelete(task);
      } else {
        await deleteTaskFromVault(task, app);
      }
      onTaskDeleted?.();
    } catch (error) {
      console.error("Failed to delete task:", error);
      new Notice(t("task_create.delete_failed"));
    }

    setIsOpen(false);
  };

  return (
    <div className="tasks-map-task-menu nodrag" ref={menuRef}>
      <button
        className="tasks-map-task-menu-button"
        onClick={handleToggle}
        aria-label="Task menu"
      >
        <MoreVertical size={14} />
      </button>

      {isOpen && (
        <div className="tasks-map-task-menu-dropdown">
          <button
            className="tasks-map-task-menu-item"
            onClick={(e) => void handleCreate(e)}
          >
            <CirclePlus size={12} />
            <span>Create task</span>
          </button>
          <button
            className="tasks-map-task-menu-item"
            onClick={(e) => void handleEdit(e)}
          >
            <SquarePen size={12} />
            <span>Edit task</span>
          </button>
          <button
            className="tasks-map-task-menu-item tasks-map-task-menu-item--danger"
            onClick={(e) => void handleDelete(e)}
          >
            <Trash2 size={12} />
            <span>Delete task</span>
          </button>
        </div>
      )}
    </div>
  );
};
export default TaskMenu;
