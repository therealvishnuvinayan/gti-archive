"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Replace, Search, X } from "lucide-react";

import { showErrorToast, showSuccessToast } from "@/lib/toast";
import type { ProjectTrackerWorkspaceRecord, TrackerCellValue } from "@/lib/project-tracker";

import { useSpreadsheet, type TrackerCellChange } from "./hooks/use-spreadsheet";
import { parseCellKey } from "./lib/coordinates";
import { downloadWorkbook } from "./lib/xlsx";
import { PRIMARY_SHEET_ID } from "./types/spreadsheet";
import { SpreadsheetContextMenu, type SpreadsheetContextMenuState } from "./spreadsheet-context-menu";
import { SpreadsheetFormulaBar } from "./spreadsheet-formula-bar";
import { SpreadsheetGrid, type SpreadsheetGridHandle } from "./spreadsheet-grid";
import { SpreadsheetTabs } from "./spreadsheet-tabs";
import { SpreadsheetToolbar } from "./spreadsheet-toolbar";

export type SpreadsheetExportRequest = { id: number; format: "xlsx" | "csv" };
export type SpreadsheetFocusRequest = { id: number; row: number; column: number };

export type ProjectTrackerSpreadsheetProps = {
  workspace: ProjectTrackerWorkspaceRecord;
  revision: number;
  exportRequest: SpreadsheetExportRequest | null;
  focusRequest: SpreadsheetFocusRequest | null;
  onActiveRowChange: (rowId: string | null) => void;
  onSelectedRowsChange: (rowIds: string[]) => void;
  onSaveCell: (rowId: string, columnId: string, value: TrackerCellValue) => void;
  onSaveCells?: (changes: TrackerCellChange[]) => void;
  onWorkbookSavingChange: (saving: boolean) => void;
  onInsertTrackerRow?: (sheetRow: number, side: "above" | "below") => void;
  onDeleteTrackerRows?: (sheetRows: number[]) => void;
  onInsertTrackerColumn?: (sheetColumn: number, side: "left" | "right") => void;
  onDeleteTrackerColumns?: (sheetColumns: number[]) => void;
  onSortTrackerRows?: (rowIds: string[]) => void;
};

function FindPanel({ query, setQuery, matchCount, currentMatch, onMove, onReplace, onReplaceAll, onClose, canEdit }: {
  query: string;
  setQuery: (query: string) => void;
  matchCount: number;
  currentMatch: number;
  onMove: (delta: number) => void;
  onReplace: (replacement: string) => void;
  onReplaceAll: (replacement: string) => void;
  onClose: () => void;
  canEdit: boolean;
}) {
  const [replacement, setReplacement] = useState("");
  return (
    <div className="absolute right-3 top-3 z-[60] w-[340px] rounded-[14px] border border-[#d8e1d9] bg-white p-3 shadow-[0_18px_55px_rgba(22,43,28,0.18)]">
      <div className="flex items-center gap-2">
        <Search className="size-4 shrink-0 text-[#50705b]" />
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onMove(event.shiftKey ? -1 : 1); if (event.key === "Escape") onClose(); }} placeholder="Find in this sheet" className="h-8 min-w-0 flex-1 rounded-[8px] border border-[#dce3dc] px-2 text-[12px] outline-none focus:border-[#82b594]" />
        <span className="shrink-0 text-[10px] font-[650] text-[#778279]">{matchCount ? `${currentMatch + 1}/${matchCount}` : "0/0"}</span>
        <button type="button" className="grid size-7 place-items-center rounded hover:bg-[#eef3ef]" onClick={() => onMove(-1)} aria-label="Previous match"><ChevronUp className="size-4" /></button>
        <button type="button" className="grid size-7 place-items-center rounded hover:bg-[#eef3ef]" onClick={() => onMove(1)} aria-label="Next match"><ChevronDown className="size-4" /></button>
        <button type="button" className="grid size-7 place-items-center rounded hover:bg-[#eef3ef]" onClick={onClose} aria-label="Close find"><X className="size-4" /></button>
      </div>
      {canEdit ? <div className="mt-2 flex items-center gap-2 border-t border-[#e6eae6] pt-2">
        <Replace className="size-4 shrink-0 text-[#6b786f]" />
        <input value={replacement} onChange={(event) => setReplacement(event.target.value)} placeholder="Replace with" className="h-8 min-w-0 flex-1 rounded-[8px] border border-[#dce3dc] px-2 text-[12px] outline-none focus:border-[#82b594]" />
        <button type="button" className="h-8 rounded-[8px] border border-[#dce3dc] px-2 text-[10px] font-[750] hover:bg-[#f1f5f1]" onClick={() => onReplace(replacement)}>Replace</button>
        <button type="button" className="h-8 rounded-[8px] bg-[#287a50] px-2 text-[10px] font-[750] text-white hover:bg-[#216943]" onClick={() => onReplaceAll(replacement)}>All</button>
      </div> : null}
    </div>
  );
}

