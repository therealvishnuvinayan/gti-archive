import type { ProjectTrackerWorkspaceRecord, TrackerCellValue } from "@/lib/project-tracker";

import {
  DEFAULT_COLUMN_COUNT,
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_COUNT,
  DEFAULT_ROW_HEIGHT,
  PRIMARY_SHEET_ID,
  type SpreadsheetCell,
  type SpreadsheetCellStyle,
  type SpreadsheetRange,
  type SpreadsheetScalar,
  type SpreadsheetSheet,
  type SpreadsheetWorkbook,
} from "../types/spreadsheet";
import { cellKey, forEachCellInRange, normalizeRange, parseCellKey } from "./coordinates";
import { translateFormula } from "./formulas";

type LegacyCell = {
  v?: unknown;
  m?: unknown;
  f?: unknown;
  bg?: unknown;
  fc?: unknown;
  bl?: unknown;
  it?: unknown;
  un?: unknown;
  cl?: unknown;
  fs?: unknown;
  ff?: unknown;
  ht?: unknown;
  vt?: unknown;
  tb?: unknown;
  ct?: { fa?: unknown };
  ps?: { value?: unknown };
};

type LegacyStoredCell = { r?: unknown; c?: unknown; v?: LegacyCell | null };
type LegacySheet = Record<string, unknown> & {
  id?: unknown;
  name?: unknown;
  row?: unknown;
  column?: unknown;
  celldata?: unknown;
  data?: unknown;
  config?: unknown;
  frozen?: unknown;
};

const HEADER_STYLE: SpreadsheetCellStyle = {
  backgroundColor: "#1f6f4a",
  textColor: "#ffffff",
  fontWeight: "bold",
  verticalAlign: "middle",
  wrap: true,
};

function scalar(value: unknown): SpreadsheetScalar {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  return String(value);
}

function displayValue(value: TrackerCellValue): SpreadsheetScalar {
  return Array.isArray(value) ? value.join(", ") : value;
}

function legacyCells(sheet: LegacySheet) {
  if (Array.isArray(sheet.celldata)) {
    return sheet.celldata.filter((entry): entry is LegacyStoredCell =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry));
  }
  if (!Array.isArray(sheet.data)) return [];
  const cells: LegacyStoredCell[] = [];
  sheet.data.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) return;
    row.forEach((cell, columnIndex) => {
      if (cell && typeof cell === "object" && !Array.isArray(cell)) {
        cells.push({ r: rowIndex, c: columnIndex, v: cell as LegacyCell });
      }
    });
  });
  return cells;
}

function legacyStyle(cell: LegacyCell): SpreadsheetCellStyle | undefined {
  const style: SpreadsheetCellStyle = {};
  if (typeof cell.bg === "string") style.backgroundColor = cell.bg;
  if (typeof cell.fc === "string") style.textColor = cell.fc;
  if (cell.bl === 1) style.fontWeight = "bold";
  if (cell.it === 1) style.italic = true;
  if (cell.un === 1) style.underline = true;
  if (cell.cl === 1) style.strike = true;
  if (typeof cell.fs === "number") style.fontSize = cell.fs;
  if (typeof cell.ff === "string") style.fontFamily = cell.ff;
  if (cell.ht === 0) style.horizontalAlign = "center";
  if (cell.ht === 1) style.horizontalAlign = "left";
  if (cell.ht === 2) style.horizontalAlign = "right";
  if (cell.vt === 0) style.verticalAlign = "middle";
  if (cell.vt === 1) style.verticalAlign = "top";
  if (cell.vt === 2) style.verticalAlign = "bottom";
  if (cell.tb === "2" || cell.tb === "1") style.wrap = true;
  const format = typeof cell.ct?.fa === "string" ? cell.ct.fa.toLocaleLowerCase() : "";
  if (format.includes("%")) style.numberFormat = "percentage";
  else if (format.includes("$")) style.numberFormat = "currency";
  else if (/[dmy]/.test(format)) style.numberFormat = "date";
  return Object.keys(style).length ? style : undefined;
}

