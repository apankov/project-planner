import { MiniMap } from "reactflow";

export const TaskMinimap = () => {
  // TODO: Would be nice to have better typing for node here
  const getNodeColor = (node: { data?: { task?: { status?: string } } }) => {
    const status = node.data?.task?.status;
    switch (status) {
      case "done":
        return "var(--project-planner-color-green)";
      case "in_progress":
        return "var(--project-planner-color-blue)";
      case "canceled":
        return "var(--project-planner-color-red)";
      default:
        return "var(--background-secondary)";
    }
  };

  return (
    <MiniMap
      className="project-planner-react-flow__minimap"
      nodeColor={getNodeColor}
      pannable
      zoomable
    />
  );
};
