/**
 * The dependency graph, drawn for paper.
 *
 * The on-screen graph is a canvas you pan, zoom and drag; none of that survives
 * being printed, and a screenshot of it arrives as a postage stamp with the
 * interesting part cropped off. So this is its own drawing, laid out for a
 * reader who gets one look at a fixed page.
 *
 * Three decisions do most of the work:
 *
 * - **One picture per chain, not one picture of everything.** A vault's tasks
 *   are almost never one connected graph; they are a dozen small ones. Drawing
 *   them together means fitting the whole bounding box on a page and shrinking
 *   every chain to nothing. Drawn separately, each chain gets to be legible,
 *   and the ones that are just a single task are not drawn at all — they are
 *   handed back as a list, because a lone box with no arrows is a table row
 *   wearing a costume.
 *
 * - **Left to right, in layers of "what has to happen first".** A task sits one
 *   column to the right of the last thing blocking it. That makes the columns
 *   mean something — everything in column 0 can start now — which a force
 *   layout, whatever else it has going for it, never gives you on paper.
 *
 * - **Cycles are drawn, not hidden.** A task that (indirectly) blocks itself is
 *   a real problem in a plan and the reader is entitled to see it, so the edge
 *   that closes the loop is kept and drawn dashed instead of being dropped to
 *   make the layering work.
 *
 * Nothing here touches the DOM, which is what lets the layout be tested.
 */

import { TaskStatus } from "../../types/task";
import {
  PAPER_ACCENT,
  PAPER_INK,
  PAPER_MUTED,
  PAPER_RULE,
  PAPER_STATUS_FILL,
  PAPER_WHITE,
  escapeXml,
  num,
  paperTextWidth,
} from "./handover-theme";

export interface HandoverGraphNode {
  id: string;
  label: string;
  status: TaskStatus;
  /** On the chain that decides the finish date. */
  critical: boolean;
}

export interface HandoverGraphEdge {
  /** The task that must finish first. */
  fromId: string;
  toId: string;
  /** Both ends are on the critical path with no slack between them. */
  critical: boolean;
}

export interface HandoverGraphDrawing {
  svg: string;
  width: number;
  height: number;
  /** How many tasks it draws, for the caption. */
  nodeCount: number;
  /** The tasks in it, in reading order, for the caption and for anchors. */
  nodeIds: string[];
}

export interface HandoverGraphResult {
  /** One drawing per connected chain, busiest first. */
  drawings: HandoverGraphDrawing[];
  /** Tasks that block nothing and are blocked by nothing. */
  isolatedIds: string[];
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

const NODE_WIDTH = 158;
const NODE_MIN_HEIGHT = 34;
const LINE_HEIGHT = 13;
const MAX_LABEL_LINES = 3;
const LABEL_SIZE = 10;
/** Room between a node's edge and its text. */
const NODE_PADDING = 7;
const LAYER_GAP = 66;
const ROW_GAP = 16;
const MARGIN = 18;

interface PlacedNode extends HandoverGraphNode {
  layer: number;
  /** Position within the layer, top to bottom. */
  order: number;
  x: number;
  y: number;
  height: number;
  lines: string[];
}

/**
 * A label broken to the box's width, and cut off once it has had its three
 * lines. A task summary can be a paragraph; a box on a diagram cannot.
 */
function wrapLabel(label: string): string[] {
  const room = NODE_WIDTH - NODE_PADDING * 2;
  const words = label.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (paperTextWidth(candidate, LABEL_SIZE) <= room || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === MAX_LABEL_LINES) break;
  }

  if (lines.length < MAX_LABEL_LINES && current) lines.push(current);

  // Whatever did not fit becomes an ellipsis on the last line kept, so the
  // reader can tell a shortened name from a short one
  const kept = lines.slice(0, MAX_LABEL_LINES);
  const dropped =
    lines.length > MAX_LABEL_LINES ||
    (lines.length === MAX_LABEL_LINES && current && !lines.includes(current));

