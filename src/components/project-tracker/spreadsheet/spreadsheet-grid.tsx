"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Filter } from "lucide-react";

import type { SpreadsheetController } from "./hooks/use-spreadsheet";
import {
  cellKey,
  columnIndexToLabel,
  normalizeRange,
  rangeContains,
} from "./lib/coordinates";
import { formatCellDisplay, resolveCellStyle } from "./lib/formatting";
import { formulaCellValue } from "./lib/formulas";
import { findMergeAt } from "./lib/ranges";
import { columnWidth, rowHeight } from "./lib/workbook";
import type { SpreadsheetCell } from "./types/spreadsheet";
import type { SpreadsheetContextMenuState } from "./spreadsheet-context-menu";

export type SpreadsheetGridHandle = {
  scrollToCell: (row: number, column: number) => void;
  focus: () => void;
};

type ResizeState =
  | { kind: "column"; index: number; start: number; original: number; current: number }
  | { kind: "row"; index: number; start: number; original: number; current: number };

function offsetsFor(count: number, size: (index: number) => number) {
  const offsets = new Array<number>(count + 1);
  offsets[0] = 0;
  for (let index = 0; index < count; index += 1) offsets[index + 1] = offsets[index] + size(index);
  return offsets;
}

function visibleIndices(offsets: number[], start: number, end: number, overscan: number) {
  let low = 0;
  let high = offsets.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (offsets[middle] < start) low = middle + 1;
    else high = middle;
  }
  const first = Math.max(0, low - 1 - overscan);
  const values: number[] = [];
  for (let index = first; index < offsets.length - 1 && offsets[index] <= end; index += 1) {
    if (offsets[index + 1] > offsets[index]) values.push(index);
  }
  return values;
}

function selectionEdge(controller: SpreadsheetController, row: number, column: number) {
  const range = normalizeRange(controller.selection);
  return {
    selected: rangeContains(range, row, column),
    top: row === range.startRow,
    right: column === range.endColumn,
    bottom: row === range.endRow,
    left: column === range.startColumn,
    active: row === controller.selection.anchorRow && column === controller.selection.anchorColumn,
  };
}

function SpreadsheetCellEditor({
  initialValue,
  replacement,
  onCommit,
  onCancel,
  onMove,
}: {
  initialValue: string;
  replacement?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  onMove: (rowDelta: number, columnDelta: number) => void;
}) {
  const [value, setValue] = useState(replacement ?? initialValue);
  const finished = useRef(false);
  const commit = useCallback((movement?: [number, number]) => {
    if (finished.current) return;
    finished.current = true;
    onCommit(value);
    if (movement) onMove(...movement);
  }, [onCommit, onMove, value]);
  return (
    <textarea
      autoFocus
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => {
        event.currentTarget.setSelectionRange(event.currentTarget.value.length, event.currentTarget.value.length);
      }}
      onBlur={() => commit()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          finished.current = true;
          onCancel();
        } else if (event.key === "Enter" && !event.altKey && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          commit([event.shiftKey ? -1 : 1, 0]);
        } else if (event.key === "Tab") {
          event.preventDefault();
          commit([0, event.shiftKey ? -1 : 1]);
        }
      }}
      className="absolute inset-[-1px] z-30 min-h-full min-w-full resize-none overflow-hidden border-2 border-[#238653] bg-white px-1.5 py-1 text-[12px] leading-4 text-[#1f2b23] outline-none shadow-[0_4px_16px_rgba(27,83,50,0.16)]"
      spellCheck={false}
    />
  );
}

const CellContent = memo(function CellContent({
  cell,
  display,
}: {
  cell: SpreadsheetCell | undefined;
  display: string;
}) {
  return (
    <>
      <span className="block max-h-full overflow-hidden text-ellipsis">{display}</span>
      {cell?.comment ? <span className="absolute right-0 top-0 size-0 border-l-[6px] border-t-[6px] border-l-transparent border-t-[#e29232]" title={cell.comment} /> : null}
    </>
  );
});

