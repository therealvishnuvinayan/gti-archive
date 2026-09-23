"use client";

import { useState } from "react";

import { rangeLabel, selectionRange } from "./lib/coordinates";
import type { SpreadsheetController } from "./hooks/use-spreadsheet";

export function SpreadsheetFormulaBar({ controller, canEdit }: {
  controller: SpreadsheetController;
  canEdit: boolean;
}) {
  const [value, setValue] = useState(controller.selectedInput);

  const commit = () => {
    if (!canEdit) return;
    controller.commitCell(controller.selection.anchorRow, controller.selection.anchorColumn, value);
  };

  return (
    <div className="flex h-9 shrink-0 items-stretch border-b border-[#dfe5df] bg-white text-[12px]">
      <div className="flex w-[112px] shrink-0 items-center border-r border-[#dfe5df] px-3 font-[700] text-[#38463c]" aria-label="Name box">
        {rangeLabel(selectionRange(controller.selection))}
      </div>
      <div className="grid w-10 shrink-0 place-items-center border-r border-[#dfe5df] font-serif text-[15px] italic text-[#54705d]" aria-hidden="true">fx</div>
      <input
        value={value}
        readOnly={!canEdit}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
            controller.move(1, 0);
          } else if (event.key === "Escape") {
            setValue(controller.selectedInput);
            event.currentTarget.blur();
          }
        }}
        className="min-w-0 flex-1 bg-white px-3 font-mono text-[12px] text-[#27332b] outline-none focus:bg-[#fbfdfb]"
        aria-label="Formula or cell value"
        spellCheck={false}
      />
    </div>
  );
}
