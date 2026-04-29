import { useMemo, useRef, useEffect, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";

type Props = {
  /** ISO date string (YYYY-MM-DD) or empty */
  value: string;
  onChange: (iso: string) => void;
  /** Minimum year to show in the dropdown */
  minYear?: number;
  /** Maximum year to show (defaults to current year) */
  maxYear?: number;
  placeholder?: string;
  id?: string;
};

/**
 * Custom clean DOB picker — replaces the broken react-day-picker layout from Parkview.
 * Year dropdown + Month dropdown + day grid.
 */
export function DatePicker({
  value,
  onChange,
  minYear,
  maxYear,
  placeholder = "Select date",
  id,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const todayY = now.getFullYear();
  const todayM = now.getMonth();
  const todayD = now.getDate();

  const minY = minYear ?? todayY - 100;
  const maxY = maxYear ?? todayY;

  const parsed = parseIso(value);
  const [viewYear, setViewYear] = useState<number>(parsed?.y ?? todayY - 30);
  const [viewMonth, setViewMonth] = useState<number>(parsed?.m ?? todayM);

  useEffect(() => {
    const p = parseIso(value);
    if (p) {
      setViewYear(p.y);
      setViewMonth(p.m);
    }
  }, [value]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = maxY; y >= minY; y--) out.push(y);
    return out;
  }, [minY, maxY]);

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const firstWeekday = (y: number, m: number) => new Date(y, m, 1).getDay();

  const nav = (delta: number) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setViewMonth(m);
    setViewYear(y);
  };

  const select = (day: number) => {
    const iso = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`;
    onChange(iso);
    setOpen(false);
  };

  const isFuture = (day: number) => {
    if (viewYear > todayY) return true;
    if (viewYear === todayY && viewMonth > todayM) return true;
    if (viewYear === todayY && viewMonth === todayM && day > todayD) return true;
    return false;
  };

  const selectedDisplay = parsed
    ? `${months[parsed.m]} ${parsed.d}, ${parsed.y}`
    : "";

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "field-input flex items-center justify-between text-left cursor-pointer",
          !selectedDisplay && "text-ink-muted/60"
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-brand-blue" />
          {selectedDisplay || placeholder}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute z-20 mt-1 w-[300px] rounded-xl border border-divider-muted bg-white shadow-xl p-3 animate-fadeIn"
        >
          {/* Month / Year header */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => nav(-1)}
              className="p-1.5 rounded-md hover:bg-surface-offWhite"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-1.5">
              <select
                aria-label="Month"
                value={viewMonth}
                onChange={(e) => setViewMonth(Number(e.target.value))}
                className="text-sm font-medium rounded-md border border-divider-muted bg-white px-2 py-1 focus:outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
              >
                {months.map((m, i) => (
                  <option key={m} value={i}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                aria-label="Year"
                value={viewYear}
                onChange={(e) => setViewYear(Number(e.target.value))}
                className="text-sm font-medium rounded-md border border-divider-muted bg-white px-2 py-1 focus:outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/15"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => nav(1)}
              className="p-1.5 rounded-md hover:bg-surface-offWhite"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 gap-1 mb-1 text-center text-[10px] font-semibold uppercase text-ink-muted">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i}>{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstWeekday(viewYear, viewMonth) }).map((_, i) => (
              <div key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth(viewYear, viewMonth) }).map((_, i) => {
              const day = i + 1;
              const isSelected =
                parsed &&
                parsed.y === viewYear &&
                parsed.m === viewMonth &&
                parsed.d === day;
              const disabled = isFuture(day);
              const isToday =
                viewYear === todayY && viewMonth === todayM && day === todayD;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabled}
                  onClick={() => select(day)}
                  className={cn(
                    "h-8 text-sm rounded-md transition-colors",
                    "hover:bg-brand-blue/10 focus:outline-none focus:ring-2 focus:ring-brand-blue/30",
                    isSelected &&
                      "bg-brand-navy text-white hover:bg-brand-navy font-semibold",
                    !isSelected && isToday && "text-brand-blue font-semibold",
                    disabled && "text-ink-muted/30 cursor-not-allowed hover:bg-transparent"
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  if (!iso) return null;
  const [yStr, mStr, dStr] = iso.split("-");
  const y = Number(yStr);
  const m = Number(mStr) - 1;
  const d = Number(dStr);
  if (!y || Number.isNaN(m) || !d) return null;
  return { y, m, d };
}