function convertLegacySheet(raw: LegacySheet, index: number): SpreadsheetSheet {
  const cells: Record<string, SpreadsheetCell> = {};
  for (const entry of legacyCells(raw)) {
    if (!Number.isInteger(entry.r) || !Number.isInteger(entry.c) || !entry.v) continue;
    const row = Number(entry.r);
    const column = Number(entry.c);
    const legacy = entry.v;
    const formula = typeof legacy.f === "string"
      ? (legacy.f.startsWith("=") ? legacy.f : `=${legacy.f}`)
      : undefined;
    const cell: SpreadsheetCell = {
      value: scalar(legacy.v),
      ...(formula ? { formula } : {}),
      ...(legacyStyle(legacy) ? { style: legacyStyle(legacy) } : {}),
      ...(typeof legacy.ps?.value === "string" ? { comment: legacy.ps.value } : {}),
    };
    if (cell.value !== null || cell.formula || cell.style || cell.comment) cells[cellKey(row, column)] = cell;
  }
  const config = raw.config && typeof raw.config === "object" && !Array.isArray(raw.config)
    ? raw.config as Record<string, unknown>
    : {};
  const columnLengths = config.columnlen && typeof config.columnlen === "object" && !Array.isArray(config.columnlen)
    ? config.columnlen as Record<string, unknown>
    : {};
  const rowLengths = config.rowlen && typeof config.rowlen === "object" && !Array.isArray(config.rowlen)
    ? config.rowlen as Record<string, unknown>
    : {};
  const hiddenColumns = config.colhidden && typeof config.colhidden === "object" && !Array.isArray(config.colhidden)
    ? config.colhidden as Record<string, unknown>
    : {};
  const hiddenRows = config.rowhidden && typeof config.rowhidden === "object" && !Array.isArray(config.rowhidden)
    ? config.rowhidden as Record<string, unknown>
    : {};
  const merges = config.merge && typeof config.merge === "object" && !Array.isArray(config.merge)
    ? Object.values(config.merge as Record<string, unknown>).flatMap((merge) => {
        if (!merge || typeof merge !== "object" || Array.isArray(merge)) return [];
        const value = merge as Record<string, unknown>;
        const row = Number(value.r);
        const column = Number(value.c);
        const rowSpan = Number(value.rs ?? 1);
        const columnSpan = Number(value.cs ?? 1);
        return Number.isInteger(row) && Number.isInteger(column)
          ? [{ startRow: row, startColumn: column, endRow: row + rowSpan - 1, endColumn: column + columnSpan - 1 }]
          : [];
      })
    : [];
  const frozen = raw.frozen && typeof raw.frozen === "object" && !Array.isArray(raw.frozen)
    ? raw.frozen as { type?: unknown; range?: { row_focus?: unknown; column_focus?: unknown } }
    : {};
  const frozenType = typeof frozen.type === "string" ? frozen.type.toLocaleLowerCase() : "";
  return {
    id: typeof raw.id === "string" ? raw.id : `sheet-${index + 1}`,
    name: typeof raw.name === "string" ? raw.name : `Sheet${index + 1}`,
    rowCount: Math.max(DEFAULT_ROW_COUNT, Number(raw.row) || 0),
    columnCount: Math.max(DEFAULT_COLUMN_COUNT, Number(raw.column) || 0),
    cells,
    rowMetadata: Object.fromEntries(Object.entries(rowLengths).map(([key, height]) => [key, {
      ...(typeof height === "number" ? { height } : {}),
      ...(key in hiddenRows ? { hidden: true } : {}),
    }])),
    columnMetadata: Object.fromEntries(Object.entries(columnLengths).map(([key, width]) => [key, {
      ...(typeof width === "number" ? { width } : {}),
      ...(key in hiddenColumns ? { hidden: true } : {}),
    }])),
    merges,
    frozenRows: frozenType.includes("row") || frozenType.includes("both")
      ? Math.max(0, Number(frozen.range?.row_focus) + 1 || 0)
      : 0,
    frozenColumns: frozenType.includes("column") || frozenType.includes("both")
      ? Math.max(0, Number(frozen.range?.column_focus) + 1 || 0)
      : 0,
    conditionalFormats: [],
  };
}

