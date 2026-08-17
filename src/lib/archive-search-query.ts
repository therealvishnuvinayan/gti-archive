export const archiveSearchMatchKindValues = [
  "ARCHIVE_NAME",
  "PROJECT_NAME",
  "ARCHIVE_CATEGORY",
  "ARCHIVED_FILE_NAME",
  "ARTWORK_ID",
  "ASSET_TAG",
] as const;

export type ArchiveSearchMatchKind =
  (typeof archiveSearchMatchKindValues)[number];

export type ArchiveSearchCandidate = {
  archiveName: string;
  projectName?: string | null;
  archiveCategory?: string | null;
  archivedFileNames?: string[];
  artworkIds?: string[];
  assetTags?: string[];
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

function normalizeComparableArchiveSearchText(
  value: string | null | undefined,
) {
  return normalizeArchiveSearchText(value)
    .normalize("NFKC")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const archiveSearchRequestPrefixes = [
  /^(?:hey\s+)?flux\s+ai\s*[,.:;-]\s+/i,
  /^where\s+can\s+i\s+(?:find|locate|get)(?:\s+the)?\s+/i,
  /^where\s+(?:is|are)(?:\s+the)?\s+/i,
  /^(?:(?:can|could|would|will)\s+(?:you|u)|(?:can|could|would)\s+i)\s+/i,
  /^(?:i\s+(?:would|'d)\s+like|i\s+(?:want|need))(?:\s+you)?(?:\s+to)?\s+/i,
  /^(?:do\s+you\s+have|have\s+you\s+got)\s+/i,
  /^please\s+/i,
  /^(?:find|locate|look\s+up|search(?:\s+for)?|show|view|display|list|open|fetch|retrieve|get|give|send)(?:\s+(?:to\s+)?me)?(?:\s+(?:all|any|the))?\s+/i,
];

const archiveSearchSubjectPrefixes = [
  /^(?:(?:an?|the)\s+)?(?:(?:archive|archived)\s+)?files?\s+(?:for|of|from)\s+(?:(?:an?|the)\s+)?projects?(?:\s+(?:named|called))?\s+/i,
  /^(?:(?:an?|the)\s+)?archives?\s+(?:for|of|from)\s+(?:(?:an?|the)\s+)?projects?(?:\s+(?:named|called))?\s+/i,
  /^(?:(?:an?|the)\s+)?(?:files?|archives?)\s+(?:in|under|from)\s+(?:(?:an?|the)\s+)?(?:archive\s+)?categor(?:y|ies)\s+/i,
  /^(?:(?:an?|the)\s+)?(?:files?|archives?)\s+(?:tagged(?:\s+with)?|with\s+(?:(?:an?|the)\s+)?(?:asset\s+)?tags?)\s+/i,
  /^(?:(?:an?|the)\s+)?archives?\s+(?:for|of|from)\s+/i,
  /^(?:by\s+|with\s+)?(?:(?:an?|the)\s+)?(?:original\s+file\s*names?|original\s+filenames?|archive(?:d)?\s+file\s*names?|archive(?:d)?\s+filenames?|file\s*names?|filenames?)(?:(?:\s+(?:named|called|is|equals?))?\s+|\s*[:=]\s*)/i,
  /^(?:by\s+|with\s+)?(?:(?:an?|the)\s+)?artworks?\s*(?:ids?|identifiers?)(?:(?:\s+(?:named|called|is|equals?))?\s+|\s*[:=]\s*)/i,
  /^(?:by\s+|with\s+)?(?:(?:an?|the)\s+)?(?:asset\s+)?tags?(?:(?:\s+(?:named|called|is|equals?))?\s+|\s*[:=]\s*)/i,
  /^(?:by\s+|in\s+|under\s+)?(?:(?:an?|the)\s+)?(?:archive\s+)?categor(?:y|ies)(?:(?:\s+(?:named|called|is|equals?))?\s+|\s*[:=]\s*)/i,
  /^(?:by\s+|for\s+|of\s+)?(?:(?:an?|the)\s+)?(?:archive(?:d)?\s+)?projects?(?:\s+names?)?(?:(?:\s+(?:named|called|is|equals?))?\s+|\s*[:=]\s*)/i,
  /^(?:by\s+|for\s+|of\s+)?(?:(?:an?|the)\s+)?archives?(?:\s+names?)?(?:(?:\s+(?:named|called|is|equals?))?\s+|\s*[:=]\s*)/i,
  /^(?:(?:an?|the)\s+)?(?:(?:archive|archived)\s+)?files?\s+(?:named|called)\s+/i,
  /^(?:(?:an?|the)\s+)?(?:(?:archive|archived)\s+)?files?\s+(?:for|of|from)\s+/i,
  /^(?:(?:an?|the)\s+)?(?:(?:archive|archived)\s+)?files?\s+/i,
];

const archiveSearchSubjectSuffixes = [
  /\s+please$/i,
  /(?:['’]s)\s+(?:(?:archive|archived)\s+)?files?$/i,
  /\s+(?:archive\s+categor(?:y|ies)|categor(?:y|ies))$/i,
  /\s+(?:asset\s+)?tags?$/i,
  /\s+artworks?\s*(?:ids?|identifiers?)$/i,
  /\s+(?:archives?|archived\s+projects?|projects?)$/i,
  /\s+(?:(?:archive|archived)\s+)?files?$/i,
];

function trimArchiveSearchQuery(value: string) {
  return normalizeWhitespace(
    value.replace(/^[\s"'`“”‘’]+|[\s"'`“”‘’.?!]+$/g, ""),
  );
}

function removeArchiveSearchFraming(value: string) {
  let query = trimArchiveSearchQuery(value);

  for (let pass = 0; pass < 8; pass += 1) {
    const previousQuery = query;

    for (const prefix of [
      ...archiveSearchRequestPrefixes,
      ...archiveSearchSubjectPrefixes,
    ]) {
      const strippedQuery = trimArchiveSearchQuery(query.replace(prefix, ""));

      if (strippedQuery && strippedQuery !== query) {
        query = strippedQuery;
        break;
      }
    }

    for (const suffix of archiveSearchSubjectSuffixes) {
      const strippedQuery = trimArchiveSearchQuery(query.replace(suffix, ""));

      if (strippedQuery && strippedQuery !== query) {
        query = strippedQuery;
        break;
      }
    }

    if (query === previousQuery) {
      break;
    }
  }

  return query;
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

  const query = removeArchiveSearchFraming(rawQuery);

  return { query, recent: false };
}

function getTextMatchRank(value: string | null | undefined, query: string) {
  const normalizedValue = normalizeArchiveSearchText(value);
  const comparableValue = normalizeComparableArchiveSearchText(value);
  const comparableQuery = normalizeComparableArchiveSearchText(query);

  if (!normalizedValue || !query) {
    return null;
  }

  if (
    normalizedValue === query ||
    (comparableQuery && comparableValue === comparableQuery)
  ) {
    return 0;
  }

  if (
    normalizedValue.startsWith(query) ||
    (comparableQuery && comparableValue.startsWith(comparableQuery))
  ) {
    return 1;
  }

  if (
    normalizedValue.includes(query) ||
    (comparableQuery && comparableValue.includes(comparableQuery))
  ) {
    return 2;
  }

  const queryTokens = comparableQuery.split(" ").filter(Boolean);

  if (
    queryTokens.length > 1 &&
    queryTokens.every((token) => comparableValue.includes(token))
  ) {
    return 3;
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

  const matches: Array<ArchiveSearchMatch & { textRank: number }> = [];
  const addMatch = (
    value: string | null | undefined,
    kind: ArchiveSearchMatchKind,
    matchedFileName: string | null,
    resultRank?: number,
  ) => {
    const textRank = getTextMatchRank(value, normalizedQuery);

    if (textRank !== null) {
      matches.push({
        rank: resultRank ?? textRank,
        kind,
        matchedFileName,
        textRank,
      });
    }
  };

  addMatch(candidate.archiveName, "ARCHIVE_NAME", null);
  addMatch(candidate.projectName, "PROJECT_NAME", null, 3);
  addMatch(candidate.archiveCategory, "ARCHIVE_CATEGORY", null, 4);

  for (const fileName of candidate.archivedFileNames ?? []) {
    addMatch(fileName, "ARCHIVED_FILE_NAME", fileName, 5);
  }

  for (const artworkId of candidate.artworkIds ?? []) {
    addMatch(artworkId, "ARTWORK_ID", null, 6);
  }

  for (const assetTag of candidate.assetTags ?? []) {
    addMatch(assetTag, "ASSET_TAG", null, 7);
  }

  matches.sort(
    (left, right) => left.textRank - right.textRank || left.rank - right.rank,
  );

  const [bestMatch] = matches;

  if (!bestMatch) {
    return null;
  }

  return {
    rank: bestMatch.rank,
    kind: bestMatch.kind,
    matchedFileName: bestMatch.matchedFileName,
  };
}
