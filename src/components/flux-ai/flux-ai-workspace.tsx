"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import {
  Archive,
  ArrowRight,
  FileArchive,
  FolderArchive,
  History,
  Loader2,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ArchiveSearchResult } from "@/lib/archives";

type FluxArchiveSearchResponse = {
  query: string;
  recent: boolean;
  results: ArchiveSearchResult[];
  message: string;
  recentSearches?: string[];
  error?: string;
};

const matchLabels: Record<ArchiveSearchResult["matchedOn"], string> = {
  ARCHIVE_NAME: "Archive name",
  PROJECT_NAME: "Project name",
  ARCHIVE_CATEGORY: "Archive category",
  ARCHIVED_FILE_NAME: "Archived filename",
  ARTWORK_ID: "Artwork ID",
  ASSET_TAG: "Asset tag",
};

function formatArchivedDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function ArchiveResultCard({ result }: { result: ArchiveSearchResult }) {
  const isProjectArchive = result.recordType === "PROJECT_ARCHIVE";
  const ResultIcon = isProjectArchive ? FolderArchive : FileArchive;

  return (
    <article className="rounded-[22px] border border-[#e0e8df] bg-white p-5 shadow-[0_14px_36px_rgba(23,39,28,0.05)]">
      <div className="flex min-w-0 items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-[15px] bg-[#e8f4ea] text-brand">
          <ResultIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-[800] text-[#172019]">
            {result.name}
          </h3>
          <p className="mt-1 text-[12px] font-[700] uppercase tracking-[0.08em] text-[#687269]">
            {isProjectArchive ? "Archived project" : "Archived file"}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 border-t border-[#edf1ec] pt-4 text-[13px] sm:grid-cols-2">
        {result.projectName && result.projectName !== result.name ? (
          <div className="min-w-0">
            <dt className="text-[#748077]">Project</dt>
            <dd className="mt-0.5 truncate font-[700] text-[#263129]">
              {result.projectName}
            </dd>
          </div>
        ) : null}
        <div className="min-w-0">
          <dt className="text-[#748077]">Archived</dt>
          <dd className="mt-0.5 font-[700] text-[#263129]">
            {formatArchivedDate(result.archivedAt)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[#748077]">Category</dt>
          <dd className="mt-0.5 truncate font-[700] text-[#263129]">
            {result.archiveCategory}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[#748077]">Matched</dt>
          <dd className="mt-0.5 font-[700] text-[#263129]">
            {matchLabels[result.matchedOn]}
          </dd>
        </div>
        {result.matchedFileName ? (
          <div className="min-w-0 sm:col-span-2">
            <dt className="text-[#748077]">Matched file</dt>
            <dd className="mt-0.5 truncate font-[700] text-[#263129]">
              {result.matchedFileName}
            </dd>
          </div>
        ) : null}
      </dl>

      <Button asChild className="mt-5 h-10 w-full rounded-full sm:w-auto">
        <Link href={result.href}>
          Open Archive
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
    </article>
  );
}

export function FluxAiWorkspace({
  initialRecentSearches,
}: {
  initialRecentSearches: string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState(initialRecentSearches);
  const [response, setResponse] = useState<FluxArchiveSearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  async function runSearch(submittedQuery: string) {
    if (!submittedQuery || isSearching) {
      inputRef.current?.focus();
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      const request = await fetch("/api/flux-ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: submittedQuery }),
      });
      const payload = (await request.json()) as FluxArchiveSearchResponse;

      if (!request.ok) {
        throw new Error(payload.error || "Archive search is temporarily unavailable.");
      }

      setResponse(payload);
      if (payload.recentSearches) {
        setRecentSearches(payload.recentSearches);
      }
    } catch (searchError) {
      setResponse(null);
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Archive search is temporarily unavailable.",
      );
    } finally {
      setIsSearching(false);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch(query.trim());
  }

  function selectRecentSearch(recentQuery: string) {
    setQuery(recentQuery);
    void runSearch(recentQuery);
  }

  return (
    <section className="mx-auto w-full max-w-[1040px] space-y-6">
      <header>
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-[17px] bg-[#e6f3e8] text-brand">
            <Archive className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-[40px] font-[700] leading-none tracking-[-0.045em] text-[#0f1411] sm:text-[52px]">
              Flux AI
            </h1>
            <p className="mt-2 text-[15px] text-[#626d64]">
              Search your archived projects and files.
            </p>
          </div>
        </div>
      </header>

      <div className="rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_22px_60px_rgba(23,39,28,0.06)] sm:p-7">
        <form onSubmit={submitSearch} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7c887f]" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search archives..."
              aria-label="Search archives"
              autoComplete="off"
              maxLength={240}
              className="h-13 rounded-full border-[#dce6db] bg-[#fbfcfa] pl-12 pr-5 text-[15px] shadow-none focus-visible:ring-brand/20"
            />
          </div>
          <Button
            type="submit"
            disabled={isSearching || !query.trim()}
            className="h-13 rounded-full px-7 text-[14px] font-[800]"
          >
            {isSearching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {isSearching ? "Searching..." : "Search"}
          </Button>
        </form>

        {recentSearches.length > 0 ? (
          <div className="mt-5">
            <p className="flex items-center gap-2 text-[12px] font-[800] uppercase tracking-[0.08em] text-[#778178]">
              <History className="h-3.5 w-3.5" />
              Recent searches
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {recentSearches.map((recentQuery) => (
                <button
                  key={recentQuery}
                  type="button"
                  disabled={isSearching}
                  title={recentQuery}
                  onClick={() => selectRecentSearch(recentQuery)}
                  className="max-w-full truncate rounded-full border border-[#dce7dc] bg-[#f8fbf8] px-4 py-2 text-[12px] font-[700] text-[#3f4d43] transition hover:border-brand/35 hover:bg-[#eef7ef] hover:text-brand disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {recentQuery}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div aria-live="polite">
        {error ? (
          <div className="rounded-[20px] border border-[#f0d4d1] bg-[#fff7f6] px-5 py-4 text-[14px] font-[700] text-[#a7453e]">
            {error}
          </div>
        ) : null}

        {response ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-[22px] font-[800] tracking-[-0.025em] text-[#172019]">
                  Archive results
                </h2>
                <p className="mt-1 text-[13px] text-[#687269]">{response.message}</p>
              </div>
              {response.results.length ? (
                <span className="rounded-full bg-[#eaf5eb] px-3 py-1 text-[12px] font-[800] text-brand">
                  {response.results.length} result{response.results.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>

            {response.results.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {response.results.map((result) => (
                  <ArchiveResultCard
                    key={`${result.recordType}:${result.id}`}
                    result={result}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-[24px] border border-dashed border-[#d9e3d8] bg-white px-6 py-12 text-center">
                <FileArchive className="mx-auto h-8 w-8 text-[#8a958c]" />
                <p className="mt-3 text-[15px] font-[800] text-[#263129]">
                  {response.message}
                </p>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </section>
  );
}