export function emptySheet(name = "Sheet1", id: string = crypto.randomUUID()): SpreadsheetSheet {
  return {
    id,
    name,
    rowCount: DEFAULT_ROW_COUNT,
    columnCount: DEFAULT_COLUMN_COUNT,
    cells: {},
    rowMetadata: {},
    columnMetadata: {},
    merges: [],
    frozenRows: 0,
    frozenColumns: 0,
    conditionalFormats: [],
  };
}

export function normalizeWorkbook(raw: unknown): SpreadsheetWorkbook | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidate = raw as Partial<SpreadsheetWorkbook>;
  if (candidate.version !== 2 || !Array.isArray(candidate.sheets) || !candidate.sheets.length) return null;
  const sheets = candidate.sheets.filter((sheet): sheet is SpreadsheetSheet =>
    Boolean(sheet) && typeof sheet.id === "string" && typeof sheet.name === "string" &&
    Boolean(sheet.cells) && typeof sheet.cells === "object");
  if (!sheets.length) return null;
  return {
    version: 2,
    activeSheetId: sheets.some((sheet) => sheet.id === candidate.activeSheetId)
      ? candidate.activeSheetId as string
      : sheets[0].id,
    sheets: sheets.map((sheet) => ({
      ...sheet,
      rowCount: Math.max(DEFAULT_ROW_COUNT, sheet.rowCount || 0),
      columnCount: Math.max(DEFAULT_COLUMN_COUNT, sheet.columnCount || 0),
      rowMetadata: sheet.rowMetadata ?? {},
      columnMetadata: sheet.columnMetadata ?? {},
      merges: sheet.merges ?? [],
      frozenRows: sheet.frozenRows ?? 0,
      frozenColumns: sheet.frozenColumns ?? 0,
      conditionalFormats: sheet.conditionalFormats ?? [],
    })),
  };
}

export function workbookFromStored(raw: unknown): SpreadsheetWorkbook | null {
  const current = normalizeWorkbook(raw);
  if (current) return current;
  if (!Array.isArray(raw)) return null;
  const legacySheets = raw.filter((sheet): sheet is LegacySheet =>
    Boolean(sheet) && typeof sheet === "object" && !Array.isArray(sheet));
  if (!legacySheets.length) return null;
  const sheets = legacySheets.map(convertLegacySheet);
  return { version: 2, activeSheetId: sheets[0].id, sheets };
}

export function buildProjectTrackerWorkbook(
  workspace: ProjectTrackerWorkspaceRecord,
  stored: unknown,
): SpreadsheetWorkbook {
  const existing = workbookFromStored(stored);
  const workbook = existing ?? {
    version: 2 as const,
    activeSheetId: PRIMARY_SHEET_ID,
    sheets: [emptySheet(workspace.name, PRIMARY_SHEET_ID)],
  };
  const sourcePrimary = workbook.sheets.find((sheet) => sheet.id === PRIMARY_SHEET_ID) ?? workbook.sheets[0];
  const primary: SpreadsheetSheet = {
    ...sourcePrimary,
    id: PRIMARY_SHEET_ID,
    name: workspace.name,
    rowCount: Math.max(DEFAULT_ROW_COUNT, sourcePrimary.rowCount, workspace.rows.length + 1),
    columnCount: Math.max(DEFAULT_COLUMN_COUNT, sourcePrimary.columnCount, workspace.columns.length),
    cells: { ...sourcePrimary.cells },
    rowMetadata: { ...sourcePrimary.rowMetadata },
    columnMetadata: { ...sourcePrimary.columnMetadata },
    merges: [...sourcePrimary.merges],
    conditionalFormats: [...sourcePrimary.conditionalFormats],
  };

  workspace.columns.forEach((column, columnIndex) => {
    const key = cellKey(0, columnIndex);
    const previous = primary.cells[key] ?? {};
    primary.cells[key] = { ...previous, value: column.name, formula: undefined, style: { ...HEADER_STYLE, ...previous.style } };
    primary.columnMetadata[String(columnIndex)] = {
      ...primary.columnMetadata[String(columnIndex)],
      width: primary.columnMetadata[String(columnIndex)]?.width ?? column.width ?? DEFAULT_COLUMN_WIDTH,
      hidden: column.hidden || primary.columnMetadata[String(columnIndex)]?.hidden,
    };
  });
  workspace.rows.forEach((row, rowIndex) => {
    workspace.columns.forEach((column, columnIndex) => {
      const key = cellKey(rowIndex + 1, columnIndex);
      const previous = primary.cells[key] ?? {};
      const value = displayValue(row.cells[column.id]?.value ?? null);
      const validationValues = column.options.length
        ? column.options
        : column.type === "BOOLEAN" || column.type === "CHECKBOX" ? ["Yes", "No"] : [];
      const next: SpreadsheetCell = {
        ...previous,
        value,
        ...(validationValues.length ? { validation: { type: "list", values: validationValues, allowBlank: true } } : {}),
      };
      if (previous.formula) next.formula = previous.formula;
      if (value === null && !next.formula && !next.style && !next.comment && !next.validation) delete primary.cells[key];
      else primary.cells[key] = next;
    });
  });
  const frozenColumns = workspace.columns.findLastIndex((column) => column.frozen) + 1;
  if (!existing) {
    primary.frozenRows = 1;
    primary.frozenColumns = frozenColumns;
  }
  const otherSheets = workbook.sheets.filter((sheet) => sheet !== sourcePrimary && sheet.id !== PRIMARY_SHEET_ID);
  return {
    version: 2,
    activeSheetId: workbook.activeSheetId === sourcePrimary.id ? PRIMARY_SHEET_ID : workbook.activeSheetId,
    sheets: [primary, ...otherSheets],
  };
}

