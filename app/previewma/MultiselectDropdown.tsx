"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

interface MultiSelectDropdownProps {
  label: string;
  placeholder?: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}

/**
 * Searchable multi-select with "Select all", checkbox rows, and a
 * dark-green highlighted active/selected row — an enhanced version of
 * the plain Streamlit multiselect widget.
 */
export function MultiSelectDropdown({
  label,
  placeholder = "Choose options",
  options,
  selected,
  onChange,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
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
    () => options.filter((o) => o.toLowerCase().includes(query.toLowerCase())),
    [options, query]
  );

  const allSelected = options.length > 0 && options.every((o) => selected.includes(o));

  const toggleOption = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt]);
  };

  const toggleSelectAll = () => {
    onChange(allSelected ? [] : [...options]);
  };

  const removeChip = (opt: string) => {
    onChange(selected.filter((s) => s !== opt));
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="text-sm font-medium text-card-text mb-1.5">{label}</div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        className="w-full flex items-center justify-between rounded-lg border border-logo-green/20 bg-white px-3.5 py-2.5 text-left hover:border-logo-green/40 transition-colors cursor-pointer"
      >
        {selected.length === 0 ? (
          <span className="text-sm text-card-text-secondary/70">{placeholder}</span>
        ) : (
          <span className="flex flex-wrap gap-1.5 py-0.5">
            {selected.slice(0, 3).map((s) => (
              <span
                key={s}
                className="inline-flex items-center gap-1 rounded-md bg-primary-bg px-2 py-0.5 text-xs font-medium text-card-text"
              >
                {s.length > 28 ? s.slice(0, 26) + "…" : s}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeChip(s);
                  }}
                  className="text-card-text-secondary hover:text-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {selected.length > 3 && (
              <span className="inline-flex items-center rounded-md bg-primary-bg px-2 py-0.5 text-xs font-medium text-card-text-secondary">
                +{selected.length - 3} more
              </span>
            )}
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 text-card-text-secondary flex-shrink-0 ml-2 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </div>

      {open && (
        <div className="absolute z-30 mt-1.5 w-full rounded-lg border border-logo-green/15 bg-white shadow-lg shadow-logo-green/5 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-logo-green/10 px-3 py-2.5">
            <Search className="h-3.5 w-3.5 text-card-text-secondary flex-shrink-0" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tags…"
              className="w-full text-sm text-card-text placeholder:text-card-text-secondary/60 outline-none bg-transparent"
            />
            {selected.length > 0 && (
              <span className="flex-shrink-0 rounded-full bg-logo-green/10 px-2 py-0.5 text-[0.65rem] font-semibold text-logo-green">
                {selected.length} selected
              </span>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            <button
              onClick={toggleSelectAll}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-card-text hover:bg-primary-bg/50 transition-colors border-b border-logo-green/5"
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border ${
                  allSelected ? "bg-logo-green border-logo-green" : "border-logo-green/30"
                }`}
              >
                {allSelected && <Check className="h-3 w-3 text-white" />}
              </span>
              <span className="font-medium">Select all</span>
            </button>

            {filtered.length === 0 ? (
              <div className="px-3.5 py-6 text-center text-sm text-card-text-secondary">No tags found.</div>
            ) : (
              filtered.map((opt) => {
                const isSelected = selected.includes(opt);
                return (
                  <button
                    key={opt}
                    onClick={() => toggleOption(opt)}
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
                    <span className="truncate">{opt}</span>
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