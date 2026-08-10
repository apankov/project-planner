import React, {
  useState,
  useContext,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { setTooltip } from "obsidian";
import { Plus } from "lucide-react";
import { useApp } from "src/hooks/hooks";
import { BaseTask } from "src/types/task";
import { TaskDetails } from "./task-details";
import { ExpandButton } from "./expand-button";
import { LinkButton } from "./link-button";
import { StarButton } from "./star-button";
import TaskMenu from "./task-menu";
import { Tag } from "./tag";
import { TaskStatusToggle } from "./task-status";
import { TaskBackground } from "./task-background";
import { TaskPriority } from "./task-priority";
import { TagInput } from "./tag-input";
import { useSummaryRenderer } from "../hooks/use-summary-renderer";
import {
  removeTagFromTaskInVault,
  addTagToTaskInVault,
  addStarToTaskInVault,
  editTaskWithTasksModal,
  getTaskDateProperties,
  removeStarFromTaskInVault,
  type TaskDateType,
} from "../lib/utils";
import { TagsContext } from "../contexts/context";
import { t } from "../i18n";

export const NODEWIDTH = 250;

const PROJECT_DOT_COLORS = [
  "var(--color-blue)",
  "var(--color-purple)",
  "var(--color-green)",
  "var(--color-red)",
  "var(--color-orange)",
  "var(--color-cyan)",
  "var(--color-pink)",
  "var(--color-yellow)",
];

const TASK_DATE_EMOJIS: Record<TaskDateType, string> = {
  due: "📅",
  scheduled: "⏳",
  start: "🛫",
  created: "➕",
  done: "✅",
  canceled: "❌",
};
export const NODEHEIGHT = 120;

interface ProjectDotProps {
  project: string;
  color: string;
}

function ProjectDot({ project, color }: ProjectDotProps) {
  const ref = useCallback(
    (el: HTMLSpanElement | null) => {
      if (el) {
        el.style.setProperty("--dot-color", color);
        setTooltip(el, project);
      }
    },
    [project, color]
  );
  return <span ref={ref} className="project-planner-project-dot" />;
}

interface TaskNodeData {
  task: BaseTask;
  layoutDirection?: "Horizontal" | "Vertical";
  showPriorities?: boolean;
  showTags?: boolean;
  debugVisualization?: boolean;
  tagColorPalette?: import("src/lib/tag-color-manager").TagColorPalette;
  tagColorOverrides?: import("src/lib/tag-color-manager").TagColorOverrides;
  companionNoteOptions?: import("src/lib/companion-note").CompanionNoteOptions;
  connected?: boolean;
  dimmed?: boolean;
  critical?: boolean;
  onRequestDelete?: (_task: BaseTask) => Promise<void>;
  groupByProject?: boolean;
  // eslint-disable-next-line no-unused-vars -- callback parameter convention
  onDeleteTask?: (taskId: string) => void;
  // eslint-disable-next-line no-unused-vars -- callback parameter convention
  onTaskCreated?: (_newTask: BaseTask) => void;
  onTaskEdited?: (_taskId: string, _updatedTask: BaseTask) => void;
  onEditFinance?: (_task: BaseTask) => Promise<void>;
}

export default function TaskNode({ data, selected }: NodeProps<TaskNodeData>) {
  const {
    task,
    layoutDirection = "Horizontal",
    showPriorities = true,
    showTags = true,
    debugVisualization = false,
    tagColorPalette = "rainbow",
    tagColorOverrides,
    companionNoteOptions = { enabled: false, folder: "Tasks" },
    connected = false,
    dimmed = false,
    critical = false,
    onRequestDelete,
    groupByProject = false,
    onDeleteTask,
    onTaskCreated,
    onTaskEdited,
    onEditFinance,
  } = data;

  const { allTags, updateTaskTags } = useContext(TagsContext);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(task.status);
  const [starred, setStarred] = useState(task.starred);
  const [tags, setTags] = useState(task.tags || []);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [tagError, setTagError] = useState(false);
  const app = useApp();
  const summaryRef = useSummaryRenderer(task.summary, app);
  const taskDates = useMemo(
    () => getTaskDateProperties(task.text),
    [task.text]
  );

  useEffect(() => {
    setStatus(task.status);
    setStarred(task.starred);
    setTags(task.tags || []);
  }, [task.status, task.starred, task.tags]);

  const isVertical = layoutDirection === "Vertical";
  const targetPosition = isVertical ? Position.Top : Position.Left;
  const sourcePosition = isVertical ? Position.Bottom : Position.Right;

  const handleTagRemove = async (tagToRemove: string) => {
    // Immediately update the visual state
    setTags((prevTags) => {
      const updatedTags = prevTags.filter((tag) => tag !== tagToRemove);
      // Update tasks array so allTags recomputes
      updateTaskTags(task.id, updatedTags);
      return updatedTags;
    });

    try {
      await removeTagFromTaskInVault(task, tagToRemove, app);
    } catch {
      // Revert the visual change if the vault operation failed
      setTags((prevTags) => {
        const revertedTags = [...prevTags, tagToRemove];
        updateTaskTags(task.id, revertedTags);
        return revertedTags;
      });
    }
  };

  const handleAddTag = async (tagToAdd: string) => {
    if (!tagToAdd.trim()) return;

    // Don't allow tags with spaces - check before any cleaning
    if (tagToAdd.includes(" ")) {
      setTagError(true);
      // Reset after showing error briefly
      window.setTimeout(() => {
        setTagError(false);
        setIsAddingTag(false);
      }, 100);
      return;
    }

    const cleanTag = tagToAdd.trim().replace(/^#+/, ""); // Remove any leading #

    // Clear any previous error
    setTagError(false);

    // Don't add duplicate tags
    if (tags.includes(cleanTag)) {
      setIsAddingTag(false);
      return;
    }

    // Immediately update the visual state
    setTags((prevTags) => {
      const updatedTags = [...prevTags, cleanTag];
      // Update tasks array so allTags recomputes
      updateTaskTags(task.id, updatedTags);
      return updatedTags;
    });

    try {
      await addTagToTaskInVault(task, cleanTag, app);
    } catch {
      // Revert the visual change if the vault operation failed
      setTags((prevTags) => {
        const revertedTags = prevTags.filter((tag) => tag !== cleanTag);
        updateTaskTags(task.id, revertedTags);
        return revertedTags;
      });
    }

    // Reset input state
    setIsAddingTag(false);
  };

  const handleCancelAddTag = () => {
    setIsAddingTag(false);
    setTagError(false);
  };

  const handleStarToggle = async () => {
    const newStarred = !starred;
    // Immediately update the visual state
    setStarred(newStarred);

    try {
      if (newStarred) {
        await addStarToTaskInVault(task, app);
      } else {
        await removeStarFromTaskInVault(task, app);
      }
    } catch {
      // Revert the visual change if the vault operation failed
      setStarred(!newStarred);
    }
  };

  const handleDoubleClick = async (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    const interactiveTarget = target.closest?.(
      "button, input, textarea, select, a, [role='button'], .nodrag, .react-flow__handle, .project-planner-add-tag-button, .project-planner-tag-remove-icon"
    );
    if (interactiveTarget && event.currentTarget.contains(interactiveTarget)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const updatedTask = await editTaskWithTasksModal(task, app);
    if (updatedTask) {
      onTaskEdited?.(task.id, updatedTask);
    }
  };

  return (
    <div
      className={[
        "project-planner-task-node-root",
        connected ? "project-planner-task-node-root--connected" : "",
        dimmed ? "project-planner-task-node-root--dimmed" : "",
        critical ? "project-planner-task-node-root--critical" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onDoubleClick={(event) => void handleDoubleClick(event)}
    >
      {selected && taskDates.length > 0 && (
        <div
          className="project-planner-task-date-bar"
          aria-label={t("task_dates.title")}
        >
          {taskDates.map(({ type, date }) => (
            <span className="project-planner-task-date-item" key={type}>
              <span
                className="project-planner-task-date-emoji"
                aria-hidden="true"
              >
                {TASK_DATE_EMOJIS[type]}
              </span>
              <span className="project-planner-task-date-label">
                {t(`task_dates.${type}`)}
              </span>
              <span className="project-planner-task-date-value">{date}</span>
            </span>
          ))}
        </div>
      )}
      <Handle type="target" position={targetPosition} />
      <Handle type="source" position={sourcePosition} />
      <TaskBackground
        status={status}
        starred={starred}
        expanded={expanded}
        debugVisualization={debugVisualization}
        selected={selected}
      >
        <div className="project-planner-task-node-header">
          <TaskStatusToggle
            status={status}
            task={task}
            onStatusChange={setStatus}
          />
          {showPriorities && <TaskPriority priority={task.priority} />}
          <div className="project-planner-task-node-header-spacer" />
          <StarButton
            starred={starred}
            onClick={() => void handleStarToggle()}
          />
          <LinkButton link={task.link} app={app} taskStatus={status} />
          <TaskMenu
            task={task}
            app={app}
            companionNoteOptions={companionNoteOptions}
            onTaskDeleted={() => onDeleteTask?.(task.id)}
            onRequestDelete={onRequestDelete}
            onTaskCreated={onTaskCreated}
            onTaskEdited={onTaskEdited}
            onEditFinance={onEditFinance}
          />
        </div>

        <div className="project-planner-task-node-content">
          <span
            ref={summaryRef}
            className="project-planner-task-node-summary"
          />
        </div>

        {showTags && (
          <div className="project-planner-task-node-footer">
            <div className="project-planner-tag-list">
              {tags.map((tag) => (
                <Tag
                  key={tag}
                  tag={tag}
                  palette={tagColorPalette}
                  colorOverrides={tagColorOverrides}
                  onRemove={(tag) => void handleTagRemove(tag)}
                />
              ))}

              {/* Add tag button/input */}
              {isAddingTag ? (
                <div className="nodrag">
                  <TagInput
                    allTags={allTags}
                    existingTags={tags}
                    onAddTag={(tag) => void handleAddTag(tag)}
                    onCancel={handleCancelAddTag}
                    hasError={tagError}
                  />
                </div>
              ) : (
                <span
                  className="project-planner-add-tag-button"
                  onClick={() => setIsAddingTag(true)}
                >
                  <Plus size={10} />
                  Add tag
                </span>
              )}
            </div>
          </div>
        )}

        {debugVisualization && (
          <ExpandButton
            expanded={expanded}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
          />
        )}

        {debugVisualization && expanded && (
          <TaskDetails task={task} status={status} />
        )}

        {groupByProject && task.projects.length > 1 && (
          <div className="project-planner-task-node-projects">
            {task.projects.map((project, index) => (
              <ProjectDot
                key={project}
                project={project}
                color={PROJECT_DOT_COLORS[index % PROJECT_DOT_COLORS.length]}
              />
            ))}
          </div>
        )}
      </TaskBackground>
    </div>
  );
}