export function mergeImportedWorkbook(
  base: SpreadsheetWorkbook,
  imported: SpreadsheetWorkbook,
  existingRowCount: number,
  targetColumnNames: string[],
) {
  const basePrimary = base.sheets.find((sheet) => sheet.id === PRIMARY_SHEET_ID) ?? base.sheets[0];
  const importedPrimary = imported.sheets[0];
  const primary: SpreadsheetSheet = {
    ...basePrimary,
    cells: { ...basePrimary.cells },
    rowMetadata: { ...basePrimary.rowMetadata },
    columnMetadata: { ...basePrimary.columnMetadata },
    merges: [...basePrimary.merges],
  };
  const normalizedTargets = targetColumnNames.map((name) => name.trim().toLocaleLowerCase());
  const columnMap = new Map<number, number>();
  for (let column = 0; column < importedPrimary.columnCount; column += 1) {
    const header = importedPrimary.cells[cellKey(0, column)]?.value;
    if (typeof header !== "string") continue;
    const target = normalizedTargets.indexOf(header.trim().toLocaleLowerCase());
    if (target >= 0) columnMap.set(column, target);
  }
  for (const [key, cell] of Object.entries(importedPrimary.cells)) {
    const coordinate = parseCellKey(key);
    if (!coordinate) continue;
    const targetColumn = columnMap.get(coordinate.column);
    if (targetColumn === undefined) continue;
    const targetRow = coordinate.row === 0 ? 0 : existingRowCount + coordinate.row;
    const targetKey = cellKey(targetRow, targetColumn);
    primary.cells[targetKey] = coordinate.row === 0
      ? { ...primary.cells[targetKey], style: cell.style, comment: cell.comment }
      : structuredClone(cell);
  }
  for (const [row, metadata] of Object.entries(importedPrimary.rowMetadata)) {
    const sourceRow = Number(row);
    primary.rowMetadata[String(sourceRow === 0 ? 0 : existingRowCount + sourceRow)] = structuredClone(metadata);
  }
  for (const [sourceColumn, targetColumn] of columnMap) {
    const metadata = importedPrimary.columnMetadata[String(sourceColumn)];
    if (metadata) primary.columnMetadata[String(targetColumn)] = {
      ...primary.columnMetadata[String(targetColumn)],
      ...structuredClone(metadata),
    };
  }
  primary.merges.push(...importedPrimary.merges.flatMap((merge) => {
    const startColumn = columnMap.get(merge.startColumn);
    const endColumn = columnMap.get(merge.endColumn);
    if (startColumn === undefined || endColumn === undefined) return [];
    return [{
      startRow: merge.startRow === 0 ? 0 : existingRowCount + merge.startRow,
      endRow: merge.endRow === 0 ? 0 : existingRowCount + merge.endRow,
      startColumn,
      endColumn,
    }];
  }));

  const names = new Set(base.sheets.map((sheet) => sheet.name.toLocaleLowerCase()));
  const additionalSheets = imported.sheets.slice(1).map((source, index) => {
    let name = source.name.slice(0, 31) || `Imported ${index + 1}`;
    let suffix = 2;
    while (names.has(name.toLocaleLowerCase())) {
      name = `${source.name.slice(0, 26)} (${suffix++})`.slice(0, 31);
    }
    names.add(name.toLocaleLowerCase());
    return { ...structuredClone(source), id: crypto.randomUUID(), name };
  });
  return {
    ...base,
    activeSheetId: PRIMARY_SHEET_ID,
    sheets: [primary, ...base.sheets.filter((sheet) => sheet.id !== basePrimary.id), ...additionalSheets],
  } satisfies SpreadsheetWorkbook;
}

