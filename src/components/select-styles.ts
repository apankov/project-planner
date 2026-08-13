import { CSSObjectWithLabel } from "react-select";

/**
 * One react-select theme, in Obsidian's own colours.
 *
 * react-select ships its own styles through emotion, which land as generated
 * classes with higher specificity than anything in `global.css` — so a picker
 * styled only by `classNamePrefix` comes out white-on-white in a dark theme
 * however carefully the stylesheet is written. Overriding through the `styles`
 * prop is the one approach that reliably wins, which is why the graph's
 * multi-select has always done it this way.
 *
 * Every value is a theme variable rather than a colour, so these follow whatever
 * theme the vault is using instead of guessing at one.
 *
 * The state arguments are typed by the flags each callback actually reads,
 * rather than as `StylesConfig`. Naming the full type would pin down whether the
 * select is multi, and these are shared by pickers that are and are not — which
 * would then lose the narrowing every `onChange` depends on.
 */
interface FocusState {
  isFocused: boolean;
}

interface OptionState {
  isFocused: boolean;
  isSelected: boolean;
}

export const obsidianSelectStyles = {
  control: (base: CSSObjectWithLabel, state: FocusState) => ({
    ...base,
    minHeight: 30,
    background: "var(--background-primary)",
    borderColor: state.isFocused
      ? "var(--interactive-accent)"
      : "var(--background-modifier-border)",
    boxShadow: state.isFocused ? "0 0 0 1px var(--interactive-accent)" : "none",
    color: "var(--text-normal)",
    "&:hover": { borderColor: "var(--interactive-accent)" },
  }),
  valueContainer: (base: CSSObjectWithLabel) => ({
    ...base,
    padding: "0 6px",
  }),
  input: (base: CSSObjectWithLabel) => ({
    ...base,
    color: "var(--text-normal)",
    margin: 0,
  }),
  singleValue: (base: CSSObjectWithLabel) => ({
    ...base,
    color: "var(--text-normal)",
  }),
  placeholder: (base: CSSObjectWithLabel) => ({
    ...base,
    color: "var(--text-faint)",
  }),

  // The menu is portalled out of the modal, so it has to sit above it
  menuPortal: (base: CSSObjectWithLabel) => ({ ...base, zIndex: 9999 }),
  menu: (base: CSSObjectWithLabel) => ({
    ...base,
    background: "var(--background-secondary)",
    border: "1px solid var(--background-modifier-border)",
    boxShadow: "var(--shadow-s)",
  }),
  menuList: (base: CSSObjectWithLabel) => ({ ...base, padding: 4 }),
  option: (base: CSSObjectWithLabel, state: OptionState) => ({
    ...base,
    borderRadius: "var(--radius-s, 4px)",
    background: state.isSelected
      ? "var(--interactive-accent)"
      : state.isFocused
        ? "var(--background-modifier-hover)"
        : "transparent",
    color: state.isSelected ? "var(--text-on-accent)" : "var(--text-normal)",
    ":active": { background: "var(--background-modifier-active-hover)" },
  }),
  noOptionsMessage: (base: CSSObjectWithLabel) => ({
    ...base,
    color: "var(--text-muted)",
  }),

  multiValue: (base: CSSObjectWithLabel) => ({
    ...base,
    background: "var(--background-modifier-active-hover)",
    borderRadius: "var(--radius-s, 4px)",
  }),
  multiValueLabel: (base: CSSObjectWithLabel) => ({
    ...base,
    color: "var(--text-normal)",
  }),
  multiValueRemove: (base: CSSObjectWithLabel) => ({
    ...base,
    color: "var(--text-faint)",
    ":hover": {
      background: "var(--background-modifier-error)",
      color: "var(--text-on-accent)",
    },
  }),

  indicatorSeparator: (base: CSSObjectWithLabel) => ({
    ...base,
    background: "var(--background-modifier-border)",
  }),
  dropdownIndicator: (base: CSSObjectWithLabel) => ({
    ...base,
    padding: 4,
    color: "var(--text-faint)",
    ":hover": { color: "var(--text-normal)" },
  }),
  clearIndicator: (base: CSSObjectWithLabel) => ({
    ...base,
    padding: 4,
    color: "var(--text-faint)",
    ":hover": { color: "var(--text-normal)" },
  }),
};

/**
 * The props every picker in the plugin passes.
 *
 * The menu is portalled to the document body because the task editor scrolls: a
 * menu rendered inline is clipped by the modal's own `overflow-y`, so opening a
 * picker near the bottom of the dialog showed two rows and a scrollbar.
 * `activeDocument` rather than `document`, so it lands in the right window when
 * Obsidian has a popout open.
 */
export function selectProps(prefix: string) {
  return {
    classNamePrefix: prefix,
    styles: obsidianSelectStyles,
    menuPortalTarget: activeDocument.body,
    menuPlacement: "auto" as const,
  };
}
