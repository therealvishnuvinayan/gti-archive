"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { saveProjectTrackerWorkbookAction } from "@/app/(dashboard)/project-tracker/actions";
import { showErrorToast } from "@/lib/toast";
import type { ProjectTrackerWorkspaceRecord, TrackerCellValue } from "@/lib/project-tracker";

import type {
  ConditionalFormatRule,
  SpreadsheetCell,
  SpreadsheetCellStyle,
  SpreadsheetRange,
  SpreadsheetScalar,
  SpreadsheetSelection,
  SpreadsheetSheet,
  SpreadsheetWorkbook,
} from "../types/spreadsheet";
import { PRIMARY_SHEET_ID } from "../types/spreadsheet";
import {
  cellKey,
  clampSelection,
  forEachCellInRange,
  normalizeRange,
  parseCellKey,
  rangeContains,
  rangesOverlap,
  selectionRange,
} from "../lib/coordinates";
import { parseClipboardText, serializeClipboardMatrix } from "../lib/clipboard";
import { formulaCellValue, recalculateWorkbook, translateFormula } from "../lib/formulas";
import { applyCellPatch, reverseCellPatch, type SpreadsheetCellPatch } from "../lib/history";
import { canMergeRange, findMergeAt } from "../lib/ranges";
import {
  activeSheet,
  applyStyleToRange,
  buildProjectTrackerWorkbook,
  deleteSheetColumn,
  deleteSheetRow,
  emptySheet,
  insertSheetColumn,
  insertSheetRow,
  isCellEmpty,
  updateSheet,
} from "../lib/workbook";

type HistoryCommand =
  | { kind: "cells"; sheetId: string; before: SpreadsheetCellPatch; after: SpreadsheetCellPatch }
  | { kind: "sheet"; sheetId: string; before: SpreadsheetSheet; after: SpreadsheetSheet; syncCellKeys?: string[] }
  | { kind: "workbook"; before: SpreadsheetWorkbook; after: SpreadsheetWorkbook };

type InternalClipboard = {
  matrix: SpreadsheetCell[][];
  cut: boolean;
  source: SpreadsheetRange;
  sheetId: string;
};

export type TrackerCellChange = {
  rowId: string;
  columnId: string;
  value: TrackerCellValue;
};

type UseSpreadsheetOptions = {
  workspace: ProjectTrackerWorkspaceRecord;
  revision: number;
  onActiveRowChange: (rowId: string | null) => void;
  onSelectedRowsChange: (rowIds: string[]) => void;
  onSaveCells: (changes: TrackerCellChange[]) => void;
  onWorkbookSavingChange: (saving: boolean) => void;
  onSortTrackerRows?: (rowIds: string[]) => void;
};

function cloneCell(cell: SpreadsheetCell | undefined) {
  return cell ? structuredClone(cell) : undefined;
}

function parsedInput(input: string): Pick<SpreadsheetCell, "value" | "formula"> {
  if (input.trim().startsWith("=")) return { formula: input.trim(), value: null };
  if (input === "") return { value: null, formula: undefined };
  if (/^(true|false)$/i.test(input.trim())) return { value: input.trim().toLocaleLowerCase() === "true", formula: undefined };
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(input.trim())) return { value: Number(input), formula: undefined };
  return { value: input, formula: undefined };
}

