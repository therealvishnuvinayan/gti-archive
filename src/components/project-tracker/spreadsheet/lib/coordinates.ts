import type { SpreadsheetRange, SpreadsheetSelection } from "../types/spreadsheet";

export function columnIndexToLabel(index: number) {
  if (!Number.isInteger(index) || index < 0) throw new Error("Column index must be zero or greater.");
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

export function columnLabelToIndex(label: string) {
  const normalized = label.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) throw new Error(`Invalid column label: ${label}`);
  let value = 0;
  for (const character of normalized) value = value * 26 + character.charCodeAt(0) - 64;
  return value - 1;
}

export function cellAddress(row: number, column: number) {
  return `${columnIndexToLabel(column)}${row + 1}`;
}

export function parseCellAddress(address: string) {
  const match = address.trim().toUpperCase().match(/^\$?([A-Z]+)\$?(\d+)$/);
  if (!match) return null;
  const row = Number(match[2]) - 1;
  if (row < 0) return null;
  return { row, column: columnLabelToIndex(match[1]) };
}

export function cellKey(row: number, column: number) {
  return `${row}:${column}`;
}

export function parseCellKey(key: string) {
  const [row, column] = key.split(":").map(Number);
  return Number.isInteger(row) && Number.isInteger(column) ? { row, column } : null;
}

export function normalizeRange(range: SpreadsheetRange): SpreadsheetRange {
  return {
    startRow: Math.min(range.startRow, range.endRow),
    startColumn: Math.min(range.startColumn, range.endColumn),
    endRow: Math.max(range.startRow, range.endRow),
    endColumn: Math.max(range.startColumn, range.endColumn),
  };
}

export function selectionRange(selection: SpreadsheetSelection) {
  return normalizeRange(selection);
}

export function rangeLabel(range: SpreadsheetRange) {
  const normalized = normalizeRange(range);
  const start = cellAddress(normalized.startRow, normalized.startColumn);
  const end = cellAddress(normalized.endRow, normalized.endColumn);
  return start === end ? start : `${start}:${end}`;
}

export function rangeContains(range: SpreadsheetRange, row: number, column: number) {
  const normalized = normalizeRange(range);
  return row >= normalized.startRow && row <= normalized.endRow &&
    column >= normalized.startColumn && column <= normalized.endColumn;
}

export function rangesOverlap(left: SpreadsheetRange, right: SpreadsheetRange) {
  const a = normalizeRange(left);
  const b = normalizeRange(right);
  return a.startRow <= b.endRow && a.endRow >= b.startRow &&
    a.startColumn <= b.endColumn && a.endColumn >= b.startColumn;
}

export function clampSelection(
  selection: SpreadsheetSelection,
  rowCount: number,
  columnCount: number,
): SpreadsheetSelection {
  const row = (value: number) => Math.max(0, Math.min(rowCount - 1, value));
  const column = (value: number) => Math.max(0, Math.min(columnCount - 1, value));
  return {
    ...selection,
    anchorRow: row(selection.anchorRow),
    anchorColumn: column(selection.anchorColumn),
    startRow: row(selection.startRow),
    endRow: row(selection.endRow),
    startColumn: column(selection.startColumn),
    endColumn: column(selection.endColumn),
  };
}

export function forEachCellInRange(
  range: SpreadsheetRange,
  callback: (row: number, column: number) => void,
) {
  const normalized = normalizeRange(range);
  for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
    for (let column = normalized.startColumn; column <= normalized.endColumn; column += 1) {
      callback(row, column);
    }
  }
}

