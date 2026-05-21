"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

type ProjectSortDropdownProps = {
  activeSort: "newest" | "oldest" | "name";
  activeStatus: "ONGOING" | "ON_HOLD" | "COMPLETED";
  query: string;
};

const sortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A-Z" },
] as const;

function getSortLabel(sort: ProjectSortDropdownProps["activeSort"]) {
  return sortOptions.find((option) => option.value === sort)?.label ?? "Newest first";
}

export function ProjectSortDropdown({
  activeSort,
  activeStatus,
  query,
}: ProjectSortDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-brand bg-white px-6 text-[18px] font-semibold text-brand transition-all duration-200 hover:bg-brand-soft ${
          open ? "shadow-[0_14px_30px_rgba(34,102,70,0.14)]" : ""
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Sort
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      <div
        className={`absolute right-0 top-[calc(100%+10px)] z-20 min-w-[220px] origin-top-right rounded-[18px] border border-[#dfe6de] bg-white p-2 shadow-[0_20px_50px_rgba(23,39,28,0.12)] transition-all duration-200 ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none -translate-y-1 scale-95 opacity-0"
        }`}
        role="menu"
      >
        <div className="px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#7b857d]">
          {getSortLabel(activeSort)}
        </div>

        {sortOptions.map((option) => (
          <Link
            key={option.value}
            href={{
              pathname: "/projects",
              query: {
                ...(query ? { q: query } : {}),
                status: activeStatus,
                sort: option.value,
              },
            }}
            onClick={() => setOpen(false)}
            className={`flex items-center justify-between rounded-[14px] px-3 py-3 text-[15px] font-medium transition-colors ${
              activeSort === option.value
                ? "bg-[#f3faf4] text-brand"
                : "text-[#223026] hover:bg-[#f7faf7]"
            }`}
            role="menuitem"
          >
            <span>{option.label}</span>
            {activeSort === option.value ? <Check className="h-4 w-4" /> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
