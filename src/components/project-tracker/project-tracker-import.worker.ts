import * as XLSX from "xlsx";

import { cellKey } from "./spreadsheet/lib/coordinates";
import { formulaCellValue } from "./spreadsheet/lib/formulas";
import { normalizeImportedWorkbook } from "./spreadsheet/lib/workbook";
import { importXlsxWorkbook } from "./spreadsheet/lib/xlsx";
import type { SpreadsheetSheet, SpreadsheetWorkbook } from "./spreadsheet/types/spreadsheet";

type SpreadsheetCellValue = string | number | boolean | null;
type SpreadsheetColumnType = "TEXT" | "NUMBER" | "CHECKBOX" | "DATE";

type ParseRequest = {
  buffer: ArrayBuffer;
};

type ParseResponse =
  | {
      ok: true;
      columns: Array<{ name: string; type: SpreadsheetColumnType }>;
      rows: SpreadsheetCellValue[][];
      workbook: SpreadsheetWorkbook;
      warnings: string[];
    }
  | { ok: false; error: string };

self.onmessage = async (event: MessageEvent<ParseRequest>) => {
  try {
    let importedWorkbook: SpreadsheetWorkbook;
    let warnings: string[] = [];
    try {
      const imported = await importXlsxWorkbook(event.data.buffer);
      importedWorkbook = imported.workbook;
      warnings = imported.warnings;
    } catch {
      const source = XLSX.read(event.data.buffer, { type: "array", cellDates: true, cellStyles: true });
      const sheets = source.SheetNames.flatMap((name, sheetIndex) => {
        const sourceSheet = source.Sheets[name];
        if (!sourceSheet) return [];
        const range = sourceSheet["!ref"] ? XLSX.utils.decode_range(sourceSheet["!ref"]) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } };
        const cells: SpreadsheetSheet["cells"] = {};
        for (let row = range.s.r; row <= range.e.r; row += 1) {
          for (let column = range.s.c; column <= range.e.c; column += 1) {
            const sourceCell = sourceSheet[XLSX.utils.encode_cell({ r: row, c: column })];
            if (!sourceCell) continue;
            const value = sourceCell.v instanceof Date ? sourceCell.v.toISOString() : sourceCell.v;
            cells[cellKey(row, column)] = {
              value: typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : value == null ? null : String(value),
              ...(typeof sourceCell.f === "string" ? { formula: `=${sourceCell.f}` } : {}),
            };
          }
        }
        return [{
          id: sheetIndex === 0 ? "project-tracker" : crypto.randomUUID(),
          name,
          rowCount: Math.max(1_000, range.e.r + 1),
          columnCount: Math.max(100, range.e.c + 1),
          cells,
          rowMetadata: {},
          columnMetadata: {},
          merges: (sourceSheet["!merges"] ?? []).map((merge) => ({ startRow: merge.s.r, startColumn: merge.s.c, endRow: merge.e.r, endColumn: merge.e.c })),
          frozenRows: 0,
          frozenColumns: 0,
          conditionalFormats: [],
        } satisfies SpreadsheetSheet];
      });
      if (!sheets.length) throw new Error("This file does not contain a readable table.");
      importedWorkbook = { version: 2, activeSheetId: sheets[0].id, sheets };
      warnings = ["Legacy spreadsheet formatting could not be fully imported; values, formulas, sheets, and merges were retained where available."];
    }
    importedWorkbook = normalizeImportedWorkbook(importedWorkbook);
    const firstSheet = importedWorkbook.sheets[0];
    let maxRow = 0;
    let maxColumn = 0;
    for (const [key, cell] of Object.entries(firstSheet.cells)) {
      const value = formulaCellValue(cell);
      if (!cell.formula && (value === null || value === undefined || value === "")) continue;
      const [row, column] = key.split(":").map(Number);
      maxRow = Math.max(maxRow, row);
      maxColumn = Math.max(maxColumn, column);
    }
    const matrix = Array.from({ length: maxRow + 1 }, (_, row) =>
      Array.from({ length: maxColumn + 1 }, (_, column) =>
        formulaCellValue(firstSheet.cells[cellKey(row, column)]) ?? ""));
    if (!matrix.length) throw new Error("This file does not contain a readable table.");

    const headers = matrix[0].map(
      (value, index) => String(value).trim() || `Column ${index + 1}`,
    );
    const rows = matrix
      .slice(1)
      .map((sourceRow) =>
        headers.map((_, index) => {
          const value = sourceRow[index];
          if (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
          ) {
            return value;
          }
          return value == null ? null : String(value);
        }),
      )
      .filter((row) => row.some((value) => value !== null && value !== ""));
    const columns = headers.map((name, columnIndex) => {
      const values = rows
        .map((row) => row[columnIndex])
        .filter((value) => value !== null && value !== "");
      let type: SpreadsheetColumnType = "TEXT";
      if (values.length && values.every((value) => typeof value === "number")) {
        type = "NUMBER";
      } else if (values.length && values.every((value) => typeof value === "boolean")) {
        type = "CHECKBOX";
      } else if (
        values.length &&
        values.every(
          (value) =>
            typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value),
        )
      ) {
        type = "DATE";
      }
      return { name, type };
    });

    const response: ParseResponse = { ok: true, columns, rows, workbook: importedWorkbook, warnings };
    self.postMessage(response);
  } catch (error) {
    const response: ParseResponse = {
      ok: false,
      error: error instanceof Error ? error.message : "The spreadsheet could not be read.",
    };
    self.postMessage(response);
  }
};

export {};
