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
  activeStatus: "ONGOING" | "ON_HOLD" | "COMPLETED";
  query: string;
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
}: ProjectSortDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="lg" className="gap-2 text-[18px]">
          Sort
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <DropdownMenuLabel>
          {getSortLabel(activeSort)}
        </DropdownMenuLabel>

        {sortOptions.map((option) => (
          <DropdownMenuItem key={option.value} asChild>
            <Link
              href={{
                pathname: "/projects",
                query: {
                  ...(query ? { q: query } : {}),
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
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
