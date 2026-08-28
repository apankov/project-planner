import React, { useCallback, useEffect, useRef, useState } from "react";
import { App } from "obsidian";
import {
  CircleCheck,
  FileText,
  MessageSquarePlus,
  RotateCcw,
} from "lucide-react";
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
  onSaveAnswer: (_questionId: string, _answer: string | null) => void;
}

/**
 * One question, drawn as a card.
 *
 * The card reports what happened and writes nothing itself, the way a board
 * card does: the view owns the vault write so that answering a question and
 * taking that back land on the same undo stack. The draft an answer is typed
 * into is the card's own, though — it is not worth anything until it is saved,
 * and lifting it out would make every keystroke a render of the whole grid.
 */
export function OpenQuestionCard({
  question,
  app,
  saving,
  onToggleResolved,
  onSaveAnswer,
}: OpenQuestionCardProps) {
  // The question is free text and may name a note, so it is rendered as
  // markdown rather than printed
  const questionRef = useSummaryRenderer(question.question, app);
  const answerRef = useSummaryRenderer(question.answer ?? "", app);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(question.answer ?? "");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const startEditing = useCallback(() => {
    setDraft(question.answer ?? "");
    setEditing(true);
  }, [question.answer]);

  useEffect(() => {
    if (!editing) return;
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [editing]);

  const save = useCallback(() => {
    const trimmed = draft.trim();
    setEditing(false);
    // An answer emptied is an answer taken away, not an empty one written
    onSaveAnswer(question.id, trimmed.length > 0 ? trimmed : null);
  }, [draft, onSaveAnswer, question.id]);

  const cancel = useCallback(() => {
    setDraft(question.answer ?? "");
    setEditing(false);
  }, [question.answer]);

  /** Enter saves; a newline needs a modifier, the way a chat box works. */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        save();
      }
    },
    [cancel, save]
  );

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

      {editing && (
        <div className="project-planner-open-questions-card__editor">
          <textarea
            ref={textareaRef}
            className="project-planner-open-questions-card__textarea"
            value={draft}
            rows={3}
            placeholder={t("open_questions.answer_placeholder")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="project-planner-open-questions-card__editor-actions">
            <span className="project-planner-open-questions-card__editor-hint">
              {t("open_questions.answer_hint")}
            </span>
            <button
              className="project-planner-open-questions-card__button"
              onClick={cancel}
            >
              {t("open_questions.cancel")}
            </button>
            <button
              className="project-planner-open-questions-card__button project-planner-open-questions-card__button--accent"
              onClick={save}
            >
              {t("open_questions.save")}
            </button>
          </div>
        </div>
      )}

      {!editing && question.answer && (
        <div
          className="project-planner-open-questions-card__answer"
          role="button"
          tabIndex={0}
          title={t("open_questions.edit_answer")}
          onClick={startEditing}
          onKeyDown={(event) => {
            if (event.key === "Enter") startEditing();
          }}
        >
          <span ref={answerRef} />
        </div>
      )}

      {!editing && !question.answer && (
        <button
          className="project-planner-open-questions-card__add-answer"
          disabled={saving}
          onClick={startEditing}
        >
          <MessageSquarePlus size={13} />
          <span>{t("open_questions.add_answer")}</span>
        </button>
      )}

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
