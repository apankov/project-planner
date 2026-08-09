import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

/**
 * What the dashboard could not work out.
 *
 * The whole design leans on reporting rather than guessing — an unknown person
 * costs nothing and says so — which only pays off if the shortfalls are
 * somewhere a planner will actually look. So they sit alongside the totals
 * rather than in a console log.
 */

export interface IssueGroup {
  key: string;
  label: string;
  /** Lines naming what is affected, e.g. task summaries or note line numbers. */
  details: string[];
  onSelect?: (_index: number) => void;
}

interface FinanceIssuesProps {
  groups: IssueGroup[];
  emptyLabel: string;
}

function IssueRow({ group }: { group: IssueGroup }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="tasks-map-finance-issues__group">
      <button
        className="tasks-map-finance-issues__header"
        onClick={() => setOpen((previous) => !previous)}
        type="button"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{group.label}</span>
      </button>

      {open && (
        <ul className="tasks-map-finance-issues__details">
          {group.details.map((detail, index) => (
            <li key={`${group.key}-${index}`}>
              {group.onSelect ? (
                <button
                  className="tasks-map-finance-issues__detail-button"
                  onClick={() => group.onSelect?.(index)}
                  type="button"
                >
                  {detail}
                </button>
              ) : (
                detail
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function FinanceIssues({
  groups,
  emptyLabel,
}: FinanceIssuesProps) {
  if (groups.length === 0) {
    return <p className="tasks-map-finance__empty">{emptyLabel}</p>;
  }

  return (
    <ul className="tasks-map-finance-issues">
      {groups.map((group) => (
        <IssueRow group={group} key={group.key} />
      ))}
    </ul>
  );
}
