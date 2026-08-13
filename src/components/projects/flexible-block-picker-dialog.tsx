"use client";

import { useMemo, useState } from "react";
import {
  CalendarCheck2,
  ClipboardCheck,
  Globe2,
  Megaphone,
  Palette,
  Search,
  Settings2,
  ShoppingCart,
  Type,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { FlexiblePrototypeDialog } from "@/components/projects/flexible-prototype-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FLEXIBLE_BLOCK_CATEGORIES,
  FLEXIBLE_BLOCK_DEFINITIONS,
  type FlexibleBlockCategory,
  type FlexibleBlockDefinition,
} from "@/lib/flexible-project-ui-fixtures";

const categoryIcons: Record<FlexibleBlockCategory, LucideIcon> = {
  Basic: Type,
  Workflow,
  Creative: Palette,
  "Vendor & Purchase": ShoppingCart,
  "Review & Inspection": ClipboardCheck,
  Event: CalendarCheck2,
  "Website / App": Globe2,
  Marketing: Megaphone,
  Advanced: Settings2,
};

export function FlexibleBlockPickerDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (block: FlexibleBlockDefinition) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FlexibleBlockCategory>("Basic");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleBlocks = useMemo(
    () =>
      FLEXIBLE_BLOCK_DEFINITIONS.filter((block) =>
        normalizedQuery
          ? `${block.name} ${block.category}`.toLowerCase().includes(normalizedQuery)
          : block.category === category,
      ),
    [category, normalizedQuery],
  );

  return (
    <FlexiblePrototypeDialog
      open
      title="What do you want to add?"
      description="Choose one visual block. Block behavior and persistence are not connected."
      maxWidth="max-w-[900px]"
      onClose={onClose}
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <label className="relative block">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#78827a]" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search blocks..."
          autoFocus
          className="h-12 rounded-[15px] border border-[#d8e1d9] bg-white pl-11 shadow-none"
        />
      </label>

      {!normalizedQuery ? (
        <div className="no-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Block categories">
          {FLEXIBLE_BLOCK_CATEGORIES.map((item) => {
            const Icon = categoryIcons[item];
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={category === item}
                onClick={() => setCategory(item)}
                className={`flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[11px] font-[750] transition ${
                  category === item
                    ? "border-[#2f8055] bg-[#eaf5ed] text-[#176c42]"
                    : "border-[#dce3dc] bg-white text-[#626c64] hover:bg-[#f4f7f3]"
                }`}
              >
                <Icon className="size-3.5" /> {item}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-5 text-[11px] font-[750] uppercase tracking-[0.14em] text-[#78817a]">
          Search results · {visibleBlocks.length}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleBlocks.map((block) => {
          const Icon = categoryIcons[block.category];
          return (
            <button
              key={`${block.category}-${block.name}`}
              type="button"
              onClick={() => onAdd(block)}
              className="group flex min-h-[84px] items-center gap-3 rounded-[16px] border border-[#dfe5df] bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-[#87b297] hover:shadow-[0_10px_24px_rgba(31,94,58,0.08)]"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[#eff6f0] text-[#27774e] transition group-hover:bg-[#e3f1e6]">
                <Icon className="size-4.5" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-[750] leading-5 text-[#263029]">{block.name}</span>
                <span className="mt-0.5 block truncate text-[10px] font-[650] uppercase tracking-[0.08em] text-[#89918b]">
                  {block.category}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {visibleBlocks.length === 0 ? (
        <div className="mt-4 rounded-[18px] border border-dashed border-[#cbd5cc] bg-white px-6 py-10 text-center">
          <p className="text-[14px] font-[700] text-[#3e4941]">No blocks match “{query}”</p>
          <p className="mt-1 text-[12px] text-[#7a837c]">Try a term such as quotation, approval, file, or checklist.</p>
        </div>
      ) : null}
    </FlexiblePrototypeDialog>
  );
}
