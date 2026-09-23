import type {
  SpreadsheetCell,
  SpreadsheetScalar,
  SpreadsheetSheet,
  SpreadsheetWorkbook,
} from "../types/spreadsheet";
import { cellAddress, cellKey, columnIndexToLabel, parseCellAddress } from "./coordinates";

type FormulaValue = SpreadsheetScalar | string | FormulaRange;
type FormulaRange = { kind: "range"; values: FormulaValue[][] };
type FormulaError = "#REF!" | "#DIV/0!" | "#VALUE!" | "#NAME?" | "#CYCLE!" | "#N/A";
type Token = { type: "number" | "string" | "identifier" | "operator" | "punctuation" | "eof"; value: string };
type FormulaContext = {
  workbook: SpreadsheetWorkbook;
  sheet: SpreadsheetSheet;
  visit: (sheet: SpreadsheetSheet, address: string) => FormulaValue;
};

const ERRORS = new Set<FormulaError>(["#REF!", "#DIV/0!", "#VALUE!", "#NAME?", "#CYCLE!", "#N/A"]);

function isError(value: FormulaValue): value is FormulaError {
  return typeof value === "string" && ERRORS.has(value as FormulaError);
}

function isRange(value: FormulaValue): value is FormulaRange {
  return value !== null && typeof value === "object" && "kind" in value && value.kind === "range";
}

function flatten(value: FormulaValue): FormulaValue[] {
  return isRange(value) ? value.values.flatMap((row) => row.flatMap(flatten)) : [value];
}

function numeric(value: FormulaValue) {
  if (isError(value)) return value;
  if (isRange(value)) return numeric(flatten(value)[0] ?? null);
  if (value === null || value === "") return 0;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : "#VALUE!";
}

function truthy(value: FormulaValue) {
  if (isError(value)) return value;
  if (isRange(value)) return truthy(flatten(value)[0] ?? null);
  if (typeof value === "string") return value.length > 0 && value.toLocaleLowerCase() !== "false";
  return Boolean(value);
}

function textValue(value: FormulaValue) {
  if (isRange(value)) return textValue(flatten(value)[0] ?? null);
  if (value === null) return "";
  return String(value);
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const character = input[index];
    if (/\s/.test(character)) {
      index += 1;
      continue;
    }
    if (character === '"') {
      let value = "";
      index += 1;
      while (index < input.length) {
        if (input[index] === '"' && input[index + 1] === '"') {
          value += '"';
          index += 2;
          continue;
        }
        if (input[index] === '"') break;
        value += input[index++];
      }
      index += 1;
      tokens.push({ type: "string", value });
      continue;
    }
    if (character === "'") {
      let value = "";
      index += 1;
      while (index < input.length) {
        if (input[index] === "'" && input[index + 1] === "'") {
          value += "'";
          index += 2;
          continue;
        }
        if (input[index] === "'") break;
        value += input[index++];
      }
      index += 1;
      tokens.push({ type: "identifier", value });
      continue;
    }
    if (/\d|\./.test(character)) {
      const match = input.slice(index).match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
      if (match) {
        tokens.push({ type: "number", value: match[0] });
        index += match[0].length;
        continue;
      }
    }
    if (/[A-Za-z_$]/.test(character)) {
      const match = input.slice(index).match(/^[A-Za-z_$][A-Za-z0-9_.$]*/);
      if (match) {
        tokens.push({ type: "identifier", value: match[0] });
        index += match[0].length;
        continue;
      }
    }
    const pair = input.slice(index, index + 2);
    if (["<=", ">=", "<>", "!=", "=="].includes(pair)) {
      tokens.push({ type: "operator", value: pair });
      index += 2;
      continue;
    }
    if ("+-*/^%&=<>".includes(character)) tokens.push({ type: "operator", value: character });
    else if ("(),:!".includes(character)) tokens.push({ type: "punctuation", value: character });
    else tokens.push({ type: "identifier", value: character });
    index += 1;
  }
  tokens.push({ type: "eof", value: "" });
  return tokens;
}

class FormulaParser {
  private index = 0;

  constructor(private readonly tokens: Token[], private readonly context: FormulaContext) {}

  parse() {
    return this.comparison();
  }

  private current() {
    return this.tokens[this.index];
  }

  private take(value?: string) {
    const token = this.current();
    if (value !== undefined && token.value !== value) return null;
    this.index += 1;
    return token;
  }

