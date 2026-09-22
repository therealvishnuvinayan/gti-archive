import type { SpreadsheetCell, SpreadsheetSheet } from "../types/spreadsheet";

export type SpreadsheetCellPatch = Record<string, SpreadsheetCell | undefined>;

export function applyCellPatch(sheet: SpreadsheetSheet, patch: SpreadsheetCellPatch) {
  const cells = { ...sheet.cells };
  for (const [key, cell] of Object.entries(patch)) {
    if (cell) cells[key] = structuredClone(cell);
    else delete cells[key];
  }
  return { ...sheet, cells };
}

export function reverseCellPatch(
  sheet: SpreadsheetSheet,
  patch: SpreadsheetCellPatch,
): SpreadsheetCellPatch {
  return Object.fromEntries(
    Object.keys(patch).map((key) => [key, sheet.cells[key] ? structuredClone(sheet.cells[key]) : undefined]),
  );
}

