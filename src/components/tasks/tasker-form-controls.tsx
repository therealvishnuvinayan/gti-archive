"use client";

import { useId, type ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { AppDatePicker } from "@/components/calendar/app-date-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TaskOption } from "@/lib/tasker/types";

const controlClassName = "h-12 w-full min-w-0 rounded-[14px] border border-[#cfdad1] bg-white px-4 text-sm font-normal text-[#263e2d] shadow-none focus-visible:border-[#46906a] focus-visible:ring-3 focus-visible:ring-[#46906a]/15";
const emptyOption = "__tasker_empty__";

export function TaskInput({ className, ...props }: ComponentProps<typeof Input>) {
  return <Input className={cn(controlClassName, className)} {...props} />;
}

export function TaskTextarea({ className, ...props }: ComponentProps<typeof Textarea>) {
  return <Textarea className={cn(controlClassName, "h-auto min-h-28 py-3", className)} {...props} />;
}

export function TaskSelect({ label, value, onChange, options, placeholder = "Choose an option", emptyLabel, required, disabled }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: TaskOption[];
  placeholder?: string;
  emptyLabel?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <Select value={value || (emptyLabel ? emptyOption : "")} onValueChange={(next) => onChange(next === emptyOption ? "" : next)} required={required} disabled={disabled}>
      <SelectTrigger aria-label={label} className={controlClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="z-[180]">
        {emptyLabel && <SelectItem value={emptyOption}>{emptyLabel}</SelectItem>}
        {options.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function TaskMultiSelect({ label, values, onChange, options, disabled = false }: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: TaskOption[];
  disabled?: boolean;
}) {
  const selected = options.filter((option) => values.includes(option.id));
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" disabled={disabled} aria-label={label} className={cn(controlClassName, "justify-between hover:bg-white")}>
          <span className={cn("truncate text-left", !selected.length && "text-[#9aa39b]")}>{selected.length ? selected.map((option) => option.label).join(", ") : "Choose options"}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[#667268]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="z-[180] max-h-[min(var(--radix-dropdown-menu-content-available-height),20rem)] w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto" aria-label={label}>
        {!options.length && <p className="p-3 text-sm text-[#7a867e]">No options available.</p>}
        {options.map((option) => (
          <DropdownMenuCheckboxItem key={option.id} checked={values.includes(option.id)} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => onChange(checked ? [...new Set([...values, option.id])] : values.filter((value) => value !== option.id))}>
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TaskDatePicker({ label, ...props }: Omit<ComponentProps<typeof AppDatePicker>, "triggerClassName" | "popoverZIndex" | "id"> & { label: string }) {
  const id = useId();
  return <div><label htmlFor={id} className="sr-only">{label}</label><AppDatePicker {...props} id={id} popoverZIndex={190} triggerClassName={cn(controlClassName, "justify-between text-left hover:bg-white")} /></div>;
}
