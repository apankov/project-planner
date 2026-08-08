import React from "react";

/**
 * The headline numbers.
 *
 * The total carries a caveat whenever some of it rests on dates the plugin
 * suggested rather than dates anybody wrote down. That is not decoration: every
 * task gets a bar whether or not it has dates, so without the caveat a vault of
 * undated work reads as a confident, entirely invented figure.
 */

export interface Kpi {
  key: string;
  label: string;
  value: string;
  /** Small print under the value, e.g. how much of a total is a guess. */
  caveat?: string;
  /** Draws attention without alarming; used for the suggested-dates caveat. */
  warning?: boolean;
}

export default function FinanceKpis({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="tasks-map-finance-kpis">
      {kpis.map((kpi) => (
        <div className="tasks-map-finance-kpi" key={kpi.key}>
          <div className="tasks-map-finance-kpi__label">{kpi.label}</div>
          <div className="tasks-map-finance-kpi__value">{kpi.value}</div>
          {kpi.caveat && (
            <div
              className={
                kpi.warning
                  ? "tasks-map-finance-kpi__caveat tasks-map-finance-kpi__caveat--warning"
                  : "tasks-map-finance-kpi__caveat"
              }
            >
              {kpi.caveat}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
