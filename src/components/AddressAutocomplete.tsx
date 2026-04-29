import { useEffect, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { MOCK_ADDRESS_SUGGESTIONS } from "../lib/constants";

type Address = { street: string; city: string; state: string; zip: string };

type Props = {
  value: Address;
  onChange: (a: Address) => void;
  placeholder?: string;
  id?: string;
};

/**
 * Clean single-field address autocomplete for the demo.
 * Production plug: swap MOCK_ADDRESS_SUGGESTIONS for Google Places Autocomplete results.
 */
export function AddressAutocomplete({
  value,
  onChange,
  placeholder = "Start typing your address…",
  id,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(
    value.street
      ? `${value.street}, ${value.city}, ${value.state} ${value.zip}`.trim()
      : ""
  );
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const suggestions = query
    ? MOCK_ADDRESS_SUGGESTIONS.filter((s) =>
        s.full.toLowerCase().includes(query.toLowerCase())
      )
    : MOCK_ADDRESS_SUGGESTIONS;

  const pick = (s: (typeof MOCK_ADDRESS_SUGGESTIONS)[number]) => {
    setQuery(s.full);
    onChange({ street: s.street, city: s.city, state: s.state, zip: s.zip });
    setOpen(false);
  };

  const clear = () => {
    setQuery("");
    onChange({ street: "", city: "", state: "", zip: "" });
    setOpen(true);
  };

  const hasValue = Boolean(value.street);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-blue">
          <MapPin className="h-4 w-4" />
        </span>
        <input
          id={id}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="field-input pl-9 pr-10"
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear address"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-surface-offWhite text-ink-muted"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 w-full rounded-xl border border-divider-muted bg-white shadow-xl overflow-hidden animate-fadeIn"
        >
          {suggestions.map((s) => (
            <li key={s.full}>
              <button
                type="button"
                onClick={() => pick(s)}
                className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-surface-offWhite focus:bg-brand-blue/5 focus:outline-none flex items-start gap-2"
              >
                <MapPin className="h-4 w-4 mt-0.5 text-brand-blue shrink-0" />
                <span>
                  <span className="font-medium text-brand-navy">{s.street}</span>
                  <span className="block text-xs text-ink-muted mt-0.5">
                    {s.city}, {s.state} {s.zip}
                  </span>
                </span>
              </button>
            </li>
          ))}
          <li className="px-3.5 py-2 bg-surface-offWhite text-[11px] text-ink-muted border-t border-divider-soft">
            Demo suggestions. Production uses Google Places (or similar) for live results.
          </li>
        </ul>
      )}

      {hasValue && !open && (
        <p className="text-xs text-ink-muted mt-1.5">
          {value.street}, {value.city}, {value.state} {value.zip}
        </p>
      )}
    </div>
  );
}
