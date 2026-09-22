import assert from "node:assert/strict";

import { parseClipboardText, serializeClipboardMatrix } from "../src/components/project-tracker/spreadsheet/lib/clipboard";
import {
  cellAddress,
  cellKey,
  columnIndexToLabel,
  columnLabelToIndex,
  normalizeRange,
  parseCellAddress,
  rangeLabel,
  rangesOverlap,
} from "../src/components/project-tracker/spreadsheet/lib/coordinates";
import { formulaCellValue, recalculateWorkbook, translateFormula } from "../src/components/project-tracker/spreadsheet/lib/formulas";
import { applyCellPatch, reverseCellPatch } from "../src/components/project-tracker/spreadsheet/lib/history";
import { canMergeRange, findMergeAt } from "../src/components/project-tracker/spreadsheet/lib/ranges";
import { emptySheet, workbookFromStored } from "../src/components/project-tracker/spreadsheet/lib/workbook";
import { importXlsxWorkbook, workbookToXlsxBuffer } from "../src/components/project-tracker/spreadsheet/lib/xlsx";
import type { SpreadsheetWorkbook } from "../src/components/project-tracker/spreadsheet/types/spreadsheet";

assert.equal(columnLabelToIndex("A"), 0);
assert.equal(columnLabelToIndex("Z"), 25);
assert.equal(columnLabelToIndex("AA"), 26);
assert.equal(columnLabelToIndex("AB"), 27);
assert.equal(columnIndexToLabel(51), "AZ");
assert.equal(columnIndexToLabel(52), "BA");
assert.deepEqual(parseCellAddress("$AB$12"), { row: 11, column: 27 });
assert.equal(cellAddress(11, 27), "AB12");
assert.equal(rangeLabel({ startRow: 3, startColumn: 2, endRow: 0, endColumn: 0 }), "A1:C4");
assert.deepEqual(normalizeRange({ startRow: 4, startColumn: 5, endRow: 1, endColumn: 2 }), {
  startRow: 1, startColumn: 2, endRow: 4, endColumn: 5,
});

assert.equal(rangesOverlap(
  { startRow: 0, startColumn: 0, endRow: 2, endColumn: 2 },
  { startRow: 2, startColumn: 2, endRow: 4, endColumn: 4 },
), true);
assert.equal(canMergeRange([], { startRow: 0, startColumn: 0, endRow: 1, endColumn: 1 }), true);
assert.equal(findMergeAt([{ startRow: 2, startColumn: 2, endRow: 3, endColumn: 4 }], 3, 3)?.endColumn, 4);

assert.deepEqual(parseClipboardText("A\t2\tTRUE\nB\t3.5\t"), [["A", 2, true], ["B", 3.5, null]]);
assert.equal(serializeClipboardMatrix([["A", 2, true], ["B", null, false]]), "A\t2\ttrue\nB\t\tfalse");

assert.equal(translateFormula("=A1+$B$2+C$3+$D4", 2, 3), "=D3+$B$2+F$3+$D6");
assert.equal(translateFormula("=A1", -1, 0), "=#REF!");

const sheet = emptySheet("Calculations", "sheet-1");
sheet.cells = {
  [cellKey(0, 0)]: { value: 10 },
  [cellKey(0, 1)]: { formula: "=A1*2" },
  [cellKey(0, 2)]: { formula: "=B1+5" },
  [cellKey(1, 0)]: { value: 4 },
  [cellKey(2, 0)]: { formula: "=SUM(A1:A2)" },
  [cellKey(3, 0)]: { formula: "=IF(C1=25,\"yes\",\"no\")" },
  [cellKey(4, 0)]: { formula: "=XLOOKUP(4,A1:A2,B1:B2,\"missing\")" },
};
let workbook: SpreadsheetWorkbook = { version: 2, activeSheetId: sheet.id, sheets: [sheet] };
let calculated = recalculateWorkbook(workbook).workbook;
assert.equal(formulaCellValue(calculated.sheets[0].cells[cellKey(0, 1)]), 20);
assert.equal(formulaCellValue(calculated.sheets[0].cells[cellKey(0, 2)]), 25);
assert.equal(formulaCellValue(calculated.sheets[0].cells[cellKey(2, 0)]), 14);
assert.equal(formulaCellValue(calculated.sheets[0].cells[cellKey(3, 0)]), "yes");

