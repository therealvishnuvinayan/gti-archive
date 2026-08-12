export const archiveSearchMatchKindValues = [
  "ARCHIVE_NAME",
  "PROJECT_NAME",
  "ARCHIVE_CATEGORY",
  "ARCHIVED_FILE_NAME",
] as const;

export type ArchiveSearchMatchKind =
  (typeof archiveSearchMatchKindValues)[number];

export type ArchiveSearchCandidate = {
  archiveName: string;
  projectName?: string | null;
  archiveCategory?: string | null;
  archivedFileNames?: string[];
};

export type ArchiveSearchMatch = {
  rank: number;
  kind: ArchiveSearchMatchKind;
  matchedFileName: string | null;
};

export type ParsedArchiveSearchQuery = {
  query: string;
  recent: boolean;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeArchiveSearchText(value: string | null | undefined) {
  return normalizeWhitespace(value ?? "").toLocaleLowerCase();
}

export function parseArchiveSearchQuery(
  value: string | null | undefined,
): ParsedArchiveSearchQuery {
  const rawQuery = normalizeWhitespace(value ?? "");

  if (!rawQuery) {
    return { query: "", recent: false };
  }

  const normalizedRawQuery = normalizeArchiveSearchText(rawQuery);
  const recent =
    /^(?:please\s+)?(?:show|find|list|view|display|search)(?:\s+me)?(?:\s+the)?\s+(?:most\s+)?(?:recent|latest)\s+archives?$/.test(
      normalizedRawQuery,
    ) || /^(?:recent|latest)\s+archives?$/.test(normalizedRawQuery);

  if (recent) {
    return { query: "", recent: true };
  }

  let query = rawQuery
    .replace(/^(?:can\s+you\s+|could\s+you\s+|would\s+you\s+)?(?:please\s+)?/i, "")
    .replace(
      /^(?:find|search|show|view|display|locate|open)(?:\s+me)?(?:\s+the)?\s+/i,
      "",
    )
    .replace(/^(?:an?\s+)?archives?\s+(?:for\s+)?/i, "")
    .replace(/^(?:an?\s+)?archived\s+projects?\s+/i, "")
    .replace(/^(?:an?\s+)?archived\s+files?\s+/i, "")
    .replace(/^where\s+is(?:\s+the)?\s+/i, "")
    .replace(/^where\s+can\s+i\s+find(?:\s+the)?\s+/i, "")
    .replace(/\s+(?:archives?|archived\s+projects?)$/i, "")
    .replace(/^[\s"'`“”‘’]+|[\s"'`“”‘’.?!]+$/g, "");

  query = normalizeWhitespace(query);

  return { query, recent: false };
}

function getTextMatchRank(value: string | null | undefined, query: string) {
  const normalizedValue = normalizeArchiveSearchText(value);

  if (!normalizedValue || !query) {
    return null;
  }

  if (normalizedValue === query) {
    return 0;
  }

  if (normalizedValue.startsWith(query)) {
    return 1;
  }

  if (normalizedValue.includes(query)) {
    return 2;
  }

  return null;
}

export function rankArchiveSearchCandidate(
  candidate: ArchiveSearchCandidate,
  query: string,
): ArchiveSearchMatch | null {
  const normalizedQuery = normalizeArchiveSearchText(query);

  if (!normalizedQuery) {
    return {
      rank: 0,
      kind: "ARCHIVE_NAME",
      matchedFileName: null,
    };
  }

  const archiveNameRank = getTextMatchRank(
    candidate.archiveName,
    normalizedQuery,
  );

  if (archiveNameRank !== null) {
    return {
      rank: archiveNameRank,
      kind: "ARCHIVE_NAME",
      matchedFileName: null,
    };
  }

  if (getTextMatchRank(candidate.projectName, normalizedQuery) !== null) {
    return {
      rank: 3,
      kind: "PROJECT_NAME",
      matchedFileName: null,
    };
  }

  if (getTextMatchRank(candidate.archiveCategory, normalizedQuery) !== null) {
    return {
      rank: 4,
      kind: "ARCHIVE_CATEGORY",
      matchedFileName: null,
    };
  }

  const matchingFile = (candidate.archivedFileNames ?? []).find(
    (fileName) => getTextMatchRank(fileName, normalizedQuery) !== null,
  );

  if (matchingFile) {
    return {
      rank: 5,
      kind: "ARCHIVED_FILE_NAME",
      matchedFileName: matchingFile,
    };
  }

  return null;
}
