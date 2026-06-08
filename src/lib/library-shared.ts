export const libraryQuickMenuOptions = [
  "assets",
  "finance",
  "users",
  "favourites",
] as const;

export type LibraryQuickMenuOption = (typeof libraryQuickMenuOptions)[number];

export const libraryDateFilterOptions = [
  "all",
  "today",
  "last7",
  "last30",
] as const;

export type LibraryDateFilter = (typeof libraryDateFilterOptions)[number];

export const libraryTypeFilterOptions = [
  "All Types",
  "Image",
  "PDF",
  "Document",
  "Spreadsheet",
  "Archive/ZIP",
  "Design file",
  "Invoice/Quotation",
  "Other",
] as const;

export type LibraryTypeFilter = (typeof libraryTypeFilterOptions)[number];

export type LibraryItemRecord = {
  id: string;
  fileName: string;
  projectId: string;
  projectName: string;
  projectTag: string | null;
  uploadedAt: string;
  uploadedAtValue: string;
  createdBy: string;
  createdById: string;
  createdByEmail: string;
  type: string;
  quickCategory: "Project Assets" | "Quotations/Invoices";
  mimeType: string;
  previewPath: string;
  downloadPath: string;
  canDelete: boolean;
  isFavoritedByCurrentUser: boolean;
};

export type LibraryFilterOption = {
  id: string;
  label: string;
};

export type LibraryUploadProjectOption = {
  id: string;
  label: string;
  tag: string | null;
};

export const libraryUploadCategoryOptions = [
  { value: "PROJECT_ASSET", label: "Project Asset" },
  { value: "REFERENCE_FILE", label: "Reference File" },
  { value: "ARTWORK", label: "Artwork" },
  { value: "DOCUMENT", label: "Document" },
  { value: "QUOTATION_INVOICE", label: "Quotation / Invoice" },
  { value: "OTHER", label: "Other" },
] as const;

export type LibraryUploadCategory =
  (typeof libraryUploadCategoryOptions)[number]["value"];

export type LibraryUploadMetadata = {
  source?: "dashboard-library-upload" | "dashboard-archive-upload";
  category?: LibraryUploadCategory;
  note?: string;
};

export type LibraryQuickMenuCounts = {
  projectAssets: number;
  quotationsAndInvoices: number;
  fromUsers: number;
  favourites: number;
};

export type LibraryPageData = {
  items: LibraryItemRecord[];
  counts: LibraryQuickMenuCounts;
  filters: {
    projects: LibraryFilterOption[];
    createdBy: LibraryFilterOption[];
  };
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type LibraryQueryInput = {
  search?: string;
  projectId?: string;
  createdById?: string;
  date?: LibraryDateFilter;
  type?: LibraryTypeFilter;
  quickMenu?: LibraryQuickMenuOption;
  page?: number;
  pageSize?: number;
};

export function parseLibraryQuickMenu(
  value: string | null | undefined,
): LibraryQuickMenuOption {
  if (value && libraryQuickMenuOptions.includes(value as LibraryQuickMenuOption)) {
    return value as LibraryQuickMenuOption;
  }

  return "assets";
}

export function parseLibraryDateFilter(
  value: string | null | undefined,
): LibraryDateFilter {
  if (value && libraryDateFilterOptions.includes(value as LibraryDateFilter)) {
    return value as LibraryDateFilter;
  }

  return "all";
}

export function parseLibraryTypeFilter(
  value: string | null | undefined,
): LibraryTypeFilter {
  if (value && libraryTypeFilterOptions.includes(value as LibraryTypeFilter)) {
    return value as LibraryTypeFilter;
  }

  return "All Types";
}
