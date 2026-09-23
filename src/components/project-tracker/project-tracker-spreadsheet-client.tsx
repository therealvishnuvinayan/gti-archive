"use client";

import dynamic from "next/dynamic";

import type { ComponentProps } from "react";
import type { ProjectTrackerSpreadsheet } from "./project-tracker-spreadsheet";

const CustomProjectTracker = dynamic(
  () => import("./project-tracker-spreadsheet").then((module) => module.ProjectTrackerSpreadsheet),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full min-h-0 place-items-center bg-white text-[12px] font-[700] text-[#667269]">
        Loading spreadsheet...
      </div>
    ),
  },
);

export function ProjectTrackerSpreadsheetClient(
  props: ComponentProps<typeof ProjectTrackerSpreadsheet>,
) {
  return <CustomProjectTracker {...props} />;
}
