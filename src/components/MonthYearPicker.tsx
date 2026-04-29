import { MONTHS, YEARS } from "../lib/constants";
import { Select } from "./ui/Input";

type Props = {
  month: string;
  year: string;
  onChange: (patch: { month?: string; year?: string }) => void;
  idBase?: string;
};

/**
 * Inline Month + Year dropdowns. No calendar icon, no popovers.
 * Used for "Date Business Started" where we don't need day-precision.
 */
export function MonthYearPicker({ month, year, onChange, idBase = "started" }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Select
        id={`${idBase}-month`}
        placeholder="Month"
        value={month}
        onChange={(e) => onChange({ month: e.target.value })}
        aria-label="Month"
      >
        {MONTHS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </Select>
      <Select
        id={`${idBase}-year`}
        placeholder="Year"
        value={year}
        onChange={(e) => onChange({ year: e.target.value })}
        aria-label="Year"
      >
        {YEARS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
    </div>
  );
}
