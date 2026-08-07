import React, { useRef, useCallback } from "react";
import {
  EdgeProps,
  getBezierPath,
  getStraightPath,
  getSmoothStepPath,
  Position,
} from "reactflow";
import {
  DEFAULT_EDGE_STYLE,
  edgeMarkerId,
  getEdgeStyleClasses,
  showsArrowAtEnd,
  showsArrowAtStart,
} from "src/lib/edge-style-manager";

function getEdgePath(
  edgeStyle: string,
  params: {
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    sourcePosition: Position;
    targetPosition: Position;
  },
  borderRadius: number = 5
) {
  switch (edgeStyle) {
    case "Straight":
      return getStraightPath(params);
    case "SmoothStep":
      return getSmoothStepPath({ ...params, borderRadius });
    default:
      return getBezierPath(params);
  }
}

export default function HashEdge({
  id,
  data,
  sourceX,
  sourceY,
  targetX,
  targetY,
  selected,
}: EdgeProps) {
  const groupRef = useRef<SVGGElement>(null);

  const handleMouseEnter = useCallback(() => {
    // groupRef is HashEdge's <g>, its parent is wrapEdge's <g>,
    // and that parent's parent is the shared <g> holding all edges.
    const wrapEdgeEl = groupRef.current?.parentNode as Element | null;
    const edgeContainer = wrapEdgeEl?.parentNode as Element | null;
    if (edgeContainer && wrapEdgeEl && edgeContainer.lastChild !== wrapEdgeEl) {
      edgeContainer.appendChild(wrapEdgeEl);
    }
  }, []);

  // Set positions based on layout direction
  const layoutDirection = data?.layoutDirection || "Horizontal";
  const edgeStyle = data?.edgeStyle || "Bezier";
  const smoothStepRadius = data?.smoothStepRadius ?? 10;
  const style = data?.style ?? DEFAULT_EDGE_STYLE;
  const isVertical = layoutDirection === "Vertical";
  const sourcePosition = isVertical ? Position.Bottom : Position.Right;
  const targetPosition = isVertical ? Position.Top : Position.Left;

  const [edgePath, labelX, labelY] = getEdgePath(
    edgeStyle,
    {
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    },
    smoothStepRadius
  );

  return (
    <g ref={groupRef} onMouseEnter={handleMouseEnter}>
      {/* Invisible thick path for easier selection */}
      <path
        className="react-flow__edge-interaction tasks-map-hash-edge-interaction"
        d={edgePath}
        stroke="transparent"
        strokeWidth={16}
        fill="none"
      />
      <path
        id={id}
        className={[
          "react-flow__edge-path",
          "tasks-map-hash-edge-path",
          selected ? "tasks-map-hash-edge-path--selected" : "",
          data?.connected ? "tasks-map-hash-edge-path--connected" : "",
          data?.direction ? `tasks-map-hash-edge-path--${data.direction}` : "",
          data?.dimmed ? "tasks-map-hash-edge-path--dimmed" : "",
          data?.dropTarget ? "tasks-map-hash-edge-path--drop-target" : "",
          ...getEdgeStyleClasses(style),
        ]
          .filter(Boolean)
          .join(" ")}
        d={edgePath}
        markerStart={
          showsArrowAtStart(style)
            ? `url(#${edgeMarkerId(style.color)})`
            : undefined
        }
        markerEnd={
          showsArrowAtEnd(style)
            ? `url(#${edgeMarkerId(style.color)})`
            : undefined
        }
      />
      {data?.debugVisualization && (
        <text
          x={labelX}
          y={labelY - 8}
          textAnchor="middle"
          fontSize={12}
          className="tasks-map-hash-edge-text"
        >
          {data?.hash}
        </text>
      )}
    </g>
  );
}
