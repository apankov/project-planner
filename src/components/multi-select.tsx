import Select, { MultiValue } from "react-select";
import { selectProps } from "./select-styles";
import { t } from "../i18n";

interface MultiSelectProps<T extends string> {
  options: T[];
  selected: T[];
  setSelected: (selected: T[]) => void; // eslint-disable-line no-unused-vars -- prop callback parameter convention
  placeholder?: string;
}

type OptionType = { value: string; label: string };

/** The theming lives in `select-styles`, shared with the task editor's pickers. */
export default function MultiSelect<T extends string>({
  options,
  selected,
  setSelected,
  placeholder = t("multiselect.select"),
}: MultiSelectProps<T>) {
  return (
    <Select
      {...selectProps("project-planner-multi-select")}
      isMulti
      options={options.map((o) => ({ value: o, label: o }))}
      value={selected.map((o) => ({ value: o, label: o }))}
      onChange={(opts: MultiValue<OptionType>) =>
        setSelected(opts.map((o) => o.value as T))
      }
      placeholder={placeholder}
    />
  );
}
