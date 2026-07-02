"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface UnderlineTab {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

interface UnderlineTabsProps {
  tabs: UnderlineTab[];
  active: string;
  onChange: (key: string) => void;
  size?: "sm" | "md";
}

/**
 * Horizontally scrollable underline-style tab bar, matching the
 * Streamlit MA Review dashboard's tab look (red/gold underline on active).
 * Shows edge fade + arrow buttons whenever tabs overflow the available width.
 */
export function UnderlineTabs({ tabs, active, onChange, size = "md" }: UnderlineTabsProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateScrollState();
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    el.addEventListener("scroll", updateScrollState);
    window.addEventListener("resize", updateScrollState);
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length]);

  const scrollBy = (dir: 1 | -1) => {
    scrollerRef.current?.scrollBy({ left: dir * 220, behavior: "smooth" });
  };

  return (
    <div className="relative border-b border-card-text-secondary/15">
      {canScrollLeft && (
        <>
          <div className="pointer-events-none absolute left-0 top-0 bottom-2 w-8 bg-gradient-to-r from-primary-bg to-transparent z-10" />
          <button
            onClick={() => scrollBy(-1)}
            aria-label="Scroll tabs left"
            className="absolute -left-1 top-0 bottom-2 z-20 flex items-center px-0.5 text-card-text-secondary hover:text-logo-green"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </>
      )}

      <div
        ref={scrollerRef}
        className="flex gap-6 overflow-x-auto scrollbar-none"
        style={{ scrollbarWidth: "none" }}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={`flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 pb-3 pt-1 border-b-2 transition-colors ${
                size === "sm" ? "text-sm" : "text-[0.95rem]"
              } ${
                isActive
                  ? "border-button-text text-logo-green font-semibold"
                  : "border-transparent text-card-text-secondary hover:text-logo-green"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {canScrollRight && (
        <>
          <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-primary-bg to-transparent z-10" />
          <button
            onClick={() => scrollBy(1)}
            aria-label="Scroll tabs right"
            className="absolute -right-1 top-0 bottom-2 z-20 flex items-center px-0.5 text-card-text-secondary hover:text-logo-green"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}