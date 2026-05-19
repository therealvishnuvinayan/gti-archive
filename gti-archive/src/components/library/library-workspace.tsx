"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ChevronDown,
  Download,
  Eye,
  FileCheck2,
  FileStack,
  ReceiptText,
  Star,
  Tag,
  Trash2,
  UserRound,
} from "lucide-react";

type LibraryCategory = "assets" | "finance" | "users" | "favourites";

type LibraryItem = {
  id: string;
  fileName: string;
  project: string;
  date: string;
  createdBy: string;
  type: string;
  source: "Project Assets" | "Quotations/Invoices" | "From Users";
  priority: "High" | "Medium" | "Low";
  favourite: boolean;
};

type QuickMenuCard = {
  key: LibraryCategory;
  title: string;
  icon: LucideIcon;
  source?: LibraryItem["source"];
};

const quickMenuCards: QuickMenuCard[] = [
  { key: "assets", title: "Project Assets", icon: FileStack, source: "Project Assets" },
  {
    key: "finance",
    title: "Quotations/Invoices",
    icon: ReceiptText,
    source: "Quotations/Invoices",
  },
  { key: "users", title: "From Users", icon: UserRound, source: "From Users" },
  { key: "favourites", title: "Favourites", icon: Star },
];

const initialItems: LibraryItem[] = [
  {
    id: "library-1",
    fileName: "Milano-Framework-Queens",
    project: "Milano Queens Retro",
    date: "17/08/2023",
    createdBy: "Slavomir Kluziak",
    type: "Artwork",
    source: "Project Assets",
    priority: "High",
    favourite: false,
  },
  {
    id: "library-2",
    fileName: "Mond_POS_Canada",
    project: "Milano Queens Retro",
    date: "17/08/2023",
    createdBy: "Aditya Karolia",
    type: "Graphics",
    source: "From Users",
    priority: "Medium",
    favourite: true,
  },
  {
    id: "library-3",
    fileName: "Momento-Framework-Queens",
    project: "Milano Queens Retro",
    date: "17/08/2023",
    createdBy: "Sam Altman",
    type: "Invoice",
    source: "Quotations/Invoices",
    priority: "Low",
    favourite: false,
  },
  {
    id: "library-4",
    fileName: "Cavallo-Framework-Queens",
    project: "Milano Queens Retro",
    date: "17/08/2023",
    createdBy: "Louis Philippe",
    type: "Advert",
    source: "Project Assets",
    priority: "Medium",
    favourite: true,
  },
  {
    id: "library-5",
    fileName: "Milano-Framework-Queens",
    project: "Milano Queens Retro",
    date: "17/08/2023",
    createdBy: "BCC Printing",
    type: "Promotional",
    source: "Project Assets",
    priority: "High",
    favourite: false,
  },
  {
    id: "library-6",
    fileName: "Mond-Framework-Queens",
    project: "Milano Queens Retro",
    date: "17/08/2023",
    createdBy: "Emirates Group",
    type: "Quotation",
    source: "Quotations/Invoices",
    priority: "Low",
    favourite: false,
  },
  {
    id: "library-7",
    fileName: "Cavallo-Framework-Queens",
    project: "Milano Queens Retro",
    date: "17/08/2023",
    createdBy: "Emirates Group",
    type: "Graphics",
    source: "From Users",
    priority: "Medium",
    favourite: false,
  },
  {
    id: "library-8",
    fileName: "Momento-Framework-Queens",
    project: "Milano Queens Retro",
    date: "17/08/2023",
    createdBy: "Sam Altman",
    type: "Invoice",
    source: "Quotations/Invoices",
    priority: "Low",
    favourite: true,
  },
  {
    id: "library-9",
    fileName: "Milano-Framework-Queens",
    project: "Milano Queens Retro",
    date: "17/08/2023",
    createdBy: "Slavomir Kluziak",
    type: "Artwork",
    source: "Project Assets",
    priority: "High",
    favourite: true,
  },
  {
    id: "library-10",
    fileName: "Mond_POS_Canada",
    project: "Milano Queens Retro",
    date: "17/08/2023",
    createdBy: "Aditya Karolia",
    type: "Graphics",
    source: "From Users",
    priority: "Medium",
    favourite: false,
  },
];