  private comparison(): FormulaValue {
    let left = this.concatenate();
    while (["=", "==", "<>", "!=", "<", ">", "<=", ">="].includes(this.current().value)) {
      const operator = this.take()!.value;
      const right = this.concatenate();
      if (isError(left)) return left;
      if (isError(right)) return right;
      if (isRange(left) || isRange(right)) return "#VALUE!";
      const a = typeof left === "string" ? left.toLocaleLowerCase() : left;
      const b = typeof right === "string" ? right.toLocaleLowerCase() : right;
      if (operator === "=" || operator === "==") left = a === b;
      else if (operator === "<>" || operator === "!=") left = a !== b;
      else {
        const comparison = typeof a === "number" && typeof b === "number"
          ? a - b
          : String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
        if (operator === "<") left = comparison < 0;
        else if (operator === ">") left = comparison > 0;
        else if (operator === "<=") left = comparison <= 0;
        else left = comparison >= 0;
      }
    }
    return left;
  }

  private concatenate(): FormulaValue {
    let left = this.additive();
    while (this.current().value === "&") {
      this.take("&");
      const right = this.additive();
      if (isError(left)) return left;
      if (isError(right)) return right;
      left = textValue(left) + textValue(right);
    }
    return left;
  }

  private additive(): FormulaValue {
    let left = this.multiplicative();
    while (this.current().value === "+" || this.current().value === "-") {
      const operator = this.take()!.value;
      const right = this.multiplicative();
      const a = numeric(left);
      const b = numeric(right);
      if (typeof a === "string") return a;
      if (typeof b === "string") return b;
      left = operator === "+" ? a + b : a - b;
    }
    return left;
  }

  private multiplicative(): FormulaValue {
    let left = this.power();
    while (this.current().value === "*" || this.current().value === "/") {
      const operator = this.take()!.value;
      const right = this.power();
      const a = numeric(left);
      const b = numeric(right);
      if (typeof a === "string") return a;
      if (typeof b === "string") return b;
      if (operator === "/" && b === 0) return "#DIV/0!";
      left = operator === "*" ? a * b : a / b;
    }
    return left;
  }

  private power(): FormulaValue {
    let value = this.unary();
    if (this.current().value === "^") {
      this.take("^");
      const right = this.power();
      const a = numeric(value);
      const b = numeric(right);
      if (typeof a === "string") return a;
      if (typeof b === "string") return b;
      value = a ** b;
    }
    return value;
  }

  private unary(): FormulaValue {
    if (this.current().value === "+") {
      this.take("+");
      return this.unary();
    }
    if (this.current().value === "-") {
      this.take("-");
      const value = numeric(this.unary());
      return typeof value === "string" ? value : -value;
    }
    let value = this.primary();
    if (this.current().value === "%") {
      this.take("%");
      const number = numeric(value);
      value = typeof number === "string" ? number : number / 100;
    }
    return value;
  }

  private primary(): FormulaValue {
    const token = this.current();
    if (token.type === "number") {
      this.take();
      return Number(token.value);
    }
    if (token.type === "string") {
      this.take();
      return token.value;
    }
    if (token.value === "(") {
      this.take("(");
      const value = this.comparison();
      this.take(")");
      return value;
    }
    if (token.type !== "identifier") {
      this.take();
      return "#VALUE!";
    }

    const identifier = this.take()!.value;
    if (this.current().value === "!") {
      this.take("!");
      const reference = this.take();
      if (!reference || reference.type !== "identifier") return "#REF!";
      const targetSheet = this.context.workbook.sheets.find(
        (sheet) => sheet.name.toLocaleLowerCase() === identifier.toLocaleLowerCase(),
      );
      if (!targetSheet) return "#REF!";
      return this.reference(targetSheet, reference.value);
    }
    if (this.current().value === "(") return this.functionCall(identifier);
    if (identifier.toLocaleUpperCase() === "TRUE") return true;
    if (identifier.toLocaleUpperCase() === "FALSE") return false;
    if (parseCellAddress(identifier)) return this.reference(this.context.sheet, identifier);
    return "#NAME?";
  }

