import type ExcelJS from "exceljs";

import {
  DEFAULT_COLUMN_COUNT,
  DEFAULT_COLUMN_WIDTH,
  DEFAULT_ROW_COUNT,
  type SpreadsheetBorder,
  type SpreadsheetCell,
  type SpreadsheetCellStyle,
  type SpreadsheetScalar,
  type SpreadsheetSheet,
  type SpreadsheetWorkbook,
} from "../types/spreadsheet";
import { cellAddress, cellKey, parseCellAddress } from "./coordinates";
import { formulaCellValue } from "./formulas";

type ExcelColor = { argb?: string; theme?: number; indexed?: number };

function hexFromColor(color: Partial<ExcelColor> | undefined) {
  if (!color?.argb) return undefined;
  const value = color.argb.replace(/^FF/i, "");
  return value.length === 6 ? `#${value}` : undefined;
}

function excelColor(color: string | undefined) {
  return color ? { argb: `FF${color.replace("#", "").toUpperCase()}` } : undefined;
}

function borderFromExcel(border: Partial<ExcelJS.Border> | undefined): SpreadsheetBorder | undefined {
  if (!border?.style) return undefined;
  return { style: "solid", color: hexFromColor(border.color) ?? "#808780" };
}

function styleFromExcel(cell: ExcelJS.Cell): SpreadsheetCellStyle | undefined {
  const style: SpreadsheetCellStyle = {};
  const font = cell.font;
  const alignment = cell.alignment;
  const fill = cell.fill;
  if (font?.name) style.fontFamily = font.name;
  if (font?.size) style.fontSize = font.size;
  if (font?.bold) style.fontWeight = "bold";
  if (font?.italic) style.italic = true;
  if (font?.underline) style.underline = true;
  if (font?.strike) style.strike = true;
  const textColor = hexFromColor(font?.color);
  if (textColor) style.textColor = textColor;
  if (fill?.type === "pattern" && fill.pattern === "solid") {
    const backgroundColor = hexFromColor(fill.fgColor);
    if (backgroundColor) style.backgroundColor = backgroundColor;
  }
  if (alignment?.horizontal && ["left", "center", "right"].includes(alignment.horizontal)) {
    style.horizontalAlign = alignment.horizontal as "left" | "center" | "right";
  }
  if (alignment?.vertical && ["top", "middle", "bottom"].includes(alignment.vertical)) {
    style.verticalAlign = alignment.vertical as "top" | "middle" | "bottom";
  }
  if (alignment?.wrapText) style.wrap = true;
  if (cell.numFmt) {
    const format = cell.numFmt.toLocaleLowerCase();
    if (format.includes("%")) style.numberFormat = "percentage";
    else if (/[$€£¥]|aed/.test(format)) style.numberFormat = format.includes("_)") ? "accounting" : "currency";
    else if (/[dmy]/.test(format)) style.numberFormat = /[hs]/.test(format) && !/[dy]/.test(format) ? "time" : "date";
    else if (/[0#]/.test(format)) style.numberFormat = "number";
    const decimals = format.match(/\.(0+|#+)/)?.[1].length;
    if (decimals !== undefined) style.decimalPlaces = decimals;
  }
  const borders = {
    top: borderFromExcel(cell.border?.top),
    right: borderFromExcel(cell.border?.right),
    bottom: borderFromExcel(cell.border?.bottom),
    left: borderFromExcel(cell.border?.left),
  };
  const compactBorders = Object.fromEntries(Object.entries(borders).filter(([, value]) => value));
  if (Object.keys(compactBorders).length) style.borders = compactBorders;
  return Object.keys(style).length ? style : undefined;
}

function valueFromExcel(value: ExcelJS.CellValue): SpreadsheetScalar {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return valueFromExcel(value.result as ExcelJS.CellValue);
    if ("error" in value && typeof value.error === "string") return value.error;
  }
  return String(value);
}

function formulaFromExcel(value: ExcelJS.CellValue) {
  if (!value || typeof value !== "object" || !("formula" in value) || typeof value.formula !== "string") return undefined;
  return value.formula.startsWith("=") ? value.formula : `=${value.formula}`;
}

function numberFormat(style: SpreadsheetCellStyle | undefined) {
  const decimals = "0".repeat(style?.decimalPlaces ?? 2);
  if (style?.numberFormat === "number") return decimals ? `#,##0.${decimals}` : "#,##0";
  if (style?.numberFormat === "currency") return decimals ? `AED #,##0.${decimals}` : "AED #,##0";
  if (style?.numberFormat === "accounting") return decimals ? `_(* #,##0.${decimals}_);_(* (#,##0.${decimals});_(* \"-\"??_);_(@_)` : "#,##0";
  if (style?.numberFormat === "percentage") return decimals ? `0.${decimals}%` : "0%";
  if (style?.numberFormat === "date") return "dd mmm yyyy";
  if (style?.numberFormat === "time") return "hh:mm";
  return undefined;
}

function applyExcelStyle(cell: ExcelJS.Cell, style: SpreadsheetCellStyle | undefined) {
  if (!style) return;
  cell.font = {
    name: style.fontFamily,
    size: style.fontSize,
    bold: style.fontWeight === "bold",
    italic: style.italic,
    underline: style.underline,
    strike: style.strike,
    color: excelColor(style.textColor),
  };
  if (style.backgroundColor) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: excelColor(style.backgroundColor)! };
  }
  cell.alignment = {
    horizontal: style.horizontalAlign,
    vertical: style.verticalAlign === "middle" ? "middle" : style.verticalAlign,
    wrapText: style.wrap,
  };
  const numFmt = numberFormat(style);
  if (numFmt) cell.numFmt = numFmt;
  if (style.borders) {
    cell.border = Object.fromEntries(Object.entries(style.borders).flatMap(([side, border]) =>
      border ? [[side, { style: "thin", color: excelColor(border.color) }]] : []));
  }
}

export async function importXlsxWorkbook(buffer: ArrayBuffer) {
  const { default: ExcelJSImport } = await import("exceljs");
  const source = new ExcelJSImport.Workbook();
  await source.xlsx.load(buffer);
  const warnings: string[] = [];
  if (source.worksheets.length === 0) throw new Error("This workbook does not contain a worksheet.");
  const sheets: SpreadsheetSheet[] = source.worksheets.map((worksheet, sheetIndex) => {
    const cells: Record<string, SpreadsheetCell> = {};
    const rowMetadata: SpreadsheetSheet["rowMetadata"] = {};
    const columnMetadata: SpreadsheetSheet["columnMetadata"] = {};
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const rowIndex = rowNumber - 1;
      if (row.height || row.hidden) {
        rowMetadata[String(rowIndex)] = {
          ...(row.height ? { height: Math.round(row.height / 0.75) } : {}),
          ...(row.hidden ? { hidden: true } : {}),
        };
      }
      row.eachCell({ includeEmpty: false }, (sourceCell, columnNumber) => {
        const value = valueFromExcel(sourceCell.value);
        const formula = formulaFromExcel(sourceCell.value);
        const style = styleFromExcel(sourceCell);
        const validation = sourceCell.dataValidation?.type === "list"
          ? {
              type: "list" as const,
              values: (sourceCell.dataValidation.formulae ?? [])
                .flatMap((item) => typeof item === "string" ? item.replace(/^"|"$/g, "").split(",") : [])
                .map((item) => item.trim())
                .filter(Boolean),
              allowBlank: sourceCell.dataValidation.allowBlank,
            }
          : undefined;
        const note = typeof sourceCell.note === "string"
          ? sourceCell.note
          : sourceCell.note?.texts?.map((text) => text.text).join("");
        cells[cellKey(rowIndex, columnNumber - 1)] = {
          value,
          ...(formula ? { formula, computedValue: value } : {}),
          ...(style ? { style } : {}),
          ...(validation?.values.length ? { validation } : {}),
          ...(note ? { comment: note } : {}),
        };
      });
    });
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      const sourceColumn = worksheet.getColumn(column);
      if (sourceColumn.width || sourceColumn.hidden) {
        columnMetadata[String(column - 1)] = {
          ...(sourceColumn.width ? { width: Math.max(36, Math.round(sourceColumn.width * 7)) } : {}),
          ...(sourceColumn.hidden ? { hidden: true } : {}),
        };
      }
    }
    const mergeAddresses = Array.isArray(worksheet.model.merges) ? worksheet.model.merges : [];
    const merges = mergeAddresses.flatMap((address) => {
      const [start, end = start] = address.split(":");
      const first = parseCellAddress(start);
      const last = parseCellAddress(end);
      return first && last
        ? [{ startRow: first.row, startColumn: first.column, endRow: last.row, endColumn: last.column }]
        : [];
    });
    if (worksheet.getImages().length) warnings.push(`${worksheet.name}: images were not imported.`);
    if (worksheet.getTables().length > 0) warnings.push(`${worksheet.name}: table styling was flattened to cells where available.`);
    const frozenView = worksheet.views.find((view) => view.state === "frozen");
    return {
      id: sheetIndex === 0 ? "project-tracker" : crypto.randomUUID(),
      name: worksheet.name || `Sheet${sheetIndex + 1}`,
      rowCount: Math.max(DEFAULT_ROW_COUNT, worksheet.rowCount),
      columnCount: Math.max(DEFAULT_COLUMN_COUNT, worksheet.columnCount),
      cells,
      rowMetadata,
      columnMetadata,
      merges,
      frozenRows: frozenView && "ySplit" in frozenView ? frozenView.ySplit ?? 0 : 0,
      frozenColumns: frozenView && "xSplit" in frozenView ? frozenView.xSplit ?? 0 : 0,
      conditionalFormats: [],
    };
  });
  return {
    workbook: { version: 2, activeSheetId: sheets[0].id, sheets } satisfies SpreadsheetWorkbook,
    warnings: Array.from(new Set(warnings)),
  };
}

