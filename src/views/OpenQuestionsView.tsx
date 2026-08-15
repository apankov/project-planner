import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Notice } from "obsidian";
import { useApp } from "src/hooks/hooks";
import { OpenQuestion, matchesQuery } from "src/lib/open-question";
import {
  StaleQuestionError,
  getAllOpenQuestions,
  setOpenQuestionResolved,
} from "src/lib/open-question-vault";
import { todayIso } from "src/lib/date-utils";
import { plainTaskText } from "src/lib/task-text";
import { useUndoHistory } from "src/hooks/use-undo-history";
import { OpenQuestionCard } from "src/components/open-question-card";
import { OpenQuestionsToolbar } from "src/components/open-questions-toolbar";
import ProjectPlannerPlugin from "../main";
import { t } from "../i18n";

/**
 * No settings reach this view, so it takes none. The other views are handed a
 * cloned copy that a wrapper keeps in step with the settings tab; adding that
 * plumbing here would only be something to keep working.
 */
interface OpenQuestionsViewProps {
  plugin: ProjectPlannerPlugin;
}

/**
 * Every open question in the vault, as a wall of cards.
 *
 * There are no columns and nothing to drag. A question has one thing that can
 * be said about it — whether it still needs an answer — so the view is a grid
 * and a toggle, and the questions are left in the order the vault holds them:
 * by note, then down the note. Anything cleverer would be sorting by a
 * property a question does not have.
 */
export default function OpenQuestionsView({ plugin }: OpenQuestionsViewProps) {
  const app = useApp();
  const [questions, setQuestions] = useState<OpenQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // Undo runs long after its action, so it reads questions through a ref
  const questionsRef = useRef<OpenQuestion[]>([]);
  const undo = useUndoHistory(plugin.undoHistory);

  const loadQuestions = useCallback(
    async (options: { notify?: boolean } = {}) => {
      setIsLoading(true);
      try {
        setQuestions(await getAllOpenQuestions(app));
        if (options.notify) new Notice(t("open_questions.reloaded"));
      } finally {
        setIsLoading(false);
      }
    },
    [app]
  );

  // No wait on Dataview: the questions are read off the files, so there is no
  // index to be ready
  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  const visibleQuestions = useMemo(
    () =>
      questions.filter((question) => {
        if (!showResolved && question.resolved) return false;
        return matchesQuery(question, searchQuery);
      }),
    [questions, searchQuery, showResolved]
  );

  const markSaving = useCallback((questionId: string, saving: boolean) => {
    setSavingIds((current) => {
      const next = new Set(current);
      if (saving) next.add(questionId);
      else next.delete(questionId);
      return next;
    });
  }, []);

  const applyUpdate = useCallback((updated: OpenQuestion) => {
    setQuestions((current) =>
      current.map((question) =>
        question.id === updated.id ? updated : question
      )
    );
  }, []);

  /**
   * Answers a question, or reopens one already answered.
   *
   * The line as written comes back from the vault and is kept, because the
   * question is known by the line it was read from: an undo run against the
   * line as it looked *before* this write would find nothing to change.
   */
  const handleToggleResolved = useCallback(
    async (questionId: string) => {
      const question = questionsRef.current.find(
        (candidate) => candidate.id === questionId
      );
      if (!question) return;

      const resolvedOn = question.resolved ? null : todayIso();

      // Optimistic: the vault write is slower than the eye
      applyUpdate({ ...question, resolved: resolvedOn !== null, resolvedOn });
      markSaving(questionId, true);

      try {
        const rawLine = await setOpenQuestionResolved(
          app,
          question,
          resolvedOn
        );
        const written: OpenQuestion = {
          ...question,
          resolved: resolvedOn !== null,
          resolvedOn,
          rawLine,
        };
        applyUpdate(written);

        const label = plainTaskText(question.question);
        plugin.undoHistory.push({
          label: resolvedOn
            ? t("open_questions.undo_resolve", { question: label })
            : t("open_questions.undo_reopen", { question: label }),
          undo: async () => {
            const reverted = await setOpenQuestionResolved(
              app,
              written,
              question.resolvedOn
            );
            applyUpdate({ ...question, rawLine: reverted });
          },
        });
      } catch (error) {
        console.error("Could not change the question", error);
        new Notice(
          error instanceof StaleQuestionError
            ? t("open_questions.stale_line", { note: question.noteName })
            : t("open_questions.resolve_failed")
        );
        applyUpdate(question);
      } finally {
        markSaving(questionId, false);
      }
    },
    [app, applyUpdate, markSaving, plugin]
  );

  const emptyMessage =
    questions.length === 0
      ? t("open_questions.empty")
      : t("open_questions.empty_filtered");

  return (
    <div className="project-planner-open-questions">
      <OpenQuestionsToolbar
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
        showResolved={showResolved}
        onShowResolvedChange={setShowResolved}
        onReload={() => void loadQuestions({ notify: true })}
        onUndo={() => void undo.undo()}
        canUndo={undo.canUndo}
        undoLabel={undo.label}
        questionCount={visibleQuestions.length}
      />

      {isLoading && (
        <div className="project-planner-open-questions__message">
          {t("open_questions.loading")}
        </div>
      )}

      {!isLoading && visibleQuestions.length === 0 && (
        <div className="project-planner-open-questions__message">
          <p>{emptyMessage}</p>
          {questions.length === 0 && (
            <p className="project-planner-open-questions__hint">
              {t("open_questions.empty_hint")}
            </p>
          )}
        </div>
      )}

      {!isLoading && visibleQuestions.length > 0 && (
        <div className="project-planner-open-questions__grid">
          {visibleQuestions.map((question) => (
            <OpenQuestionCard
              key={question.id}
              question={question}
              app={app}
              saving={savingIds.has(question.id)}
              onToggleResolved={(id) => void handleToggleResolved(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
