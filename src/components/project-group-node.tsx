import React from "react";
import { NodeProps, NodeResizer } from "reactflow";
import { FolderOpen } from "lucide-react";

export interface ProjectGroupNodeData {
  label: string;
  isDragOver?: boolean;
}

export default function ProjectGroupNode({
  data,
  selected,
}: NodeProps<ProjectGroupNodeData>) {
  const classes = [
    "project-planner-project-group",
    selected ? "project-planner-project-group--selected" : "",
    data.isDragOver ? "project-planner-project-group--drag-over" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classes}>
      <NodeResizer minWidth={100} minHeight={100} isVisible={selected} />
      <div className="project-planner-project-group-label">
        <FolderOpen size={13} />
        <span>{data.label}</span>
      </div>
    </div>
  );
}
