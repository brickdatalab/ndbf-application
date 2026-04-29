import { useMemo } from "react";
import { MONTHS } from "../lib/constants";
import { Select } from "./ui/Input";

type Props = {
  /** ISO `YYYY-MM-DD` or empty string */
  value: string;
  onChange: (iso: string) => void;
  idBase?: string;
  /** Defaults to current year */
  maxYear?: number;
  /** Defaults to current year - 100 */
  minYear?: number;
};

const pad2 = (n: number | string) => String(n).padStart(2, "0");

function parseIso(v: string): { y: string; m: string; d: string } {
  if (!v) return { y: "", m: "", d: "" };
  const [y, m, d] = v.split("-");
  return { y: y || "", m: m ? String(Number(m)) : "", d: d ? String(Number(d)) : "" };
}

function buildIso(m: string, d: string, y: string) {
  if (!m || !d || !y) return "";
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

/**
 * Inline Month / Day / Year picker for DOB. Tab-friendly (three real <select>s)
 * and visually consistent with MonthYearPicker.
 */
export function DOBPicker({ value, onChange, idBase = "dob", maxYear, minYear }: Props) {
  const now = new Date();
  const yMax = maxYear ?? now.getFullYear();
  const yMin = minYear ?? yMax - 100;

  const years = useMemo(() => {
    const out: string[] = [];
    for (let y = yMax; y >= yMin; y--) out.push(String(y));
    return out;
  }, [yMax, yMin]);

  const { y, m, d } = parseIso(value);

  // Days available depend on selected month/year (handles leap years + 30/31).
  const daysInMonth = useMemo(() => {
    if (!m || !y) return 31;
    return new Date(Number(y), Number(m), 0).getDate();
  }, [m, y]);

  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
    [daysInMonth]
  );

  const setMonth = (next: string) => {
    // If the previously selected day is now out of range (e.g., Feb 30), clamp it.
    let nextDay = d;
    if (next && y) {
      const dim = new Date(Number(y), Number(next), 0).getDate();
      if (Number(d) > dim) nextDay = String(dim);
    }
    onChange(buildIso(next, nextDay, y));
  };

  const setDay = (next: string) => onChange(buildIso(m, next, y));

  const setYear = (next: string) => {
    let nextDay = d;
    if (m && next) {
      const dim = new Date(Number(next), Number(m), 0).getDate();
      if (Number(d) > dim) nextDay = String(dim);
    }
    onChange(buildIso(m, nextDay, next));
  };

  return (
    <div className="grid grid-cols-[1.6fr,1fr,1.2fr] gap-2">
      <Select
        id={`${idBase}-month`}
        placeholder="Month"
        value={m}
        onChange={(e) => setMonth(e.target.value)}
        aria-label="Birth month"
      >
        {MONTHS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
      <Select
        id={`${idBase}-day`}
        placeholder="Day"
        value={d}
        onChange={(e) => setDay(e.target.value)}
        aria-label="Birth day"
      >
        {days.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </Select>
      <Select
        id={`${idBase}-year`}
        placeholder="Year"
        value={y}
        onChange={(e) => setYear(e.target.value)}
        aria-label="Birth year"
      >
        {years.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </Select>
    </div>
  );
}
