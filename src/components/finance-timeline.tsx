import React from "react";
import { CostBucket } from "src/lib/finance-summary";

/**
 * Cost per week or month, as a stacked column chart.
 *
 * Absolutely-positioned divs with percentage heights, matching the hand-rolled
 * Gantt rather than pulling in a charting library for one chart. Heights go in
 * as custom properties, since inline styles are not allowed.
 */

interface FinanceTimelineProps {
  buckets: CostBucket[];
  /** Formats a bucket's start date for the axis. */
  formatLabel: (_start: string) => string;
  formatMoney: (_value: number) => string;
  labourLabel: string;
  materialsLabel: string;
  emptyLabel: string;
}

function setHeight(el: HTMLElement | null, percent: number): void {
  el?.style.setProperty("--project-planner-finance-column", `${percent}%`);
}

export default function FinanceTimeline({
  buckets,
  formatLabel,
  formatMoney,
  labourLabel,
  materialsLabel,
  emptyLabel,
}: FinanceTimelineProps) {
  if (buckets.length === 0) {
    return <p className="project-planner-finance__empty">{emptyLabel}</p>;
  }

  const tallest = Math.max(...buckets.map((bucket) => bucket.total), 1);

  // Every column is labelled at month scale, but a year of weeks would be
  // unreadable, so thin them out to roughly a dozen
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 12));

  return (
    <div className="project-planner-finance-timeline">
      <div className="project-planner-finance-timeline__plot">
        {buckets.map((bucket, index) => (
          <div
            className="project-planner-finance-timeline__slot"
            key={bucket.start}
          >
            <div
              className="project-planner-finance-timeline__column"
              title={`${formatLabel(bucket.start)} — ${formatMoney(bucket.total)}`}
            >
              <div
                className="project-planner-finance-timeline__materials"
                ref={(el) => setHeight(el, (bucket.materials / tallest) * 100)}
              />
              <div
                className="project-planner-finance-timeline__labour"
                ref={(el) => setHeight(el, (bucket.labour / tallest) * 100)}
              />
            </div>
            <div className="project-planner-finance-timeline__tick">
              {index % labelEvery === 0 ? formatLabel(bucket.start) : ""}
            </div>
          </div>
        ))}
      </div>
      <div className="project-planner-finance-timeline__key">
        <span className="project-planner-finance-timeline__key-item">
          <span className="project-planner-finance-timeline__swatch project-planner-finance-timeline__swatch--labour" />
          {labourLabel}
        </span>
        <span className="project-planner-finance-timeline__key-item">
          <span className="project-planner-finance-timeline__swatch project-planner-finance-timeline__swatch--materials" />
          {materialsLabel}
        </span>
      </div>
    </div>
  );
}
