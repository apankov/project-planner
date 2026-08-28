import React from "react";
import { EDGE_COLOR_NAMES, edgeMarkerId } from "src/lib/edge-style-manager";

/**
 * Arrowhead markers, one per connection colour.
 *
 * SVG markers cannot inherit the stroke of the path that references them, so
 * a marker per colour is the only way to get an arrowhead that matches its
 * line. They live in a single hidden SVG because marker ids resolve
 * document-wide, and `auto-start-reverse` lets the same marker serve both
 * ends of a line.
 */
export function EdgeMarkerDefs() {
  return (
    <svg className="project-planner-edge-marker-defs" aria-hidden="true">
      <defs>
        {EDGE_COLOR_NAMES.map((color) => (
          <marker
            key={color}
            id={edgeMarkerId(color)}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto-start-reverse"
            markerUnits="strokeWidth"
          >
            <path
              d="M0,0 L8,3 L0,6 z"
              className={`project-planner-edge-arrowhead project-planner-edge-arrowhead--${color}`}
            />
          </marker>
        ))}
      </defs>
    </svg>
  );
}
