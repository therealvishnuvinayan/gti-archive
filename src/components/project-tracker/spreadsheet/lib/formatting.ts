import type {
  ConditionalFormatRule,
  SpreadsheetCell,
  SpreadsheetCellStyle,
  SpreadsheetScalar,
  SpreadsheetSheet,
} from "../types/spreadsheet";
import { cellKey, rangeContains } from "./coordinates";

export const DEFAULT_CELL_STYLE: Required<Pick<
  SpreadsheetCellStyle,
  "fontFamily" | "fontSize" | "fontWeight" | "italic" | "underline" | "strike" |
  "textColor" | "backgroundColor" | "horizontalAlign" | "verticalAlign" | "wrap" |
  "numberFormat" | "decimalPlaces"
>> = {
  fontFamily: "Inter",
  fontSize: 12,
  fontWeight: "normal",
  italic: false,
  underline: false,
  strike: false,
  textColor: "#26332b",
  backgroundColor: "#ffffff",
  horizontalAlign: "left",
  verticalAlign: "middle",
  wrap: false,
  numberFormat: "general",
  decimalPlaces: 2,
};

function comparable(value: SpreadsheetScalar | string | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return String(value ?? "").toLocaleLowerCase();
}

function ruleMatches(
  rule: ConditionalFormatRule,
  value: SpreadsheetScalar | string | undefined,
  sheet: SpreadsheetSheet,
) {
  const left = comparable(value);
  const right = comparable(rule.value ?? null);
  if (rule.kind === "greaterThan") return left > right;
  if (rule.kind === "lessThan") return left < right;
  if (rule.kind === "equalTo") return left === right;
  if (rule.kind === "textContains") return String(left).includes(String(right));
  if (rule.kind === "duplicate") {
    let matches = 0;
    for (let row = rule.range.startRow; row <= rule.range.endRow; row += 1) {
      for (let column = rule.range.startColumn; column <= rule.range.endColumn; column += 1) {
        const cell = sheet.cells[cellKey(row, column)];
        if (comparable(cell?.computedValue ?? cell?.value) === left && ++matches > 1) return true;
      }
    }
  }
  return false;
}

export function resolveCellStyle(
  sheet: SpreadsheetSheet,
  row: number,
  column: number,
  cell?: SpreadsheetCell,
): SpreadsheetCellStyle {
  const conditional = sheet.conditionalFormats
    .filter((rule) => rangeContains(rule.range, row, column))
    .filter((rule) => ruleMatches(rule, cell?.computedValue ?? cell?.value, sheet))
    .reduce<SpreadsheetCellStyle>((style, rule) => ({ ...style, ...rule.style }), {});
  return {
    ...DEFAULT_CELL_STYLE,
    ...sheet.columnMetadata[String(column)]?.style,
    ...sheet.rowMetadata[String(row)]?.style,
    ...cell?.style,
    ...conditional,
    borders: {
      ...sheet.columnMetadata[String(column)]?.style?.borders,
      ...sheet.rowMetadata[String(row)]?.style?.borders,
      ...cell?.style?.borders,
    },
  };
}

function excelSerialToDate(value: number) {
  return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
}

export function formatCellDisplay(
  value: SpreadsheetScalar | string | undefined,
  style?: SpreadsheetCellStyle,
) {
  if (value === null || value === undefined) return "";
  const format = style?.numberFormat ?? "general";
  const decimals = style?.decimalPlaces ?? 2;
  if (typeof value === "number") {
    if (format === "number") {
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value);
    }
    if (format === "currency" || format === "accounting") {
      return new Intl.NumberFormat("en-AE", {
        style: "currency",
        currency: "AED",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
        currencySign: format === "accounting" ? "accounting" : "standard",
      }).format(value);
    }
    if (format === "percentage") {
      return new Intl.NumberFormat("en-US", {
        style: "percent",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(Math.abs(value) > 1 ? value / 100 : value);
    }
    if (format === "date" || format === "time") {
      const date = excelSerialToDate(value);
      return new Intl.DateTimeFormat("en-GB", format === "date"
        ? { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }
        : { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(date);
    }
  }
  if ((format === "date" || format === "time") && typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("en-GB", format === "date"
        ? { day: "2-digit", month: "short", year: "numeric" }
        : { hour: "2-digit", minute: "2-digit" }).format(date);
    }
  }
  return String(value);
}

