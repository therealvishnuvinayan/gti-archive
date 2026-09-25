"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";

import type { SpreadsheetContextTarget } from "./types/spreadsheet";
import type { SpreadsheetController } from "./hooks/use-spreadsheet";

type MenuState = { x: number; y: number; target: SpreadsheetContextTarget };

export function SpreadsheetContextMenu({
  state,
  controller,
  canEdit,
  onClose,
  onInsertRow,
  onDeleteRows,
  onInsertColumn,
  onDeleteColumns,
}: {
  state: MenuState | null;
  controller: SpreadsheetController;
  canEdit: boolean;
  onClose: () => void;
  onInsertRow: (row: number, side: "above" | "below") => void;
  onDeleteRows: (rows: number[]) => void;
  onInsertColumn: (column: number, side: "left" | "right") => void;
  onDeleteColumns: (columns: number[]) => void;
}) {
  useEffect(() => {
    if (!state) return;
    const close = () => onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose, state]);

  const position = useMemo(() => state ? {
    left: Math.max(8, Math.min(state.x, window.innerWidth - 230)),
    top: Math.max(8, Math.min(state.y, window.innerHeight - 390)),
  } : null, [state]);
  if (!state || !position || typeof document === "undefined") return null;

  const range = controller.selection;
  const target = state.target;
  const rows = Array.from({ length: range.endRow - range.startRow + 1 }, (_, index) => range.startRow + index);
  const columns = Array.from({ length: range.endColumn - range.startColumn + 1 }, (_, index) => range.startColumn + index);
  const item = (label: string, action: () => void, disabled = false) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => { action(); onClose(); }}
      className="flex h-8 w-full items-center rounded-[7px] px-3 text-left text-[12px] font-[650] text-[#3b483f] hover:bg-[#edf4ef] disabled:opacity-35"
    >{label}</button>
  );
  const separator = <div className="my-1 h-px bg-[#e4e9e4]" />;

  return createPortal(
    <div
      className="fixed z-[90] w-[220px] rounded-[12px] border border-[#dce4dd] bg-white p-1.5 shadow-[0_18px_55px_rgba(24,42,30,0.18)]"
      style={position}
      onPointerDown={(event) => event.stopPropagation()}
      role="menu"
    >
      {item("Cut", () => void controller.copy(true), !canEdit)}
      {item("Copy", () => void controller.copy())}
      {item("Paste", () => void controller.paste(), !canEdit)}
      {separator}
      {target.kind === "row" ? <>
        {item("Insert row above", () => onInsertRow(target.row, "above"), !canEdit)}
        {item("Insert row below", () => onInsertRow(target.row, "below"), !canEdit)}
        {item("Delete selected rows", () => onDeleteRows(rows), !canEdit)}
        {item("Hide selected rows", () => controller.hideRows(rows, true), !canEdit)}
        {item("Show all rows", () => controller.hideRows(Array.from({ length: controller.sheet.rowCount }, (_, index) => index), false), !canEdit)}
        {item("Resize rows…", () => {
          const value = Number(window.prompt("Row height in pixels", "28"));
          if (Number.isFinite(value)) rows.forEach((row) => controller.resizeRow(row, value));
        }, !canEdit)}
        {separator}
        {item("Clear contents", controller.clear, !canEdit)}
        {item("Clear formatting", controller.clearFormatting, !canEdit)}
        {item("Clear all", controller.clearAll, !canEdit)}
      </> : target.kind === "column" ? <>
        {item("Insert column left", () => onInsertColumn(target.column, "left"), !canEdit)}
        {item("Insert column right", () => onInsertColumn(target.column, "right"), !canEdit)}
        {item("Delete selected columns", () => onDeleteColumns(columns), !canEdit)}
        {item("Hide selected columns", () => controller.hideColumns(columns, true), !canEdit)}
        {item("Show all columns", () => controller.hideColumns(Array.from({ length: controller.sheet.columnCount }, (_, index) => index), false), !canEdit)}
        {item("Resize columns…", () => {
          const value = Number(window.prompt("Column width in pixels", "140"));
          if (Number.isFinite(value)) columns.forEach((column) => controller.resizeColumn(column, value));
        }, !canEdit)}
        {separator}
        {item("Clear contents", controller.clear, !canEdit)}
        {item("Clear formatting", controller.clearFormatting, !canEdit)}
        {item("Clear all", controller.clearAll, !canEdit)}
      </> : <>
        {item("Insert row above", () => onInsertRow(target.row, "above"), !canEdit)}
        {item("Delete row", () => onDeleteRows([target.row]), !canEdit)}
        {item("Insert column left", () => onInsertColumn(target.column, "left"), !canEdit)}
        {item("Delete column", () => onDeleteColumns([target.column]), !canEdit)}
        {separator}
        {item("Clear contents", controller.clear, !canEdit)}
        {item("Clear formatting", controller.clearFormatting, !canEdit)}
        {item("Clear all", controller.clearAll, !canEdit)}
        {item(controller.selectedCell?.comment ? "Edit note…" : "Add note…", () => {
          const value = window.prompt("Cell note", controller.selectedCell?.comment ?? "");
          if (value !== null) controller.addComment(value);
        }, !canEdit)}
        {controller.selectedCell?.comment ? item("Delete note", () => controller.addComment(undefined), !canEdit) : null}
      </>}
    </div>,
    document.body,
  );
}

export type SpreadsheetContextMenuState = MenuState;
