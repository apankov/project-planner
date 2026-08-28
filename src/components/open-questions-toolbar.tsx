import React from "react";
import { RefreshCw, Search, Undo2 } from "lucide-react";
import { t } from "../i18n";

interface OpenQuestionsToolbarProps {
  searchQuery: string;
  onSearch: (_query: string) => void;
  showResolved: boolean;
  onShowResolvedChange: (_show: boolean) => void;
  onReload: () => void;
  onUndo: () => void;
  canUndo: boolean;
  /** What pressing undo would reverse, for the tooltip. */
  undoLabel: string | null;
  questionCount: number;
}

export function OpenQuestionsToolbar({
  searchQuery,
  onSearch,
  showResolved,
  onShowResolvedChange,
  onReload,
  onUndo,
  canUndo,
  undoLabel,
  questionCount,
}: OpenQuestionsToolbarProps) {
  return (
    <div className="project-planner-open-questions-toolbar">
      <div className="project-planner-open-questions-toolbar__search">
        <Search size={14} />
        <input
          type="text"
          value={searchQuery}
          placeholder={t("open_questions.search_placeholder")}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>

      <label className="project-planner-open-questions-toolbar__toggle">
        <input
          type="checkbox"
          checked={showResolved}
          onChange={(event) => onShowResolvedChange(event.target.checked)}
        />
        <span>{t("open_questions.show_resolved")}</span>
      </label>

      <button
        className="project-planner-open-questions-toolbar__button"
        onClick={onUndo}
        disabled={!canUndo}
        title={undoLabel ?? t("open_questions.undo_desc")}
      >
        <Undo2 size={14} />
        <span>{t("open_questions.undo")}</span>
      </button>

      <span className="project-planner-open-questions-toolbar__count">
        {t("open_questions.question_count", { n: questionCount })}
      </span>

      <div className="project-planner-open-questions-toolbar__spacer" />

      <button
        className="project-planner-open-questions-toolbar__button"
        onClick={onReload}
        title={t("open_questions.reload")}
      >
        <RefreshCw size={14} />
      </button>
    </div>
  );
}
