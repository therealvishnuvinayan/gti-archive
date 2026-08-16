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
      isActive: true,
    },
  });
  fixtureIds.searchCategoryId = searchFixtureCategory.id;
  const searchFixtureAssetTag = await prisma.assetTag.create({
    data: {
      name: `FluxAssetTag-${searchFixtureRunId}`,
    },
  });
  fixtureIds.searchAssetTagId = searchFixtureAssetTag.id;
  const searchFixtureArtworkId = `FLUX-ART-${searchFixtureRunId}`;
  const searchFixtureArchive = await prisma.manualArchiveFile.create({
    data: {
      fileName: `Flux metadata fixture file ${searchFixtureRunId}.pdf`,
      originalFileName: `flux-metadata-original-${searchFixtureRunId}.pdf`,
      projectName: `Flux metadata project ${searchFixtureRunId}`,
      archiveCategoryId: searchFixtureCategory.id,
      mimeType: "application/pdf",
      fileSize: 128,
      bucket: "flux-search-integration",
      storageKey: `flux-search-integration/metadata-${searchFixtureRunId}.pdf`,
      status: AttachmentStatus.READY,
      uploadedById: superAdmin.id,
      assetTags: {
        create: {
          tagId: searchFixtureAssetTag.id,
        },
      },
      artworkMetadata: {
        create: {
          artworkId: searchFixtureArtworkId,
          titleWorkingName: "Flux metadata fixture",
          versionRevision: "1",
          languageMarket: "English",
          artworkType: "Integration test",
          brandSubBrand: "Flux",
          colourSpace: "RGB",
          fileFormats: "PDF",
          creationDate: new Date(),
          lastModifiedDate: new Date(),
          archiveStatus: "Archived",
          createdByName: "Flux integration check",
          approvedByName: "Flux integration check",
          clientBrandOwner: "Flux",
          fontsUsed: "None",
          imagesPhotography: "None",
          illustrationsIcons: "None",
          colourCodes: "None",
          changeLog: "Created for archive search verification.",
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
    "Artwork ID search must find a metadata-backed archive record",
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