function scalarForTracker(value: SpreadsheetScalar | string | undefined): TrackerCellValue {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function compareValues(left: SpreadsheetScalar | string | undefined, right: SpreadsheetScalar | string | undefined) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  const leftDate = typeof left === "string" ? Date.parse(left) : Number.NaN;
  const rightDate = typeof right === "string" ? Date.parse(right) : Number.NaN;
  if (!Number.isNaN(leftDate) && !Number.isNaN(rightDate)) return leftDate - rightDate;
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

export function useSpreadsheet({
  workspace,
  revision,
  onActiveRowChange,
  onSelectedRowsChange,
  onSaveCells,
  onWorkbookSavingChange,
  onSortTrackerRows,
}: UseSpreadsheetOptions) {
  const initial = useMemo(
    () => recalculateWorkbook(buildProjectTrackerWorkbook(workspace, workspace.spreadsheetState)).workbook,
    // The first render is the only intended consumer of this memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [workbook, setWorkbook] = useState<SpreadsheetWorkbook>(initial);
  const [selection, setSelection] = useState<SpreadsheetSelection>({
    anchorRow: 0,
    anchorColumn: 0,
    startRow: 0,
    startColumn: 0,
    endRow: 0,
    endColumn: 0,
    kind: "cell",
  });
  const [editingCell, setEditingCell] = useState<{ row: number; column: number; replace?: string } | null>(null);
  const [saveError, setSaveError] = useState(false);
  const workbookRef = useRef(workbook);
  const workspaceRef = useRef(workspace);
  const undoRef = useRef<HistoryCommand[]>([]);
  const redoRef = useRef<HistoryCommand[]>([]);
  const clipboardRef = useRef<InternalClipboard | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const pendingSaveRef = useRef<SpreadsheetWorkbook | null>(null);
  const previousRevisionRef = useRef(revision);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

  const sheet = activeSheet(workbook);
  const structureSignature = useMemo(() => JSON.stringify({
    rows: workspace.rows.map((row) => row.id),
    columns: workspace.columns.map((column) => [column.id, column.name, column.width, column.hidden, column.frozen]),
  }), [workspace.columns, workspace.rows]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  const flushSave = useCallback(async () => {
    if (saveInFlightRef.current || !pendingSaveRef.current || !workspaceRef.current.canEdit) return;
    saveInFlightRef.current = true;
    onWorkbookSavingChange(true);
    try {
      while (pendingSaveRef.current && workspaceRef.current.canEdit) {
        const target = pendingSaveRef.current;
        pendingSaveRef.current = null;
        setSaveError(false);
        try {
          const result = await saveProjectTrackerWorkbookAction({ workbook: target });
          if ("error" in result) throw new Error(result.error);
        } catch (error) {
          setSaveError(true);
          showErrorToast(
            "Workbook could not be saved",
            error instanceof Error ? error.message : "Try the change again.",
          );
        }
      }
    } finally {
      saveInFlightRef.current = false;
      onWorkbookSavingChange(false);
    }
  }, [onWorkbookSavingChange]);

  const queueSave = useCallback((next: SpreadsheetWorkbook) => {
    workbookRef.current = next;
    pendingSaveRef.current = next;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    onWorkbookSavingChange(true);
    saveTimerRef.current = setTimeout(() => void flushSave(), 500);
  }, [flushSave, onWorkbookSavingChange]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  useEffect(() => {
    const hasNewPersistedWorkbook = previousRevisionRef.current !== revision;
    const stored = hasNewPersistedWorkbook ? workspace.spreadsheetState : workbookRef.current;
    previousRevisionRef.current = revision;
    const next = recalculateWorkbook(buildProjectTrackerWorkbook(workspace, stored)).workbook;
    workbookRef.current = next;
    setWorkbook(next);
  }, [revision, structureSignature, workspace]);

  const commitWorkbook = useCallback((next: SpreadsheetWorkbook, command?: HistoryCommand, save = true) => {
    const calculated = recalculateWorkbook(next).workbook;
    workbookRef.current = calculated;
    setWorkbook(calculated);
    if (command) {
      undoRef.current.push(command);
      if (undoRef.current.length > 120) undoRef.current.shift();
      redoRef.current = [];
      setHistoryState({ canUndo: true, canRedo: false });
    }
    if (save) queueSave(calculated);
    return calculated;
  }, [queueSave]);

  const select = useCallback((row: number, column: number, options?: {
    extend?: boolean;
    kind?: SpreadsheetSelection["kind"];
  }) => {
    const currentSheet = activeSheet(workbookRef.current);
    const next = clampSelection(options?.extend
      ? {
          ...selection,
          endRow: row,
          endColumn: column,
          kind: options.kind ?? selection.kind,
        }
      : {
          anchorRow: row,
          anchorColumn: column,
          startRow: row,
          startColumn: column,
          endRow: row,
          endColumn: column,
          kind: options?.kind ?? "cell",
        }, currentSheet.rowCount, currentSheet.columnCount);
    if (next.kind === "row") {
      next.startColumn = 0;
      next.endColumn = currentSheet.columnCount - 1;
    } else if (next.kind === "column") {
      next.startRow = 0;
      next.endRow = currentSheet.rowCount - 1;
    } else if (next.kind === "all") {
      next.startRow = 0;
      next.endRow = currentSheet.rowCount - 1;
      next.startColumn = 0;
      next.endColumn = currentSheet.columnCount - 1;
    }
    setSelection(next);
    setEditingCell(null);
    if (currentSheet.id === PRIMARY_SHEET_ID) {
      const range = normalizeRange(next);
      const rowIds = workspaceRef.current.rows
        .slice(Math.max(0, range.startRow - 1), Math.max(0, range.endRow))
        .map((rowItem) => rowItem.id);
      onActiveRowChange(next.kind === "cell" || next.kind === "row" ? rowIds[0] ?? null : null);
      onSelectedRowsChange(next.kind === "row" ? rowIds : []);
    } else {
      onActiveRowChange(null);
      onSelectedRowsChange([]);
    }
  }, [onActiveRowChange, onSelectedRowsChange, selection]);

  const trackerChangesForPatch = useCallback((
    changedSheet: SpreadsheetSheet,
    keys: string[],
  ) => {
    if (changedSheet.id !== PRIMARY_SHEET_ID) return [];
    const currentWorkspace = workspaceRef.current;
    return keys.flatMap((key) => {
      const coordinate = parseCellKey(key);
      if (!coordinate || coordinate.row <= 0) return [];
      const row = currentWorkspace.rows[coordinate.row - 1];
      const column = currentWorkspace.columns[coordinate.column];
      if (!row || !column) return [];
      return [{
        rowId: row.id,
        columnId: column.id,
        value: scalarForTracker(formulaCellValue(changedSheet.cells[key])),
      }];
    });
  }, []);

  const changeCells = useCallback((updates: Record<string, SpreadsheetCell | undefined>) => {
    const current = workbookRef.current;
    const currentSheet = activeSheet(current);
    const before = reverseCellPatch(currentSheet, updates);
    const after = Object.fromEntries(Object.entries(updates).map(([key, cell]) => [key, cloneCell(cell)]));
    const nextSheet = applyCellPatch(currentSheet, after);
    const next = commitWorkbook(
      updateSheet(current, currentSheet.id, () => nextSheet),
      { kind: "cells", sheetId: currentSheet.id, before, after },
    );
    onSaveCells(trackerChangesForPatch(activeSheet(next), Object.keys(updates)));
  }, [commitWorkbook, onSaveCells, trackerChangesForPatch]);

  const commitCell = useCallback((row: number, column: number, input: string) => {
    const currentSheet = activeSheet(workbookRef.current);
    if (!workspaceRef.current.canEdit) return;
    if (currentSheet.id === PRIMARY_SHEET_ID && row === 0 && column < workspaceRef.current.columns.length) return;
    const key = cellKey(row, column);
    const current = currentSheet.cells[key] ?? {};
    changeCells({ [key]: { ...current, ...parsedInput(input), computedValue: undefined } });
    setEditingCell(null);
  }, [changeCells]);

  const applyHistory = useCallback((command: HistoryCommand, direction: "undo" | "redo") => {
    const current = workbookRef.current;
    const side = direction === "undo" ? "before" : "after";
    let next: SpreadsheetWorkbook;
    if (command.kind === "cells") {
      next = updateSheet(current, command.sheetId, (target) => applyCellPatch(target, command[side]));
    } else if (command.kind === "sheet") {
      next = updateSheet(current, command.sheetId, () => structuredClone(command[side]));
    } else {
      next = structuredClone(command[side]);
    }
    const calculated = commitWorkbook(next);
    if (command.kind === "cells") {
      onSaveCells(trackerChangesForPatch(
        calculated.sheets.find((item) => item.id === command.sheetId)!,
        Object.keys(command[side]),
      ));
    } else if (command.kind === "sheet" && command.syncCellKeys?.length) {
      onSaveCells(trackerChangesForPatch(
        calculated.sheets.find((item) => item.id === command.sheetId)!,
        command.syncCellKeys,
      ));
    }
  }, [commitWorkbook, onSaveCells, trackerChangesForPatch]);

  const undo = useCallback(() => {
    const command = undoRef.current.pop();
    if (!command) return;
    redoRef.current.push(command);
    applyHistory(command, "undo");
    setHistoryState({ canUndo: undoRef.current.length > 0, canRedo: true });
  }, [applyHistory]);

  const redo = useCallback(() => {
    const command = redoRef.current.pop();
    if (!command) return;
    undoRef.current.push(command);
    applyHistory(command, "redo");
    setHistoryState({ canUndo: true, canRedo: redoRef.current.length > 0 });
  }, [applyHistory]);

  const selectedCell = sheet.cells[cellKey(selection.anchorRow, selection.anchorColumn)];
  const selectedInput = selectedCell?.formula ?? (
    selectedCell?.value === null || selectedCell?.value === undefined ? "" : String(selectedCell.value)
  );

  const clearSelection = useCallback((mode: "contents" | "formatting" | "all") => {
    if (!workspaceRef.current.canEdit) return;
    const current = workbookRef.current;
    const currentSheet = activeSheet(current);
    const range = selectionRange(selection);
    const cells = { ...currentSheet.cells };
    const changedCellKeys: string[] = [];

    for (const [key, cell] of Object.entries(currentSheet.cells)) {
      const coordinate = parseCellKey(key);
      if (!coordinate || !rangeContains(range, coordinate.row, coordinate.column)) continue;
      const protectedHeader =
        currentSheet.id === PRIMARY_SHEET_ID &&
        coordinate.row === 0 &&
        coordinate.column < workspaceRef.current.columns.length;
      if (protectedHeader) continue;

      if (mode === "contents") {
        const nextCell = {
          ...cell,
          value: null,
          formula: undefined,
          computedValue: undefined,
        };
        if (isCellEmpty(nextCell)) delete cells[key];
        else cells[key] = nextCell;
      } else if (mode === "formatting") {
        const nextCell = { ...cell, style: undefined };
        if (isCellEmpty(nextCell)) delete cells[key];
        else cells[key] = nextCell;
      } else {
        delete cells[key];
      }
      changedCellKeys.push(key);
    }

    let rowMetadata = currentSheet.rowMetadata;
    let columnMetadata = currentSheet.columnMetadata;
    if (mode !== "contents" && (selection.kind === "row" || selection.kind === "all")) {
      rowMetadata = { ...currentSheet.rowMetadata };
      for (const [key, metadata] of Object.entries(rowMetadata)) {
        const row = Number(key);
        if (!Number.isInteger(row) || row < range.startRow || row > range.endRow) continue;
        const remaining = { ...metadata };
        delete remaining.style;
        if (Object.keys(remaining).length) rowMetadata[key] = remaining;
        else delete rowMetadata[key];
      }
    }
    if (mode !== "contents" && (selection.kind === "column" || selection.kind === "all")) {
      columnMetadata = { ...currentSheet.columnMetadata };
      for (const [key, metadata] of Object.entries(columnMetadata)) {
        const column = Number(key);
        if (!Number.isInteger(column) || column < range.startColumn || column > range.endColumn) continue;
        const remaining = { ...metadata };
        delete remaining.style;
        if (Object.keys(remaining).length) columnMetadata[key] = remaining;
        else delete columnMetadata[key];
      }
    }

    const nextSheet: SpreadsheetSheet = {
      ...currentSheet,
      cells,
      rowMetadata,
      columnMetadata,
      conditionalFormats: mode === "contents"
        ? currentSheet.conditionalFormats
        : currentSheet.conditionalFormats.filter((rule) => !rangesOverlap(rule.range, range)),
      merges: mode === "all"
        ? currentSheet.merges.filter((mergeRange) => !rangesOverlap(mergeRange, range))
        : currentSheet.merges,
      ...(mode === "all" && currentSheet.filter && rangesOverlap(currentSheet.filter.range, range)
        ? { filter: undefined }
        : {}),
    };
    commitWorkbook(
      updateSheet(current, currentSheet.id, () => nextSheet),
      {
        kind: "sheet",
        sheetId: currentSheet.id,
        before: currentSheet,
        after: nextSheet,
        ...(mode === "contents" || mode === "all" ? { syncCellKeys: changedCellKeys } : {}),
      },
    );
    if (mode === "contents" || mode === "all") {
      onSaveCells(trackerChangesForPatch(nextSheet, changedCellKeys));
    }
  }, [commitWorkbook, onSaveCells, selection, trackerChangesForPatch]);

  const clear = useCallback(() => clearSelection("contents"), [clearSelection]);
  const clearFormatting = useCallback(() => clearSelection("formatting"), [clearSelection]);
  const clearAll = useCallback(() => clearSelection("all"), [clearSelection]);

  const copy = useCallback(async (cut = false) => {
    const currentSheet = activeSheet(workbookRef.current);
    const range = normalizeRange(selection);
    const matrix: SpreadsheetCell[][] = [];
    const values: SpreadsheetScalar[][] = [];
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      const cellRow: SpreadsheetCell[] = [];
      const valueRow: SpreadsheetScalar[] = [];
      for (let column = range.startColumn; column <= range.endColumn; column += 1) {
        const cell = currentSheet.cells[cellKey(row, column)] ?? {};
        cellRow.push(structuredClone(cell));
        valueRow.push(scalarForTracker(formulaCellValue(cell)) as SpreadsheetScalar);
      }
      matrix.push(cellRow);
      values.push(valueRow);
    }
    clipboardRef.current = { matrix, cut, source: range, sheetId: currentSheet.id };
    try {
      await navigator.clipboard.writeText(serializeClipboardMatrix(values));
    } catch {
      // The internal clipboard remains available when browser permission is denied.
    }
  }, [selection]);

  const pasteMatrix = useCallback((matrix: SpreadsheetCell[][], fromInternal = false) => {
    if (!workspaceRef.current.canEdit || !matrix.length) return;
    const currentSheet = activeSheet(workbookRef.current);
    const updates: Record<string, SpreadsheetCell | undefined> = {};
    matrix.forEach((sourceRow, rowOffset) => sourceRow.forEach((sourceCell, columnOffset) => {
      const row = selection.anchorRow + rowOffset;
      const column = selection.anchorColumn + columnOffset;
      if (row >= currentSheet.rowCount || column >= currentSheet.columnCount) return;
      if (currentSheet.id === PRIMARY_SHEET_ID && row === 0 && column < workspaceRef.current.columns.length) return;
      const translated = fromInternal && sourceCell.formula
        ? translateFormula(
            sourceCell.formula,
            row - (clipboardRef.current?.source.startRow ?? row),
            column - (clipboardRef.current?.source.startColumn ?? column),
          )
        : sourceCell.formula;
      updates[cellKey(row, column)] = {
        ...(currentSheet.cells[cellKey(row, column)] ?? {}),
        ...structuredClone(sourceCell),
        formula: translated,
        computedValue: undefined,
      };
    }));
    const internal = clipboardRef.current;
    if (fromInternal && internal?.cut && internal.sheetId === currentSheet.id) {
      forEachCellInRange(internal.source, (row, column) => {
        const key = cellKey(row, column);
        const current = currentSheet.cells[key];
        updates[key] = current ? { ...current, value: null, formula: undefined, computedValue: undefined } : undefined;
      });
      clipboardRef.current = { ...internal, cut: false };
    }
    changeCells(updates);
  }, [changeCells, selection.anchorColumn, selection.anchorRow]);

  const paste = useCallback(async (text?: string) => {
    const internal = clipboardRef.current;
    if (text === undefined && internal) {
      pasteMatrix(internal.matrix, true);
      return;
    }
    let clipboardText = text;
    if (clipboardText === undefined) {
      try {
        clipboardText = await navigator.clipboard.readText();
      } catch {
        return;
      }
    }
    pasteMatrix(parseClipboardText(clipboardText).map((row) => row.map((value) => ({ value }))), false);
  }, [pasteMatrix]);

  const format = useCallback((style: SpreadsheetCellStyle) => {
    if (!workspaceRef.current.canEdit) return;
    const current = workbookRef.current;
    const currentSheet = activeSheet(current);
    const nextSheet = applyStyleToRange(currentSheet, selectionRange(selection), style, selection.kind);
    commitWorkbook(
      updateSheet(current, currentSheet.id, () => nextSheet),
      { kind: "sheet", sheetId: currentSheet.id, before: currentSheet, after: nextSheet },
    );
  }, [commitWorkbook, selection]);

  const setBorders = useCallback((mode: "all" | "outer" | "inner" | "top" | "bottom" | "left" | "right" | "none") => {
    const currentSheet = activeSheet(workbookRef.current);
    const range = normalizeRange(selection);
    const updates: Record<string, SpreadsheetCell> = {};
    const border = { style: "solid" as const, color: "#879188" };
    forEachCellInRange(range, (row, column) => {
      const key = cellKey(row, column);
      const cell = currentSheet.cells[key] ?? {};
      const borders = mode === "none" ? {} : { ...cell.style?.borders };
      if (mode === "all" || mode === "inner") Object.assign(borders, { top: border, right: border, bottom: border, left: border });
      if (mode === "outer" || mode === "top") if (row === range.startRow) borders.top = border;
      if (mode === "outer" || mode === "bottom") if (row === range.endRow) borders.bottom = border;
      if (mode === "outer" || mode === "left") if (column === range.startColumn) borders.left = border;
      if (mode === "outer" || mode === "right") if (column === range.endColumn) borders.right = border;
      updates[key] = { ...cell, style: { ...cell.style, borders } };
    });
    changeCells(updates);
  }, [changeCells, selection]);

  const merge = useCallback(() => {
    const current = workbookRef.current;
    const currentSheet = activeSheet(current);
    const range = normalizeRange(selection);
    let nextSheet = currentSheet;
    const existing = findMergeAt(currentSheet.merges, selection.anchorRow, selection.anchorColumn);
    if (existing) {
      nextSheet = { ...currentSheet, merges: currentSheet.merges.filter((item) => item !== existing) };
    } else if (canMergeRange(currentSheet.merges, range)) {
      nextSheet = { ...currentSheet, merges: [...currentSheet.merges, range] };
    } else return;
    commitWorkbook(
      updateSheet(current, currentSheet.id, () => nextSheet),
      { kind: "sheet", sheetId: currentSheet.id, before: currentSheet, after: nextSheet },
    );
  }, [commitWorkbook, selection]);

  const resizeRow = useCallback((row: number, height: number) => {
    const current = workbookRef.current;
    const currentSheet = activeSheet(current);
    const nextSheet = {
      ...currentSheet,
      rowMetadata: {
        ...currentSheet.rowMetadata,
        [row]: { ...currentSheet.rowMetadata[String(row)], height: Math.max(18, Math.min(240, Math.round(height))) },
      },
    };
    commitWorkbook(updateSheet(current, currentSheet.id, () => nextSheet), {
      kind: "sheet", sheetId: currentSheet.id, before: currentSheet, after: nextSheet,
    });
  }, [commitWorkbook]);

  const resizeColumn = useCallback((column: number, width: number) => {
    const current = workbookRef.current;
    const currentSheet = activeSheet(current);
    const nextSheet = {
      ...currentSheet,
      columnMetadata: {
        ...currentSheet.columnMetadata,
        [column]: { ...currentSheet.columnMetadata[String(column)], width: Math.max(48, Math.min(600, Math.round(width))) },
      },
    };
    commitWorkbook(updateSheet(current, currentSheet.id, () => nextSheet), {
      kind: "sheet", sheetId: currentSheet.id, before: currentSheet, after: nextSheet,
    });
  }, [commitWorkbook]);

  const hideRows = useCallback((rows: number[], hidden: boolean) => {
    const current = workbookRef.current;
    const currentSheet = activeSheet(current);
    const rowMetadata = { ...currentSheet.rowMetadata };
    rows.forEach((row) => {
      const current = rowMetadata[String(row)] ?? {};
      if (hidden) rowMetadata[String(row)] = { ...current, hidden: true };
      else {
        const visible = { ...current };
        delete visible.hidden;
        if (Object.keys(visible).length) rowMetadata[String(row)] = visible;
        else delete rowMetadata[String(row)];
      }
    });
    const nextSheet = { ...currentSheet, rowMetadata };
    commitWorkbook(updateSheet(current, currentSheet.id, () => nextSheet), {
      kind: "sheet", sheetId: currentSheet.id, before: currentSheet, after: nextSheet,
    });
  }, [commitWorkbook]);

  const hideColumns = useCallback((columns: number[], hidden: boolean) => {
    const current = workbookRef.current;
    const currentSheet = activeSheet(current);
    const columnMetadata = { ...currentSheet.columnMetadata };
    columns.forEach((column) => {
      const current = columnMetadata[String(column)] ?? {};
      if (hidden) columnMetadata[String(column)] = { ...current, hidden: true };
      else {
        const visible = { ...current };
        delete visible.hidden;
        if (Object.keys(visible).length) columnMetadata[String(column)] = visible;
        else delete columnMetadata[String(column)];
      }
    });
    const nextSheet = { ...currentSheet, columnMetadata };
    commitWorkbook(updateSheet(current, currentSheet.id, () => nextSheet), {
      kind: "sheet", sheetId: currentSheet.id, before: currentSheet, after: nextSheet,
    });
  }, [commitWorkbook]);

  const mutateStructure = useCallback((operation: "insert-row" | "delete-row" | "insert-column" | "delete-column", index: number) => {
    const current = workbookRef.current;
    const currentSheet = activeSheet(current);
    const nextSheet = operation === "insert-row" ? insertSheetRow(currentSheet, index)
      : operation === "delete-row" ? deleteSheetRow(currentSheet, index)
        : operation === "insert-column" ? insertSheetColumn(currentSheet, index)
          : deleteSheetColumn(currentSheet, index);
    commitWorkbook(updateSheet(current, currentSheet.id, () => nextSheet), {
      kind: "sheet", sheetId: currentSheet.id, before: currentSheet, after: nextSheet,
    });
  }, [commitWorkbook]);

  const sort = useCallback((direction: "asc" | "desc") => {
    const current = workbookRef.current;
    const currentSheet = activeSheet(current);
    const range = normalizeRange(selection);
    const startRow = currentSheet.id === PRIMARY_SHEET_ID ? Math.max(1, range.startRow) : range.startRow;
    const endRow = currentSheet.id === PRIMARY_SHEET_ID
      ? Math.min(range.endRow, workspaceRef.current.rows.length)
      : range.endRow;
    const rows = Array.from({ length: Math.max(0, endRow - startRow + 1) }, (_, index) => startRow + index);
    rows.sort((left, right) => direction === "asc"
      ? compareValues(formulaCellValue(currentSheet.cells[cellKey(left, selection.anchorColumn)]), formulaCellValue(currentSheet.cells[cellKey(right, selection.anchorColumn)]))
      : compareValues(formulaCellValue(currentSheet.cells[cellKey(right, selection.anchorColumn)]), formulaCellValue(currentSheet.cells[cellKey(left, selection.anchorColumn)])));
    if (currentSheet.id === PRIMARY_SHEET_ID && rows.every((row) => Boolean(workspaceRef.current.rows[row - 1]))) {
      onSortTrackerRows?.(rows.map((row) => workspaceRef.current.rows[row - 1].id));
      return;
    }
    const cells = { ...currentSheet.cells };
    const snapshots = rows.map((row) => Array.from({ length: range.endColumn - range.startColumn + 1 }, (_, offset) =>
      cloneCell(currentSheet.cells[cellKey(row, range.startColumn + offset)])));
    const destinationRows = [...rows].sort((a, b) => a - b);
    destinationRows.forEach((row, rowIndex) => snapshots[rowIndex].forEach((cell, columnOffset) => {
      const key = cellKey(row, range.startColumn + columnOffset);
      if (cell) cells[key] = cell;
      else delete cells[key];
    }));
    const nextSheet = { ...currentSheet, cells };
    commitWorkbook(updateSheet(current, currentSheet.id, () => nextSheet), {
      kind: "sheet", sheetId: currentSheet.id, before: currentSheet, after: nextSheet,
    });
  }, [commitWorkbook, onSortTrackerRows, selection]);

  const toggleFilter = useCallback(() => {
    const current = workbookRef.current;
    const currentSheet = activeSheet(current);
    const nextSheet = { ...currentSheet, filter: currentSheet.filter ? undefined : {
      range: normalizeRange(selection), hiddenRows: [], criteria: {},
    } };
    commitWorkbook(updateSheet(current, currentSheet.id, () => nextSheet), {
      kind: "sheet", sheetId: currentSheet.id, before: currentSheet, after: nextSheet,
    });
  }, [commitWorkbook, selection]);

  const applyFilter = useCallback((column: number, allowedValues: string[]) => {
    const current = workbookRef.current;
    const currentSheet = activeSheet(current);
    if (!currentSheet.filter) return;
    const criteria: Record<string, string[]> = { ...currentSheet.filter.criteria, [column]: allowedValues };
    const hiddenRows: number[] = [];
    const { range } = currentSheet.filter;
    for (let row = range.startRow + 1; row <= range.endRow; row += 1) {
      const hidden = Object.entries(criteria).some(([columnKey, allowed]) => {
        if (!allowed.length) return false;
        return !allowed.includes(String(formulaCellValue(currentSheet.cells[cellKey(row, Number(columnKey))]) ?? ""));
      });
      if (hidden) hiddenRows.push(row);
    }
    const nextSheet = { ...currentSheet, filter: { ...currentSheet.filter, criteria, hiddenRows } };
    commitWorkbook(updateSheet(current, currentSheet.id, () => nextSheet), {
      kind: "sheet", sheetId: currentSheet.id, before: currentSheet, after: nextSheet,
    });
  }, [commitWorkbook]);

  const freeze = useCallback((rows: number, columns: number) => {
    const current = workbookRef.current;
    const currentSheet = activeSheet(current);
    const nextSheet = { ...currentSheet, frozenRows: rows, frozenColumns: columns };
    commitWorkbook(updateSheet(current, currentSheet.id, () => nextSheet), {
      kind: "sheet", sheetId: currentSheet.id, before: currentSheet, after: nextSheet,
    });
  }, [commitWorkbook]);

  const addComment = useCallback((comment: string | undefined) => {
    const currentSheet = activeSheet(workbookRef.current);
    const key = cellKey(selection.anchorRow, selection.anchorColumn);
    changeCells({ [key]: { ...currentSheet.cells[key], comment: comment?.trim() || undefined } });
  }, [changeCells, selection.anchorColumn, selection.anchorRow]);

  const setValidation = useCallback((values: string[]) => {
    const currentSheet = activeSheet(workbookRef.current);
    const updates: Record<string, SpreadsheetCell> = {};
    forEachCellInRange(selectionRange(selection), (row, column) => {
      const key = cellKey(row, column);
      updates[key] = {
        ...currentSheet.cells[key],
        validation: values.length ? { type: "list", values, allowBlank: true } : undefined,
      };
    });
    changeCells(updates);
  }, [changeCells, selection]);

  const addConditionalFormat = useCallback((rule: Omit<ConditionalFormatRule, "id" | "range">) => {
    const current = workbookRef.current;
    const currentSheet = activeSheet(current);
    const nextSheet = {
      ...currentSheet,
      conditionalFormats: [...currentSheet.conditionalFormats, {
        ...rule,
        id: crypto.randomUUID(),
        range: selectionRange(selection),
      }],
    };
    commitWorkbook(updateSheet(current, currentSheet.id, () => nextSheet), {
      kind: "sheet", sheetId: currentSheet.id, before: currentSheet, after: nextSheet,
    });
  }, [commitWorkbook, selection]);

  const addSheet = useCallback(() => {
    const current = workbookRef.current;
    const names = new Set(current.sheets.map((item) => item.name.toLocaleLowerCase()));
    let index = current.sheets.length + 1;
    while (names.has(`sheet${index}`)) index += 1;
    const created = emptySheet(`Sheet${index}`);
    const next = { ...current, activeSheetId: created.id, sheets: [...current.sheets, created] };
    commitWorkbook(next, { kind: "workbook", before: current, after: next });
    setSelection((value) => ({ ...value, anchorRow: 0, anchorColumn: 0, startRow: 0, endRow: 0, startColumn: 0, endColumn: 0, kind: "cell" }));
  }, [commitWorkbook]);

  const activateSheet = useCallback((sheetId: string) => {
    const current = workbookRef.current;
    if (!current.sheets.some((item) => item.id === sheetId)) return;
    const next = { ...current, activeSheetId: sheetId };
    workbookRef.current = next;
    setWorkbook(next);
    queueSave(next);
    setSelection({ anchorRow: 0, anchorColumn: 0, startRow: 0, startColumn: 0, endRow: 0, endColumn: 0, kind: "cell" });
    onActiveRowChange(null);
    onSelectedRowsChange([]);
  }, [onActiveRowChange, onSelectedRowsChange, queueSave]);

  const renameSheet = useCallback((sheetId: string, name: string) => {
    const trimmed = name.trim().slice(0, 31);
    const current = workbookRef.current;
    if (!trimmed || current.sheets.some((item) => item.id !== sheetId && item.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) return false;
    const next = updateSheet(current, sheetId, (item) => ({ ...item, name: trimmed }));
    commitWorkbook(next, { kind: "workbook", before: current, after: next });
    return true;
  }, [commitWorkbook]);

  const duplicateSheet = useCallback((sheetId: string) => {
    const current = workbookRef.current;
    const source = current.sheets.find((item) => item.id === sheetId);
    if (!source) return;
    const duplicate = structuredClone(source);
    duplicate.id = crypto.randomUUID();
    duplicate.name = `${source.name} copy`.slice(0, 31);
    const next = { ...current, activeSheetId: duplicate.id, sheets: [...current.sheets, duplicate] };
    commitWorkbook(next, { kind: "workbook", before: current, after: next });
  }, [commitWorkbook]);

  const deleteSheet = useCallback((sheetId: string) => {
    const current = workbookRef.current;
    if (current.sheets.length <= 1 || sheetId === PRIMARY_SHEET_ID) return false;
    const index = current.sheets.findIndex((item) => item.id === sheetId);
    const sheets = current.sheets.filter((item) => item.id !== sheetId);
    const next = { ...current, sheets, activeSheetId: current.activeSheetId === sheetId ? sheets[Math.max(0, index - 1)].id : current.activeSheetId };
    commitWorkbook(next, { kind: "workbook", before: current, after: next });
    return true;
  }, [commitWorkbook]);

  const fillTo = useCallback((targetRow: number, targetColumn: number) => {
    const currentSheet = activeSheet(workbookRef.current);
    const source = normalizeRange(selection);
    const target: SpreadsheetRange = {
      startRow: Math.min(source.startRow, targetRow),
      startColumn: Math.min(source.startColumn, targetColumn),
      endRow: Math.max(source.endRow, targetRow),
      endColumn: Math.max(source.endColumn, targetColumn),
    };
    const updates: Record<string, SpreadsheetCell> = {};
    const verticalSeries = source.startColumn === source.endColumn && source.endRow > source.startRow
      ? Array.from({ length: source.endRow - source.startRow + 1 }, (_, index) =>
          formulaCellValue(currentSheet.cells[cellKey(source.startRow + index, source.startColumn)]))
      : [];
    const horizontalSeries = source.startRow === source.endRow && source.endColumn > source.startColumn
      ? Array.from({ length: source.endColumn - source.startColumn + 1 }, (_, index) =>
          formulaCellValue(currentSheet.cells[cellKey(source.startRow, source.startColumn + index)]))
      : [];
    const verticalStep = verticalSeries.length >= 2 && verticalSeries.every((value) => typeof value === "number")
      ? (verticalSeries.at(-1) as number) - (verticalSeries.at(-2) as number)
      : null;
    const horizontalStep = horizontalSeries.length >= 2 && horizontalSeries.every((value) => typeof value === "number")
      ? (horizontalSeries.at(-1) as number) - (horizontalSeries.at(-2) as number)
      : null;
    forEachCellInRange(target, (row, column) => {
      if (row >= source.startRow && row <= source.endRow && column >= source.startColumn && column <= source.endColumn) return;
      const sourceRow = source.startRow + ((row - source.startRow) % (source.endRow - source.startRow + 1));
      const sourceColumn = source.startColumn + ((column - source.startColumn) % (source.endColumn - source.startColumn + 1));
      const cell = structuredClone(currentSheet.cells[cellKey(sourceRow, sourceColumn)] ?? {});
      if (cell.formula) cell.formula = translateFormula(cell.formula, row - sourceRow, column - sourceColumn);
      else if (verticalStep !== null && column === source.startColumn) {
        const first = verticalSeries[0] as number;
        cell.value = first + verticalStep * (row - source.startRow);
      } else if (horizontalStep !== null && row === source.startRow) {
        const first = horizontalSeries[0] as number;
        cell.value = first + horizontalStep * (column - source.startColumn);
      }
      updates[cellKey(row, column)] = cell;
    });
    if (Object.keys(updates).length) changeCells(updates);
    setSelection((value) => ({ ...value, ...target, endRow: target.endRow, endColumn: target.endColumn }));
  }, [changeCells, selection]);

  const move = useCallback((rowDelta: number, columnDelta: number, extend = false) => {
    const targetRow = extend ? selection.endRow + rowDelta : selection.anchorRow + rowDelta;
    const targetColumn = extend ? selection.endColumn + columnDelta : selection.anchorColumn + columnDelta;
    select(targetRow, targetColumn, { extend, kind: "cell" });
  }, [select, selection]);

  return {
    workbook,
    sheet,
    selection,
    selectedCell,
    selectedInput,
    editingCell,
    setEditingCell,
    select,
    move,
    commitCell,
    clear,
    clearFormatting,
    clearAll,
    copy,
    paste,
    undo,
    redo,
    canUndo: historyState.canUndo,
    canRedo: historyState.canRedo,
    format,
    setBorders,
    merge,
    resizeRow,
    resizeColumn,
    hideRows,
    hideColumns,
    mutateStructure,
    sort,
    toggleFilter,
    applyFilter,
    freeze,
    addComment,
    setValidation,
    addConditionalFormat,
    addSheet,
    activateSheet,
    renameSheet,
    duplicateSheet,
    deleteSheet,
    fillTo,
    saveError,
    workbookRef,
  };
}

export type SpreadsheetController = ReturnType<typeof useSpreadsheet>;