export function activeSheet(workbook: SpreadsheetWorkbook) {
  return workbook.sheets.find((sheet) => sheet.id === workbook.activeSheetId) ?? workbook.sheets[0];
}

export function updateSheet(
  workbook: SpreadsheetWorkbook,
  sheetId: string,
  updater: (sheet: SpreadsheetSheet) => SpreadsheetSheet,
): SpreadsheetWorkbook {
  return { ...workbook, sheets: workbook.sheets.map((sheet) => sheet.id === sheetId ? updater(sheet) : sheet) };
}

export function updateCell(
  sheet: SpreadsheetSheet,
  row: number,
  column: number,
  updater: (cell: SpreadsheetCell) => SpreadsheetCell,
) {
  const key = cellKey(row, column);
  const next = updater(sheet.cells[key] ?? {});
  const cells = { ...sheet.cells };
  if (isCellEmpty(next)) delete cells[key];
  else cells[key] = next;
  return { ...sheet, cells };
}

export function isCellEmpty(cell: SpreadsheetCell | undefined) {
  return !cell || (
    (cell.value === null || cell.value === undefined || cell.value === "") &&
    !cell.formula && !cell.style && !cell.validation && !cell.comment
  );
}

export function applyStyleToRange(
  sheet: SpreadsheetSheet,
  range: SpreadsheetRange,
  style: SpreadsheetCellStyle,
  selectionKind: "cell" | "row" | "column" | "all" = "cell",
) {
  const normalized = normalizeRange(range);
  if (selectionKind === "row" || selectionKind === "all") {
    const rowMetadata = { ...sheet.rowMetadata };
    for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
      const current = rowMetadata[String(row)] ?? {};
      rowMetadata[String(row)] = { ...current, style: { ...current.style, ...style } };
    }
    return { ...sheet, rowMetadata };
  }
  if (selectionKind === "column") {
    const columnMetadata = { ...sheet.columnMetadata };
    for (let column = normalized.startColumn; column <= normalized.endColumn; column += 1) {
      const current = columnMetadata[String(column)] ?? {};
      columnMetadata[String(column)] = { ...current, style: { ...current.style, ...style } };
    }
    return { ...sheet, columnMetadata };
  }
  const cells = { ...sheet.cells };
  forEachCellInRange(normalized, (row, column) => {
    const key = cellKey(row, column);
    const current = cells[key] ?? {};
    cells[key] = { ...current, style: { ...current.style, ...style } };
  });
  return { ...sheet, cells };
}

function shiftMetadata<T>(metadata: Record<string, T>, index: number, amount: number) {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const current = Number(key);
    if (!Number.isInteger(current)) continue;
    if (amount > 0) result[String(current >= index ? current + amount : current)] = value;
    else if (current !== index) result[String(current > index ? current + amount : current)] = value;
  }
  return result;
}

export function insertSheetRow(sheet: SpreadsheetSheet, index: number) {
  const cells: Record<string, SpreadsheetCell> = {};
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const coordinate = parseCellKey(key);
    if (!coordinate) continue;
    const row = coordinate.row >= index ? coordinate.row + 1 : coordinate.row;
    cells[cellKey(row, coordinate.column)] = cell.formula
      ? { ...cell, formula: translateFormula(cell.formula, coordinate.row >= index ? 1 : 0, 0) }
      : cell;
  }
  return {
    ...sheet,
    rowCount: sheet.rowCount + 1,
    cells,
    rowMetadata: shiftMetadata(sheet.rowMetadata, index, 1),
    merges: sheet.merges.map((merge) => ({
      ...merge,
      startRow: merge.startRow >= index ? merge.startRow + 1 : merge.startRow,
      endRow: merge.endRow >= index ? merge.endRow + 1 : merge.endRow,
    })),
  };
}

