"use client";

import { transformFortuneToExcel } from "@corbe30/fortune-excel";
import { Workbook, type WorkbookInstance } from "@fortune-sheet/react";
import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { saveProjectTrackerWorkbookAction } from "@/app/(dashboard)/project-tracker/actions";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import type {
  ProjectTrackerSpreadsheetSheet,
  ProjectTrackerWorkspaceRecord,
  TrackerCellValue,
} from "@/lib/project-tracker";

type WorkbookData = ComponentProps<typeof Workbook>["data"];
type FortuneCell = {
  v?: string | number | boolean;
  m?: string | number;
  f?: string;
  ct?: { fa?: string; t?: string; s?: unknown };
  bg?: string;
  fc?: string;
  bl?: number;
  vt?: number;
  ht?: number;
  tb?: string;
  [key: string]: unknown;
};
type FortuneCellData = { r: number; c: number; v: FortuneCell | null };

export type SpreadsheetExportRequest = {
  id: number;
  format: "xlsx" | "csv";
};

export type SpreadsheetFocusRequest = {
  id: number;
  row: number;
  column: number;
};

type ProjectTrackerSpreadsheetProps = {
  workspace: ProjectTrackerWorkspaceRecord;
  revision: number;
  exportRequest: SpreadsheetExportRequest | null;
  focusRequest: SpreadsheetFocusRequest | null;
  onActiveRowChange: (rowId: string | null) => void;
  onSelectedRowsChange: (rowIds: string[]) => void;
  onSaveCell: (rowId: string, columnId: string, value: TrackerCellValue) => void;
  onWorkbookSavingChange: (saving: boolean) => void;
};

const PRIMARY_SHEET_ID = "project-tracker";
export const PROJECT_TRACKER_SHEET_ROWS = 50;
export const PROJECT_TRACKER_SHEET_COLUMNS = 26;
const XLSX_FILE_TYPE = "xlsx" as NonNullable<Parameters<typeof transformFortuneToExcel>[1]>;
const CSV_FILE_TYPE = "csv" as NonNullable<Parameters<typeof transformFortuneToExcel>[1]>;
const TOOLBAR_ITEMS = [
  "undo",
  "redo",
  "format-painter",
  "clear-format",
  "|",
  "currency-format",
  "percentage-format",
  "number-decrease",
  "number-increase",
  "format",
  "|",
  "font",
  "|",
  "font-size",
  "|",
  "bold",
  "italic",
  "strike-through",
  "underline",
  "|",
  "font-color",
  "background",
  "border",
  "merge-cell",
  "|",
  "horizontal-align",
  "vertical-align",
  "text-wrap",
  "text-rotation",
  "|",
  "freeze",
  "conditionFormat",
  "link",
  "image",
  "comment",
  "quick-formula",
  "dataVerification",
  "locationCondition",
  "screenshot",
  "search",
];
const CELL_CONTEXT_MENU = [
  "copy",
  "paste",
  "|",
  "clear",
  "image",
  "link",
  "data",
  "cell-format",
];
const HEADER_CONTEXT_MENU = [
  "copy",
  "paste",
  "|",
  "hide-row",
  "set-row-height",
  "set-column-width",
  "|",
  "clear",
];

function displayValue(value: TrackerCellValue) {
  if (Array.isArray(value)) return value.join(", ");
  return value;
}

function storedCells(sheet: ProjectTrackerSpreadsheetSheet | undefined) {
  const celldata = sheet?.celldata;
  if (Array.isArray(celldata)) {
    return celldata.filter(
      (cell): cell is FortuneCellData =>
        Boolean(cell) && typeof cell === "object" && "r" in cell && "c" in cell,
    );
  }

  const data = sheet?.data;
  if (!Array.isArray(data)) return [];
  const cells: FortuneCellData[] = [];
  data.forEach((row, r) => {
    if (!Array.isArray(row)) return;
    row.forEach((cell, c) => {
      if (cell && typeof cell === "object" && !Array.isArray(cell)) {
        cells.push({ r, c, v: cell as FortuneCell });
      }
    });
  });
  return cells;
}

function normalizeStoredSheet(sheet: ProjectTrackerSpreadsheetSheet, index: number) {
  const normalized = { ...sheet } as Record<string, unknown>;
  normalized.id = typeof sheet.id === "string" ? sheet.id : `tracker-sheet-${index + 1}`;
  normalized.name = typeof sheet.name === "string" ? sheet.name : `Sheet ${index + 1}`;
  normalized.order = typeof sheet.order === "number" ? sheet.order : index;
  normalized.status = index === 0 ? 1 : (typeof sheet.status === "number" ? sheet.status : 0);
  normalized.celldata = storedCells(sheet);
  delete normalized.data;
  return normalized;
}

