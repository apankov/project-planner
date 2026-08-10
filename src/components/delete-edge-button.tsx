import { t } from "../i18n";

interface DeleteEdgeButtonProps {
  onDelete: () => void;
  onInsertTask: () => void;
  onToggleStyle: () => void;
  styleOpen: boolean;
}

export const DeleteEdgeButton = ({
  onDelete,
  onInsertTask,
  onToggleStyle,
  styleOpen,
}: DeleteEdgeButtonProps) => {
  return (
    <div className="project-planner-delete-edge-button-container">
      <button onClick={onDelete} className="project-planner-delete-edge-button">
        {t("edge_actions.delete_edge")}
      </button>
      <button
        onClick={onInsertTask}
        className="project-planner-insert-task-button"
      >
        {t("edge_actions.insert_task")}
      </button>
      <button
        onClick={onToggleStyle}
        className={`project-planner-style-edge-button ${
          styleOpen ? "project-planner-style-edge-button--active" : ""
        }`}
      >
        {t("edge_actions.style_edge")}
      </button>
    </div>
  );
};
