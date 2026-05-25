"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SupportedLanguage } from "@/lib/ai/languages";

type ChatLanguagePickerProps = {
  languages: SupportedLanguage[];
  selectedLanguage: SupportedLanguage;
  disabled?: boolean;
  onSelect: (language: SupportedLanguage) => void;
};

export function ChatLanguagePicker({
  languages,
  selectedLanguage,
  disabled = false,
  onSelect,
}: ChatLanguagePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  const filteredLanguages = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return languages;
    }

    return languages.filter((language) =>
      `${language.name} ${language.nativeName} ${language.shortCode}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [languages, query]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 rounded-md px-2.5 text-[10px] font-[700]"
        disabled={disabled}
        onClick={() => {
          setIsOpen((current) => !current);
        }}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        {selectedLanguage.shortCode}
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>

      {isOpen ? (
        <Card className="absolute bottom-[calc(100%+10px)] right-0 z-50 w-[280px] rounded-[22px] border border-[#e3e8e2] p-3 shadow-[0_22px_60px_rgba(16,32,22,0.16)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#90a090]" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search languages..."
              className="h-10 rounded-full border-[#e0e6e0] pl-10 pr-4 text-[13px]"
            />
          </div>
          <div className="mt-3 max-h-[260px] space-y-1 overflow-y-auto pr-1">
            {filteredLanguages.map((language) => {
              const isSelected = language.code === selectedLanguage.code;

              return (
                <button
                  key={language.code}
                  type="button"
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-[16px] px-3 py-2.5 text-left transition-colors hover:bg-[#f3f7f2]",
                    isSelected && "bg-[#eef8f0]",
                  )}
                  onClick={() => {
                    onSelect(language);
                    setIsOpen(false);
                    setQuery("");
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-[700] text-[#16211a]">{language.name}</p>
                    <p className="text-[11px] text-[#6d766f]">
                      {language.nativeName} · {language.shortCode}
                    </p>
                  </div>
                  {isSelected ? (
                    <Check className="h-4 w-4 text-brand" />
                  ) : null}
                </button>
              );
            })}
            {filteredLanguages.length === 0 ? (
              <div className="rounded-[16px] border border-dashed border-[#d7e1d7] px-3 py-5 text-center text-[12px] text-[#707a72]">
                No languages found.
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
