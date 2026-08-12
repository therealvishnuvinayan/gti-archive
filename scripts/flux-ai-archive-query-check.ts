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

check(exactMatch?.rank === 0, "Exact archive-name matches must rank first.");
check(prefixMatch?.rank === 1, "Archive-name prefix matches must rank second.");
check(containsMatch?.rank === 2, "Archive-name contains matches must rank third.");
check(projectMatch?.rank === 3, "Project metadata must rank below archive names.");
check(
  filenameMatch?.kind === "ARCHIVED_FILE_NAME" &&
    filenameMatch.matchedFileName === "final-master-carton.pdf",
  "Archived filename matches must identify the real matching file.",
);

console.log("Flux AI archive query checks passed.");
