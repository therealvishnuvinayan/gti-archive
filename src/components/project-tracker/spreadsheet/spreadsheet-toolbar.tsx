"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDownAZ,
  Bold,
  Check,
  ChevronDown,
  ClipboardPaste,
  Copy,
  Eraser,
  Filter,
  Grid2X2,
  Italic,
  ListChecks,
  PaintBucket,
  PanelTop,
  Redo2,
  Scissors,
  Search,
  Strikethrough,
  TableProperties,
  Underline,
  Undo2,
  WrapText,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

const EXCEL_THEME_COLORS = [
  "#000000", "#ffffff", "#1f4e78", "#e7e6e6", "#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47",
  "#404040", "#f2f2f2", "#d9eaf7", "#d0cece", "#d9e2f3", "#fce4d6", "#ededed", "#fff2cc", "#ddebf7", "#e2f0d9",
  "#595959", "#d9d9d9", "#b4c6e7", "#aeaaaa", "#b4c6e7", "#f8cbad", "#dbdbdb", "#ffe699", "#bdd7ee", "#c6e0b4",
  "#7f7f7f", "#bfbfbf", "#8ea9db", "#757171", "#8ea9db", "#f4b183", "#c9c9c9", "#ffd966", "#9dc3e6", "#a9d18e",
  "#a5a5a5", "#a6a6a6", "#2f5597", "#3f3f3f", "#2f5597", "#c65911", "#7b7b7b", "#bf9000", "#2e75b6", "#548235",
  "#d9d9d9", "#7f7f7f", "#203864", "#262626", "#203864", "#833c0c", "#525252", "#806000", "#1f4e78", "#375623",
] as const;

const EXCEL_STANDARD_COLORS = [
  "#c00000", "#ff0000", "#ffc000", "#ffff00", "#92d050",
  "#00b050", "#00b0f0", "#0070c0", "#002060", "#7030a0",
] as const;

function colorNeedsLightCheck(color: string) {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 < 140;
}

