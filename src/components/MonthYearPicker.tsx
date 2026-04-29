import { Calendar } from "lucide-react";
import { MONTHS, YEARS } from "../lib/constants";
import { Select } from "./ui/Input";

type Props = {
  month: string;
  year: string;
  onChange: (patch: { month?: string; year?: string }) => void;
  idBase?: string;
};

export function MonthYearPicker({ month, year, onChange, idBase = "started" }: Props) {
  return (
    <div className="flex items-stretch gap-2">
      <div className="flex items-center pl-3 pr-1 rounded-lg border border-divider-muted bg-white shadow-input text-ink-muted">
        <Calendar className="h-4 w-4" />
      </div>
      <Select
        id={`${idBase}-month`}
        placeholder="Month"
        value={month}
        onChange={(e) => onChange({ month: e.target.value })}
        className="flex-1"
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
        className="w-32"
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