function sheetCellStyle(sheet: SpreadsheetSheet, row: number, column: number, cell: SpreadsheetCell) {
  return {
    ...sheet.columnMetadata[String(column)]?.style,
    ...sheet.rowMetadata[String(row)]?.style,
    ...cell.style,
    borders: {
      ...sheet.columnMetadata[String(column)]?.style?.borders,
      ...sheet.rowMetadata[String(row)]?.style?.borders,
      ...cell.style?.borders,
    },
  };
}

export async function workbookToXlsxBuffer(workbook: SpreadsheetWorkbook) {
  const { default: ExcelJSImport } = await import("exceljs");
  const output = new ExcelJSImport.Workbook();
  output.creator = "Gulbahar Project Tracker";
  output.created = new Date();
  for (const sheet of workbook.sheets) {
    const worksheet = output.addWorksheet(sheet.name.slice(0, 31) || "Sheet", {
      views: sheet.frozenRows || sheet.frozenColumns
        ? [{ state: "frozen", xSplit: sheet.frozenColumns, ySplit: sheet.frozenRows }]
        : undefined,
    });
    for (const [key, metadata] of Object.entries(sheet.rowMetadata)) {
      const row = worksheet.getRow(Number(key) + 1);
      if (metadata.height) row.height = metadata.height * 0.75;
      if (metadata.hidden) row.hidden = true;
      if (metadata.style) row.eachCell({ includeEmpty: false }, (cell) => applyExcelStyle(cell, metadata.style));
    }
    for (let index = 0; index < sheet.columnCount; index += 1) {
      const metadata = sheet.columnMetadata[String(index)];
      const column = worksheet.getColumn(index + 1);
      column.width = Math.max(5, (metadata?.width ?? DEFAULT_COLUMN_WIDTH) / 7);
      if (metadata?.hidden) column.hidden = true;
    }
    for (const [key, sourceCell] of Object.entries(sheet.cells)) {
      const [row, column] = key.split(":").map(Number);
      const cell = worksheet.getCell(row + 1, column + 1);
      const value = formulaCellValue(sourceCell);
      if (sourceCell.formula) {
        cell.value = {
          formula: sourceCell.formula.replace(/^=/, ""),
          result: value === null || (typeof value === "string" && value.startsWith("#")) ? undefined : value,
        };
      } else if (typeof sourceCell.value === "string" && sourceCell.style?.numberFormat === "date") {
        const date = new Date(sourceCell.value);
        cell.value = Number.isNaN(date.getTime()) ? sourceCell.value : date;
      } else {
        cell.value = sourceCell.value ?? null;
      }
      applyExcelStyle(cell, sheetCellStyle(sheet, row, column, sourceCell));
      if (sourceCell.comment) cell.note = sourceCell.comment;
      if (sourceCell.validation?.type === "list") {
        cell.dataValidation = {
          type: "list",
          allowBlank: sourceCell.validation.allowBlank ?? true,
          formulae: [`"${sourceCell.validation.values.join(",").replaceAll('"', '""')}"`],
          showErrorMessage: true,
        };
      }
    }
    for (const merge of sheet.merges) {
      worksheet.mergeCells(
        cellAddress(merge.startRow, merge.startColumn),
        cellAddress(merge.endRow, merge.endColumn),
      );
    }
    if (sheet.filter) {
      worksheet.autoFilter = {
        from: cellAddress(sheet.filter.range.startRow, sheet.filter.range.startColumn),
        to: cellAddress(sheet.filter.range.endRow, sheet.filter.range.endColumn),
      };
    }
  }
  return output.xlsx.writeBuffer();
}

export function workbookSheetToCsv(sheet: SpreadsheetSheet) {
  let maxRow = 0;
  let maxColumn = 0;
  for (const key of Object.keys(sheet.cells)) {
    const [row, column] = key.split(":").map(Number);
    maxRow = Math.max(maxRow, row);
    maxColumn = Math.max(maxColumn, column);
  }
  const escape = (value: SpreadsheetScalar | string | undefined) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return Array.from({ length: maxRow + 1 }, (_, row) =>
    Array.from({ length: maxColumn + 1 }, (_, column) =>
      escape(formulaCellValue(sheet.cells[cellKey(row, column)]))).join(","),
  ).join("\r\n");
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export async function downloadWorkbook(workbook: SpreadsheetWorkbook, format: "xlsx" | "csv") {
  const active = workbook.sheets.find((sheet) => sheet.id === workbook.activeSheetId) ?? workbook.sheets[0];
  if (format === "csv") {
    downloadBlob(new Blob(["\uFEFF", workbookSheetToCsv(active)], { type: "text/csv;charset=utf-8" }), `${active.name}.csv`);
    return;
  }
  const buffer = await workbookToXlsxBuffer(workbook);
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    "Project Tracker.xlsx",
  );
}