  private reference(sheet: SpreadsheetSheet, firstAddress: string): FormulaValue {
    const first = parseCellAddress(firstAddress);
    if (!first || first.row >= sheet.rowCount || first.column >= sheet.columnCount) return "#REF!";
    if (this.current().value !== ":") return this.context.visit(sheet, cellAddress(first.row, first.column));
    this.take(":");
    const secondToken = this.take();
    const second = secondToken ? parseCellAddress(secondToken.value) : null;
    if (!second || second.row >= sheet.rowCount || second.column >= sheet.columnCount) return "#REF!";
    const values: FormulaValue[][] = [];
    for (let row = Math.min(first.row, second.row); row <= Math.max(first.row, second.row); row += 1) {
      const outputRow: FormulaValue[] = [];
      for (let column = Math.min(first.column, second.column); column <= Math.max(first.column, second.column); column += 1) {
        outputRow.push(this.context.visit(sheet, cellAddress(row, column)));
      }
      values.push(outputRow);
    }
    return { kind: "range", values };
  }

  private functionCall(name: string): FormulaValue {
    this.take("(");
    const args: FormulaValue[] = [];
    while (this.current().type !== "eof" && this.current().value !== ")") {
      args.push(this.comparison());
      if (!this.take(",")) break;
    }
    this.take(")");
    return callFunction(name, args);
  }
}

function numbers(args: FormulaValue[]) {
  const result: number[] = [];
  for (const value of args.flatMap(flatten)) {
    if (typeof value === "number") result.push(value);
    else if (typeof value === "boolean") result.push(value ? 1 : 0);
  }
  return result;
}

function criterionMatches(value: FormulaValue, criterion: FormulaValue) {
  if (typeof criterion !== "string") return comparable(value) === comparable(criterion);
  const match = criterion.match(/^(<=|>=|<>|!=|=|<|>)(.*)$/);
  if (!match) return textValue(value).toLocaleLowerCase() === criterion.toLocaleLowerCase();
  const rightRaw = match[2];
  const right: string | number = Number.isFinite(Number(rightRaw)) ? Number(rightRaw) : rightRaw.toLocaleLowerCase();
  const left = typeof right === "number" ? numeric(value) : textValue(value).toLocaleLowerCase();
  if (typeof left === "string" && isError(left)) return false;
  if (match[1] === "=") return left === right;
  if (match[1] === "<>" || match[1] === "!=") return left !== right;
  const comparison = typeof left === "number" && typeof right === "number"
    ? left - right
    : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
  if (match[1] === "<") return comparison < 0;
  if (match[1] === ">") return comparison > 0;
  if (match[1] === "<=") return comparison <= 0;
  return comparison >= 0;
}

