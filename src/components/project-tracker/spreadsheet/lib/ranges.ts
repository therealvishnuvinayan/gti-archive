import { cellKey, normalizeRange, rangeContains, rangesOverlap } from "./coordinates";
import type { SpreadsheetMerge, SpreadsheetRange } from "../types/spreadsheet";

export function findMergeAt(merges: SpreadsheetMerge[], row: number, column: number) {
  return merges.find((merge) => rangeContains(merge, row, column)) ?? null;
}

export function canMergeRange(merges: SpreadsheetMerge[], range: SpreadsheetRange) {
  const normalized = normalizeRange(range);
  const hasArea = normalized.startRow !== normalized.endRow || normalized.startColumn !== normalized.endColumn;
  return hasArea && !merges.some((merge) => rangesOverlap(merge, normalized));
}

export function cellsCoveredByRange(range: SpreadsheetRange) {
  const normalized = normalizeRange(range);
  const keys: string[] = [];
  for (let row = normalized.startRow; row <= normalized.endRow; row += 1) {
    for (let column = normalized.startColumn; column <= normalized.endColumn; column += 1) {
      keys.push(cellKey(row, column));
    }
  }
  return keys;
}

export function rangeSize(range: SpreadsheetRange) {
  const normalized = normalizeRange(range);
  return {
    rows: normalized.endRow - normalized.startRow + 1,
    columns: normalized.endColumn - normalized.startColumn + 1,
  };
}

