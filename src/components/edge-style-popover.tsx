import React from "react";
import {
  EDGE_ARROW_OPTIONS,
  EDGE_COLOR_NAMES,
  EDGE_LINE_PATTERNS,
  EdgeArrows,
  EdgeColorName,
  EdgeLinePattern,
  EdgeStyleOverride,
} from "src/lib/edge-style-manager";
import { t } from "../i18n";

interface EdgeStylePopoverProps {
  /** Named `edgeStyle` rather than `style`: a JSX prop called `style` trips
      the project's no-inline-styles lint rule. */
  edgeStyle: EdgeStyleOverride;
  onChange: (_style: EdgeStyleOverride) => void;
  onReset: () => void;
}

/** Colour, dash pattern and arrowheads for the selected connection. */
export function EdgeStylePopover({
  edgeStyle,
  onChange,
  onReset,
}: EdgeStylePopoverProps) {
  const setColor = (color: EdgeColorName) => onChange({ ...edgeStyle, color });
  const setPattern = (pattern: EdgeLinePattern) =>
    onChange({ ...edgeStyle, pattern });
  const setArrows = (arrows: EdgeArrows) => onChange({ ...edgeStyle, arrows });

  return (
    <div className="tasks-map-edge-style">
      <div className="tasks-map-edge-style__row">
        <span className="tasks-map-edge-style__label">
          {t("edge_actions.colour")}
        </span>
        <div className="tasks-map-edge-style__swatches">
          {EDGE_COLOR_NAMES.map((color) => (
            <button
              key={color}
              className={`tasks-map-edge-style__swatch tasks-map-edge-style__swatch--${color} ${
                edgeStyle.color === color
                  ? "tasks-map-edge-style__swatch--active"
                  : ""
              }`}
              title={t(`edge_actions.colour_${color}`)}
              aria-label={t(`edge_actions.colour_${color}`)}
              onClick={() => setColor(color)}
            />
          ))}
        </div>
      </div>

      <div className="tasks-map-edge-style__row">
        <span className="tasks-map-edge-style__label">
          {t("edge_actions.line")}
        </span>
        <div className="tasks-map-edge-style__group">
          {EDGE_LINE_PATTERNS.map((pattern) => (
            <button
              key={pattern}
              className={`tasks-map-edge-style__option ${
                edgeStyle.pattern === pattern
                  ? "tasks-map-edge-style__option--active"
                  : ""
              }`}
              onClick={() => setPattern(pattern)}
            >
              {t(`edge_actions.line_${pattern}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="tasks-map-edge-style__row">
        <span className="tasks-map-edge-style__label">
          {t("edge_actions.arrows")}
        </span>
        <div className="tasks-map-edge-style__group">
          {EDGE_ARROW_OPTIONS.map((arrows) => (
            <button
              key={arrows}
              className={`tasks-map-edge-style__option ${
                edgeStyle.arrows === arrows
                  ? "tasks-map-edge-style__option--active"
                  : ""
              }`}
              onClick={() => setArrows(arrows)}
            >
              {t(`edge_actions.arrows_${arrows}`)}
            </button>
          ))}
        </div>
      </div>

      <button className="tasks-map-edge-style__reset" onClick={onReset}>
        {t("edge_actions.reset_style")}
      </button>
    </div>
  );
}
