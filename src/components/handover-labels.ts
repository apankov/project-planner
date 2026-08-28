/**
 * Every word the handover document prints, gathered in one place.
 *
 * The writer in `lib/handover/handover-html.ts` is pure and takes its wording
 * as an argument, which keeps `t()` — and therefore i18next, and therefore a
 * loaded plugin — out of the part that decides layout. This is the one seam
 * where the two meet.
 */

import { HandoverLabels } from "src/lib/handover/handover-html";
import { t } from "../i18n";

export function handoverLabels(): HandoverLabels {
  return {
    contents: t("handover.contents"),
    generatedOn: t("handover.generated_on"),
    vault: t("handover.vault"),
    preparedWith: t("handover.prepared_with"),
    section: {
      overview: t("handover.section_overview"),
      plan: t("handover.section_plan"),
      register: t("handover.section_register"),
      dependencies: t("handover.section_dependencies"),
      finance: t("handover.section_finance"),
      questions: t("handover.section_questions"),
      notes: t("handover.section_notes"),
    },
    overview: {
      tasks: t("handover.overview_tasks"),
      span: t("handover.overview_span"),
      critical: t("handover.overview_critical"),
      inferred: t("handover.overview_inferred"),
      overdue: t("handover.overview_overdue"),
      unowned: t("handover.overview_unowned"),
      milestones: t("handover.overview_milestones"),
      openQuestions: t("handover.overview_open_questions"),
      answeredQuestions: t("handover.overview_answered_questions"),
      notes: t("handover.overview_notes"),
      statusHeading: t("handover.overview_status_heading"),
      inferredWarning: t("handover.overview_inferred_warning"),
      howToRead: t("handover.overview_how_to_read"),
      howToReadBody: t("handover.overview_how_to_read_body"),
    },
    register: {
      id: t("handover.register_id"),
      task: t("handover.register_task"),
      status: t("handover.register_status"),
      owner: t("handover.register_owner"),
      start: t("handover.register_start"),
      finish: t("handover.register_finish"),
      progress: t("handover.register_progress"),
      dependsOn: t("handover.register_depends_on"),
      blocks: t("handover.register_blocks"),
      float: t("handover.register_float"),
      hours: t("handover.register_hours"),
      cost: t("handover.register_cost"),
      note: t("handover.register_note"),
      empty: t("handover.register_empty"),
      suggested: t("handover.register_suggested"),
      overdue: t("handover.register_overdue"),
      criticalMark: t("handover.register_critical"),
      days: t("handover.register_days"),
    },
    dependencies: {
      chain: t("handover.dependencies_chain"),
      chainOf: t("handover.dependencies_chain_of"),
      isolated: t("handover.dependencies_isolated"),
      isolatedDesc: t("handover.dependencies_isolated_desc"),
      legendCritical: t("handover.dependencies_legend_critical"),
      legendLoop: t("handover.dependencies_legend_loop"),
      empty: t("handover.dependencies_empty"),
    },
    milestones: {
      heading: t("handover.milestones_heading"),
      date: t("handover.milestones_date"),
      name: t("handover.milestones_name"),
      past: t("handover.milestones_past"),
    },
    finance: {
      total: t("handover.finance_total"),
      labour: t("handover.finance_labour"),
      materials: t("handover.finance_materials"),
      hours: t("handover.finance_hours"),
      byPerson: t("handover.finance_by_person"),
      byProject: t("handover.finance_by_project"),
      topCosts: t("handover.finance_top_costs"),
      issues: t("handover.finance_issues"),
      person: t("handover.finance_person"),
      project: t("handover.finance_project"),
      taskCount: t("handover.finance_task_count"),
      priced: t("handover.finance_priced"),
      unpriced: t("handover.finance_unpriced"),
      noFinance: t("handover.finance_no_finance"),
      inferredNote: t("handover.finance_inferred_note"),
      unassigned: t("handover.finance_unassigned"),
      empty: t("handover.finance_empty"),
    },
    questions: {
      open: t("handover.questions_open"),
      answered: t("handover.questions_answered"),
      answeredOn: t("handover.questions_answered_on"),
      noAnswer: t("handover.questions_no_answer"),
      raisedIn: t("handover.questions_raised_in"),
      empty: t("handover.questions_empty"),
    },
    notes: {
      rootFolder: t("handover.notes_root_folder"),
      empty: t("handover.notes_empty"),
      emptyNote: t("handover.notes_empty_note"),
    },
    statuses: {
      todo: t("gantt.legend_todo"),
      in_progress: t("gantt.legend_in_progress"),
      done: t("gantt.legend_done"),
      canceled: t("gantt.legend_canceled"),
    },
    none: t("handover.none"),
  };
}