export function deleteSheetRow(sheet: SpreadsheetSheet, index: number) {
  const cells: Record<string, SpreadsheetCell> = {};
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const coordinate = parseCellKey(key);
    if (!coordinate || coordinate.row === index) continue;
    const row = coordinate.row > index ? coordinate.row - 1 : coordinate.row;
    cells[cellKey(row, coordinate.column)] = cell.formula
      ? { ...cell, formula: translateFormula(cell.formula, coordinate.row > index ? -1 : 0, 0) }
      : cell;
  }
  return {
    ...sheet,
    rowCount: Math.max(1, sheet.rowCount - 1),
    cells,
    rowMetadata: shiftMetadata(sheet.rowMetadata, index, -1),
    merges: sheet.merges.flatMap((merge) => {
      if (index >= merge.startRow && index <= merge.endRow) return [];
      return [{
        ...merge,
        startRow: merge.startRow > index ? merge.startRow - 1 : merge.startRow,
        endRow: merge.endRow > index ? merge.endRow - 1 : merge.endRow,
      }];
    }),
  };
}

export function insertSheetColumn(sheet: SpreadsheetSheet, index: number) {
  const cells: Record<string, SpreadsheetCell> = {};
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const coordinate = parseCellKey(key);
    if (!coordinate) continue;
    const column = coordinate.column >= index ? coordinate.column + 1 : coordinate.column;
    cells[cellKey(coordinate.row, column)] = cell.formula
      ? { ...cell, formula: translateFormula(cell.formula, 0, coordinate.column >= index ? 1 : 0) }
      : cell;
  }
  return {
    ...sheet,
    columnCount: sheet.columnCount + 1,
    cells,
    columnMetadata: shiftMetadata(sheet.columnMetadata, index, 1),
    merges: sheet.merges.map((merge) => ({
      ...merge,
      startColumn: merge.startColumn >= index ? merge.startColumn + 1 : merge.startColumn,
      endColumn: merge.endColumn >= index ? merge.endColumn + 1 : merge.endColumn,
    })),
  };
}

export function deleteSheetColumn(sheet: SpreadsheetSheet, index: number) {
  const cells: Record<string, SpreadsheetCell> = {};
  for (const [key, cell] of Object.entries(sheet.cells)) {
    const coordinate = parseCellKey(key);
    if (!coordinate || coordinate.column === index) continue;
    const column = coordinate.column > index ? coordinate.column - 1 : coordinate.column;
    cells[cellKey(coordinate.row, column)] = cell.formula
      ? { ...cell, formula: translateFormula(cell.formula, 0, coordinate.column > index ? -1 : 0) }
      : cell;
  }
  return {
    ...sheet,
    columnCount: Math.max(1, sheet.columnCount - 1),
    cells,
    columnMetadata: shiftMetadata(sheet.columnMetadata, index, -1),
    merges: sheet.merges.flatMap((merge) => {
      if (index >= merge.startColumn && index <= merge.endColumn) return [];
      return [{
        ...merge,
        startColumn: merge.startColumn > index ? merge.startColumn - 1 : merge.startColumn,
        endColumn: merge.endColumn > index ? merge.endColumn - 1 : merge.endColumn,
      }];
    }),
  };
}

export function rowHeight(sheet: SpreadsheetSheet, row: number) {
  if (sheet.rowMetadata[String(row)]?.hidden || sheet.filter?.hiddenRows.includes(row)) return 0;
  return sheet.rowMetadata[String(row)]?.height ?? DEFAULT_ROW_HEIGHT;
}

export function columnWidth(sheet: SpreadsheetSheet, column: number) {
  if (sheet.columnMetadata[String(column)]?.hidden) return 0;
  return sheet.columnMetadata[String(column)]?.width ?? DEFAULT_COLUMN_WIDTH;
}
