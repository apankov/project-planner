import React from "react";
import { RefreshCw, Search } from "lucide-react";
import { CostDimension, TimeBucket } from "src/lib/finance-summary";
import { t } from "../i18n";

const DIMENSIONS: CostDimension[] = [
  "person",
  "grade",
  "project",
  "tag",
  "status",
  "file",
];

const BUCKETS: TimeBucket[] = ["week", "month"];

interface FinanceToolbarProps {
  onReload: () => void;
  searchQuery: string;
  onSearch: (_query: string) => void;
  hideCompleted: boolean;
  onHideCompletedChange: (_hide: boolean) => void;
  includeInferred: boolean;
  onIncludeInferredChange: (_include: boolean) => void;
  dimension: CostDimension;
  onDimensionChange: (_dimension: CostDimension) => void;
  bucket: TimeBucket;
  onBucketChange: (_bucket: TimeBucket) => void;
  /** Whether costs are measured in working days or calendar days. */
  skipWeekends: boolean;
  total: string;
}

export default function FinanceToolbar({
  onReload,
  searchQuery,
  onSearch,
  hideCompleted,
  onHideCompletedChange,
  includeInferred,
  onIncludeInferredChange,
  dimension,
  onDimensionChange,
  bucket,
  onBucketChange,
  skipWeekends,
  total,
}: FinanceToolbarProps) {
  return (
    <div className="tasks-map-finance-toolbar">
      <button
        className="tasks-map-finance-toolbar__icon"
        onClick={onReload}
        aria-label={t("finance.reload")}
        title={t("finance.reload")}
        type="button"
      >
        <RefreshCw size={14} />
      </button>

      <div className="tasks-map-finance-toolbar__search">
        <Search size={13} />
        <input
          type="search"
          value={searchQuery}
          placeholder={t("finance.search_placeholder")}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>

      <label className="tasks-map-finance-toolbar__field">
        {t("finance.group_by")}
        <select
          value={dimension}
          onChange={(event) =>
            onDimensionChange(event.target.value as CostDimension)
          }
        >
          {DIMENSIONS.map((option) => (
            <option key={option} value={option}>
              {t(`finance.dimension_${option}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="tasks-map-finance-toolbar__field">
        {t("finance.over_time")}
        <select
          value={bucket}
          onChange={(event) => onBucketChange(event.target.value as TimeBucket)}
        >
          {BUCKETS.map((option) => (
            <option key={option} value={option}>
              {t(`finance.bucket_${option}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="tasks-map-finance-toolbar__toggle">
        <input
          type="checkbox"
          checked={hideCompleted}
          onChange={(event) => onHideCompletedChange(event.target.checked)}
        />
        {t("finance.hide_completed")}
      </label>

      <label className="tasks-map-finance-toolbar__toggle">
        <input
          type="checkbox"
          checked={includeInferred}
          onChange={(event) => onIncludeInferredChange(event.target.checked)}
        />
        {t("finance.include_suggested")}
      </label>

      {/* Toggling working days in the Gantt moves every figure here, so which
          mode is in force has to be visible rather than inferred */}
      <span
        className="tasks-map-finance-toolbar__chip"
        title={t("finance.day_mode_desc")}
      >
        {skipWeekends ? t("finance.working_days") : t("finance.calendar_days")}
      </span>

      <span className="tasks-map-finance-toolbar__total">{total}</span>
    </div>
  );
}