function ColorPickerTool({ title, value, defaultColor, defaultLabel, icon, disabled, onChange }: {
  title: string;
  value: string;
  defaultColor: string;
  defaultLabel: string;
  icon: ReactNode;
  disabled?: boolean;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const normalizedValue = value.toLocaleLowerCase();
  const colorItem = (color: string, group: string, index: number) => (
    <DropdownMenuItem
      key={`${group}:${index}:${color}`}
      aria-label={`${group} ${color}`}
      title={color}
      onSelect={() => onChange(color)}
      className="relative size-5 rounded-[3px] border border-black/15 p-0 data-[highlighted]:ring-2 data-[highlighted]:ring-[#217346] data-[highlighted]:ring-offset-1"
      style={{ backgroundColor: color }}
    >
      {normalizedValue === color ? <Check className={`absolute inset-0 m-auto size-3.5 ${colorNeedsLightCheck(color) ? "text-white" : "text-[#172019]"}`} strokeWidth={3} /> : null}
    </DropdownMenuItem>
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={title}
          aria-label={title}
          disabled={disabled}
          className="relative flex h-8 w-10 shrink-0 items-center justify-center rounded-[7px] text-[#4d5b51] transition hover:bg-[#eef3ef] disabled:opacity-35"
        >
          <span className="grid size-4 place-items-center">{icon}</span>
          <ChevronDown aria-hidden="true" className="absolute right-0.5 top-2.5 size-2.5" />
          <span className="absolute bottom-1 left-2 h-0.5 w-4 border border-black/10" style={{ backgroundColor: value }} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className="w-[252px] rounded-[12px] p-3">
        <DropdownMenuItem
          onSelect={() => onChange(defaultColor)}
          className="mb-2 h-8 rounded-[6px] border border-[#dfe4df] px-2.5 py-0 text-[11px] font-[700]"
        >
          <span className="size-4 rounded-[2px] border border-black/20" style={{ backgroundColor: defaultColor }} />
          {defaultLabel}
          {normalizedValue === defaultColor ? <Check className="ml-auto size-3.5" /> : null}
        </DropdownMenuItem>
        <p className="mb-1.5 text-[9px] font-[800] uppercase tracking-[0.12em] text-[#768178]">Theme colors</p>
        <div className="grid grid-cols-10 gap-1">
          {EXCEL_THEME_COLORS.map((color, index) => colorItem(color, "Theme color", index))}
        </div>
        <p className="mb-1.5 mt-3 text-[9px] font-[800] uppercase tracking-[0.12em] text-[#768178]">Standard colors</p>
        <div className="grid grid-cols-10 gap-1">
          {EXCEL_STANDARD_COLORS.map((color, index) => colorItem(color, "Standard color", index))}
        </div>
        <div className="mt-3 border-t border-[#e4e8e4] pt-2.5">
          <label className="flex h-9 cursor-pointer items-center gap-2 rounded-[7px] px-2 text-[11px] font-[750] text-[#344139] hover:bg-[#f1f6f2]">
            <span className="size-5 rounded-[4px] border border-black/20" style={{ backgroundColor: value }} />
            Pick a custom color
            <input
              type="color"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              className="ml-auto size-6 cursor-pointer rounded border-0 bg-transparent p-0"
              aria-label={`Pick custom ${title.toLocaleLowerCase()}`}
            />
          </label>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MergeCellsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M8 5v14M16 5v14M5.5 12h4M14.5 12h4M10 9.5l2.5 2.5-2.5 2.5M14 9.5 11.5 12l2.5 2.5" />
    </svg>
  );
}

function DecimalPlacesIcon({ direction }: { direction: "decrease" | "increase" }) {
  return (
    <span aria-hidden="true" className="flex items-center gap-px text-[10px] font-[800] tracking-[-0.08em]">
      {direction === "decrease" ? <span className="text-[9px]">←</span> : null}
      <span>{direction === "decrease" ? ".0" : ".00"}</span>
      {direction === "increase" ? <span className="text-[9px]">→</span> : null}
    </span>
  );
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

function IconSelect({ title, value, onChange, children, icon, disabled }: {
  title: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  icon: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={`relative flex h-8 w-11 shrink-0 items-center justify-center gap-0.5 rounded-[7px] text-[#4d5b51] transition ${disabled ? "opacity-35" : "cursor-pointer hover:bg-[#eef3ef]"}`}
      title={title}
    >
      <span className="sr-only">{title}</span>
      <span aria-hidden="true" className="grid size-4 place-items-center">{icon}</span>
      <ChevronDown aria-hidden="true" className="size-2.5" />
      <select
        aria-label={title}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-default"
      >
        {children}
      </select>
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
      <ToolButton title="Paste" disabled={disabled} onClick={() => void controller.paste()}><ClipboardPaste className="size-4" /></ToolButton>
      <IconSelect title="Clear" value="" disabled={disabled} icon={<Eraser className="size-4" />} onChange={(value) => {
        if (value === "contents") controller.clear();
        else if (value === "formatting") controller.clearFormatting();
        else if (value === "all") controller.clearAll();
      }}>
        <option value="">Clear</option><option value="contents">Clear contents</option><option value="formatting">Clear formatting</option><option value="all">Clear all</option>
      </IconSelect>
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
      <ColorPickerTool
        title="Text color"
        value={cellStyle.textColor ?? "#26332b"}
        defaultColor="#26332b"
        defaultLabel="Automatic"
        disabled={disabled}
        icon={<span aria-hidden="true" className="text-[14px] font-[800] leading-none">A</span>}
        onChange={(textColor) => set({ textColor })}
      />
      <ColorPickerTool
        title="Fill color"
        value={cellStyle.backgroundColor ?? "#ffffff"}
        defaultColor="#ffffff"
        defaultLabel="No fill"
        disabled={disabled}
        icon={<PaintBucket className="size-4" />}
        onChange={(backgroundColor) => set({ backgroundColor })}
      />
      <IconSelect title="Borders" value="" disabled={disabled} icon={<Grid2X2 className="size-4" />} onChange={(value) => value && controller.setBorders(value as Parameters<typeof controller.setBorders>[0])}>
        <option value="">Borders</option><option value="all">All borders</option><option value="outer">Outer borders</option><option value="inner">Inner borders</option><option value="top">Top border</option><option value="bottom">Bottom border</option><option value="left">Left border</option><option value="right">Right border</option><option value="none">Clear borders</option>
      </IconSelect>
      <Divider />
      <ToolButton title="Align left" active={cellStyle.horizontalAlign === "left"} disabled={disabled} onClick={() => set({ horizontalAlign: "left" })}><AlignLeft className="size-4" /></ToolButton>
      <ToolButton title="Align center" active={cellStyle.horizontalAlign === "center"} disabled={disabled} onClick={() => set({ horizontalAlign: "center" })}><AlignCenter className="size-4" /></ToolButton>
      <ToolButton title="Align right" active={cellStyle.horizontalAlign === "right"} disabled={disabled} onClick={() => set({ horizontalAlign: "right" })}><AlignRight className="size-4" /></ToolButton>
      <IconSelect
        title="Vertical alignment"
        value={cellStyle.verticalAlign ?? "middle"}
        disabled={disabled}
        icon={cellStyle.verticalAlign === "top" ? <AlignVerticalJustifyStart className="size-4" /> : cellStyle.verticalAlign === "bottom" ? <AlignVerticalJustifyEnd className="size-4" /> : <AlignVerticalJustifyCenter className="size-4" />}
        onChange={(value) => set({ verticalAlign: value as "top" | "middle" | "bottom" })}
      >
        <option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option>
      </IconSelect>
      <ToolButton title="Wrap text" active={cellStyle.wrap} disabled={disabled} onClick={() => set({ wrap: !cellStyle.wrap })}><WrapText className="size-4" /></ToolButton>
      <ToolButton title={controller.sheet.merges.some((merge) => merge.startRow <= controller.selection.anchorRow && merge.endRow >= controller.selection.anchorRow && merge.startColumn <= controller.selection.anchorColumn && merge.endColumn >= controller.selection.anchorColumn) ? "Unmerge cells" : "Merge cells"} disabled={disabled} onClick={controller.merge}><MergeCellsIcon /></ToolButton>
      <Divider />
      <IconSelect
        title="Number format"
        value={cellStyle.numberFormat ?? "general"}
        disabled={disabled}
        icon={<span className="text-[9px] font-[850] tracking-[-0.08em]">123</span>}
        onChange={(value) => set({ numberFormat: value as SpreadsheetNumberFormat })}
      >
        <option value="general">General</option><option value="number">Number</option><option value="currency">Currency</option><option value="accounting">Accounting</option><option value="percentage">Percentage</option><option value="date">Date</option><option value="time">Time</option>
      </IconSelect>
      <ToolButton title="Decrease decimal places" disabled={disabled} onClick={() => set({ decimalPlaces: Math.max(0, (cellStyle.decimalPlaces ?? 2) - 1) })}><DecimalPlacesIcon direction="decrease" /></ToolButton>
      <ToolButton title="Increase decimal places" disabled={disabled} onClick={() => set({ decimalPlaces: Math.min(8, (cellStyle.decimalPlaces ?? 2) + 1) })}><DecimalPlacesIcon direction="increase" /></ToolButton>
      <Divider />
      <IconSelect title="Sort range" value="" disabled={disabled} icon={<ArrowDownAZ className="size-4" />} onChange={(value) => value && controller.sort(value as "asc" | "desc")}>
        <option value="">Sort range</option><option value="asc">Sort A → Z</option><option value="desc">Sort Z → A</option>
      </IconSelect>
      <ToolButton title={controller.sheet.filter ? "Clear filters" : "Enable filter"} active={Boolean(controller.sheet.filter)} disabled={disabled} onClick={controller.toggleFilter}><Filter className="size-4" /></ToolButton>
      <IconSelect title="Freeze panes" value="" disabled={disabled} icon={<PanelTop className="size-4" />} onChange={(value) => {
        if (value === "top") controller.freeze(1, controller.sheet.frozenColumns);
        else if (value === "first") controller.freeze(controller.sheet.frozenRows, 1);
        else if (value === "active") controller.freeze(controller.selection.anchorRow, controller.selection.anchorColumn);
        else if (value === "none") controller.freeze(0, 0);
      }}>
        <option value="">Freeze</option><option value="top">Top row</option><option value="first">First column</option><option value="active">To active cell</option><option value="none">Unfreeze</option>
      </IconSelect>
      <ToolButton title="Find" onClick={onFind}><Search className="size-4" /></ToolButton>
      <ToolButton title="Data validation list" disabled={disabled} onClick={() => {
        const value = window.prompt("Dropdown values, separated by commas", controller.selectedCell?.validation?.values.join(", ") ?? "");
        if (value !== null) controller.setValidation(value.split(",").map((item) => item.trim()).filter(Boolean));
      }}><ListChecks className="size-4" /></ToolButton>
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
      }}><TableProperties className="size-4" /></ToolButton>
    </div>
  );
}
