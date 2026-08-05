import { useEffect, useMemo, useRef, useState } from "react";
import { MONTHS } from "../lib/constants";
import { Select } from "./ui/Input";

type Props = {
  /** ISO `YYYY-MM-DD` or empty string */
  value: string;
  onChange: (iso: string) => void;
  idBase?: string;
  /** Defaults to 2010 */
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

/**
 * Inline Month / Day / Year picker for DOB.
 *
 * Tracks each field as local state so partial selections (e.g., user picked
 * Month but hasn't picked Day or Year yet) stay visible in the UI. Only emits
 * a full ISO string upward when all three are set; emits "" if a previously
 * complete value is cleared.
 */
export function DOBPicker({ value, onChange, idBase = "dob", maxYear, minYear }: Props) {
  const yMax = maxYear ?? 2010;
  const yMin = minYear ?? yMax - 100;

  const years = useMemo(() => {
    const out: string[] = [];
    for (let y = yMax; y >= yMin; y--) out.push(String(y));
    return out;
  }, [yMax, yMin]);

  // Local state for the three fields, seeded from any incoming value.
  const initial = parseIso(value);
  const [m, setM] = useState(initial.m);
  const [d, setD] = useState(initial.d);
  const [y, setY] = useState(initial.y);

  // Sync FROM parent when the prop changes externally (e.g., user navigates
  // back, store rehydrates). Avoid clobbering local state during the same
  // emit-cycle by comparing what we last emitted to the incoming value.
  const lastEmitted = useRef<string>(value);
  useEffect(() => {
    if (value === lastEmitted.current) return;
    const p = parseIso(value);
    setM(p.m);
    setD(p.d);
    setY(p.y);
  }, [value]);

  // Whenever the local triplet changes, emit upward.
  useEffect(() => {
    let next = "";
    if (m && d && y) next = `${y}-${pad2(m)}-${pad2(d)}`;
    if (next === lastEmitted.current) return;
    lastEmitted.current = next;
    onChange(next);
    // Intentionally not depending on onChange (parent may pass a fresh fn each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m, d, y]);

  // Days available depend on selected month/year (handles leap + 30/31).
  const daysInMonth = useMemo(() => {
    if (!m) return 31;
    const yr = y ? Number(y) : 2000; // leap year fallback so Feb shows 29 if no year picked
    return new Date(yr, Number(m), 0).getDate();
  }, [m, y]);

  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
    [daysInMonth]
  );

  // Clamp helpers when month/year change so an invalid day never lingers.
  const clampDay = (nm: string, ny: string, currD: string): string => {
    if (!nm || !currD) return currD;
    const yr = ny ? Number(ny) : 2000;
    const dim = new Date(yr, Number(nm), 0).getDate();
    return Number(currD) > dim ? String(dim) : currD;
  };

  const handleMonth = (next: string) => {
    setM(next);
    setD((curr) => clampDay(next, y, curr));
  };

  const handleDay = (next: string) => setD(next);

  const handleYear = (next: string) => {
    setY(next);
    setD((curr) => clampDay(m, next, curr));
  };

  return (
    <div className="grid grid-cols-[1.6fr,1fr,1.2fr] gap-2">
      <Select
        id={`${idBase}-month`}
        placeholder="Month"
        value={m}
        onChange={(e) => handleMonth(e.target.value)}
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
        onChange={(e) => handleDay(e.target.value)}
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
        onChange={(e) => handleYear(e.target.value)}
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
