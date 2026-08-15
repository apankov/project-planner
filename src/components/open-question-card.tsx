import React from "react";
import { App } from "obsidian";
import { CircleCheck, FileText, RotateCcw } from "lucide-react";
import { OpenQuestion } from "src/lib/open-question";
import { useSummaryRenderer } from "src/hooks/use-summary-renderer";
import { LinkButton } from "./link-button";
import { t } from "../i18n";

export interface OpenQuestionCardProps {
  question: OpenQuestion;
  app: App;
  /** A vault write is in flight for this question. */
  saving: boolean;
  onToggleResolved: (_questionId: string) => void;
}

/**
 * One question, drawn as a card.
 *
 * The card reports what happened and writes nothing itself, the way a board
 * card does: the view owns the vault write so that answering a question and
 * taking that back land on the same undo stack.
 */
export function OpenQuestionCard({
  question,
  app,
  saving,
  onToggleResolved,
}: OpenQuestionCardProps) {
  // The question is free text and may name a note, so it is rendered as
  // markdown rather than printed
  const questionRef = useSummaryRenderer(question.question, app);

  const classNames = [
    "project-planner-open-questions-card",
    question.resolved ? "project-planner-open-questions-card--resolved" : "",
    saving ? "project-planner-open-questions-card--saving" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const toggleLabel = question.resolved
    ? t("open_questions.reopen")
    : t("open_questions.resolve");

  return (
    <div className={classNames}>
      <div className="project-planner-open-questions-card__header">
        <button
          className="project-planner-open-questions-card__toggle"
          title={toggleLabel}
          aria-label={toggleLabel}
          disabled={saving}
          onClick={() => onToggleResolved(question.id)}
        >
          {question.resolved ? (
            <RotateCcw size={15} />
          ) : (
            <CircleCheck size={15} />
          )}
        </button>

        <span
          ref={questionRef}
          className="project-planner-open-questions-card__question"
        />
      </div>

      <div className="project-planner-open-questions-card__footer">
        <span
          className="project-planner-open-questions-card__note"
          title={question.notePath}
        >
          <FileText size={12} />
          {question.noteName}
        </span>

        {question.resolvedOn && (
          <span className="project-planner-open-questions-card__resolved-on">
            {t("open_questions.resolved_on", { date: question.resolvedOn })}
          </span>
        )}

        <LinkButton link={question.notePath} app={app} />
      </div>
    </div>
  );
}