function FilterMenu({
  rect,
  values,
  selected,
  onApply,
  onSort,
  onClose,
}: {
  rect: DOMRect;
  values: string[];
  selected: string[];
  onApply: (values: string[]) => void;
  onSort: (direction: "asc" | "desc") => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => new Set(selected.length ? selected : values));
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest("[data-filter-menu]")) return;
      onClose();
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [onClose]);
  return createPortal(
    <div
      data-filter-menu
      className="fixed z-[85] w-[238px] rounded-[13px] border border-[#dce4dd] bg-white p-2 shadow-[0_20px_60px_rgba(20,42,28,0.2)]"
      style={{
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 246)),
        top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 360)),
      }}
    >
      <button className="h-8 w-full rounded-[7px] px-2 text-left text-[11px] font-[700] hover:bg-[#eef4ef]" type="button" onClick={() => { onSort("asc"); onClose(); }}>Sort ascending</button>
      <button className="h-8 w-full rounded-[7px] px-2 text-left text-[11px] font-[700] hover:bg-[#eef4ef]" type="button" onClick={() => { onSort("desc"); onClose(); }}>Sort descending</button>
      <div className="my-1 h-px bg-[#e5eae5]" />
      <label className="flex h-8 items-center gap-2 px-2 text-[11px] font-[700]"><input type="checkbox" checked={draft.size === values.length} onChange={(event) => setDraft(event.target.checked ? new Set(values) : new Set())} /> Select all</label>
      <div className="max-h-[190px] overflow-y-auto py-1">
        {values.map((value) => <label key={value} className="flex min-h-7 items-center gap-2 rounded px-2 text-[11px] hover:bg-[#f1f5f1]"><input type="checkbox" checked={draft.has(value)} onChange={(event) => setDraft((current) => { const next = new Set(current); if (event.target.checked) next.add(value); else next.delete(value); return next; })} /><span className="truncate">{value || "(Blanks)"}</span></label>)}
      </div>
      <div className="mt-1 flex justify-end gap-2 border-t border-[#e5eae5] pt-2">
        <button type="button" className="h-7 rounded px-2 text-[11px] font-[700] text-[#637068]" onClick={onClose}>Cancel</button>
        <button type="button" className="h-7 rounded bg-[#287a50] px-3 text-[11px] font-[750] text-white" onClick={() => { onApply([...draft]); onClose(); }}>Apply</button>
      </div>
    </div>,
    document.body,
  );
}

