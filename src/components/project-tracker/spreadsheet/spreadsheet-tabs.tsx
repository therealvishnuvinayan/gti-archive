"use client";

import { Copy, Plus, Trash2 } from "lucide-react";

import type { SpreadsheetController } from "./hooks/use-spreadsheet";
import { PRIMARY_SHEET_ID } from "./types/spreadsheet";

export function SpreadsheetTabs({ controller, canEdit }: {
  controller: SpreadsheetController;
  canEdit: boolean;
}) {
  return (
    <div className="flex h-9 shrink-0 items-stretch border-t border-[#dfe5df] bg-[#f6f8f6]">
      {canEdit ? (
        <button type="button" className="grid w-10 shrink-0 place-items-center border-r border-[#dfe5df] text-[#45614f] hover:bg-[#eaf2ec]" onClick={controller.addSheet} aria-label="Add worksheet" title="Add worksheet">
          <Plus className="size-4" />
        </button>
      ) : null}
      <div className="no-scrollbar flex min-w-0 flex-1 overflow-x-auto">
        {controller.workbook.sheets.map((sheet) => {
          const active = sheet.id === controller.workbook.activeSheetId;
          return (
            <div key={sheet.id} className={`group flex shrink-0 items-center border-r border-[#dfe5df] ${active ? "bg-white text-[#1c7047]" : "text-[#5f6b63]"}`}>
              <button
                type="button"
                onClick={() => controller.activateSheet(sheet.id)}
                onDoubleClick={() => {
                  if (!canEdit || sheet.id === PRIMARY_SHEET_ID) return;
                  const name = window.prompt("Worksheet name", sheet.name);
                  if (name) controller.renameSheet(sheet.id, name);
                }}
                className={`h-full min-w-[92px] px-4 text-[11px] font-[750] ${active ? "border-b-2 border-[#2d8053]" : "hover:bg-[#eef3ef]"}`}
              >
                {sheet.name}
              </button>
              {canEdit && active ? (
                <span className="flex pr-1">
                  <button type="button" className="grid size-6 place-items-center rounded text-[#768078] hover:bg-[#e7eee8]" onClick={() => controller.duplicateSheet(sheet.id)} title="Duplicate sheet" aria-label="Duplicate sheet"><Copy className="size-3" /></button>
                  {sheet.id !== PRIMARY_SHEET_ID && controller.workbook.sheets.length > 1 ? <button type="button" className="grid size-6 place-items-center rounded text-[#a45650] hover:bg-[#f8e8e7]" onClick={() => controller.deleteSheet(sheet.id)} title="Delete sheet" aria-label="Delete sheet"><Trash2 className="size-3" /></button> : null}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