  if (dropped && kept.length > 0) {
    const last = kept[kept.length - 1];
    const room2 = NODE_WIDTH - NODE_PADDING * 2;
    let trimmed = last;
    while (
      trimmed.length > 1 &&
      paperTextWidth(`${trimmed}…`, LABEL_SIZE) > room2
    ) {
      trimmed = trimmed.slice(0, -1);
    }
    kept[kept.length - 1] = `${trimmed.trimEnd()}…`;
  }

  return kept;
}

function nodeHeight(lines: string[]): number {
  // The ID strip under the name costs a line of its own
  return Math.max(
    NODE_MIN_HEIGHT,
    lines.length * LINE_HEIGHT + LINE_HEIGHT + NODE_PADDING * 2
  );
}

/* -------------------------------------------------------------------------- */
/* Splitting the graph up                                                     */
/* -------------------------------------------------------------------------- */

interface Component {
  ids: string[];
  edges: HandoverGraphEdge[];
}

/**
 * The graph broken into chains that have nothing to do with each other.
 *
 * Direction is ignored on the way in — two tasks blocked by the same third are
 * part of the same picture even though neither blocks the other.
 */
function connectedComponents(
  nodes: HandoverGraphNode[],
  edges: HandoverGraphEdge[]
): Component[] {
  const neighbours = new Map<string, Set<string>>();
  nodes.forEach((node) => neighbours.set(node.id, new Set()));

  for (const edge of edges) {
    neighbours.get(edge.fromId)?.add(edge.toId);
    neighbours.get(edge.toId)?.add(edge.fromId);
  }

  const seen = new Set<string>();
  const components: Component[] = [];

  for (const node of nodes) {
    if (seen.has(node.id)) continue;

    const ids: string[] = [];
    const stack = [node.id];
    seen.add(node.id);

    while (stack.length > 0) {
      const id = stack.pop() as string;
      ids.push(id);

      for (const next of neighbours.get(id) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }

    const members = new Set(ids);
    components.push({
      ids,
      edges: edges.filter(
        (edge) => members.has(edge.fromId) && members.has(edge.toId)
      ),
    });
  }

  return components;
}

/* -------------------------------------------------------------------------- */
/* Layering                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The edges that close a loop, found by depth-first search.
 *
 * They are the ones pointing back at a task still open on the current path.
 * Layering has to ignore them or it never terminates, but the drawing keeps
 * them — see the note at the top of the file.
 */
function findBackEdges(
  ids: string[],
  edges: HandoverGraphEdge[]
): Set<HandoverGraphEdge> {
  const outgoing = new Map<string, HandoverGraphEdge[]>();
  ids.forEach((id) => outgoing.set(id, []));
  edges.forEach((edge) => outgoing.get(edge.fromId)?.push(edge));

  const back = new Set<HandoverGraphEdge>();
  const done = new Set<string>();
  const onPath = new Set<string>();

  const visit = (id: string) => {
    onPath.add(id);

    for (const edge of outgoing.get(id) ?? []) {
      if (onPath.has(edge.toId)) {
        back.add(edge);
        continue;
      }
      if (!done.has(edge.toId)) visit(edge.toId);
    }

    onPath.delete(id);
    done.add(id);
  };

  for (const id of ids) {
    if (!done.has(id)) visit(id);
  }

  return back;
}

/** How far right each task sits: one past the last thing that blocks it. */
function assignLayers(
  ids: string[],
  edges: HandoverGraphEdge[],
  backEdges: Set<HandoverGraphEdge>
): Map<string, number> {
  const layers = new Map<string, number>();
  ids.forEach((id) => layers.set(id, 0));

  const forward = edges.filter((edge) => !backEdges.has(edge));

  // Relaxation rather than a topological walk: the forward edges are a DAG, so
  // one pass per node is always enough, and the bound means a graph that is
  // somehow still cyclic settles instead of spinning
  for (let pass = 0; pass < ids.length; pass += 1) {
    let moved = false;

    for (const edge of forward) {
      const from = layers.get(edge.fromId) ?? 0;
      const to = layers.get(edge.toId) ?? 0;
      if (to >= from + 1) continue;

      layers.set(edge.toId, from + 1);
      moved = true;
    }

    if (!moved) break;
  }

  return layers;
}

/**
 * Where each task sits inside its column.
 *
 * Straight barycentre ordering: a task wants to sit level with the average of
 * the things it points at, and they want to sit level with it. A few sweeps in
 * each direction is enough to untangle the crossings that make a printed
 * diagram unreadable, and stopping there keeps the layout deterministic — the
 * same plan has to produce the same picture every time it is exported.
 */
function orderWithinLayers(
  ids: string[],
  edges: HandoverGraphEdge[],
  layers: Map<string, number>
): Map<string, number> {
  const byLayer = new Map<number, string[]>();
  // Seeded in the order the tasks arrived, so an unconstrained graph comes out
  // in the order the user already sees elsewhere
  for (const id of ids) {
    const layer = layers.get(id) ?? 0;
    const bucket = byLayer.get(layer);
    if (bucket) bucket.push(id);
    else byLayer.set(layer, [id]);
  }

  const position = new Map<string, number>();
  byLayer.forEach((bucket) => {
    bucket.forEach((id, index) => position.set(id, index));
  });

  const upstream = new Map<string, string[]>();
  const downstream = new Map<string, string[]>();
  ids.forEach((id) => {
    upstream.set(id, []);
    downstream.set(id, []);
  });
  for (const edge of edges) {
    downstream.get(edge.fromId)?.push(edge.toId);
    upstream.get(edge.toId)?.push(edge.fromId);
  }

  const layerNumbers = [...byLayer.keys()].sort((a, b) => a - b);

  const sweep = (towards: Map<string, string[]>, order: number[]) => {
    for (const layer of order) {
      const bucket = byLayer.get(layer);
      if (!bucket || bucket.length < 2) continue;

      const median = new Map<string, number>();
      for (const id of bucket) {
        const neighbours = (towards.get(id) ?? [])
          .map((other) => position.get(other))
          .filter((value): value is number => value !== undefined);

        median.set(
          id,
          neighbours.length === 0
            ? (position.get(id) ?? 0)
            : neighbours.reduce((sum, value) => sum + value, 0) /
                neighbours.length
        );
      }

      bucket.sort((left, right) => {
        const difference = (median.get(left) ?? 0) - (median.get(right) ?? 0);
        // Ties keep the order they already had, so the sweep never churns
        if (difference !== 0) return difference;
        return (position.get(left) ?? 0) - (position.get(right) ?? 0);
      });
      bucket.forEach((id, index) => position.set(id, index));
    }
  };

  const downward = layerNumbers.slice(1);
  const upward = [...layerNumbers].reverse().slice(1);

  for (let pass = 0; pass < 4; pass += 1) {
    sweep(upstream, downward);
    sweep(downstream, upward);
  }

  return position;
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                    */
/* -------------------------------------------------------------------------- */

/** A dependency, drawn as a curve from one box's right edge to another's left. */
function drawEdge(
  from: PlacedNode,
  to: PlacedNode,
  edge: HandoverGraphEdge,
  isBack: boolean
): string {
  const startX = from.x + NODE_WIDTH;
  const startY = from.y + from.height / 2;
  const endX = to.x;
  const endY = to.y + to.height / 2;

  const stroke = edge.critical ? PAPER_ACCENT : PAPER_MUTED;
  const width = edge.critical ? 1.6 : 1;
  const marker = edge.critical ? "arrow-critical" : "arrow";

  // A loop-closing edge runs backwards, so it is bowed well clear of the boxes
  // between its ends rather than drawn straight through them
  if (isBack) {
    const lift = Math.max(from.height, to.height) / 2 + 16;
    const midY = Math.min(startY, endY) - lift;
    const path =
      `M ${num(startX)} ${num(startY)} ` +
      `C ${num(startX + 30)} ${num(midY)}, ` +
      `${num(endX - 30)} ${num(midY)}, ${num(endX)} ${num(endY)}`;

    return (
      `<path d="${path}" fill="none" stroke="${stroke}" ` +
      `stroke-width="${width}" stroke-dasharray="4 3" ` +
      `marker-end="url(#${marker})" />`
    );
  }

  const control = Math.max(18, (endX - startX) / 2);
  const path =
    `M ${num(startX)} ${num(startY)} ` +
    `C ${num(startX + control)} ${num(startY)}, ` +
    `${num(endX - control)} ${num(endY)}, ${num(endX)} ${num(endY)}`;

  return (
    `<path d="${path}" fill="none" stroke="${stroke}" ` +
    `stroke-width="${width}" marker-end="url(#${marker})" />`
  );
}

/** One task's box: a status stripe, the name, and the ID underneath. */
function drawNode(node: PlacedNode): string {
  const parts: string[] = [];
  const stripe = PAPER_STATUS_FILL[node.status];

  parts.push(
    `<rect x="${num(node.x)}" y="${num(node.y)}" width="${num(NODE_WIDTH)}" ` +
      `height="${num(node.height)}" rx="3" fill="${PAPER_WHITE}" ` +
      `stroke="${node.critical ? PAPER_ACCENT : PAPER_RULE}" ` +
      `stroke-width="${node.critical ? 1.6 : 1}" />`
  );

  // The status, as a stripe down the left edge. A filled box would fight the
  // text sitting on it, and colour is the only thing a stripe has to carry
  parts.push(
    `<path d="M ${num(node.x + 3)} ${num(node.y)} ` +
      `h -1.5 a 3 3 0 0 0 -1.5 3 v ${num(node.height - 6)} ` +
      `a 3 3 0 0 0 1.5 3 h 1.5 z" fill="${stripe}" />`
  );
  parts.push(
    `<rect x="${num(node.x)}" y="${num(node.y)}" width="4" ` +
      `height="${num(node.height)}" fill="${stripe}" />`
  );

  const textX = node.x + NODE_PADDING + 3;
  let textY = node.y + NODE_PADDING + LINE_HEIGHT - 3;

  for (const line of node.lines) {
    parts.push(
      `<text x="${num(textX)}" y="${num(textY)}" font-size="${LABEL_SIZE}" ` +
        `fill="${PAPER_INK}"${node.status === "canceled" ? ' text-decoration="line-through"' : ""}` +
        `>${escapeXml(line)}</text>`
    );
    textY += LINE_HEIGHT;
  }

  parts.push(
    `<text x="${num(textX)}" y="${num(textY)}" font-size="8.5" ` +
      `fill="${PAPER_MUTED}">${escapeXml(node.id)}</text>`
  );

  return parts.join("");
}

const ARROW_DEFS =
  `<defs>` +
  `<marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" ` +
  `markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
  `<path d="M 0 1 L 7 4 L 0 7 z" fill="${PAPER_MUTED}" /></marker>` +
  `<marker id="arrow-critical" viewBox="0 0 8 8" refX="7" refY="4" ` +
  `markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
  `<path d="M 0 1 L 7 4 L 0 7 z" fill="${PAPER_ACCENT}" /></marker>` +
  `</defs>`;

/** One connected chain, laid out and drawn. */
function drawComponent(
  component: Component,
  byId: Map<string, HandoverGraphNode>
): HandoverGraphDrawing {
  const backEdges = findBackEdges(component.ids, component.edges);
  const layers = assignLayers(component.ids, component.edges, backEdges);
  const position = orderWithinLayers(component.ids, component.edges, layers);

  const placed = new Map<string, PlacedNode>();
  const byLayer = new Map<number, string[]>();

  for (const id of component.ids) {
    const layer = layers.get(id) ?? 0;
    const bucket = byLayer.get(layer);
    if (bucket) bucket.push(id);
    else byLayer.set(layer, [id]);
  }

  byLayer.forEach((bucket) =>
    bucket.sort((left, right) => {
      const difference = (position.get(left) ?? 0) - (position.get(right) ?? 0);
      return difference !== 0 ? difference : left.localeCompare(right);
    })
  );

  // Every column is measured before any is placed, so the tallest can be the
  // one everything else is centred against
  const columnHeights = new Map<number, number>();
  byLayer.forEach((bucket, layer) => {
    const total = bucket.reduce((sum, id) => {
      const node = byId.get(id);
      const lines = wrapLabel(node?.label ?? id);
      return sum + nodeHeight(lines) + ROW_GAP;
    }, -ROW_GAP);
    columnHeights.set(layer, total);
  });

  const tallest = Math.max(0, ...columnHeights.values());

  byLayer.forEach((bucket, layer) => {
    let y = MARGIN + (tallest - (columnHeights.get(layer) ?? 0)) / 2;
    const x = MARGIN + layer * (NODE_WIDTH + LAYER_GAP);

    bucket.forEach((id, index) => {
      const node = byId.get(id);
      const lines = wrapLabel(node?.label ?? id);
      const height = nodeHeight(lines);

      placed.set(id, {
        id,
        label: node?.label ?? id,
        status: node?.status ?? "todo",
        critical: node?.critical ?? false,
        layer,
        order: index,
        x,
        y,
        height,
        lines,
      });

      y += height + ROW_GAP;
    });
  });

  const layerCount = byLayer.size;
  const width =
    MARGIN * 2 + layerCount * NODE_WIDTH + (layerCount - 1) * LAYER_GAP;
  const height = MARGIN * 2 + tallest;

  const edgeMarkup = component.edges
    .map((edge) => {
      const from = placed.get(edge.fromId);
      const to = placed.get(edge.toId);
      if (!from || !to) return "";
      return drawEdge(from, to, edge, backEdges.has(edge));
    })
    .join("");

  // Reading order is column by column, top to bottom — the same order the
  // caption lists them in, so a reader can match one to the other
  const nodeIds: string[] = [];
  [...byLayer.keys()]
    .sort((a, b) => a - b)
    .forEach((layer) => nodeIds.push(...(byLayer.get(layer) ?? [])));

  const nodeMarkup = nodeIds
    .map((id) => {
      const node = placed.get(id);
      return node ? drawNode(node) : "";
    })
    .join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}" ` +
    `height="${num(height)}" viewBox="0 0 ${num(width)} ${num(height)}" ` +
    `font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, ` +
    `Helvetica, Arial, sans-serif">${ARROW_DEFS}${edgeMarkup}${nodeMarkup}</svg>`;

  return { svg, width, height, nodeCount: component.ids.length, nodeIds };
}

/**
 * Every dependency chain in the plan, drawn.
 *
 * Chains come back busiest first, because the first diagram a reader meets
 * should be the one that explains the most about how the project hangs
 * together. Lone tasks come back as a list instead of a picture.
 */
export function buildDependencyGraphs(
  nodes: HandoverGraphNode[],
  edges: HandoverGraphEdge[]
): HandoverGraphResult {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const real = edges.filter(
    (edge) =>
      edge.fromId !== edge.toId && byId.has(edge.fromId) && byId.has(edge.toId)
  );

  const components = connectedComponents(nodes, real);
  const drawings: HandoverGraphDrawing[] = [];
  const isolatedIds: string[] = [];

  for (const component of components) {
    if (component.edges.length === 0) {
      isolatedIds.push(...component.ids);
      continue;
    }
    drawings.push(drawComponent(component, byId));
  }

  drawings.sort((left, right) => right.nodeCount - left.nodeCount);

  return { drawings, isolatedIds };
}
