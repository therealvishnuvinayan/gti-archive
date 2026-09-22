"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  CaseUpper,
  ChevronDown,
  Copy,
  Filter,
  Italic,
  Merge,
  PaintBucket,
  Redo2,
  Scissors,
  Search,
  Sigma,
  Strikethrough,
  Underline,
  Undo2,
  WrapText,
} from "lucide-react";
import type { ReactNode } from "react";

import { resolveCellStyle } from "./lib/formatting";
import type { SpreadsheetController } from "./hooks/use-spreadsheet";
import type { SpreadsheetCellStyle, SpreadsheetNumberFormat } from "./types/spreadsheet";

function ToolButton({ title, active, disabled, onClick, children }: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-8 shrink-0 place-items-center rounded-[7px] transition disabled:opacity-35 ${active ? "bg-[#dceee1] text-[#17683f]" : "text-[#4d5b51] hover:bg-[#eef3ef]"}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-6 w-px shrink-0 bg-[#dfe5df]" />;
}

function SmallSelect({ title, value, onChange, children, width = "w-[92px]" }: {
  title: string;
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  width?: string;
}) {
  return (
    <label className={`relative h-8 shrink-0 ${width}`} title={title}>
      <span className="sr-only">{title}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-full w-full appearance-none rounded-[7px] border border-[#dce3dc] bg-white pl-2 pr-6 text-[11px] font-[650] text-[#465249] outline-none hover:bg-[#f7f9f7] focus:border-[#83b696]"
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-2.5 size-3 text-[#6d786f]" />
    </label>
  );
}

export function SpreadsheetToolbar({ controller, canEdit, onFind }: {
  controller: SpreadsheetController;
  canEdit: boolean;
  onFind: () => void;
}) {
  const cellStyle = resolveCellStyle(
    controller.sheet,
    controller.selection.anchorRow,
    controller.selection.anchorColumn,
    controller.selectedCell,
  );
  const set = (style: SpreadsheetCellStyle) => controller.format(style);
  const disabled = !canEdit;

  return (
    <div className="no-scrollbar flex min-h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[#dfe5df] bg-[#f9fbf9] px-2 py-1.5">
      <ToolButton title="Undo" disabled={!controller.canUndo} onClick={controller.undo}><Undo2 className="size-4" /></ToolButton>
      <ToolButton title="Redo" disabled={!controller.canRedo} onClick={controller.redo}><Redo2 className="size-4" /></ToolButton>
      <Divider />
      <ToolButton title="Cut" disabled={disabled} onClick={() => void controller.copy(true)}><Scissors className="size-4" /></ToolButton>
      <ToolButton title="Copy" onClick={() => void controller.copy()}><Copy className="size-4" /></ToolButton>
      <ToolButton title="Paste" disabled={disabled} onClick={() => void controller.paste()}><span className="text-[13px] font-[850]">P</span></ToolButton>
      <Divider />
      <SmallSelect title="Font family" value={cellStyle.fontFamily ?? "Inter"} width="w-[112px]" onChange={(value) => set({ fontFamily: value })}>
        {['Inter', 'Arial', 'Calibri', 'Georgia', 'Times New Roman', 'Courier New'].map((font) => <option key={font}>{font}</option>)}
      </SmallSelect>
      <SmallSelect title="Font size" value={cellStyle.fontSize ?? 12} width="w-[62px]" onChange={(value) => set({ fontSize: Number(value) })}>
        {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32].map((size) => <option key={size}>{size}</option>)}
      </SmallSelect>
      <ToolButton title="Bold" active={cellStyle.fontWeight === "bold"} disabled={disabled} onClick={() => set({ fontWeight: cellStyle.fontWeight === "bold" ? "normal" : "bold" })}><Bold className="size-4" /></ToolButton>
      <ToolButton title="Italic" active={cellStyle.italic} disabled={disabled} onClick={() => set({ italic: !cellStyle.italic })}><Italic className="size-4" /></ToolButton>
      <ToolButton title="Underline" active={cellStyle.underline} disabled={disabled} onClick={() => set({ underline: !cellStyle.underline })}><Underline className="size-4" /></ToolButton>
      <ToolButton title="Strikethrough" active={cellStyle.strike} disabled={disabled} onClick={() => set({ strike: !cellStyle.strike })}><Strikethrough className="size-4" /></ToolButton>
      <label className="relative grid size-8 shrink-0 cursor-pointer place-items-center rounded-[7px] text-[#4d5b51] hover:bg-[#eef3ef]" title="Text color">
        <CaseUpper className="size-4" />
        <span className="absolute bottom-1 h-0.5 w-4" style={{ backgroundColor: cellStyle.textColor ?? "#26332b" }} />
        <input type="color" value={cellStyle.textColor ?? "#26332b"} onChange={(event) => set({ textColor: event.target.value })} className="absolute inset-0 cursor-pointer opacity-0" disabled={disabled} aria-label="Text color" />
      </label>
      <label className="relative grid size-8 shrink-0 cursor-pointer place-items-center rounded-[7px] text-[#4d5b51] hover:bg-[#eef3ef]" title="Fill color">
        <PaintBucket className="size-4" />
        <span className="absolute bottom-1 h-0.5 w-4" style={{ backgroundColor: cellStyle.backgroundColor ?? "#ffffff" }} />
        <input type="color" value={cellStyle.backgroundColor ?? "#ffffff"} onChange={(event) => set({ backgroundColor: event.target.value })} className="absolute inset-0 cursor-pointer opacity-0" disabled={disabled} aria-label="Fill color" />
      </label>
      <SmallSelect title="Borders" value="" width="w-[78px]" onChange={(value) => value && controller.setBorders(value as Parameters<typeof controller.setBorders>[0])}>
        <option value="">Borders</option><option value="all">All</option><option value="outer">Outer</option><option value="inner">Inner</option><option value="top">Top</option><option value="bottom">Bottom</option><option value="left">Left</option><option value="right">Right</option><option value="none">None</option>
      </SmallSelect>
      <Divider />
      <ToolButton title="Align left" active={cellStyle.horizontalAlign === "left"} disabled={disabled} onClick={() => set({ horizontalAlign: "left" })}><AlignLeft className="size-4" /></ToolButton>
      <ToolButton title="Align center" active={cellStyle.horizontalAlign === "center"} disabled={disabled} onClick={() => set({ horizontalAlign: "center" })}><AlignCenter className="size-4" /></ToolButton>
      <ToolButton title="Align right" active={cellStyle.horizontalAlign === "right"} disabled={disabled} onClick={() => set({ horizontalAlign: "right" })}><AlignRight className="size-4" /></ToolButton>
      <SmallSelect title="Vertical alignment" value={cellStyle.verticalAlign ?? "middle"} width="w-[72px]" onChange={(value) => set({ verticalAlign: value as "top" | "middle" | "bottom" })}>
        <option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option>
      </SmallSelect>
      <ToolButton title="Wrap text" active={cellStyle.wrap} disabled={disabled} onClick={() => set({ wrap: !cellStyle.wrap })}><WrapText className="size-4" /></ToolButton>
      <ToolButton title={controller.sheet.merges.some((merge) => merge.startRow <= controller.selection.anchorRow && merge.endRow >= controller.selection.anchorRow && merge.startColumn <= controller.selection.anchorColumn && merge.endColumn >= controller.selection.anchorColumn) ? "Unmerge cells" : "Merge cells"} disabled={disabled} onClick={controller.merge}><Merge className="size-4" /></ToolButton>
      <Divider />
      <SmallSelect title="Number format" value={cellStyle.numberFormat ?? "general"} width="w-[104px]" onChange={(value) => set({ numberFormat: value as SpreadsheetNumberFormat })}>
        <option value="general">General</option><option value="number">Number</option><option value="currency">Currency</option><option value="accounting">Accounting</option><option value="percentage">Percentage</option><option value="date">Date</option><option value="time">Time</option>
      </SmallSelect>
      <ToolButton title="Decrease decimal places" disabled={disabled} onClick={() => set({ decimalPlaces: Math.max(0, (cellStyle.decimalPlaces ?? 2) - 1) })}><span className="text-[11px] font-[800]">.0−</span></ToolButton>
      <ToolButton title="Increase decimal places" disabled={disabled} onClick={() => set({ decimalPlaces: Math.min(8, (cellStyle.decimalPlaces ?? 2) + 1) })}><span className="text-[11px] font-[800]">.0+</span></ToolButton>
      <Divider />
      <SmallSelect title="Sort" value="" width="w-[76px]" onChange={(value) => value && controller.sort(value as "asc" | "desc")}>
        <option value="">Sort</option><option value="asc">A → Z</option><option value="desc">Z → A</option>
      </SmallSelect>
      <ToolButton title={controller.sheet.filter ? "Clear filters" : "Enable filter"} active={Boolean(controller.sheet.filter)} disabled={disabled} onClick={controller.toggleFilter}><Filter className="size-4" /></ToolButton>
      <SmallSelect title="Freeze panes" value="" width="w-[84px]" onChange={(value) => {
        if (value === "top") controller.freeze(1, controller.sheet.frozenColumns);
        else if (value === "first") controller.freeze(controller.sheet.frozenRows, 1);
        else if (value === "active") controller.freeze(controller.selection.anchorRow, controller.selection.anchorColumn);
        else if (value === "none") controller.freeze(0, 0);
      }}>
        <option value="">Freeze</option><option value="top">Top row</option><option value="first">First column</option><option value="active">To active cell</option><option value="none">Unfreeze</option>
      </SmallSelect>
      <ToolButton title="Find" onClick={onFind}><Search className="size-4" /></ToolButton>
      <ToolButton title="Data validation list" disabled={disabled} onClick={() => {
        const value = window.prompt("Dropdown values, separated by commas", controller.selectedCell?.validation?.values.join(", ") ?? "");
        if (value !== null) controller.setValidation(value.split(",").map((item) => item.trim()).filter(Boolean));
      }}><ChevronDown className="size-4" /></ToolButton>
      <ToolButton title="Conditional formatting" disabled={disabled} onClick={() => {
        const kind = window.prompt("Rule: greater than, less than, equal to, text contains, or duplicate", "greater than")?.toLocaleLowerCase();
        if (!kind) return;
        const map: Record<string, "greaterThan" | "lessThan" | "equalTo" | "textContains" | "duplicate"> = {
          "greater than": "greaterThan", "less than": "lessThan", "equal to": "equalTo", "text contains": "textContains", duplicate: "duplicate",
        };
        const ruleKind = map[kind];
        if (!ruleKind) return;
        const raw = ruleKind === "duplicate" ? null : window.prompt("Compare with", "");
        if (raw === null && ruleKind !== "duplicate") return;
        const number = Number(raw);
        controller.addConditionalFormat({
          kind: ruleKind,
          value: raw !== null && raw.trim() !== "" && Number.isFinite(number) ? number : raw,
          style: { backgroundColor: "#fff0b8", textColor: "#7b4d00" },
        });
      }}><Sigma className="size-4" /></ToolButton>
    </div>
  );
}

