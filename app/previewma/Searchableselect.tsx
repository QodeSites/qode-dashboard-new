"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  label?: string;
  placeholder?: string;
  options: SelectOption[];
  value: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * Single-select searchable dropdown — same visual language as
 * MultiSelectDropdown, used for the client picker and strategy picker.
 */
export function SearchableSelect({
  label,
  placeholder = "Select...",
  options,
  value,
  onChange,
  disabled = false,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const filtered = useMemo(
    () =>
      options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.sublabel?.toLowerCase().includes(query.toLowerCase())
      ),
    [options, query]
  );

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={containerRef} className="relative">
      {label && <div className="text-sm font-medium text-card-text mb-1.5">{label}</div>}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between rounded-lg border border-logo-green/20 bg-white px-3.5 py-2.5 text-left transition-colors ${
          disabled ? "opacity-50 cursor-not-allowed" : "hover:border-logo-green/40"
        }`}
      >
        {selected ? (
          <span className="text-sm text-card-text truncate">{selected.label}</span>
        ) : (
          <span className="text-sm text-card-text-secondary/70">{placeholder}</span>
        )}
        <ChevronDown
          className={`h-4 w-4 text-card-text-secondary flex-shrink-0 ml-2 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && !disabled && (
        <div className="absolute z-30 mt-1.5 w-full rounded-lg border border-logo-green/15 bg-white shadow-lg shadow-logo-green/5 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-logo-green/10 px-3 py-2.5">
            <Search className="h-3.5 w-3.5 text-card-text-secondary flex-shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full text-sm text-card-text placeholder:text-card-text-secondary/60 outline-none bg-transparent"
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3.5 py-6 text-center text-sm text-card-text-secondary">No results found.</div>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left transition-colors ${
                      isSelected ? "bg-logo-green text-white" : "text-card-text hover:bg-primary-bg/50"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                        isSelected ? "border-white bg-white/20" : "border-logo-green/30"
                      }`}
                    >
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </span>
                    <span className="flex flex-col truncate">
                      <span className="truncate">{opt.label}</span>
                      {opt.sublabel && (
                        <span className={`text-xs ${isSelected ? "text-white/70" : "text-card-text-secondary"}`}>
                          {opt.sublabel}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}