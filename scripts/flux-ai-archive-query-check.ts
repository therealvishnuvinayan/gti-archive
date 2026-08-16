import {
  parseArchiveSearchQuery,
  rankArchiveSearchCandidate,
} from "../src/lib/archive-search-query";

function check(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function checkParsed(input: string, expectedQuery: string, recent = false) {
  const parsed = parseArchiveSearchQuery(input);

  check(
    parsed.query === expectedQuery && parsed.recent === recent,
    `Archive query "${input}" parsed as ${JSON.stringify(parsed)}.`,
  );
}

for (const [input, expected] of [
  ["Merci AppleMint", "Merci AppleMint"],
  ["find Merci AppleMint", "Merci AppleMint"],
  ["find the archive for Merci AppleMint", "Merci AppleMint"],
  ["search archive AppleMint", "AppleMint"],
  ["Can you find Abhijith file", "Abhijith"],
  ["can u find ChatGPT Image Jun 12, 2026, 07_30_15 PM (1).png", "ChatGPT Image Jun 12, 2026, 07_30_15 PM (1).png"],
  ["find the file named final-master-carton.pdf", "final-master-carton.pdf"],
  ["show archived project Premium Rebrand", "Premium Rebrand"],
  ["where is the Merci AppleMint archive", "Merci AppleMint"],
]) {
  checkParsed(input, expected);
}
checkParsed("show recent archives", "", true);

const exactMatch = rankArchiveSearchCandidate(
  {
    archiveName: "Merci AppleMint",
    projectName: "Premium Rebrand",
    archivedFileNames: ["final-master-carton.pdf"],
  },
  "MERCI APPLEMINT",
);
const prefixMatch = rankArchiveSearchCandidate(
  { archiveName: "Merci AppleMint" },
  "Merci",
);
const containsMatch = rankArchiveSearchCandidate(
  { archiveName: "Merci AppleMint" },
  "AppleMint",
);
const projectMatch = rankArchiveSearchCandidate(
  {
    archiveName: "Archived Artwork",
    projectName: "Premium Rebrand",
  },
  "Premium Rebrand",
);
const filenameMatch = rankArchiveSearchCandidate(
  {
    archiveName: "Premium Rebrand",
    archivedFileNames: ["final-master-carton.pdf"],
  },
  "master-carton",
);
const unicodeWhitespaceFilenameMatch = rankArchiveSearchCandidate(
  {
    archiveName: "Premium Rebrand",
    archivedFileNames: ["Screenshot 2026-08-16 at 11.19.18\u202fAM.png"],
  },
  "Screenshot 2026-08-16 at 11.19.18 AM.png",
);
const artworkIdMatch = rankArchiveSearchCandidate(
  {
    archiveName: "Premium Rebrand",
    artworkIds: ["ART-2026-0002"],
  },
  "ART-2026-0002",
);
const assetTagMatch = rankArchiveSearchCandidate(
  {
    archiveName: "Premium Rebrand",
    assetTags: ["Digital & Website"],
  },
  "Digital & Website",
);

check(exactMatch?.rank === 0, "Exact archive-name matches must rank first.");
check(prefixMatch?.rank === 1, "Archive-name prefix matches must rank second.");
check(containsMatch?.rank === 2, "Archive-name contains matches must rank third.");
check(projectMatch?.rank === 3, "Project metadata must rank below archive names.");
check(
  filenameMatch?.kind === "ARCHIVED_FILE_NAME" &&
    filenameMatch.matchedFileName === "final-master-carton.pdf",
  "Archived filename matches must identify the real matching file.",
);
check(
  unicodeWhitespaceFilenameMatch?.kind === "ARCHIVED_FILE_NAME",
  "Equivalent Unicode filename whitespace must still match.",
);
check(artworkIdMatch?.kind === "ARTWORK_ID", "Artwork IDs must be searchable.");
check(assetTagMatch?.kind === "ASSET_TAG", "Asset tags must be searchable.");

console.log("Flux AI archive query checks passed.");