type FilterState = {
  search: string;
  project: string;
  date: string;
  createdBy: string;
  type: string;
  source: string;
  priority: string;
};

const defaultFilters: FilterState = {
  search: "",
  project: "",
  date: "",
  createdBy: "",
  type: "",
  source: "",
  priority: "",
};

const typeStyles: Record<string, string> = {
  Artwork: "text-[#151b16]",
  Graphics: "text-[#151b16]",
  Invoice: "text-[#151b16]",
  Advert: "text-[#151b16]",
  Promotional: "text-[#151b16]",
  Quotation: "text-[#151b16]",
};

const uniqueValues = (items: LibraryItem[], key: keyof LibraryItem) =>
  Array.from(new Set(items.map((item) => item[key] as string)));

export function LibraryWorkspace() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeCategory, setActiveCategory] = useState<LibraryCategory>("assets");
  const [items, setItems] = useState<LibraryItem[]>(initialItems);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);

  const selectOptions = useMemo(
    () => ({
      project: uniqueValues(items, "project"),
      date: uniqueValues(items, "date"),
      createdBy: uniqueValues(items, "createdBy"),
      type: uniqueValues(items, "type"),
      source: uniqueValues(items, "source"),
      priority: uniqueValues(items, "priority"),
    }),
    [items],
  );

  const visibleItems = useMemo(() => {
    const activeCard = quickMenuCards.find((card) => card.key === activeCategory);

    return items.filter((item) => {
      if (activeCategory === "favourites" && !item.favourite) {
        return false;
      }

      if (activeCard?.source && item.source !== activeCard.source) {
        return false;
      }

      if (
        filters.search &&
        ![
          item.fileName,
          item.project,
          item.createdBy,
          item.type,
          item.source,
        ]
          .join(" ")
          .toLowerCase()
          .includes(filters.search.toLowerCase())
      ) {
        return false;
      }

      if (filters.project && item.project !== filters.project) return false;
      if (filters.date && item.date !== filters.date) return false;
      if (filters.createdBy && item.createdBy !== filters.createdBy) return false;
      if (filters.type && item.type !== filters.type) return false;
      if (filters.source && item.source !== filters.source) return false;
      if (filters.priority && item.priority !== filters.priority) return false;

      return true;
    });
  }, [activeCategory, filters, items]);

  function updateFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleFavourite(id: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, favourite: !item.favourite } : item,
      ),
    );
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function renderQuickMenu() {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {quickMenuCards.map((card) => {
          const Icon = card.icon;
          const active = activeCategory === card.key;

          return (
            <article
              key={card.key}
              className={`rounded-[22px] bg-white p-5 shadow-[0_18px_45px_rgba(23,39,28,0.05)] transition-colors ${
                active ? "ring-2 ring-brand/45" : ""
              }`}
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <div className="grid h-16 w-16 place-items-center rounded-[18px] bg-brand-soft text-brand">
                  <Icon className="h-8 w-8" />
                </div>
                <div className="grid h-10 w-10 place-items-center rounded-full bg-[#edf4ee] text-brand">
                  <FileCheck2 className="h-5 w-5" />
                </div>
              </div>

              <h3 className="text-[16px] font-[700] text-[#141915]">{card.title}</h3>
              <p className="mt-2 text-[13px] text-[#79817b]">
                {
                  visibleItems.filter((item) =>
                    card.key === "favourites"
                      ? item.favourite
                      : card.source
                        ? item.source === card.source
                        : true,
                  ).length
                }{" "}
                files available
              </p>

              <button
                type="button"
                onClick={() => setActiveCategory(card.key)}
                className="mt-5 inline-flex min-h-[42px] w-full items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-6 text-[14px] font-[600] text-white"
              >
                View
              </button>
            </article>
          );
        })}
      </div>
    );
  }

  function renderFilterBar() {
    const selectClassName =
      "h-[36px] rounded-full bg-white px-4 text-[12px] text-[#657069] outline-none";

    return (
      <div className="rounded-[18px] bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] p-3">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-7">
          <input
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Search....."
            className={`${selectClassName} px-5`}
          />

          <select
            value={filters.project}
            onChange={(event) => updateFilter("project", event.target.value)}
            className={selectClassName}
          >
            <option value="">Project</option>
            {selectOptions.project.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            value={filters.date}
            onChange={(event) => updateFilter("date", event.target.value)}
            className={selectClassName}
          >
            <option value="">Date</option>
            {selectOptions.date.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            value={filters.createdBy}
            onChange={(event) => updateFilter("createdBy", event.target.value)}
            className={selectClassName}
          >
            <option value="">Created by</option>
            {selectOptions.createdBy.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            value={filters.type}
            onChange={(event) => updateFilter("type", event.target.value)}
            className={selectClassName}
          >
            <option value="">Type</option>
            {selectOptions.type.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            value={filters.source}
            onChange={(event) => updateFilter("source", event.target.value)}
            className={selectClassName}
          >
            <option value="">Tag</option>
            {selectOptions.source.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <select
            value={filters.priority}
            onChange={(event) => updateFilter("priority", event.target.value)}
            className={selectClassName}
          >
            <option value="">Priority</option>
            {selectOptions.priority.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4">
        <h1 className="text-[42px] font-[600] leading-none tracking-[-0.05em] text-[#0f1411] sm:text-[56px]">
          Library
        </h1>
      </header>

      <section className="rounded-[30px] bg-surface p-6 shadow-[0_22px_60px_rgba(23,39,28,0.06)]">
        <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <h2
              className={`text-[24px] font-[700] tracking-[-0.03em] ${
                collapsed ? "text-[#c1c5c1]" : "text-[#434747]"
              }`}
            >
              Quick Menu
            </h2>
            <button
              type="button"
              onClick={() => setCollapsed((current) => !current)}
              className="inline-flex min-h-[28px] items-center gap-1 rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-4 text-[12px] font-[600] text-white"
            >
              {collapsed ? "Expand" : "Collapse"} <ChevronDown className={`h-3.5 w-3.5 ${collapsed ? "" : "rotate-180"}`} />
            </button>
          </div>
        </div>

        {collapsed ? renderFilterBar() : renderQuickMenu()}

        <div className="mt-6 overflow-x-auto rounded-[20px] bg-white shadow-[0_18px_45px_rgba(23,39,28,0.05)]">
          <table className="min-w-[900px] w-full border-collapse">
            <thead className="bg-[linear-gradient(90deg,#2b7e51,#3ca36d)] text-left text-[13px] font-[600] text-white">
              <tr>
                <th className="px-5 py-4">File Name</th>
                <th className="px-4 py-4">Project</th>
                <th className="px-4 py-4">Date</th>
                <th className="px-4 py-4">Created by</th>
                <th className="px-4 py-4">Type</th>
                <th className="px-4 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
                <tr key={item.id} className="border-t border-[#edf0ee] text-[13px] text-[#141915]">
                  <td className="px-5 py-4 font-[600] leading-[1.2]">{item.fileName}</td>
                  <td className="px-4 py-4">{item.project}</td>
                  <td className="px-4 py-4">{item.date}</td>
                  <td className="px-4 py-4">{item.createdBy}</td>
                  <td className={`px-4 py-4 font-[600] ${typeStyles[item.type] ?? "text-[#141915]"}`}>
                    {item.type}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        className="text-brand"
                        aria-label={`Preview ${item.fileName}`}
                        title="Preview"
                      >
                        <Eye className="h-4.5 w-4.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleFavourite(item.id)}
                        className="text-brand"
                        aria-label={`Toggle favourite for ${item.fileName}`}
                        title={item.favourite ? "Remove favourite" : "Add favourite"}
                      >
                        <Tag className={`h-4.5 w-4.5 ${item.favourite ? "fill-current" : ""}`} />
                      </button>
                      <button
                        type="button"
                        className="inline-flex min-h-[28px] items-center justify-center rounded-full bg-[linear-gradient(90deg,#2f8d5d,#123f2d)] px-3 text-[10px] font-[600] text-white"
                        aria-label={`Download ${item.fileName}`}
                        title="Download"
                      >
                        <span className="mr-1.5">Download</span>
                        <Download className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-[#ff2e00]"
                        aria-label={`Delete ${item.fileName}`}
                        title="Delete"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-[14px] text-[#707a72]">
                    No files match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