function excelSerial(date: Date) {
  return (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

function callFunction(rawName: string, args: FormulaValue[]): FormulaValue {
  const name = rawName.toLocaleUpperCase();
  if (name !== "IFERROR") {
    const error = args.flatMap(flatten).find(isError);
    if (error) return error;
  }
  const values = args.flatMap(flatten);
  const nums = numbers(args);
  if (name === "SUM") return nums.reduce((sum, value) => sum + value, 0);
  if (name === "AVERAGE") return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : "#DIV/0!";
  if (name === "MIN") return nums.length ? Math.min(...nums) : 0;
  if (name === "MAX") return nums.length ? Math.max(...nums) : 0;
  if (name === "COUNT") return nums.length;
  if (name === "COUNTA") return values.filter((value) => value !== null && value !== "").length;
  if (name === "IF") {
    const condition = truthy(args[0] ?? null);
    return typeof condition === "string" ? condition : condition ? (args[1] ?? true) : (args[2] ?? false);
  }
  if (name === "AND") {
    for (const value of values) {
      const result = truthy(value);
      if (typeof result === "string") return result;
      if (!result) return false;
    }
    return true;
  }
  if (name === "OR") {
    for (const value of values) {
      const result = truthy(value);
      if (typeof result === "string") return result;
      if (result) return true;
    }
    return false;
  }
  if (name === "NOT") {
    const result = truthy(args[0] ?? null);
    return typeof result === "string" ? result : !result;
  }
  if (["ROUND", "ROUNDUP", "ROUNDDOWN"].includes(name)) {
    const value = numeric(args[0] ?? null);
    const digits = numeric(args[1] ?? 0);
    if (typeof value === "string") return value;
    if (typeof digits === "string") return digits;
    const factor = 10 ** digits;
    if (name === "ROUND") return Math.round(value * factor) / factor;
    if (name === "ROUNDUP") return (value < 0 ? Math.floor(value * factor) : Math.ceil(value * factor)) / factor;
    return (value < 0 ? Math.ceil(value * factor) : Math.floor(value * factor)) / factor;
  }
  if (name === "ABS") {
    const value = numeric(args[0] ?? null);
    return typeof value === "string" ? value : Math.abs(value);
  }
  if (["SUMIF", "COUNTIF", "AVERAGEIF"].includes(name)) {
    const criteriaRange = isRange(args[0]) ? flatten(args[0]) : [args[0] ?? null];
    const criterion = args[1] ?? null;
    const resultRange = isRange(args[2]) ? flatten(args[2]) : criteriaRange;
    const matched = criteriaRange.flatMap((value, index) =>
      criterionMatches(value, criterion) ? [resultRange[index] ?? null] : []);
    if (name === "COUNTIF") return matched.length;
    const matchedNumbers = numbers(matched);
    if (name === "SUMIF") return matchedNumbers.reduce((sum, value) => sum + value, 0);
    return matchedNumbers.length
      ? matchedNumbers.reduce((sum, value) => sum + value, 0) / matchedNumbers.length
      : "#DIV/0!";
  }
  if (name === "CONCAT" || name === "CONCATENATE") return values.map(textValue).join("");
  if (name === "LEFT" || name === "RIGHT") {
    const text = textValue(args[0] ?? null);
    const length = numeric(args[1] ?? 1);
    if (typeof length === "string") return length;
    return name === "LEFT" ? text.slice(0, length) : text.slice(Math.max(0, text.length - length));
  }
  if (name === "MID") {
    const start = numeric(args[1] ?? 1);
    const length = numeric(args[2] ?? 0);
    if (typeof start === "string") return start;
    if (typeof length === "string") return length;
    return textValue(args[0] ?? null).slice(Math.max(0, start - 1), Math.max(0, start - 1) + length);
  }
  if (name === "LEN") return textValue(args[0] ?? null).length;
  if (name === "TRIM") return textValue(args[0] ?? null).trim().replace(/\s+/g, " ");
  if (name === "UPPER") return textValue(args[0] ?? null).toLocaleUpperCase();
  if (name === "LOWER") return textValue(args[0] ?? null).toLocaleLowerCase();
  if (name === "TODAY") return excelSerial(new Date());
  if (name === "NOW") return excelSerial(new Date()) + (Date.now() % 86_400_000) / 86_400_000;
  if (name === "DATE") {
    const year = numeric(args[0] ?? null);
    const month = numeric(args[1] ?? null);
    const day = numeric(args[2] ?? null);
    if ([year, month, day].some((value) => typeof value === "string")) return "#VALUE!";
    return excelSerial(new Date(Date.UTC(year as number, (month as number) - 1, day as number)));
  }
  if (["YEAR", "MONTH", "DAY"].includes(name)) {
    const value = numeric(args[0] ?? null);
    if (typeof value === "string") return value;
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86_400_000);
    if (name === "YEAR") return date.getUTCFullYear();
    if (name === "MONTH") return date.getUTCMonth() + 1;
    return date.getUTCDate();
  }
  if (name === "IFERROR") return isError(args[0] ?? null) ? (args[1] ?? "") : (args[0] ?? null);
  if (name === "VLOOKUP") {
    const table = args[1];
    const index = numeric(args[2] ?? 1);
    if (!isRange(table) || typeof index === "string") return "#VALUE!";
    const row = table.values.find((candidate) => comparable(candidate[0] ?? null) === comparable(args[0] ?? null));
    return row?.[Math.max(0, index - 1)] ?? "#N/A";
  }
  if (name === "HLOOKUP") {
    const table = args[1];
    const index = numeric(args[2] ?? 1);
    if (!isRange(table) || typeof index === "string") return "#VALUE!";
    const column = table.values[0]?.findIndex((value) => comparable(value) === comparable(args[0] ?? null)) ?? -1;
    return column >= 0 ? table.values[Math.max(0, index - 1)]?.[column] ?? "#N/A" : "#N/A";
  }
  if (name === "INDEX") {
    const range = args[0];
    const row = numeric(args[1] ?? 1);
    const column = numeric(args[2] ?? 1);
    if (!isRange(range) || typeof row === "string" || typeof column === "string") return "#VALUE!";
    return range.values[Math.max(0, row - 1)]?.[Math.max(0, column - 1)] ?? "#REF!";
  }
  if (name === "MATCH") {
    const range = args[1];
    if (!isRange(range)) return "#VALUE!";
    const index = flatten(range).findIndex((value) => comparable(value) === comparable(args[0] ?? null));
    return index >= 0 ? index + 1 : "#N/A";
  }
  if (name === "XLOOKUP") {
    const lookup = args[1];
    const result = args[2];
    if (!isRange(lookup) || !isRange(result)) return "#VALUE!";
    const index = flatten(lookup).findIndex((value) => comparable(value) === comparable(args[0] ?? null));
    return index >= 0 ? flatten(result)[index] ?? (args[3] ?? "#N/A") : (args[3] ?? "#N/A");
  }
  return "#NAME?";
}

function comparable(value: FormulaValue): string | number | boolean | null {
  if (isRange(value)) return comparable(flatten(value)[0] ?? null);
  return typeof value === "string" ? value.toLocaleLowerCase() : value;
}

export function evaluateFormula(formula: string, context: FormulaContext): FormulaValue {
  try {
    const input = formula.trim().replace(/^=/, "");
    if (!input) return null;
    return new FormulaParser(tokenize(input), context).parse();
  } catch {
    return "#VALUE!";
  }
}

export function recalculateWorkbook(workbook: SpreadsheetWorkbook) {
  const sheets = workbook.sheets.map((sheet) => ({ ...sheet, cells: { ...sheet.cells } }));
  const nextWorkbook = { ...workbook, sheets };
  const cache = new Map<string, FormulaValue>();
  const visiting = new Set<string>();
  const dependencies = new Map<string, Set<string>>();

  const visit = (sheet: SpreadsheetSheet, address: string): FormulaValue => {
    const coordinate = parseCellAddress(address);
    if (!coordinate) return "#REF!";
    const identity = `${sheet.id}!${cellAddress(coordinate.row, coordinate.column)}`;
    if (cache.has(identity)) return cache.get(identity)!;
    if (visiting.has(identity)) return "#CYCLE!";
    const cell = sheet.cells[cellKey(coordinate.row, coordinate.column)];
    if (!cell?.formula) return cell?.value ?? null;
    visiting.add(identity);
    const value = evaluateFormula(cell.formula, { workbook: nextWorkbook, sheet, visit });
    visiting.delete(identity);
    const normalized = isRange(value) ? "#VALUE!" : value;
    cache.set(identity, normalized);
    sheet.cells[cellKey(coordinate.row, coordinate.column)] = { ...cell, computedValue: normalized };
    for (const reference of extractFormulaReferences(cell.formula, sheet.name)) {
      const dependency = `${reference.sheet}!${reference.address}`;
      const dependents = dependencies.get(dependency) ?? new Set<string>();
      dependents.add(identity);
      dependencies.set(dependency, dependents);
    }
    return normalized;
  };

  for (const sheet of sheets) {
    for (const [key, cell] of Object.entries(sheet.cells)) {
      if (!cell.formula) continue;
      const coordinate = key.split(":").map(Number);
      visit(sheet, cellAddress(coordinate[0], coordinate[1]));
    }
  }
  return { workbook: nextWorkbook, dependencies };
}

export function extractFormulaReferences(formula: string, defaultSheet: string) {
  const references: Array<{ sheet: string; address: string }> = [];
  const expression = /(?:(?:'((?:[^']|'')+)'|([A-Za-z_][A-Za-z0-9_. ]*))!)?(\$?[A-Z]+\$?\d+)/g;
  for (const match of formula.toLocaleUpperCase().matchAll(expression)) {
    const rawSheet = match[1]?.replaceAll("''", "'") ?? match[2];
    const parsed = parseCellAddress(match[3]);
    if (!parsed) continue;
    references.push({
      sheet: rawSheet || defaultSheet,
      address: cellAddress(parsed.row, parsed.column),
    });
  }
  return references;
}

export function translateFormula(formula: string, rowDelta: number, columnDelta: number) {
  return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/gi, (match, fixedColumn, label, fixedRow, rowText) => {
    const parsed = parseCellAddress(`${label}${rowText}`);
    if (!parsed) return match;
    const row = fixedRow ? parsed.row : parsed.row + rowDelta;
    const column = fixedColumn ? parsed.column : parsed.column + columnDelta;
    if (row < 0 || column < 0) return "#REF!";
    return `${fixedColumn}${columnIndexToLabel(column)}${fixedRow}${row + 1}`;
  });
}

export function formulaCellValue(cell: SpreadsheetCell | undefined) {
  return cell?.formula ? cell.computedValue ?? null : cell?.value ?? null;
}
