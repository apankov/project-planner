import { useMemo, useState } from "react";
import CreatableSelect from "react-select/creatable";
import Select from "react-select";
import {
  ContributorLine,
  DraftCostOptions,
  TaskEditDraft,
  contributorLines,
  draftDays,
  draftHours,
  sharesLookWrong,
  draftTotals,
  totalShare,
  validateDraft,
} from "src/lib/task-edit-draft";
import { TaskStatus } from "src/types/task";
import { effectiveTaskStatus } from "src/lib/task-progress";
import { knownPeople } from "src/lib/rate-book";
import { t } from "../i18n";

/** One task offered as a parent or a dependency. */
export interface TaskChoice {
  id: string;
  label: string;
}

export interface TaskEditFormOptions {
  /** Note-based tasks are named by their file, which is not ours to rename. */
  canEditText: boolean;
  /**
   * A parent's bar is the span of its children, so its own dates are not what
   * the chart draws. The fields are shown but locked, for the same reason
   * dragging a summary bar is blocked.
   */
  summary: boolean;
  /**
   * The bar's dates when they were suggested rather than written. Pre-filled
   * into empty date fields, so accepting a suggested bar is still one gesture.
   */
  suggested: { start: string; due: string } | null;
  /** The note the task's properties live in, if it has one. */
  noteName: string | null;
  financeEnabled: boolean;
  currency: string;
  cost: DraftCostOptions;
  /** Every other task, for the parent and dependency pickers. */
  choices: TaskChoice[];
  allTags: string[];
}

interface TaskEditFormProps {
  initial: TaskEditDraft;
  options: TaskEditFormOptions;
  onSave: (_draft: TaskEditDraft) => void;
  onCancel: () => void;
  onOpenNote: (() => void) | null;
  onCreateNote: (() => void) | null;
}

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "canceled"];

/** The option value standing in for "somebody not in the rates note". */
const OTHER_PERSON = "__other__";

function formatMoney(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    // An unknown currency code should not take the dialog down with it
    return String(Math.round(value));
  }
}

function trimNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** A number typed into a field, or null when the field is empty or nonsense. */
function readNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number.parseFloat(trimmed.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** react-select needs its own theming to sit inside an Obsidian modal. */
const SELECT_CLASSES = { classNamePrefix: "project-planner-task-edit-select" };

/**
 * The one task editor.
 *
 * Every view opens this: the timeline, the board, the map and the finance
 * view. Before it there were three different dialogs and a fourth for costing,
 * so what a task *was* depended on where you had clicked, and the map's route
 * handed the line to the Tasks plugin, which had to have the fields it does not
 * understand stripped off and stitched back on around it.
 *
 * The layout puts the common edit above the fold — name, status, dates,
 * progress — and the things you change less often below it. The running totals
 * in the people section are the reason it is worth having costing here at all:
 * seeing the number move as the shares change is what catches a 60/30 split
 * before it reaches the dashboard.
 *
 * Nothing here writes to the vault. It collects a draft and hands it back, so
 * one optimistic update and one undo entry cover every field at once.
 */
export function TaskEditForm({
  initial,
  options,
  onSave,
  onCancel,
  onOpenNote,
  onCreateNote,
}: TaskEditFormProps) {
  const [draft, setDraft] = useState<TaskEditDraft>(() => ({
    ...initial,
    // A suggested bar fills the empty fields, never overwrites a real date
    start: initial.start ?? options.suggested?.start ?? null,
    due: initial.due ?? options.suggested?.due ?? null,
  }));
  const [showCosts, setShowCosts] = useState(() => draft.expenses.length > 0);

  const change = (patch: Partial<TaskEditDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const problem = validateDraft(draft, { canEditText: options.canEditText });

  const people = useMemo(
    () => knownPeople(options.cost.book),
    [options.cost.book]
  );
  const lines = useMemo(
    () => (options.financeEnabled ? contributorLines(draft, options.cost) : []),
    [draft, options.cost, options.financeEnabled]
  );
  const totals = useMemo(
    () =>
      options.financeEnabled
        ? draftTotals(draft, options.cost)
        : { labour: 0, materials: 0, total: 0 },
    [draft, options.cost, options.financeEnabled]
  );

  /**
   * Typing a percentage moves a `todo` task to in progress.
   *
   * The chart already reads it that way, so leaving the dropdown behind would
   * mean saving a task that shows as underway while its checkbox still says it
   * has not been started. The dropdown moves rather than the value being forced
   * at save time, so the change is on screen before the user commits to it —
   * and they can put it back.
   */
  const setProgress = (percent: number | null) => {
    change({
      progress: percent,
      status: effectiveTaskStatus(draft.status, { percent }),
    });
  };

  const submit = () => {
    if (problem) return;
    onSave({ ...draft, text: draft.text.trim() });
  };

  return (
    <div className="project-planner-task-edit">
      <Header
        draft={draft}
        options={options}
        change={change}
        onOpenNote={onOpenNote}
        onCreateNote={onCreateNote}
        onSubmit={submit}
      />

      <Schedule
        draft={draft}
        options={options}
        change={change}
        setProgress={setProgress}
      />

      {options.financeEnabled && (
        <People
          draft={draft}
          options={options}
          people={people}
          lines={lines}
          change={change}
        />
      )}

      <Relations draft={draft} options={options} change={change} />

      <Tags draft={draft} options={options} change={change} />

      {options.financeEnabled && (
        <Costs
          draft={draft}
          options={options}
          change={change}
          open={showCosts}
          toggle={() => setShowCosts((open) => !open)}
        />
      )}

      {options.financeEnabled && (
        <p className="project-planner-task-edit__totals">
          {t("task_edit.totals", {
            labour: formatMoney(totals.labour, options.currency),
            materials: formatMoney(totals.materials, options.currency),
            total: formatMoney(totals.total, options.currency),
          })}
        </p>
      )}

      {problem && (
        <p className="project-planner-task-edit__error">
          {t(`task_edit.problem_${problem.replace(/-/g, "_")}`)}
        </p>
      )}

      <div className="project-planner-task-edit__buttons">
        <button className="mod-cta" onClick={submit} disabled={!!problem}>
          {t("task_edit.save")}
        </button>
        <button onClick={onCancel}>{t("task_create.modal_cancel")}</button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

interface SectionProps {
  draft: TaskEditDraft;
  options: TaskEditFormOptions;
  change: (_patch: Partial<TaskEditDraft>) => void;
}

function Header({
  draft,
  options,
  change,
  onOpenNote,
  onCreateNote,
  onSubmit,
}: SectionProps & {
  onOpenNote: (() => void) | null;
  onCreateNote: (() => void) | null;
  onSubmit: () => void;
}) {
  return (
    <div className="project-planner-task-edit__header">
      <div className="project-planner-task-edit__title-row">
        <input
          className="project-planner-task-edit__title"
          type="text"
          value={draft.text}
          disabled={!options.canEditText}
          placeholder={t("task_edit.text_placeholder")}
          autoFocus={options.canEditText}
          onChange={(event) => change({ text: event.target.value })}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            onSubmit();
          }}
        />

        <select
          className="project-planner-task-edit__status dropdown"
          value={draft.status}
          onChange={(event) =>
            change({ status: event.target.value as TaskStatus })
          }
        >
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {t(`gantt.legend_${status}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="project-planner-task-edit__note-row">
        {options.noteName ? (
          <>
            <span className="project-planner-task-edit__note-name">
              {`[[${options.noteName}]]`}
            </span>
            {onOpenNote && (
              <button onClick={onOpenNote}>{t("task_edit.open_note")}</button>
            )}
          </>
        ) : (
          <>
            <span className="project-planner-task-edit__note-none">
              {t("task_edit.no_note")}
            </span>
            {onCreateNote && (
              <button onClick={onCreateNote}>
                {t("task_edit.create_note")}
              </button>
            )}
          </>
        )}
      </div>

      {!options.canEditText && (
        <p className="project-planner-task-edit__hint">
          {t("task_edit.text_locked")}
        </p>
      )}
    </div>
  );
}

function Schedule({
  draft,
  options,
  change,
  setProgress,
}: SectionProps & { setProgress: (_percent: number | null) => void }) {
  const locked = options.summary;

  return (
    <section className="project-planner-task-edit__section">
      <h4>{t("task_edit.section_schedule")}</h4>

      <div className="project-planner-task-edit__dates">
        <label>
          {t("task_edit.start")}
          <input
            type="date"
            value={draft.start ?? ""}
            disabled={locked}
            onChange={(event) => change({ start: event.target.value || null })}
          />
        </label>
        <label>
          {t("task_edit.due")}
          <input
            type="date"
            value={draft.due ?? ""}
            disabled={locked}
            onChange={(event) => change({ due: event.target.value || null })}
          />
        </label>
      </div>

      {locked && (
        <p className="project-planner-task-edit__hint">
          {t("task_edit.dates_locked")}
        </p>
      )}
      {!locked && options.suggested && (
        <p className="project-planner-task-edit__hint">
          {t("task_edit.dates_suggested", {
            start: options.suggested.start,
            end: options.suggested.due,
          })}
        </p>
      )}

      <div className="project-planner-task-edit__progress">
        <label>
          {t("task_edit.progress")}
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={draft.progress ?? 0}
            onChange={(event) => setProgress(Number(event.target.value))}
          />
        </label>
        <input
          className="project-planner-task-edit__percent"
          type="number"
          min={0}
          max={100}
          value={draft.progress === null ? "" : draft.progress}
          placeholder={t("task_edit.progress_placeholder")}
          onChange={(event) => setProgress(readNumber(event.target.value))}
        />
      </div>
    </section>
  );
}

function People({
  draft,
  options,
  change,
  people,
  lines,
}: SectionProps & { people: string[]; lines: ContributorLine[] }) {
  const { hours, source } = draftHours(draft, options.cost);
  const days = draftDays(draft, options.cost.skipWeekends);
  const share = totalShare(draft);

  const setAllocation = (index: number, patch: Partial<ContributorLine>) => {
    const allocations = draft.allocations.map((entry, i) =>
      i === index ? { ...entry, ...patch } : entry
    );
    change({ allocations });
  };

  return (
    <section className="project-planner-task-edit__section">
      <h4>{t("task_edit.section_people")}</h4>

      <label className="project-planner-task-edit__owner">
        {t("task_edit.owner")}
        <CreatableSelect
          {...SELECT_CLASSES}
          isClearable
          options={people.map((person) => ({ value: person, label: person }))}
          value={
            draft.owner ? { value: draft.owner, label: draft.owner } : null
          }
          onChange={(option) => change({ owner: option?.value ?? null })}
          placeholder={t("task_edit.owner_placeholder")}
        />
      </label>

      <div className="project-planner-task-edit__rows">
        {draft.allocations.map((allocation, index) => {
          const line = lines[index];
          const known = people.includes(allocation.person);

          return (
            <div
              className="project-planner-task-edit__row"
              key={`${index}-${allocation.person}`}
            >
              {people.length > 0 && (known || !allocation.person) ? (
                <select
                  className="dropdown"
                  value={allocation.person}
                  onChange={(event) =>
                    setAllocation(index, {
                      person:
                        event.target.value === OTHER_PERSON
                          ? " "
                          : event.target.value,
                    })
                  }
                >
                  <option value="">{t("finance.modal_pick_person")}</option>
                  {people.map((person) => (
                    <option key={person} value={person}>
                      {person}
                    </option>
                  ))}
                  <option value={OTHER_PERSON}>
                    {t("finance.modal_other_person")}
                  </option>
                </select>
              ) : (
                // Anyone not in the rates note still has to be nameable, or the
                // dialog would refuse to show what the task already says
                <input
                  type="text"
                  value={allocation.person.trim()}
                  placeholder={t("finance.modal_person_name")}
                  onChange={(event) =>
                    setAllocation(index, { person: event.target.value })
                  }
                />
              )}

              <input
                className="project-planner-task-edit__share"
                type="number"
                value={trimNumber(allocation.share * 100)}
                onChange={(event) => {
                  const percent = readNumber(event.target.value);
                  setAllocation(index, {
                    share: percent === null ? 0 : percent / 100,
                  });
                }}
              />

              <span className="project-planner-task-edit__readout">
                {!line || !allocation.person.trim()
                  ? ""
                  : line.rate === null
                    ? t("finance.modal_no_rate")
                    : t("task_edit.person_readout", {
                        hours: trimNumber(line.hours),
                        cost: formatMoney(line.cost, options.currency),
                      })}
              </span>

              <button
                className="project-planner-task-edit__remove"
                aria-label={t("finance.modal_remove")}
                onClick={() =>
                  change({
                    allocations: draft.allocations.filter(
                      (_entry, i) => i !== index
                    ),
                  })
                }
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <div className="project-planner-task-edit__row-footer">
        <button
          onClick={() =>
            change({
              allocations: [...draft.allocations, { person: "", share: 1 }],
            })
          }
        >
          {t("finance.modal_add_person")}
        </button>
        <span
          className={
            sharesLookWrong(draft)
              ? "project-planner-task-edit__chip project-planner-task-edit__chip--warning"
              : "project-planner-task-edit__chip"
          }
        >
          {`${trimNumber(share * 100)}%`}
        </span>
      </div>

      <div className="project-planner-task-edit__hours">
        <label>
          {t("finance.modal_total_hours")}
          <input
            type="number"
            value={draft.totalHours ?? ""}
            placeholder={t("finance.modal_total_hours_placeholder")}
            onChange={(event) =>
              change({ totalHours: readNumber(event.target.value) })
            }
          />
        </label>
        <label>
          {t("finance.modal_hours_per_day")}
          <input
            type="number"
            value={draft.hoursPerDay ?? ""}
            placeholder={String(options.cost.defaultHoursPerDay)}
            onChange={(event) =>
              change({ hoursPerDay: readNumber(event.target.value) })
            }
          />
        </label>
      </div>

      <p className="project-planner-task-edit__hint">
        {source === "explicit"
          ? t("finance.modal_hours_explicit", { hours: trimNumber(hours) })
          : t("finance.modal_hours_calculated", {
              hours: trimNumber(hours),
              days,
              perDay: trimNumber(
                draft.hoursPerDay ?? options.cost.defaultHoursPerDay
              ),
            })}
      </p>
    </section>
  );
}

function Relations({ draft, options, change }: SectionProps) {
  const byId = new Map(options.choices.map((choice) => [choice.id, choice]));
  const label = (id: string) => byId.get(id)?.label ?? id;

  return (
    <section className="project-planner-task-edit__section">
      <h4>{t("task_edit.section_links")}</h4>

      <label>
        {t("task_edit.parent")}
        <Select
          {...SELECT_CLASSES}
          isClearable
          options={options.choices.map((choice) => ({
            value: choice.id,
            label: choice.label,
          }))}
          value={
            draft.parentId
              ? { value: draft.parentId, label: label(draft.parentId) }
              : null
          }
          onChange={(option) => change({ parentId: option?.value ?? null })}
          placeholder={t("gantt.parent_modal_none")}
        />
      </label>

      <label>
        {t("task_edit.depends_on")}
        <Select
          {...SELECT_CLASSES}
          isMulti
          options={options.choices.map((choice) => ({
            value: choice.id,
            label: choice.label,
          }))}
          value={draft.dependsOn.map((id) => ({ value: id, label: label(id) }))}
          onChange={(selected) =>
            change({ dependsOn: selected.map((option) => option.value) })
          }
          placeholder={t("task_edit.depends_on_placeholder")}
        />
      </label>
    </section>
  );
}

function Tags({ draft, options, change }: SectionProps) {
  return (
    <section className="project-planner-task-edit__section">
      <h4>{t("task_edit.section_tags")}</h4>
      <CreatableSelect
        {...SELECT_CLASSES}
        isMulti
        options={options.allTags.map((tag) => ({ value: tag, label: tag }))}
        value={draft.tags.map((tag) => ({ value: tag, label: tag }))}
        onChange={(selected) =>
          change({ tags: selected.map((option) => option.value) })
        }
        placeholder={t("task_edit.tags_placeholder")}
      />
    </section>
  );
}

function Costs({
  draft,
  options,
  change,
  open,
  toggle,
}: SectionProps & { open: boolean; toggle: () => void }) {
  const setExpense = (
    index: number,
    patch: Partial<(typeof draft.expenses)[0]>
  ) => {
    change({
      expenses: draft.expenses.map((entry, i) =>
        i === index ? { ...entry, ...patch } : entry
      ),
    });
  };

  return (
    <section className="project-planner-task-edit__section">
      <h4>
        <button
          className="project-planner-task-edit__disclosure"
          onClick={toggle}
          aria-expanded={open}
        >
          {open ? "▾" : "▸"} {t("finance.modal_costs")}
        </button>
      </h4>

      {open && (
        <>
          <div className="project-planner-task-edit__rows">
            {draft.expenses.map((expense, index) => (
              <div className="project-planner-task-edit__row" key={index}>
                <input
                  type="text"
                  value={expense.description}
                  placeholder={t("finance.modal_cost_description")}
                  onChange={(event) =>
                    setExpense(index, { description: event.target.value })
                  }
                />
                <input
                  className="project-planner-task-edit__amount"
                  type="number"
                  value={expense.amount}
                  onChange={(event) =>
                    setExpense(index, {
                      amount: readNumber(event.target.value) ?? 0,
                    })
                  }
                />
                <span className="project-planner-task-edit__readout">
                  {formatMoney(expense.amount, options.currency)}
                </span>
                <button
                  className="project-planner-task-edit__remove"
                  aria-label={t("finance.modal_remove")}
                  onClick={() =>
                    change({
                      expenses: draft.expenses.filter(
                        (_entry, i) => i !== index
                      ),
                    })
                  }
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={() =>
              change({
                expenses: [...draft.expenses, { description: "", amount: 0 }],
              })
            }
          >
            {t("finance.modal_add_cost")}
          </button>
        </>
      )}
    </section>
  );
}
