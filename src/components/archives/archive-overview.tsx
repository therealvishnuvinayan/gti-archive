"use client";

import Link from "next/link";
import { useState } from "react";
import { FolderPlus } from "lucide-react";

import { archiveCategories } from "@/components/archives/archive-data";
import { ArchiveCategoryDialog } from "@/components/archives/archive-category-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type CustomCategory = {
  slug: string;
  title: string;
};

function toSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ArchiveOverview() {
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");

  function createCategory() {
    const trimmed = categoryName.trim();
    if (!trimmed) {
      return;
    }

    setCustomCategories((current) => [
      ...current,
      { slug: toSlug(trimmed), title: trimmed },
    ]);
    setCategoryName("");
    setDialogOpen(false);
  }

  return (
    <>
      <section className="space-y-6">
        <header className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <h1 className="text-[42px] font-[600] leading-none tracking-[-0.05em] text-[#0f1411] sm:text-[56px]">
            Archives
          </h1>
          <Button
            type="button"
            onClick={() => setDialogOpen(true)}
            size="default"
            className="gap-2 self-start text-[14px] xl:self-auto"
          >
            Create <FolderPlus className="h-4 w-4" />
          </Button>
        </header>

        <Card className="rounded-[30px] border-0 bg-surface p-6 shadow-[0_22px_60px_rgba(23,39,28,0.06)]">
          <div className="mb-8">
            <h2 className="text-[24px] font-[700] tracking-[-0.03em] text-[#434747]">
              Choose the category
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {archiveCategories.map((category) => {
              const Icon = category.icon;

              return (
                <Card
                  key={category.slug}
                  className="rounded-[22px] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(23,39,28,0.08)]"
                >
                  <div className="mb-5 grid h-20 place-items-center text-brand">
                    <Icon className="h-14 w-14" />
                  </div>
                  <h3 className="text-center text-[16px] font-[700] text-[#141915]">
                    {category.title}
                  </h3>
                  <Button asChild size="default" className="mt-5 w-full text-[14px]">
                    <Link href={`/archives/${category.slug}`}>Open</Link>
                  </Button>
                </Card>
              );
            })}

            {customCategories.map((category) => (
              <Card
                key={category.slug}
                className="rounded-[22px] p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(23,39,28,0.08)]"
              >
                <div className="mb-5 grid h-20 place-items-center text-brand">
                  <FolderPlus className="h-14 w-14" />
                </div>
                <h3 className="text-center text-[16px] font-[700] text-[#141915]">
                  {category.title}
                </h3>
                <div className="mt-5 inline-flex min-h-[42px] w-full items-center justify-center rounded-full border border-brand bg-brand-soft px-6 text-[14px] font-[600] text-brand">
                  Added
                </div>
              </Card>
            ))}
          </div>
        </Card>
      </section>

      <ArchiveCategoryDialog
        isOpen={dialogOpen}
        value={categoryName}
        onChange={setCategoryName}
        onClose={() => setDialogOpen(false)}
        onSubmit={createCategory}
      />
    </>
  );
}
