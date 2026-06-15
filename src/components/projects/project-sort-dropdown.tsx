"use client";

import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ProjectSortDropdownProps = {
  activeSort: "newest" | "oldest" | "name";
  activeStatus: string;
  query: string;
  category: string;
  tag: string;
  onSelectSort?: (sort: "newest" | "oldest" | "name") => void;
  disabled?: boolean;
  pending?: boolean;
  className?: string;
};

const sortOptions = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A-Z" },
] as const;

function getSortLabel(sort: ProjectSortDropdownProps["activeSort"]) {
  return sortOptions.find((option) => option.value === sort)?.label ?? "Newest first";
}

export function ProjectSortDropdown({
  activeSort,
  activeStatus,
  query,
  category,
  tag,
  onSelectSort,
  disabled = false,
  pending = false,
  className,
}: ProjectSortDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          className={className ?? "gap-2 text-[18px]"}
          disabled={disabled}
        >
          Sort
          <ChevronDown className={`h-4 w-4 transition-transform ${pending ? "animate-pulse" : ""}`} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel>
          {getSortLabel(activeSort)}
        </DropdownMenuLabel>

        {sortOptions.map((option) => (
          onSelectSort ? (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => onSelectSort(option.value)}
              className="flex w-full items-center gap-2"
            >
              <span className="flex h-4 w-4 items-center justify-center">
                {activeSort === option.value ? <Check className="h-4 w-4" /> : null}
              </span>
              {option.label}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={option.value} asChild>
              <Link
                href={{
                  pathname: "/projects",
                  query: {
                    ...(query ? { q: query } : {}),
                    ...(category ? { category } : {}),
                    ...(tag ? { tag } : {}),
                    status: activeStatus,
                    sort: option.value,
                  },
                }}
                className="flex w-full items-center gap-2"
              >
                <span className="flex h-4 w-4 items-center justify-center">
                  {activeSort === option.value ? <Check className="h-4 w-4" /> : null}
                </span>
                {option.label}
              </Link>
            </DropdownMenuItem>
          )
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
