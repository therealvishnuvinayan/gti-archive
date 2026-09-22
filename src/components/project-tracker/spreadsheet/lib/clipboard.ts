import type { SpreadsheetScalar } from "../types/spreadsheet";

export function parseClipboardText(text: string): SpreadsheetScalar[][] {
  const normalized = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  if (!normalized) return [[null]];
  return normalized.split("\n").map((line) =>
    line.split("\t").map((raw) => {
      if (raw === "") return null;
      if (/^(true|false)$/i.test(raw)) return raw.toLowerCase() === "true";
      const numeric = Number(raw.replaceAll(",", ""));
      return Number.isFinite(numeric) && raw.trim() !== "" ? numeric : raw;
    }),
  );
}

export function serializeClipboardMatrix(matrix: SpreadsheetScalar[][]) {
  return matrix
    .map((row) => row.map((value) => value === null ? "" : String(value)).join("\t"))
    .join("\n");
}