function buildWorkbook(
  workspace: ProjectTrackerWorkspaceRecord,
  stored: ProjectTrackerSpreadsheetSheet[],
): WorkbookData {
  const storedPrimary = stored.find((sheet) => sheet.id === PRIMARY_SHEET_ID) ?? stored[0];
  const storedCellMap = new Map(
    storedCells(storedPrimary).map((cell) => [`${cell.r}:${cell.c}`, cell.v ?? {}]),
  );
  const celldata: FortuneCellData[] = [];

  workspace.columns.forEach((column, columnIndex) => {
    const previous = storedCellMap.get(`0:${columnIndex}`) ?? {};
    celldata.push({
      r: 0,
      c: columnIndex,
      v: {
        ...previous,
        v: column.name,
        m: column.name,
        bg: typeof previous.bg === "string" ? previous.bg : "#1F6F4A",
        fc: typeof previous.fc === "string" ? previous.fc : "#FFFFFF",
        bl: 1,
        vt: 0,
        tb: "2",
      },
    });
  });

  workspace.rows.forEach((row, rowIndex) => {
    workspace.columns.forEach((column, columnIndex) => {
      const previous = storedCellMap.get(`${rowIndex + 1}:${columnIndex}`) ?? {};
      const value = displayValue(row.cells[column.id]?.value ?? null);
      const formattedValue = typeof value === "boolean" ? String(value) : value;
      const hasFormula = typeof previous.f === "string" && previous.f.trim().startsWith("=");
      if (value === null && !hasFormula && !Object.keys(previous).length) return;
      celldata.push({
        r: rowIndex + 1,
        c: columnIndex,
        v: {
          ...previous,
          ...(hasFormula ? {} : { v: value ?? "", m: formattedValue ?? "" }),
        },
      });
    });
  });

  // Rows and columns outside the structured Project Tracker area behave like
  // normal spreadsheet space. Keep their values, formulas, and formatting so
  // a fill color or note in (for example) B7 survives a refresh even when the
  // database currently contains only three linked tracker rows.
  const populatedCoordinates = new Set(celldata.map((cell) => `${cell.r}:${cell.c}`));
  for (const cell of storedCells(storedPrimary)) {
    const coordinate = `${cell.r}:${cell.c}`;
    if (populatedCoordinates.has(coordinate) || !cell.v) continue;
    celldata.push({ r: cell.r, c: cell.c, v: { ...cell.v } });
  }

  const previousConfig =
    storedPrimary?.config && typeof storedPrimary.config === "object" && !Array.isArray(storedPrimary.config)
      ? storedPrimary.config as Record<string, unknown>
      : {};
  const previousColumnLengths =
    previousConfig.columnlen && typeof previousConfig.columnlen === "object" && !Array.isArray(previousConfig.columnlen)
      ? previousConfig.columnlen as Record<string, number>
      : {};
  const columnlen = Object.fromEntries(
    workspace.columns.map((column, index) => [index, previousColumnLengths[index] ?? column.width]),
  );
  const colhidden = Object.fromEntries(
    workspace.columns.flatMap((column, index) => column.hidden ? [[index, 0]] : []),
  );
  const frozenColumns = workspace.columns.findLastIndex((column) => column.frozen) + 1;
  const defaultFrozen = frozenColumns > 0
    ? {
        type: "rangeBoth" as const,
        range: { row_focus: 0, column_focus: frozenColumns - 1 },
      }
    : {
        type: "row" as const,
        range: { row_focus: 0, column_focus: 0 },
      };

  const dataVerification = Object.fromEntries(
    workspace.columns.flatMap((column, columnIndex) => {
      const options = column.options.length
        ? column.options
        : column.type === "BOOLEAN" || column.type === "CHECKBOX"
          ? ["Yes", "No"]
          : [];
      if (!options.length) return [];
      return workspace.rows.map((_, rowIndex) => [
        `${rowIndex + 1}_${columnIndex}`,
        {
          type: "dropdown",
          type2: null,
          value1: options.join(","),
          value2: "",
          checked: false,
          remote: false,
          prohibitInput: true,
          hintShow: true,
          hintValue: `Choose a ${column.name.toLocaleLowerCase()} value`,
        },
      ]);
    }),
  );

  const primary = {
    ...normalizeStoredSheet(storedPrimary ?? {}, 0),
    id: PRIMARY_SHEET_ID,
    name: workspace.name,
    order: 0,
    status: 1,
    // Keep a familiar spreadsheet-sized canvas even when the structured tracker
    // currently has only a few records. Tracker-backed cells are still limited
    // to the saved rows and columns so blank spreadsheet space cannot create
    // disconnected project data.
    row: Math.max(PROJECT_TRACKER_SHEET_ROWS, workspace.rows.length + 1),
    column: Math.max(PROJECT_TRACKER_SHEET_COLUMNS, workspace.columns.length),
    defaultRowHeight: 28,
    defaultColWidth: 140,
    config: {
      ...previousConfig,
      columnlen,
      colhidden,
    },
    frozen:
      storedPrimary?.frozen && typeof storedPrimary.frozen === "object"
        ? storedPrimary.frozen
        : defaultFrozen,
    dataVerification: {
      ...(storedPrimary?.dataVerification && typeof storedPrimary.dataVerification === "object"
        ? storedPrimary.dataVerification as Record<string, unknown>
        : {}),
      ...dataVerification,
    },
    celldata,
  };

  const secondary = stored
    .filter((sheet) => sheet !== storedPrimary && sheet.id !== PRIMARY_SHEET_ID)
    .map((sheet, index) => ({ ...normalizeStoredSheet(sheet, index + 1), order: index + 1, status: 0 }));

  return [primary, ...secondary] as WorkbookData;
}

