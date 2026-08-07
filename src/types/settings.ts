import { Language } from "../i18n";
import { FilterState } from "./filter-state";
import { TagColorPalette, TagColorOverrides } from "../lib/tag-color-manager";
import { EdgeStyleOverrides } from "../lib/edge-style-manager";
import { DEFAULT_COMPANION_FOLDER } from "../lib/companion-note";

export interface FilterPreset {
  id: string;
  name: string;
  filter: FilterState;
}

export interface TasksMapSettings {
  showPriorities: boolean;
  showTags: boolean;
  showStatusCounts: boolean;

  layoutDirection: "Horizontal" | "Vertical";
  edgeStyle: "Bezier" | "Straight" | "SmoothStep";
  smoothStepRadius: number;
  linkingStyle: "individual" | "csv" | "dataview";

  debugVisualization: boolean;

  // Tag color settings
  tagColorPalette: TagColorPalette;
  // Manual per-tag colors; tags absent here follow the palette
  tagColorOverrides: TagColorOverrides;

  // Width of the Gantt view's task-name column, in pixels
  ganttLabelWidth: number;
  // Manual Gantt row order, as task IDs
  ganttTaskOrder: string[];

  // Per-connection line styles, keyed "sourceId->targetId"
  edgeStyleOverrides: EdgeStyleOverrides;

  // Create a note for every new task and link the task to it
  createCompanionNotes: boolean;
  companionNoteFolder: string;

  // Language setting
  language: Language;

  // Filter presets
  filterPresets: FilterPreset[];
}

export const DEFAULT_SETTINGS: TasksMapSettings = {
  showPriorities: true,
  showTags: true,
  showStatusCounts: true,

  layoutDirection: "Horizontal",
  edgeStyle: "Bezier",
  smoothStepRadius: 10,
  linkingStyle: "csv",

  debugVisualization: false,

  // Tag color defaults
  tagColorPalette: "rainbow",
  tagColorOverrides: {},

  ganttLabelWidth: 260,
  ganttTaskOrder: [],

  edgeStyleOverrides: {},

  createCompanionNotes: true,
  companionNoteFolder: DEFAULT_COMPANION_FOLDER,

  // Language default
  language: "en",

  // Filter presets default
  filterPresets: [],
};
