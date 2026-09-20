import * as XLSX from "xlsx";

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
    }
  | { ok: false; error: string };

self.onmessage = (event: MessageEvent<ParseRequest>) => {
  try {
    const workbook = XLSX.read(event.data.buffer, { type: "array", cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
    if (!firstSheet) throw new Error("This file does not contain a readable table.");

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
      header: 1,
      defval: "",
      raw: true,
    });
    if (!matrix.length) throw new Error("This file does not contain a readable table.");

    const headers = matrix[0].map(
      (value, index) => String(value).trim() || `Column ${index + 1}`,
    );
    const rows = matrix.slice(1).map((sourceRow) =>
      headers.map((_, index) => {
        const value = sourceRow[index];
        if (value instanceof Date) return value.toISOString();
        if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          return value;
        }
        return value == null ? null : String(value);
      }),
    );
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

    const response: ParseResponse = { ok: true, columns, rows };
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
