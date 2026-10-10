"use client";

import { useSyncExternalStore } from "react";
import { LayoutGrid, List } from "lucide-react";

export type ProjectsLayout = "grid" | "list";

// Reuse the existing user preference across roles and project types.
const STORAGE_KEY = "gti:user-projects:view";
const CHANGE_EVENT = "gti:user-projects:view-change";
let fallbackLayout: ProjectsLayout = "grid";
let storageUnavailable = false;

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function getSnapshot(): ProjectsLayout {
  if (storageUnavailable) return fallbackLayout;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    storageUnavailable = true;
    return fallbackLayout;
  }
}

function changeLayout(layout: ProjectsLayout) {
  fallbackLayout = layout;
  try {
    window.localStorage.setItem(STORAGE_KEY, layout);
    storageUnavailable = false;
  } catch {
    storageUnavailable = true;
    // The switch still works when browser storage is unavailable.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useProjectsLayout() {
  const layout = useSyncExternalStore(subscribe, getSnapshot, () => "grid" as const);
  return [layout, changeLayout] as const;
}

export function ProjectLayoutToggle({ layout, onChange }: {
  layout: ProjectsLayout;
  onChange: (layout: ProjectsLayout) => void;
}) {
  return (
    <div role="group" aria-label="Project layout" className="inline-flex w-fit shrink-0 rounded-[14px] border border-[#d6ded7] bg-white p-1 shadow-[0_8px_22px_rgba(18,34,25,0.035)]">
      {(["grid", "list"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-label={`${option === "grid" ? "Grid" : "List"} view`}
          aria-pressed={layout === option}
          onClick={() => onChange(option)}
          className={`flex h-10 items-center gap-2 rounded-[10px] px-4 text-[13px] font-[700] transition ${layout === option ? "bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] text-white shadow-[0_8px_18px_rgba(31,112,70,0.2)]" : "text-[#445047] hover:bg-[#f1f5f1]"}`}
        >
          {option === "grid" ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
          {option === "grid" ? "Grid" : "List"}
        </button>
      ))}
    </div>
  );
}