function serializeSheets(data: WorkbookData): ProjectTrackerSpreadsheetSheet[] {
  return data.map((sheet) => {
    const record = { ...sheet } as Record<string, unknown>;
    const matrix = sheet.data;
    if (Array.isArray(matrix)) {
      const celldata: FortuneCellData[] = [];
      matrix.forEach((row, r) => {
        if (!Array.isArray(row)) return;
        row.forEach((cell, c) => {
          if (cell) celldata.push({ r, c, v: cell as FortuneCell });
        });
      });
      record.celldata = celldata;
    }
    delete record.data;
    return record;
  });
}

function trackerValueFromCell(value: unknown): TrackerCellValue {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? (value as { v?: unknown }).v
    : value;
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") return raw;
  return String(raw);
}

export function ProjectTrackerSpreadsheet({
  workspace,
  revision,
  exportRequest,
  focusRequest,
  onActiveRowChange,
  onSelectedRowsChange,
  onSaveCell,
  onWorkbookSavingChange,
}: ProjectTrackerSpreadsheetProps) {
  const workbookRef = useRef<WorkbookInstance | null>(null);
  const workspaceRef = useRef(workspace);
  const activeSheetIdRef = useRef(PRIMARY_SHEET_ID);
  const latestSheetsRef = useRef<ProjectTrackerSpreadsheetSheet[]>(workspace.spreadsheetSheets);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledExportRef = useRef(0);
  const handledFocusRef = useRef(0);
  const initialChangeRef = useRef(true);
  const callbacksRef = useRef({
    onActiveRowChange,
    onSelectedRowsChange,
    onSaveCell,
    onWorkbookSavingChange,
  });
  const [workbookKey, setWorkbookKey] = useState(0);
  const [sheets, setSheets] = useState<WorkbookData>(() =>
    buildWorkbook(workspace, workspace.spreadsheetSheets),
  );

  const structureSignature = useMemo(
    () => JSON.stringify({
      rows: workspace.rows.map((row) => row.id),
      columns: workspace.columns.map((column) => ({
        id: column.id,
        name: column.name,
        width: column.width,
        hidden: column.hidden,
        frozen: column.frozen,
      })),
    }),
    [workspace.columns, workspace.rows],
  );

  useEffect(() => {
    workspaceRef.current = workspace;
    callbacksRef.current = {
      onActiveRowChange,
      onSelectedRowsChange,
      onSaveCell,
      onWorkbookSavingChange,
    };
  }, [onActiveRowChange, onSaveCell, onSelectedRowsChange, onWorkbookSavingChange, workspace]);

  useEffect(() => {
    const next = buildWorkbook(workspaceRef.current, latestSheetsRef.current);
    setSheets(next);
    setWorkbookKey((key) => key + 1);
    initialChangeRef.current = true;
  }, [revision, structureSignature]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  useEffect(() => {
    if (!exportRequest || exportRequest.id === handledExportRef.current) return;
    handledExportRef.current = exportRequest.id;
    const fileType = exportRequest.format === "xlsx" ? XLSX_FILE_TYPE : CSV_FILE_TYPE;
    void transformFortuneToExcel(workbookRef, fileType, true)
      .then(() => showSuccessToast(`Project Tracker downloaded as ${exportRequest.format.toUpperCase()}.`))
      .catch((error: unknown) => showErrorToast(
        "Export failed",
        error instanceof Error ? error.message : "The workbook could not be downloaded.",
      ));
  }, [exportRequest]);

  useEffect(() => {
    if (!focusRequest || focusRequest.id === handledFocusRef.current) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const workbook = workbookRef.current;
        if (!workbook) return;
        workbook.scroll({
          targetRow: focusRequest.row,
          targetColumn: focusRequest.column,
        });
        workbook.setSelection(
          [{
            row: [focusRequest.row, focusRequest.row],
            column: [focusRequest.column, focusRequest.column],
          }],
          { id: PRIMARY_SHEET_ID },
        );
        handledFocusRef.current = focusRequest.id;
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [focusRequest, workbookKey]);

  const queueWorkbookSave = useCallback((data: WorkbookData) => {
    const serialized = serializeSheets(data);
    latestSheetsRef.current = serialized;
    if (initialChangeRef.current) {
      initialChangeRef.current = false;
      return;
    }
    if (!workspaceRef.current.canEdit) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    callbacksRef.current.onWorkbookSavingChange(true);
    saveTimerRef.current = setTimeout(() => {
      void saveProjectTrackerWorkbookAction({ sheets: serialized })
        .then((result) => {
          if ("error" in result) showErrorToast("Workbook formatting could not be saved", result.error);
        })
        .catch((error: unknown) => showErrorToast(
          "Workbook formatting could not be saved",
          error instanceof Error ? error.message : "Try the change again.",
        ))
        .finally(() => callbacksRef.current.onWorkbookSavingChange(false));
    }, 250);
  }, []);

  const workbookHooks = useMemo<NonNullable<ComponentProps<typeof Workbook>["hooks"]>>(() => ({
    beforeUpdateCell: (row, column) => {
      if (activeSheetIdRef.current !== PRIMARY_SHEET_ID) return true;
      const currentWorkspace = workspaceRef.current;
      // Existing tracker headers are managed by the Columns controls. All
      // other cells, including the blank spreadsheet area, remain editable.
      return row !== 0 || column >= currentWorkspace.columns.length;
    },
    beforePaste: (selections) =>
      activeSheetIdRef.current !== PRIMARY_SHEET_ID ||
      !selections?.some((selection) => selection.row[0] === 0),
    afterUpdateCell: (row, column, _oldValue, newValue) => {
      if (activeSheetIdRef.current !== PRIMARY_SHEET_ID || row <= 0) return;
      const currentWorkspace = workspaceRef.current;
      const trackerRow = currentWorkspace.rows[row - 1];
      const trackerColumn = currentWorkspace.columns[column];
      if (!trackerRow || !trackerColumn) return;
      callbacksRef.current.onSaveCell(
        trackerRow.id,
        trackerColumn.id,
        trackerValueFromCell(newValue),
      );
    },
    afterSelectionChange: (sheetId, selection) => {
      activeSheetIdRef.current = sheetId;
      if (sheetId !== PRIMARY_SHEET_ID) {
        callbacksRef.current.onActiveRowChange(null);
        callbacksRef.current.onSelectedRowsChange([]);
        return;
      }
      const currentWorkspace = workspaceRef.current;
      const start = Math.max(1, selection.row[0]);
      const end = Math.min(currentWorkspace.rows.length, selection.row[1]);
      const rowIds = start <= end
        ? currentWorkspace.rows.slice(start - 1, end).map((row) => row.id)
        : [];
      callbacksRef.current.onActiveRowChange(rowIds[0] ?? null);
      callbacksRef.current.onSelectedRowsChange(selection.row_select ? rowIds : []);
    },
    afterActivateSheet: (id) => {
      activeSheetIdRef.current = id;
      if (id !== PRIMARY_SHEET_ID) {
        callbacksRef.current.onActiveRowChange(null);
        callbacksRef.current.onSelectedRowsChange([]);
      }
    },
    beforeDeleteSheet: (id) => {
      if (id !== PRIMARY_SHEET_ID) return true;
      showErrorToast("Project Tracker", "The main Project Tracker worksheet cannot be deleted.");
      return false;
    },
    beforeUpdateSheetName: (id) => {
      if (id !== PRIMARY_SHEET_ID) return true;
      showErrorToast("Project Tracker", "Rename the main tracker from tracker settings, not the worksheet tab.");
      return false;
    },
  }), []);

  return (
    <div className="project-tracker-fortune h-full min-h-0 min-w-0 overflow-hidden bg-white">
      <Workbook
        key={workbookKey}
        ref={workbookRef}
        data={sheets}
        lang="en"
        currency="AED"
        allowEdit={workspace.canEdit}
        row={PROJECT_TRACKER_SHEET_ROWS}
        column={PROJECT_TRACKER_SHEET_COLUMNS}
        addRows={10}
        showToolbar
        showFormulaBar
        showSheetTabs
        forceCalculation
        toolbarItems={TOOLBAR_ITEMS}
        cellContextMenu={CELL_CONTEXT_MENU}
        headerContextMenu={HEADER_CONTEXT_MENU}
        onChange={queueWorkbookSave}
        hooks={workbookHooks}
      />
    </div>
  );
}
