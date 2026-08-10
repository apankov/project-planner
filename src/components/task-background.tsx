import React from "react";
import { TaskStatus } from "src/types/task";

interface TaskBackgroundProps {
  status: TaskStatus;
  starred?: boolean;
  expanded?: boolean;
  debugVisualization?: boolean;
  selected?: boolean;
  children: React.ReactNode;
}

export function TaskBackground({
  status,
  starred = false,
  expanded,
  debugVisualization,
  selected = false,
  children,
}: TaskBackgroundProps) {
  const getStatusClass = () => {
    switch (status) {
      case "done":
        return "project-planner-task-background--done";
      case "in_progress":
        return "project-planner-task-background--in-progress";
      case "canceled":
        return "project-planner-task-background--canceled";
      default:
        return "project-planner-task-background--todo";
    }
  };

  const className = [
    "project-planner-task-background",
    getStatusClass(),
    starred && "project-planner-task-background--starred",
    expanded && "project-planner-task-background--expanded",
    debugVisualization && "project-planner-task-background--debug",
    selected && "project-planner-task-background--selected",
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={className}>{children}</div>;
}
