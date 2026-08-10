import React from "react";

/**
 * A horizontal bar list — the dashboard's workhorse, used for the breakdown,
 * the top cost drivers and the labour/materials split.
 *
 * The bars are plain divs whose width is a percentage. Inline `style` props are
 * forbidden, so the geometry goes in as a custom property through a ref, the
 * same way the status-counts overlay sets its colours.
 */

export interface BarItem {
  key: string;
  label: string;
  value: number;
  /** Shown on the right; the caller formats it, since money needs a locale. */
  display: string;
  /** Optional second line under the label. */
  detail?: string;
  onClick?: () => void;
}

interface FinanceBarListProps {
  items: BarItem[];
  emptyLabel: string;
}

function setWidth(el: HTMLElement | null, percent: number): void {
  el?.style.setProperty("--project-planner-finance-bar", `${percent}%`);
}

export default function FinanceBarList({
  items,
  emptyLabel,
}: FinanceBarListProps) {
  if (items.length === 0) {
    return <p className="project-planner-finance__empty">{emptyLabel}</p>;
  }

  // Scaled against the biggest bar rather than the total, so a long tail of
  // small rows is still readable
  const largest = Math.max(...items.map((item) => Math.abs(item.value)), 1);

  return (
    <ul className="project-planner-finance-bars">
      {items.map((item) => (
        <li className="project-planner-finance-bars__row" key={item.key}>
          <button
            className="project-planner-finance-bars__button"
            onClick={item.onClick}
            disabled={!item.onClick}
            type="button"
          >
            <span className="project-planner-finance-bars__label">
              {item.label}
              {item.detail && (
                <span className="project-planner-finance-bars__detail">
                  {item.detail}
                </span>
              )}
            </span>
            <span className="project-planner-finance-bars__track">
              <span
                className="project-planner-finance-bars__fill"
                ref={(el) =>
                  setWidth(el, (Math.abs(item.value) / largest) * 100)
                }
              />
            </span>
            <span className="project-planner-finance-bars__value">
              {item.display}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
