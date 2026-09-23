export type SpreadsheetScalar = string | number | boolean | null;

export type HorizontalAlignment = "left" | "center" | "right";
export type VerticalAlignment = "top" | "middle" | "bottom";
export type SpreadsheetNumberFormat =
  | "general"
  | "number"
  | "currency"
  | "accounting"
  | "percentage"
  | "date"
  | "time";

export type SpreadsheetBorder = {
  style: "solid";
  color: string;
};

export type SpreadsheetCellStyle = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  textColor?: string;
  backgroundColor?: string;
  horizontalAlign?: HorizontalAlignment;
  verticalAlign?: VerticalAlignment;
  wrap?: boolean;
  numberFormat?: SpreadsheetNumberFormat;
  decimalPlaces?: number;
  borders?: Partial<Record<"top" | "right" | "bottom" | "left", SpreadsheetBorder>>;
};

export type SpreadsheetValidation = {
  type: "list";
  values: string[];
  allowBlank?: boolean;
};

export type SpreadsheetCell = {
  value?: SpreadsheetScalar;
  formula?: string;
  computedValue?: SpreadsheetScalar | string;
  style?: SpreadsheetCellStyle;
  validation?: SpreadsheetValidation;
  comment?: string;
};

export type SpreadsheetRowMetadata = {
  height?: number;
  hidden?: boolean;
  style?: SpreadsheetCellStyle;
};

export type SpreadsheetColumnMetadata = {
  width?: number;
  hidden?: boolean;
  style?: SpreadsheetCellStyle;
};

export type SpreadsheetRange = {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
};

export type SpreadsheetMerge = SpreadsheetRange;

export type SpreadsheetFilter = {
  range: SpreadsheetRange;
  hiddenRows: number[];
  criteria: Record<string, string[]>;
};

export type ConditionalFormatRule = {
  id: string;
  range: SpreadsheetRange;
  kind: "greaterThan" | "lessThan" | "equalTo" | "textContains" | "duplicate";
  value?: SpreadsheetScalar;
  style: Pick<SpreadsheetCellStyle, "backgroundColor" | "textColor">;
};

export type SpreadsheetSheet = {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  cells: Record<string, SpreadsheetCell>;
  rowMetadata: Record<string, SpreadsheetRowMetadata>;
  columnMetadata: Record<string, SpreadsheetColumnMetadata>;
  merges: SpreadsheetMerge[];
  frozenRows: number;
  frozenColumns: number;
  filter?: SpreadsheetFilter;
  conditionalFormats: ConditionalFormatRule[];
};

export type SpreadsheetWorkbook = {
  version: 2;
  activeSheetId: string;
  sheets: SpreadsheetSheet[];
};

export type SpreadsheetSelectionKind = "cell" | "row" | "column" | "all";

export type SpreadsheetSelection = SpreadsheetRange & {
  anchorRow: number;
  anchorColumn: number;
  kind: SpreadsheetSelectionKind;
};

export type SpreadsheetContextTarget =
  | { kind: "cell"; row: number; column: number }
  | { kind: "row"; row: number }
  | { kind: "column"; column: number };

export type SpreadsheetSaveState = "saved" | "saving" | "error";

export const DEFAULT_ROW_COUNT = 1_000;
export const DEFAULT_COLUMN_COUNT = 100;
export const DEFAULT_ROW_HEIGHT = 28;
export const DEFAULT_COLUMN_WIDTH = 140;
export const ROW_HEADER_WIDTH = 48;
export const COLUMN_HEADER_HEIGHT = 28;
export const PRIMARY_SHEET_ID = "project-tracker";

