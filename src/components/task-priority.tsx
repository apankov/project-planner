import React from "react";

interface TaskPriorityProps {
  priority: string;
}

export function TaskPriority({ priority }: TaskPriorityProps) {
  return (
    <span title="Priority" className="project-planner-task-priority">
      {priority}
    </span>
  );
}
