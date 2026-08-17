import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import {
  AttachmentStatus,
  PrismaClient,
  UserRole,
} from "@prisma/client";

import {
  searchArchivesForUser,
  type ArchiveAccessUser,
} from "../src/lib/archives";
import {
  allPermissionKeys,
  type PermissionKey,
} from "../src/lib/permissions/definitions";
import type { PermissionProfileSnapshot } from "../src/lib/permissions/profiles";
import {
  clearRecentFluxAiSearches,
  deleteRecentFluxAiSearch,
  getRecentFluxAiSearches,
  recordFluxAiSearch,
} from "../src/lib/flux-ai-search-history";

function loadLocalEnvironment() {
  const contents = readFileSync(".env", "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

    if (!match || process.env[match[1]]) {
      continue;
    }

    let value = match[2];

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[match[1]] = value;
  }
}

loadLocalEnvironment();

const prisma = new PrismaClient();
const fixtureIds: {
  categoryId?: string;
  manualArchiveId?: string;
  searchCategoryId?: string;
  searchManualArchiveId?: string;
  searchAssetTagId?: string;
  searchHistoryUserIds?: string[];
} = {};

function check(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Flux AI archive search integration check failed: ${message}`);
  }
}

function buildPermissionSnapshot(input: {
  permissions: Iterable<PermissionKey>;
  archiveAccessLevel: "NONE" | "FULL" | "PARTIAL";
}): PermissionProfileSnapshot {
  const permissions = new Set(input.permissions);

  return {
    effectivePermissions: permissions,
    rolePermissions: permissions,
    archiveAccessGranted: input.archiveAccessLevel !== "NONE",
    archiveAccessLevel: input.archiveAccessLevel,
  };
}

function buildArchiveUser(input: {
  id: string;
  role: UserRole;
  permissions: Iterable<PermissionKey>;
  archiveAccessLevel: "NONE" | "FULL" | "PARTIAL";
}): ArchiveAccessUser {
  return {
    id: input.id,
    role: input.role,
    name: "Archive search test user",
    email: "archive-search@example.test",
    permissionProfileSnapshot: buildPermissionSnapshot(input),
  };
}

async function getBusinessWriteCounts() {
  const [
    projects,
    workflowStages,
    conceptFolders,
    attachments,
    fileChecklists,
    productionUnits,
    sampleRounds,
    projectArchives,
    manualArchives,
    users,
    rolePermissions,
    fluxConversations,
    fluxMessages,
  ] = await Promise.all([
    prisma.project.count(),
    prisma.projectWorkflowStage.count(),
    prisma.projectConceptFolder.count(),
    prisma.projectAttachment.count(),
    prisma.projectFileChecklist.count(),
    prisma.projectProductionUnit.count(),
    prisma.productionSampleRound.count(),
    prisma.projectArchive.count(),
    prisma.manualArchiveFile.count(),
    prisma.user.count(),
    prisma.rolePermission.count(),
    prisma.fluxAiConversation.count(),
    prisma.fluxAiMessage.count(),
  ]);

  return {
    projects,
    workflowStages,
    conceptFolders,
    attachments,
    fileChecklists,
    productionUnits,
    sampleRounds,
    projectArchives,
    manualArchives,
    users,
    rolePermissions,
    fluxConversations,
    fluxMessages,
  };
}

async function main() {
  const superAdmin = await prisma.user.findFirst({
    where: {
      role: UserRole.SUPER_ADMIN,
    },
    select: {
      id: true,
      role: true,
      name: true,
      email: true,
    },
  });

  check(superAdmin, "a SUPER_ADMIN user is required for the real-data check");

  const historyRunId = randomUUID();
  const historyUserOneId = `flux-history-one-${historyRunId}`;
  const historyUserTwoId = `flux-history-two-${historyRunId}`;
  fixtureIds.searchHistoryUserIds = [historyUserOneId, historyUserTwoId];
  await prisma.user.createMany({
    data: [historyUserOneId, historyUserTwoId].map((id) => ({
      id,
      email: `${id}@example.test`,
      name: id,
      passwordHash: "flux-history-integration-only",
      role: UserRole.USER,
    })),
  });
  await recordFluxAiSearch(historyUserOneId, "First history query");
  await recordFluxAiSearch(historyUserOneId, "Second history query");
  await recordFluxAiSearch(historyUserTwoId, "First history query");
  const afterIndividualDelete = await deleteRecentFluxAiSearch(
    historyUserOneId,
    "  FIRST   HISTORY QUERY  ",
  );
  check(
    afterIndividualDelete.length === 1 &&
      afterIndividualDelete[0] === "Second history query",
    "individual deletion must normalize the query and remove only the signed-in user's matching search",
  );
  check(
    (await getRecentFluxAiSearches(historyUserTwoId))[0] === "First history query",
    "individual deletion must not affect another user's search history",
  );
  await clearRecentFluxAiSearches(historyUserOneId);
  check(
    (await getRecentFluxAiSearches(historyUserOneId)).length === 0 &&
      (await getRecentFluxAiSearches(historyUserTwoId)).length === 1,
    "Clear All must remove only the requesting user's search history",
  );

  const projectArchive = await prisma.projectArchive.findFirst({
    where: {
      archiveCategoryId: {
        not: null,
      },
    },
    orderBy: {
      archivedAt: "desc",
    },
    select: {
      id: true,
      projectName: true,
      archiveCategory: {
        select: {
          slug: true,
          name: true,
        },
      },
      files: {
        take: 1,
        select: {
          finalArchiveFileName: true,
          artworkMetadata: {
            select: {
              artworkId: true,
            },
          },
          sourceAttachment: {
            select: {
              assetTags: {
                take: 1,
                select: {
                  tag: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  let manualArchive = await prisma.manualArchiveFile.findFirst({
    where: {
      status: AttachmentStatus.READY,
      archiveCategoryId: {
        not: null,
      },
    },
    orderBy: {
      uploadedAt: "desc",
    },
    select: {
      id: true,
      fileName: true,
      originalFileName: true,
      artworkMetadata: {
        select: {
          artworkId: true,
        },
      },
      assetTags: {
        take: 1,
        select: {
          tag: {
            select: {
              name: true,
            },
          },
        },
      },
      archiveCategory: {
        select: {
          slug: true,
          name: true,
        },
      },
    },
  });

  if (!projectArchive?.archiveCategory && !manualArchive?.archiveCategory) {
    const runId = randomUUID();
    const category = await prisma.archiveCategory.create({
      data: {
        name: `Flux Search Fixture ${runId}`,
        slug: `flux-search-fixture-${runId}`,
        isActive: true,
      },
    });
    const archive = await prisma.manualArchiveFile.create({
      data: {
        fileName: `Flux Search Fixture ${runId}`,
        originalFileName: `flux-search-fixture-${runId}.pdf`,
        archiveCategoryId: category.id,
        mimeType: "application/pdf",
        fileSize: 128,
        bucket: "flux-search-integration",
        storageKey: `flux-search-integration/${runId}.pdf`,
        status: AttachmentStatus.READY,
        uploadedById: superAdmin.id,
      },
      select: {
        id: true,
        fileName: true,
        originalFileName: true,
        archiveCategory: { select: { slug: true, name: true } },
        artworkMetadata: { select: { artworkId: true } },
        assetTags: { select: { tag: { select: { name: true } } } },
      },
    });
    fixtureIds.categoryId = category.id;
    fixtureIds.manualArchiveId = archive.id;
    manualArchive = archive;
  }

  check(
    projectArchive?.archiveCategory || manualArchive?.archiveCategory,
    "at least one categorized archive record is required",
  );

  const source = projectArchive?.archiveCategory
    ? {
        id: projectArchive.id,
        name: projectArchive.projectName,
        filename: projectArchive.files[0]?.finalArchiveFileName ?? null,
        artworkId: projectArchive.files[0]?.artworkMetadata?.artworkId ?? null,
        assetTag:
          projectArchive.files[0]?.sourceAttachment.assetTags[0]?.tag.name ?? null,
        categoryName: projectArchive.archiveCategory.name,
        categorySlug: projectArchive.archiveCategory.slug,
        recordType: "PROJECT_ARCHIVE" as const,
      }
    : {
        id: manualArchive!.id,
        name: manualArchive!.fileName,
        filename: manualArchive!.originalFileName,
        artworkId: manualArchive!.artworkMetadata?.artworkId ?? null,
        assetTag: manualArchive!.assetTags[0]?.tag.name ?? null,
        categoryName: manualArchive!.archiveCategory!.name,
        categorySlug: manualArchive!.archiveCategory!.slug,
        recordType: "MANUAL_ARCHIVE_FILE" as const,
      };
  const authorizedUser: ArchiveAccessUser = {
    ...superAdmin,
    permissionProfileSnapshot: buildPermissionSnapshot({
      permissions: allPermissionKeys,
      archiveAccessLevel: "FULL",
    }),
  };
  const searchFixtureRunId = randomUUID();
  const searchFixtureCategory = await prisma.archiveCategory.create({
    data: {
      name: `Flux metadata fixture ${searchFixtureRunId}`,
      slug: `flux-metadata-fixture-${searchFixtureRunId}`,
      description: `Flux category description ${searchFixtureRunId}`,
      isActive: true,
    },
  });
  fixtureIds.searchCategoryId = searchFixtureCategory.id;
  const searchFixtureAssetTag = await prisma.assetTag.create({
    data: {
      name: `FluxAssetTag-${searchFixtureRunId}`,
      description: `Flux asset tag description ${searchFixtureRunId}`,
    },
  });
  fixtureIds.searchAssetTagId = searchFixtureAssetTag.id;
  const searchFixtureArtworkId = `FLUX-ART-${searchFixtureRunId}`;
  const searchFixtureArchive = await prisma.manualArchiveFile.create({
    data: {
      fileName: `Flux metadata fixture file ${searchFixtureRunId}.pdf`,
      originalFileName: `flux-metadata-original-${searchFixtureRunId}.pdf`,
      projectName: `Flux metadata project ${searchFixtureRunId}`,
      projectCreatedBy: `Flux project creator ${searchFixtureRunId}`,
      projectDate: new Date("2040-11-12T12:00:00.000Z"),
      archiveCategoryId: searchFixtureCategory.id,
      mimeType: `application/x-flux-${searchFixtureRunId}`,
      fileSize: 1_677_722,
      bucket: "flux-search-integration",
      storageKey: `flux-search-integration/metadata-${searchFixtureRunId}.pdf`,
      status: AttachmentStatus.READY,
      uploadedById: superAdmin.id,
      uploadedAt: new Date("2042-02-03T12:00:00.000Z"),
      assetTags: {
        create: {
          tagId: searchFixtureAssetTag.id,
        },
      },
      artworkMetadata: {
        create: {
          artworkId: searchFixtureArtworkId,
          titleWorkingName: `Flux title ${searchFixtureRunId}`,
          versionRevision: `Flux revision ${searchFixtureRunId}`,
          languageMarket: `Flux market ${searchFixtureRunId}`,
          artworkType: `Flux artwork type ${searchFixtureRunId}`,
          brandSubBrand: `Flux brand ${searchFixtureRunId}`,
          productSku: `Flux-SKU-${searchFixtureRunId}`,
          campaignProject: `Flux campaign ${searchFixtureRunId}`,
          formatDimensions: `Flux dimensions ${searchFixtureRunId}`,
          colourSpace: `Flux colour space ${searchFixtureRunId}`,
          resolution: `Flux resolution ${searchFixtureRunId}`,
          fileFormats: `Flux format ${searchFixtureRunId}`,
          printProcess: `Flux print process ${searchFixtureRunId}`,
          specialFinishes: `Flux finish ${searchFixtureRunId}`,
          creationDate: new Date("2041-01-02T12:00:00.000Z"),
          lastModifiedDate: new Date("2041-03-04T12:00:00.000Z"),
          goLiveOnShelfDate: new Date("2041-05-06T12:00:00.000Z"),
          expirySunsetDate: new Date("2041-07-08T12:00:00.000Z"),
          archiveStatus: `Flux status ${searchFixtureRunId}`,
          createdByName: `Flux creator ${searchFixtureRunId}`,
          approvedByName: `Flux approver ${searchFixtureRunId}`,
          approvedAt: new Date("2041-09-10T12:00:00.000Z"),
          clientBrandOwner: `Flux owner ${searchFixtureRunId}`,
          regulatoryClearance: `Flux clearance ${searchFixtureRunId}`,
          fontsUsed: `Flux fonts ${searchFixtureRunId}`,
          imagesPhotography: `Flux photography ${searchFixtureRunId}`,
          illustrationsIcons: `Flux illustration ${searchFixtureRunId}`,
          colourCodes: `Flux colour code ${searchFixtureRunId}`,
          thirdPartyLogosIp: `Flux third party IP ${searchFixtureRunId}`,
          supplierPrinter: `Flux printer ${searchFixtureRunId}`,
          outputFilesList: `Flux output list ${searchFixtureRunId}`,
          printProofRef: `Flux proof ${searchFixtureRunId}`,
          packagingDielineRef: `Flux dieline ${searchFixtureRunId}`,
          changeLog: `Flux change log ${searchFixtureRunId}`,
          relatedArtworks: `Flux related artwork ${searchFixtureRunId}`,
          briefSpecLink: `https://example.test/flux-spec-${searchFixtureRunId}`,
          generalNotes: `Flux general notes ${searchFixtureRunId}`,
          archivedById: superAdmin.id,
        },
      },
    },
  });
  fixtureIds.searchManualArchiveId = searchFixtureArchive.id;
  const unauthorizedPartialUser = buildArchiveUser({
    id: "__flux_ai_archive_search_no_grants__",
    role: UserRole.USER,
    permissions: ["archive.view"],
    archiveAccessLevel: "PARTIAL",
  });
  const countsBefore = await getBusinessWriteCounts();

  const exact = await searchArchivesForUser({
    user: authorizedUser,
    query: source.name,
  });
  check(exact.results[0]?.id === source.id, "exact archive-name result must rank first");
  check(
    exact.results[0]?.matchedOn === "ARCHIVE_NAME",
    "exact archive-name result must report the archive-name match",
  );

  const caseInsensitive = await searchArchivesForUser({
    user: authorizedUser,
    query: source.name.toLocaleUpperCase(),
  });
  check(
    caseInsensitive.results.some((result) => result.id === source.id),
    "archive-name search must be case-insensitive",
  );

  const partialTerm = source.name.slice(0, Math.max(2, Math.ceil(source.name.length / 2)));
  const partial = await searchArchivesForUser({
    user: authorizedUser,
    query: partialTerm,
  });
  check(
    partial.results.some((result) => result.id === source.id),
    "partial archive-name search must find the real record",
  );

  const naturalLanguage = await searchArchivesForUser({
    user: authorizedUser,
    query: `find archive ${source.name}`,
  });
  check(
    naturalLanguage.results.some((result) => result.id === source.id),
    "natural-language archive search must find the real record",
  );

  if (source.filename) {
    const filename = await searchArchivesForUser({
      user: authorizedUser,
      query: source.filename,
    });
    check(
      filename.results.some((result) => result.id === source.id),
      `archived filename search must find its real archive record (${JSON.stringify({
        source,
        parsedQuery: filename.query,
        results: filename.results,
      })})`,
    );
  }

  if (source.artworkId) {
    const artworkId = await searchArchivesForUser({
      user: authorizedUser,
      query: source.artworkId,
    });
    check(
      artworkId.results.some(
        (result) => result.id === source.id && result.matchedOn === "ARTWORK_ID",
      ),
      "Artwork ID search must find its real archive record",
    );
  }

  if (source.assetTag) {
    const assetTag = await searchArchivesForUser({
      user: authorizedUser,
      query: source.assetTag,
    });
    check(
      assetTag.results.some(
        (result) => result.id === source.id && result.matchedOn === "ASSET_TAG",
      ),
      "asset-tag search must find its real archive record",
    );
  }

  const fixtureArtworkId = await searchArchivesForUser({
    user: authorizedUser,
    query: searchFixtureArtworkId,
  });
  check(
    fixtureArtworkId.results.some(
      (result) =>
        result.id === searchFixtureArchive.id && result.matchedOn === "ARTWORK_ID",
    ),
    `Artwork ID search must find a metadata-backed archive record (${JSON.stringify({
      query: fixtureArtworkId.query,
      fixtureId: searchFixtureArchive.id,
      artworkId: searchFixtureArtworkId,
      results: fixtureArtworkId.results,
    })})`,
  );

  const fixtureAssetTag = await searchArchivesForUser({
    user: authorizedUser,
    query: searchFixtureAssetTag.name,
  });
  check(
    fixtureAssetTag.results.some(
      (result) =>
        result.id === searchFixtureArchive.id && result.matchedOn === "ASSET_TAG",
    ),
    "asset-tag search must find a tagged archive record",
  );

  const naturalLanguageFieldSearches = [
    {
      query: `find file name: ${searchFixtureArchive.fileName}`,
      matchedOn: "ARCHIVE_NAME",
      label: "file name",
    },
    {
      query: `find archive file name: ${searchFixtureArchive.fileName}`,
      matchedOn: "ARCHIVE_NAME",
      label: "archive file name",
    },
    {
      query: `find original file name: ${searchFixtureArchive.originalFileName}`,
      matchedOn: "ARCHIVED_FILE_NAME",
      label: "original file name",
    },
    {
      query: `give me the file of project ${searchFixtureArchive.projectName}`,
      matchedOn: "PROJECT_NAME",
      label: "project name",
    },
    {
      query: `find artwork ID ${searchFixtureArtworkId}`,
      matchedOn: "ARTWORK_ID",
      label: "artwork ID",
    },
    {
      query: `show files in archive category ${searchFixtureCategory.name}`,
      matchedOn: "ARCHIVE_CATEGORY",
      label: "archive category",
    },
    {
      query: `find files tagged with asset tag ${searchFixtureAssetTag.name}`,
      matchedOn: "ASSET_TAG",
      label: "asset tag",
    },
  ] as const;

  for (const fieldSearch of naturalLanguageFieldSearches) {
    const response = await searchArchivesForUser({
      user: authorizedUser,
      query: fieldSearch.query,
    });
    check(
      response.results.some(
        (result) =>
          result.id === searchFixtureArchive.id &&
          result.matchedOn === fieldSearch.matchedOn,
      ),
      `natural-language ${fieldSearch.label} search must find the archive (${JSON.stringify(
        {
          query: fieldSearch.query,
          parsedQuery: response.query,
          results: response.results,
        },
      )})`,
    );
  }

  const comprehensiveMetadataSearches = [
    ["title / working name", `Flux title ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["version / revision", `Flux revision ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["language / market", `Flux market ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["artwork type", `Flux artwork type ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["brand / sub-brand", `Flux brand ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["product SKU", `Flux-SKU-${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["campaign / project", `Flux campaign ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["format / dimensions", `Flux dimensions ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["colour space", `Flux colour space ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["resolution", `Flux resolution ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["file formats", `Flux format ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["print process", `Flux print process ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["special finishes", `Flux finish ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["archive status", `Flux status ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["created by", `Flux creator ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["approved by", `Flux approver ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["client / brand owner", `Flux owner ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["regulatory clearance", `Flux clearance ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["fonts used", `Flux fonts ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["images / photography", `Flux photography ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["illustrations / icons", `Flux illustration ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["colour codes", `Flux colour code ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["third-party logos / IP", `Flux third party IP ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["supplier / printer", `Flux printer ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["output files list", `Flux output list ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["print proof ref", `Flux proof ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["packaging dieline ref", `Flux dieline ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["change log", `Flux change log ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["related artworks", `Flux related artwork ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["brief / spec link", `https://example.test/flux-spec-${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["general notes", `Flux general notes ${searchFixtureRunId}`, "ARTWORK_METADATA"],
    ["archive category description", `Flux category description ${searchFixtureRunId}`, "ARCHIVE_CATEGORY"],
    ["asset tag description", `Flux asset tag description ${searchFixtureRunId}`, "ASSET_TAG"],
    ["project created by", `Flux project creator ${searchFixtureRunId}`, "PROJECT_METADATA"],
    ["MIME type", `application/x-flux-${searchFixtureRunId}`, "FILE_METADATA"],
  ] as const;

  for (const [field, value, matchedOn] of comprehensiveMetadataSearches) {
    const response = await searchArchivesForUser({
      user: authorizedUser,
      query: `find archives with ${field} ${value}`,
      limit: 20,
    });
    check(
      response.results.some(
        (result) =>
          result.id === searchFixtureArchive.id &&
          result.matchedOn === matchedOn &&
          result.matchedFileName === searchFixtureArchive.fileName,
      ),
      `full archive field ${field} must find and identify the fixture file (${JSON.stringify({
        query: response.query,
        results: response.results,
      })})`,
    );
  }

  const dateAndSizeSearches = [
    ["project date 12 November 2040", "Project date"],
    ["creation date 2 January 2041", "Creation date"],
    ["last modified 4 March 2041", "Last modified"],
    ["go live 6 May 2041", "Go live / On shelf"],
    ["expiry 8 July 2041", "Expiry / Sunset"],
    ["approved at 10 September 2041", "Approved at"],
    ["archived on 3 February 2042", "Archived date"],
    ["file size 1.6 MB", "File size"],
  ] as const;

  for (const [filter, matchedField] of dateAndSizeSearches) {
    const response = await searchArchivesForUser({
      user: authorizedUser,
      query: `find ${searchFixtureArchive.projectName} ${filter}`,
      limit: 20,
    });
    check(
      response.results.some(
        (result) =>
          result.id === searchFixtureArchive.id &&
          (result.matchedField === matchedField ||
            result.matchedFileName === searchFixtureArchive.fileName),
      ),
      `${matchedField} filtering must find the fixture (${JSON.stringify({
        query: response.query,
        results: response.results,
      })})`,
    );
  }

  const combinedFields = await searchArchivesForUser({
    user: authorizedUser,
    query: `show archives from project ${searchFixtureArchive.projectName} with colour space Flux colour space ${searchFixtureRunId} created by Flux creator ${searchFixtureRunId}`,
    limit: 20,
  });
  check(
    combinedFields.results.some(
      (result) =>
        result.id === searchFixtureArchive.id &&
        result.matchedFileName === searchFixtureArchive.fileName,
    ),
    "one natural-language request must combine project and multiple artwork metadata filters",
  );

  const archivedBy = await searchArchivesForUser({
    user: authorizedUser,
    query: `find ${searchFixtureArchive.projectName} archived by ${superAdmin.name ?? superAdmin.email}`,
    limit: 20,
  });
  check(
    archivedBy.results.some(
      (result) =>
        result.id === searchFixtureArchive.id &&
        result.matchedOn === "ARCHIVED_BY",
    ),
    "archived-by search must filter against the archive uploader",
  );

  const screenshotArchivedByPhrase = await searchArchivesForUser({
    user: authorizedUser,
    query: `show me the files that Archived by ${superAdmin.name ?? superAdmin.email}`,
    limit: 20,
  });
  check(
    screenshotArchivedByPhrase.results.some(
      (result) => result.matchedOn === "ARCHIVED_BY",
    ),
    "the reported 'files that Archived by' wording must return archived-by matches",
  );

  for (const misspelling of ["archieve", "archieves", "achiewes"]) {
    const response = await searchArchivesForUser({
      user: authorizedUser,
      query: `find the ${misspelling} from ${searchFixtureArchive.projectName} project`,
      limit: 20,
    });
    check(
      response.results.some((result) => result.id === searchFixtureArchive.id),
      `common archive misspelling '${misspelling}' must not prevent project search`,
    );
  }

  const multiple = await searchArchivesForUser({
    user: authorizedUser,
    query: source.categoryName,
    limit: 20,
  });
  check(multiple.results.length >= 1, "category metadata search must return real results");

  const recent = await searchArchivesForUser({
    user: authorizedUser,
    query: "show recent archives",
  });
  check(recent.recent, "recent archive wording must use deterministic recent mode");
  check(recent.results.length >= 1, "recent archive mode must return real records");

  const noResultTerm = `no-such-archive-${Date.now()}`;
  const noResult = await searchArchivesForUser({
    user: authorizedUser,
    query: noResultTerm,
  });
  check(noResult.results.length === 0, "unknown archive names must return no results");

  for (const mutationPrompt of [
    "create project Flux mutation probe",
    "complete and unlock stage 7",
    `delete archive ${source.name}`,
  ]) {
    await searchArchivesForUser({
      user: authorizedUser,
      query: mutationPrompt,
    });
  }

  for (const restrictedQuery of [source.name, partialTerm, source.filename].filter(
    (value): value is string => Boolean(value),
  )) {
    const restricted = await searchArchivesForUser({
      user: unauthorizedPartialUser,
      query: restrictedQuery,
    });
    check(
      restricted.results.length === 0,
      `unauthorized search leaked data for ${restrictedQuery}`,
    );
  }

  const resultIds = new Set(
    [exact, caseInsensitive, partial, naturalLanguage, multiple, recent].flatMap(
      (response) => response.results.map((result) => `${result.recordType}:${result.id}`),
    ),
  );

  for (const resultId of resultIds) {
    const [recordType, id] = resultId.split(":");
    const exists =
      recordType === "PROJECT_ARCHIVE"
        ? await prisma.projectArchive.count({ where: { id } })
        : await prisma.manualArchiveFile.count({ where: { id } });
    check(exists === 1, `search returned a non-existent archive record ${resultId}`);
  }

  check(
    exact.results[0]?.href.startsWith(
      `/archives/${encodeURIComponent(source.categorySlug)}?search=`,
    ),
    "Open Archive must navigate to the existing archive category route",
  );

  const countsAfter = await getBusinessWriteCounts();
  check(
    JSON.stringify(countsAfter) === JSON.stringify(countsBefore),
    "archive searches must not write any business or Flux conversation records",
  );

  console.log(
    JSON.stringify(
      {
        checkedArchive: source.name,
        exactFirst: exact.results[0]?.name,
        caseInsensitiveMatches: caseInsensitive.results.length,
        partialMatches: partial.results.length,
        naturalLanguageMatches: naturalLanguage.results.length,
        filenameSearchSupported: Boolean(source.filename),
        artworkIdSearchChecked: true,
        assetTagSearchChecked: true,
        naturalLanguageFieldSearchesChecked:
          naturalLanguageFieldSearches.length,
        comprehensiveArchiveFieldsChecked:
          comprehensiveMetadataSearches.length + dateAndSizeSearches.length,
        combinedFieldSearchesChecked: 2,
        reportedPhraseRegressionsChecked: 4,
        multipleMatches: multiple.results.length,
        unauthorizedMatches: 0,
        mutationPromptsChecked: 3,
        businessWrites: 0,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (fixtureIds.searchHistoryUserIds?.length) {
      await prisma.user.deleteMany({
        where: { id: { in: fixtureIds.searchHistoryUserIds } },
      });
    }
    if (fixtureIds.searchManualArchiveId) {
      await prisma.manualArchiveFile.deleteMany({
        where: { id: fixtureIds.searchManualArchiveId },
      });
    }
    if (fixtureIds.searchAssetTagId) {
      await prisma.assetTag.deleteMany({
        where: { id: fixtureIds.searchAssetTagId },
      });
    }
    if (fixtureIds.searchCategoryId) {
      await prisma.archiveCategory.deleteMany({
        where: { id: fixtureIds.searchCategoryId },
      });
    }
    if (fixtureIds.manualArchiveId) {
      await prisma.manualArchiveFile.deleteMany({
        where: { id: fixtureIds.manualArchiveId },
      });
    }
    if (fixtureIds.categoryId) {
      await prisma.archiveCategory.deleteMany({
        where: { id: fixtureIds.categoryId },
      });
    }
    await prisma.$disconnect();
  });
