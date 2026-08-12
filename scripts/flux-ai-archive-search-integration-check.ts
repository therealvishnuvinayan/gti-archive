import { readFileSync } from "node:fs";

import {
  AttachmentStatus,
  PrismaClient,
  UserRole,
  type CollaboratorType,
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
    collaboratorTypePermissions: permissions,
    archiveAccessGranted: input.archiveAccessLevel !== "NONE",
    archiveAccessLevel: input.archiveAccessLevel,
  };
}

function buildArchiveUser(input: {
  id: string;
  role: UserRole;
  collaboratorType: CollaboratorType;
  permissions: Iterable<PermissionKey>;
  archiveAccessLevel: "NONE" | "FULL" | "PARTIAL";
}): ArchiveAccessUser {
  return {
    id: input.id,
    role: input.role,
    collaboratorType: input.collaboratorType,
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
      collaboratorType: true,
      name: true,
      email: true,
    },
  });

  check(superAdmin, "a SUPER_ADMIN user is required for the real-data check");

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
        },
      },
    },
  });
  const manualArchive = await prisma.manualArchiveFile.findFirst({
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
      archiveCategory: {
        select: {
          slug: true,
          name: true,
        },
      },
    },
  });

  check(
    projectArchive?.archiveCategory || manualArchive?.archiveCategory,
    "at least one categorized archive record is required",
  );

  const source = projectArchive?.archiveCategory
    ? {
        id: projectArchive.id,
        name: projectArchive.projectName,
        filename: projectArchive.files[0]?.finalArchiveFileName ?? null,
        categoryName: projectArchive.archiveCategory.name,
        categorySlug: projectArchive.archiveCategory.slug,
        recordType: "PROJECT_ARCHIVE" as const,
      }
    : {
        id: manualArchive!.id,
        name: manualArchive!.fileName,
        filename: manualArchive!.originalFileName,
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
  const unauthorizedPartialUser = buildArchiveUser({
    id: "__flux_ai_archive_search_no_grants__",
    role: UserRole.COLLABORATOR,
    collaboratorType: "GTI_INTERNAL_CLIENT",
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
      "archived filename search must find its real archive record",
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
    await prisma.$disconnect();
  });
