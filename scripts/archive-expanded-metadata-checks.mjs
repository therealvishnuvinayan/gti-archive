import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

function read(relativePath) {
  return readFileSync(join(rootDir, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(source, value, label) {
  assert(source.includes(value), `${label} is missing.`);
}

const archivesSource = read("src/lib/archives.ts");
const workspaceSource = read("src/components/archives/archive-category-workspace.tsx");

for (const field of [
  "formatDimensions",
  "colourSpace",
  "resolution",
  "fileFormats",
  "printProcess",
  "specialFinishes",
  "creationDate",
  "lastModifiedDate",
  "goLiveOnShelfDate",
  "expirySunsetDate",
  "approvedAt",
  "clientBrandOwner",
  "regulatoryClearance",
  "fontsUsed",
  "imagesPhotography",
  "illustrationsIcons",
  "colourCodes",
  "thirdPartyLogosIp",
  "supplierPrinter",
  "outputFilesList",
  "printProofRef",
  "packagingDielineRef",
  "relatedArtworks",
  "briefSpecLink",
]) {
  assertIncludes(archivesSource, `${field}: true`, `Archive metadata select ${field}`);
  assertIncludes(workspaceSource, `key: "${field}"`, `Archive expanded metadata field ${field}`);
}

assertIncludes(
  archivesSource,
  "mapArchiveArtworkMetadataSummary(input.artworkMetadata)",
  "Archive metadata mapper",
);
assertIncludes(
  workspaceSource,
  "expandedArchiveItemIds",
  "Archive expanded item state",
);
assertIncludes(
  workspaceSource,
  "Expand archive",
  "Archive expand button",
);
assertIncludes(
  workspaceSource,
  "Full archive metadata",
  "Expanded archive metadata panel",
);
assertIncludes(
  workspaceSource,
  "MotionSwap motionKey={`archive-details-${item.id}`}",
  "Expanded archive metadata lightweight transition",
);

assert(
  !workspaceSource.includes("<MotionItem key={item.id} layout"),
  "Archive item cards must not use layout animation for expansion.",
);

console.log("Archive expanded metadata regression checks passed.");