calculated.sheets[0].cells[cellKey(0, 0)] = { value: 20 };
calculated = recalculateWorkbook(calculated).workbook;
assert.equal(formulaCellValue(calculated.sheets[0].cells[cellKey(0, 2)]), 45);

const cycleSheet = emptySheet("Cycle", "cycle");
cycleSheet.cells = {
  [cellKey(0, 0)]: { formula: "=B1" },
  [cellKey(0, 1)]: { formula: "=A1" },
};
const cycle = recalculateWorkbook({ version: 2, activeSheetId: "cycle", sheets: [cycleSheet] }).workbook;
assert.equal(formulaCellValue(cycle.sheets[0].cells[cellKey(0, 0)]), "#CYCLE!");

const historySheet = emptySheet("History", "history");
historySheet.cells.A = { value: "before" };
const forward = { A: { value: "after" }, B: { value: 2 } };
const reverse = reverseCellPatch(historySheet, forward);
const changed = applyCellPatch(historySheet, forward);
assert.equal(changed.cells.A.value, "after");
assert.equal(changed.cells.B.value, 2);
const undone = applyCellPatch(changed, reverse);
assert.equal(undone.cells.A.value, "before");
assert.equal(undone.cells.B, undefined);

const migrated = workbookFromStored([{
  id: "legacy-sheet",
  name: "Legacy",
  row: 50,
  column: 26,
  celldata: [{
    r: 1,
    c: 2,
    v: { v: 12, f: "A1+B1", bg: "#ff0000", bl: 1, ps: { value: "Migrated note" } },
  }],
  config: {
    columnlen: { 2: 144 },
    rowlen: { 1: 36 },
    merge: { C2: { r: 1, c: 2, rs: 1, cs: 2 } },
  },
}]);
assert.ok(migrated);
assert.equal(migrated.sheets[0].rowCount, 1_000);
assert.equal(migrated.sheets[0].columnCount, 100);
assert.equal(migrated.sheets[0].cells[cellKey(1, 2)].formula, "=A1+B1");
assert.equal(migrated.sheets[0].cells[cellKey(1, 2)].style?.backgroundColor, "#ff0000");
assert.equal(migrated.sheets[0].cells[cellKey(1, 2)].style?.fontWeight, "bold");
assert.equal(migrated.sheets[0].cells[cellKey(1, 2)].comment, "Migrated note");
assert.equal(migrated.sheets[0].columnMetadata["2"].width, 144);
assert.deepEqual(migrated.sheets[0].merges[0], { startRow: 1, startColumn: 2, endRow: 1, endColumn: 3 });

async function verifyXlsxRoundTrip() {
  const exportSheet = emptySheet("Styled", "styled");
  exportSheet.rowCount = 1_000;
  exportSheet.columnCount = 100;
  exportSheet.cells[cellKey(0, 0)] = {
    value: "Header",
    style: { fontWeight: "bold", textColor: "#ffffff", backgroundColor: "#1f6f4a", horizontalAlign: "center" },
    comment: "Important",
  };
  exportSheet.cells[cellKey(1, 0)] = { value: 25, style: { numberFormat: "percentage", decimalPlaces: 0 } };
  exportSheet.cells[cellKey(1, 1)] = { formula: "=A2*2", computedValue: 50 };
  exportSheet.merges = [{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 }];
  exportSheet.frozenRows = 1;
  exportSheet.columnMetadata["0"] = { width: 180 };
  workbook = { version: 2, activeSheetId: exportSheet.id, sheets: [exportSheet] };
  const xlsx = await workbookToXlsxBuffer(workbook);
  const byteView = Uint8Array.from(xlsx as unknown as ArrayLike<number>);
  const imported = await importXlsxWorkbook(byteView.buffer);
  assert.equal(imported.workbook.sheets.length, 1);
  assert.equal(imported.workbook.sheets[0].name, "Styled");
  assert.equal(imported.workbook.sheets[0].cells[cellKey(0, 0)].value, "Header");
  assert.equal(imported.workbook.sheets[0].cells[cellKey(0, 0)].style?.fontWeight, "bold");
  assert.equal(imported.workbook.sheets[0].cells[cellKey(0, 0)].comment, "Important");
  assert.equal(imported.workbook.sheets[0].cells[cellKey(1, 1)].formula, "=A2*2");
  assert.deepEqual(imported.workbook.sheets[0].merges[0], { startRow: 0, startColumn: 0, endRow: 0, endColumn: 1 });
  console.log("Project Tracker spreadsheet logic checks passed.");
}

void verifyXlsxRoundTrip().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