export const SpreadsheetGrid = forwardRef<SpreadsheetGridHandle, {
  controller: SpreadsheetController;
  canEdit: boolean;
  highlightedKeys: Set<string>;
  activeHighlight: string | null;
  onFind: () => void;
  onContextMenu: (state: SpreadsheetContextMenuState) => void;
}>(function SpreadsheetGrid({ controller, canEdit, highlightedKeys, activeHighlight, onFind, onContextMenu }, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const fillRef = useRef<{ active: boolean; row: number; column: number }>({ active: false, row: 0, column: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0, scrollLeft: 0, scrollTop: 0 });
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [filterMenu, setFilterMenu] = useState<{ column: number; rect: DOMRect } | null>(null);
  const sheet = controller.sheet;
  const rowOffsets = useMemo(() => offsetsFor(sheet.rowCount, (row) => rowHeight(sheet, row)), [sheet]);
  const columnOffsets = useMemo(() => offsetsFor(sheet.columnCount, (column) => columnWidth(sheet, column)), [sheet]);
  const resizing = resize !== null;
  const resizeColumn = controller.resizeColumn;
  const resizeRow = controller.resizeRow;

  useLayoutEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setViewport((current) => ({
      ...current,
      width: element.clientWidth,
      height: element.clientHeight,
    })));
    observer.observe(element);
    setViewport((current) => ({ ...current, width: element.clientWidth, height: element.clientHeight }));
    return () => observer.disconnect();
  }, []);

  useImperativeHandle(ref, () => ({
    scrollToCell(row, column) {
      const scroller = scrollerRef.current;
      if (!scroller) return;
      const left = columnOffsets[column] ?? 0;
      const right = columnOffsets[column + 1] ?? left;
      const top = rowOffsets[row] ?? 0;
      const bottom = rowOffsets[row + 1] ?? top;
      if (left < scroller.scrollLeft) scroller.scrollLeft = left;
      else if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth;
      if (top < scroller.scrollTop) scroller.scrollTop = top;
      else if (bottom > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = bottom - scroller.clientHeight;
      rootRef.current?.focus();
    },
    focus() { rootRef.current?.focus(); },
  }), [columnOffsets, rowOffsets]);

  useEffect(() => {
    const stop = () => {
      draggingRef.current = false;
      if (fillRef.current.active) {
        controller.fillTo(fillRef.current.row, fillRef.current.column);
        fillRef.current.active = false;
      }
    };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, [controller]);

  useEffect(() => {
    if (!resizing) return;
    const move = (event: PointerEvent) => {
      setResize((current) => current ? { ...current, current: current.original + (current.kind === "column" ? event.clientX : event.clientY) - current.start } : null);
    };
    const end = (event: PointerEvent) => {
      setResize((current) => {
        if (!current) return null;
        const value = current.original + (current.kind === "column" ? event.clientX : event.clientY) - current.start;
        if (current.kind === "column") resizeColumn(current.index, value);
        else resizeRow(current.index, value);
        return null;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
  }, [resizeColumn, resizeRow, resizing]);

  const visibleRows = useMemo(() => {
    const values = visibleIndices(rowOffsets, viewport.scrollTop, viewport.scrollTop + viewport.height, 3);
    for (let row = 0; row < sheet.frozenRows; row += 1) if (rowHeight(sheet, row) > 0 && !values.includes(row)) values.push(row);
    return values.sort((a, b) => a - b);
  }, [rowOffsets, sheet, viewport.height, viewport.scrollTop]);
  const visibleColumns = useMemo(() => {
    const values = visibleIndices(columnOffsets, viewport.scrollLeft, viewport.scrollLeft + viewport.width, 2);
    for (let column = 0; column < sheet.frozenColumns; column += 1) if (columnWidth(sheet, column) > 0 && !values.includes(column)) values.push(column);
    return values.sort((a, b) => a - b);
  }, [columnOffsets, sheet, viewport.scrollLeft, viewport.width]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (controller.editingCell) return;
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && event.key.toLocaleLowerCase() === "a") {
      event.preventDefault(); controller.select(0, 0, { kind: "all" }); return;
    }
    if (modifier && event.key.toLocaleLowerCase() === "c") { event.preventDefault(); void controller.copy(); return; }
    if (modifier && event.key.toLocaleLowerCase() === "x") { event.preventDefault(); void controller.copy(true); return; }
    if (modifier && event.key.toLocaleLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) controller.redo(); else controller.undo(); return; }
    if (modifier && event.key.toLocaleLowerCase() === "y") { event.preventDefault(); controller.redo(); return; }
    if (modifier && event.key.toLocaleLowerCase() === "f") { event.preventDefault(); onFind(); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); controller.move(-1, 0, event.shiftKey); }
    else if (event.key === "ArrowDown") { event.preventDefault(); controller.move(1, 0, event.shiftKey); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); controller.move(0, -1, event.shiftKey); }
    else if (event.key === "ArrowRight") { event.preventDefault(); controller.move(0, 1, event.shiftKey); }
    else if (event.key === "Tab") { event.preventDefault(); controller.move(0, event.shiftKey ? -1 : 1); }
    else if (event.key === "Enter") { event.preventDefault(); controller.move(event.shiftKey ? -1 : 1, 0); }
    else if (event.key === "Home") { event.preventDefault(); controller.select(controller.selection.anchorRow, 0, { extend: event.shiftKey }); }
    else if (event.key === "End") { event.preventDefault(); controller.select(controller.selection.anchorRow, sheet.columnCount - 1, { extend: event.shiftKey }); }
    else if (event.key === "PageUp") { event.preventDefault(); controller.move(-Math.max(1, Math.floor(viewport.height / 28)), 0, event.shiftKey); }
    else if (event.key === "PageDown") { event.preventDefault(); controller.move(Math.max(1, Math.floor(viewport.height / 28)), 0, event.shiftKey); }
    else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); if (canEdit) controller.clear(); }
    else if (event.key === "F2" && canEdit) { event.preventDefault(); controller.setEditingCell({ row: controller.selection.anchorRow, column: controller.selection.anchorColumn }); }
    else if (canEdit && !modifier && !event.altKey && event.key.length === 1) {
      event.preventDefault();
      controller.setEditingCell({ row: controller.selection.anchorRow, column: controller.selection.anchorColumn, replace: event.key });
    }
  };

  const beginColumnResize = (event: React.PointerEvent, column: number) => {
    event.preventDefault(); event.stopPropagation();
    setResize({ kind: "column", index: column, start: event.clientX, original: columnWidth(sheet, column), current: columnWidth(sheet, column) });
  };
  const beginRowResize = (event: React.PointerEvent, row: number) => {
    event.preventDefault(); event.stopPropagation();
    setResize({ kind: "row", index: row, start: event.clientY, original: rowHeight(sheet, row), current: rowHeight(sheet, row) });
  };

  const selectionRange = normalizeRange(controller.selection);
  const renderedMergeAnchors = new Set<string>();

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      className="grid min-h-0 flex-1 grid-cols-[48px_minmax(0,1fr)] grid-rows-[28px_minmax(0,1fr)] overflow-hidden bg-white outline-none"
      onKeyDown={handleKeyDown}
      onPaste={(event) => { if (!controller.editingCell && canEdit) { event.preventDefault(); void controller.paste(event.clipboardData.getData("text/plain")); } }}
      onPointerUp={() => { draggingRef.current = false; }}
    >
      <button type="button" className="relative z-40 grid place-items-center border-b border-r border-[#ccd5cd] bg-[#edf1ed] text-[#718077] hover:bg-[#e2e9e3]" onClick={() => controller.select(0, 0, { kind: "all" })} aria-label="Select all cells">
        <span className="absolute bottom-1.5 right-1.5 size-0 border-b-[7px] border-l-[7px] border-b-[#849188] border-l-transparent" />
      </button>
      <div className="relative z-30 overflow-hidden border-b border-[#ccd5cd] bg-[#f3f6f3]">
        {visibleColumns.map((column) => {
          const width = columnWidth(sheet, column);
          const left = columnOffsets[column] - (column < sheet.frozenColumns ? 0 : viewport.scrollLeft);
          const selected = column >= selectionRange.startColumn && column <= selectionRange.endColumn && controller.selection.kind === "column";
          return <div key={column} className={`absolute top-0 flex h-full items-center justify-center border-r border-[#d5dcd6] text-[10px] font-[750] ${selected ? "bg-[#dceee2] text-[#1e7047]" : "text-[#617067]"}`} style={{ left, width }} onPointerDown={(event) => { rootRef.current?.focus(); draggingRef.current = true; controller.select(0, column, { extend: event.shiftKey, kind: "column" }); }} onPointerEnter={() => { if (draggingRef.current) controller.select(sheet.rowCount - 1, column, { extend: true, kind: "column" }); }} onContextMenu={(event) => { event.preventDefault(); controller.select(0, column, { kind: "column" }); onContextMenu({ x: event.clientX, y: event.clientY, target: { kind: "column", column } }); }}>
            {columnIndexToLabel(column)}
            <span className="absolute right-[-3px] top-0 z-10 h-full w-[6px] cursor-col-resize" onPointerDown={(event) => beginColumnResize(event, column)} onDoubleClick={(event) => { event.stopPropagation(); const longest = Object.entries(sheet.cells).reduce((length, [key, cell]) => { const [, candidate] = key.split(":").map(Number); return candidate === column ? Math.max(length, String(formulaCellValue(cell) ?? "").length) : length; }, 0); controller.resizeColumn(column, Math.min(600, Math.max(64, longest * 7.2 + 22))); }} />
          </div>;
        })}
      </div>
      <div className="relative z-30 overflow-hidden border-r border-[#ccd5cd] bg-[#f3f6f3]">
        {visibleRows.map((row) => {
          const height = rowHeight(sheet, row);
          const top = rowOffsets[row] - (row < sheet.frozenRows ? 0 : viewport.scrollTop);
          const selected = row >= selectionRange.startRow && row <= selectionRange.endRow && controller.selection.kind === "row";
          return <div key={row} className={`absolute left-0 flex w-full items-center justify-center border-b border-[#d5dcd6] text-[10px] font-[700] ${selected ? "bg-[#dceee2] text-[#1e7047]" : "text-[#68756d]"}`} style={{ top, height }} onPointerDown={(event) => { rootRef.current?.focus(); draggingRef.current = true; controller.select(row, 0, { extend: event.shiftKey, kind: "row" }); }} onPointerEnter={() => { if (draggingRef.current) controller.select(row, sheet.columnCount - 1, { extend: true, kind: "row" }); }} onContextMenu={(event) => { event.preventDefault(); controller.select(row, 0, { kind: "row" }); onContextMenu({ x: event.clientX, y: event.clientY, target: { kind: "row", row } }); }}>
            {row + 1}
            <span className="absolute bottom-[-3px] left-0 z-10 h-[6px] w-full cursor-row-resize" onPointerDown={(event) => beginRowResize(event, row)} onDoubleClick={(event) => { event.stopPropagation(); const maxLength = visibleColumns.reduce((length, column) => Math.max(length, String(formulaCellValue(sheet.cells[cellKey(row, column)]) ?? "").length), 0); controller.resizeRow(row, maxLength > 60 ? 56 : maxLength > 30 ? 42 : 28); }} />
          </div>;
        })}
      </div>
      <div
        ref={scrollerRef}
        className="relative min-h-0 min-w-0 overflow-auto overscroll-contain bg-white"
        onScroll={(event) => {
          const element = event.currentTarget;
          setViewport({ width: element.clientWidth, height: element.clientHeight, scrollLeft: element.scrollLeft, scrollTop: element.scrollTop });
        }}
      >
        <div className="relative" style={{ width: columnOffsets.at(-1), height: rowOffsets.at(-1) }}>
          {visibleRows.flatMap((row) => visibleColumns.flatMap((column) => {
            const merge = findMergeAt(sheet.merges, row, column);
            if (merge) {
              const anchorKey = cellKey(merge.startRow, merge.startColumn);
              if (row !== merge.startRow || column !== merge.startColumn || renderedMergeAnchors.has(anchorKey)) return [];
              renderedMergeAnchors.add(anchorKey);
            }
            const renderRow = merge?.startRow ?? row;
            const renderColumn = merge?.startColumn ?? column;
            const key = cellKey(renderRow, renderColumn);
            const cell = sheet.cells[key];
            const style = resolveCellStyle(sheet, renderRow, renderColumn, cell);
            const width = merge ? columnOffsets[merge.endColumn + 1] - columnOffsets[merge.startColumn] : columnWidth(sheet, renderColumn);
            const height = merge ? rowOffsets[merge.endRow + 1] - rowOffsets[merge.startRow] : rowHeight(sheet, renderRow);
            const frozenColumn = renderColumn < sheet.frozenColumns;
            const frozenRow = renderRow < sheet.frozenRows;
            const left = columnOffsets[renderColumn] + (frozenColumn ? viewport.scrollLeft : 0);
            const top = rowOffsets[renderRow] + (frozenRow ? viewport.scrollTop : 0);
            const edge = selectionEdge(controller, renderRow, renderColumn);
            const display = formatCellDisplay(formulaCellValue(cell), style);
            const editing = controller.editingCell?.row === renderRow && controller.editingCell?.column === renderColumn;
            const filterHeader = sheet.filter && renderRow === sheet.filter.range.startRow && renderColumn >= sheet.filter.range.startColumn && renderColumn <= sheet.filter.range.endColumn;
            const highlighted = highlightedKeys.has(key);
            return [<div
              key={key}
              data-cell-key={key}
              title={cell?.comment || undefined}
              className={`absolute overflow-hidden border-b border-r border-[#e0e5e0] px-1.5 py-1 text-[12px] leading-4 ${style.wrap ? "whitespace-pre-wrap break-words" : "whitespace-nowrap"}`}
              style={{
                left, top, width, height,
                zIndex: frozenRow && frozenColumn ? 24 : frozenRow || frozenColumn ? 20 : editing ? 25 : 1,
                color: edge.selected ? "#202124" : style.textColor,
                backgroundColor: highlighted ? (key === activeHighlight ? "#ffd97a" : "#fff3bd") : edge.selected ? "#eaf5ed" : style.backgroundColor,
                fontFamily: style.fontFamily,
                fontSize: style.fontSize,
                fontWeight: style.fontWeight,
                fontStyle: style.italic ? "italic" : undefined,
                textDecoration: [style.underline ? "underline" : "", style.strike ? "line-through" : ""].filter(Boolean).join(" ") || undefined,
                textAlign: style.horizontalAlign,
                display: "flex",
                alignItems: style.verticalAlign === "top" ? "flex-start" : style.verticalAlign === "bottom" ? "flex-end" : "center",
                borderTop: style.borders?.top ? `1px solid ${style.borders.top.color}` : edge.top ? "2px solid #278253" : undefined,
                borderRight: style.borders?.right ? `1px solid ${style.borders.right.color}` : edge.right ? "2px solid #278253" : undefined,
                borderBottom: style.borders?.bottom ? `1px solid ${style.borders.bottom.color}` : edge.bottom ? "2px solid #278253" : undefined,
                borderLeft: style.borders?.left ? `1px solid ${style.borders.left.color}` : edge.left ? "2px solid #278253" : undefined,
                boxShadow: edge.active ? "inset 0 0 0 2px #166e43" : undefined,
              }}
              onPointerDown={(event) => {
                if ((event.target as Element).closest("button,select,textarea")) return;
                rootRef.current?.focus();
                draggingRef.current = true;
                controller.select(renderRow, renderColumn, { extend: event.shiftKey, kind: "cell" });
              }}
              onPointerEnter={() => {
                if (fillRef.current.active) { fillRef.current.row = renderRow; fillRef.current.column = renderColumn; }
                else if (draggingRef.current) controller.select(renderRow, renderColumn, { extend: true, kind: "cell" });
              }}
              onDoubleClick={() => { if (canEdit) controller.setEditingCell({ row: renderRow, column: renderColumn }); }}
              onContextMenu={(event) => {
                event.preventDefault();
                if (!rangeContains(selectionRange, renderRow, renderColumn)) controller.select(renderRow, renderColumn);
                onContextMenu({ x: event.clientX, y: event.clientY, target: { kind: "cell", row: renderRow, column: renderColumn } });
              }}
            >
              {editing ? <SpreadsheetCellEditor initialValue={cell?.formula ?? (cell?.value == null ? "" : String(cell.value))} replacement={controller.editingCell?.replace} onCommit={(value) => controller.commitCell(renderRow, renderColumn, value)} onCancel={() => controller.setEditingCell(null)} onMove={controller.move} /> : <CellContent cell={cell} display={display} />}
              {filterHeader ? <button type="button" className="absolute right-0.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded bg-white/90 text-[#476252] shadow-sm hover:bg-[#deeee3]" onClick={(event) => { event.stopPropagation(); setFilterMenu({ column: renderColumn, rect: event.currentTarget.getBoundingClientRect() }); }} aria-label={`Filter ${columnIndexToLabel(renderColumn)}`}><Filter className="size-3" /></button> : null}
              {edge.active && cell?.validation?.values.length && !editing ? <select value={String(formulaCellValue(cell) ?? "")} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => controller.commitCell(renderRow, renderColumn, event.target.value)} className="absolute bottom-0 right-0 top-0 w-6 appearance-none bg-transparent text-transparent outline-none" aria-label="Choose a value"><option value="" />{cell.validation.values.map((value) => <option value={value} key={value}>{value}</option>)}</select> : null}
              {edge.active && cell?.validation?.values.length && !editing ? <ChevronDown className="pointer-events-none absolute right-1 top-1/2 size-3 -translate-y-1/2 text-[#47705a]" /> : null}
              {edge.right && edge.bottom && canEdit && !editing ? <span className="absolute bottom-[-3px] right-[-3px] z-40 size-[7px] cursor-crosshair border border-white bg-[#197648]" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); fillRef.current = { active: true, row: renderRow, column: renderColumn }; }} /> : null}
            </div>];
          }))}
          {resize?.kind === "column" ? <div className="pointer-events-none absolute bottom-0 top-0 z-50 w-px bg-[#238653]" style={{ left: columnOffsets[resize.index] + resize.current }} /> : null}
          {resize?.kind === "row" ? <div className="pointer-events-none absolute left-0 right-0 z-50 h-px bg-[#238653]" style={{ top: rowOffsets[resize.index] + resize.current }} /> : null}
        </div>
      </div>
      {filterMenu ? <FilterMenu
        rect={filterMenu.rect}
        values={Array.from(new Set(Array.from({ length: Math.max(0, (sheet.filter?.range.endRow ?? 0) - (sheet.filter?.range.startRow ?? 0)) }, (_, index) => String(formulaCellValue(sheet.cells[cellKey((sheet.filter?.range.startRow ?? 0) + index + 1, filterMenu.column)]) ?? "")))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))}
        selected={sheet.filter?.criteria[String(filterMenu.column)] ?? []}
        onApply={(values) => controller.applyFilter(filterMenu.column, values)}
        onSort={controller.sort}
        onClose={() => setFilterMenu(null)}
      /> : null}
    </div>
  );
});