export function Spreadsheet({
  workspace,
  revision,
  exportRequest,
  focusRequest,
  onActiveRowChange,
  onSelectedRowsChange,
  onSaveCell,
  onSaveCells,
  onWorkbookSavingChange,
  onInsertTrackerRow,
  onDeleteTrackerRows,
  onInsertTrackerColumn,
  onDeleteTrackerColumns,
  onSortTrackerRows,
}: ProjectTrackerSpreadsheetProps) {
  const controller = useSpreadsheet({
    workspace,
    revision,
    onActiveRowChange,
    onSelectedRowsChange,
    onSaveCells: onSaveCells ?? ((changes) => changes.forEach((change) => onSaveCell(change.rowId, change.columnId, change.value))),
    onWorkbookSavingChange,
    onSortTrackerRows,
  });
  const gridRef = useRef<SpreadsheetGridHandle>(null);
  const handledExportRef = useRef(0);
  const handledFocusRef = useRef(0);
  const [contextMenu, setContextMenu] = useState<SpreadsheetContextMenuState | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return [];
    return Object.entries(controller.sheet.cells).flatMap(([key, cell]) => {
      const searchable = `${cell.formula ?? ""}\n${cell.value ?? ""}\n${cell.computedValue ?? ""}`.toLocaleLowerCase();
      return searchable.includes(needle) ? [key] : [];
    });
  }, [controller.sheet.cells, query]);
  const highlightedKeys = useMemo(() => new Set(matches), [matches]);
  const activeHighlight = matches.length ? matches[matchIndex % matches.length] : null;

  useEffect(() => {
    if (!activeHighlight) return;
    const coordinate = parseCellKey(activeHighlight);
    if (!coordinate) return;
    controller.select(coordinate.row, coordinate.column);
    gridRef.current?.scrollToCell(coordinate.row, coordinate.column);
    // activeHighlight fully identifies this navigation target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHighlight]);

  useEffect(() => {
    if (!exportRequest || exportRequest.id === handledExportRef.current) return;
    handledExportRef.current = exportRequest.id;
    void downloadWorkbook(controller.workbookRef.current, exportRequest.format)
      .then(() => showSuccessToast(`Project Tracker downloaded as ${exportRequest.format.toUpperCase()}.`))
      .catch((error: unknown) => showErrorToast("Export failed", error instanceof Error ? error.message : "The workbook could not be downloaded."));
  }, [controller.workbookRef, exportRequest]);

  useEffect(() => {
    if (!focusRequest || focusRequest.id === handledFocusRef.current) return;
    handledFocusRef.current = focusRequest.id;
    controller.activateSheet(PRIMARY_SHEET_ID);
    controller.select(focusRequest.row, focusRequest.column);
    window.requestAnimationFrame(() => gridRef.current?.scrollToCell(focusRequest.row, focusRequest.column));
  }, [controller, focusRequest]);

  const isPrimary = controller.sheet.id === PRIMARY_SHEET_ID;
  const insertRow = (row: number, side: "above" | "below") => {
    if (isPrimary && row <= workspace.rows.length && onInsertTrackerRow) onInsertTrackerRow(Math.max(1, row), side);
    else controller.mutateStructure("insert-row", Math.max(isPrimary ? 1 : 0, row + (side === "below" ? 1 : 0)));
  };
  const deleteRows = (rows: number[]) => {
    const trackerRows = isPrimary ? rows.filter((row) => row > 0 && row <= workspace.rows.length) : [];
    if (trackerRows.length) onDeleteTrackerRows?.(trackerRows);
    rows.filter((row) => !trackerRows.includes(row) && (!isPrimary || row !== 0)).sort((a, b) => b - a).forEach((row) => controller.mutateStructure("delete-row", row));
  };
  const insertColumn = (column: number, side: "left" | "right") => {
    if (isPrimary && column < workspace.columns.length && onInsertTrackerColumn) onInsertTrackerColumn(column, side);
    else controller.mutateStructure("insert-column", column + (side === "right" ? 1 : 0));
  };
  const deleteColumns = (columns: number[]) => {
    const trackerColumns = isPrimary ? columns.filter((column) => column < workspace.columns.length) : [];
    if (trackerColumns.length) onDeleteTrackerColumns?.(trackerColumns);
    columns.filter((column) => !trackerColumns.includes(column)).sort((a, b) => b - a).forEach((column) => controller.mutateStructure("delete-column", column));
  };

  const moveMatch = (delta: number) => { if (matches.length) setMatchIndex((current) => (current + delta + matches.length) % matches.length); };
  const replaceCurrent = (replacement: string) => {
    if (!activeHighlight) return;
    const coordinate = parseCellKey(activeHighlight);
    if (!coordinate) return;
    const cell = controller.sheet.cells[activeHighlight];
    const original = cell?.formula ?? String(cell?.value ?? "");
    controller.commitCell(coordinate.row, coordinate.column, query ? original.replace(query, replacement) : replacement);
  };
  const replaceAll = (replacement: string) => {
    for (const key of matches) {
      const coordinate = parseCellKey(key);
      if (!coordinate) continue;
      const cell = controller.sheet.cells[key];
      const original = cell?.formula ?? String(cell?.value ?? "");
      controller.commitCell(coordinate.row, coordinate.column, query ? original.replaceAll(query, replacement) : replacement);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white">
      <SpreadsheetToolbar controller={controller} canEdit={workspace.canEdit} onFind={() => setFindOpen(true)} />
      <SpreadsheetFormulaBar
        key={`${controller.sheet.id}:${controller.selection.anchorRow}:${controller.selection.anchorColumn}:${controller.selectedInput}`}
        controller={controller}
        canEdit={workspace.canEdit}
      />
      <SpreadsheetGrid ref={gridRef} controller={controller} canEdit={workspace.canEdit} highlightedKeys={highlightedKeys} activeHighlight={activeHighlight} onFind={() => setFindOpen(true)} onContextMenu={setContextMenu} />
      <SpreadsheetTabs controller={controller} canEdit={workspace.canEdit} />
      {findOpen ? <FindPanel query={query} setQuery={(value) => { setQuery(value); setMatchIndex(0); }} matchCount={matches.length} currentMatch={matchIndex} onMove={moveMatch} onReplace={replaceCurrent} onReplaceAll={replaceAll} onClose={() => { setFindOpen(false); setQuery(""); setMatchIndex(0); gridRef.current?.focus(); }} canEdit={workspace.canEdit} /> : null}
      <SpreadsheetContextMenu state={contextMenu} controller={controller} canEdit={workspace.canEdit} onClose={() => setContextMenu(null)} onInsertRow={insertRow} onDeleteRows={deleteRows} onInsertColumn={insertColumn} onDeleteColumns={deleteColumns} />
      {controller.saveError ? <div className="pointer-events-none absolute bottom-10 right-3 z-50 rounded-full bg-[#fff0ee] px-3 py-1.5 text-[10px] font-[750] text-[#b64139] shadow">Save failed — the next edit will retry</div> : null}
    </div>
  );
}
