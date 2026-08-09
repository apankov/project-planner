import { Language } from "../i18n";
import { FilterState } from "./filter-state";
import { TagColorPalette, TagColorOverrides } from "../lib/tag-color-manager";
import { EdgeStyleOverrides } from "../lib/edge-style-manager";
import { GanttMilestone } from "../lib/gantt-milestones";
import { DEFAULT_COMPANION_FOLDER } from "../lib/companion-note";
import { DEFAULT_RATE_NOTE_PATH } from "../lib/rate-book-note";

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
  // Measure Gantt durations in working days and keep bars off weekends
  ganttSkipWeekends: boolean;
  // Named days marked across the Gantt timeline
  ganttMilestones: GanttMilestone[];
  // Pick out the chain of tasks that decides the finish date, in both views
  showCriticalPath: boolean;
  // Flag schedule risks on Gantt rows and count them under the chart
  ganttShowWarnings: boolean;

  // Finance: hides the view, command, ribbon and menu entries when off
  financeEnabled: boolean;
  // Note holding the grade-to-rate and person-to-grade tables
  financeRateNotePath: string;
  // Hours a person works in a day when a task does not say otherwise
  financeDefaultHoursPerDay: number;
  // ISO currency code, formatted with Intl.NumberFormat
  financeCurrency: string;
  // Count tasks whose bar dates were suggested rather than written
  financeIncludeInferred: boolean;

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
  ganttSkipWeekends: false,
  ganttMilestones: [],
  showCriticalPath: false,
  ganttShowWarnings: true,

  financeEnabled: false,
  financeRateNotePath: DEFAULT_RATE_NOTE_PATH,
  financeDefaultHoursPerDay: 8,
  financeCurrency: "USD",
  financeIncludeInferred: true,

  edgeStyleOverrides: {},

  createCompanionNotes: true,
  companionNoteFolder: DEFAULT_COMPANION_FOLDER,

  // Language default
  language: "en",

  // Filter presets default
  filterPresets: [],
};
