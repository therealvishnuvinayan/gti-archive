import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  Prisma,
  PrismaClient,
  UserRole,
} from "@prisma/client";

import {
  hashAuthPassword,
  normalizeAuthEmail,
  verifyAuthPassword,
} from "../src/lib/auth-password";
import { getPasswordValidationErrors } from "../src/lib/password-rules";
import { deleteObjectIfNeeded } from "../src/lib/storage/s3";

const PROJECT_ROOT = process.cwd();
const EXPECTED_MIGRATION_COUNT = 70;
const CANONICAL_ROOT_EMAIL = "superadmin@gti-archive.com";
const RESET_CONFIRMATION = "DELETE_ALL_DEVELOPMENT_BUSINESS_DATA";
const S3_CONFIRMATION = "DELETE_RECORDED_DEVELOPMENT_S3_OBJECTS";
const RESET_ADVISORY_LOCK = "gti-archive-reset-development-data-v1";

export const PRESERVED_TABLE_CATEGORIES = {
  "Prisma migration ledger": ["_prisma_migrations"],
  "Permission catalog and compatibility profiles": [
    "PermissionDefinition",
    "RolePermission",
  ],
  "Project master data": [
    "ProjectCategory",
    "ProjectStatusGroupOption",
    "ProjectStatusOption",
    "ProjectTag",
  ],
  "Archive and asset master data": ["AssetTag", "ArchiveCategory"],
} as const;

export const DISPOSABLE_TABLE_CATEGORIES = {
  "Users and authentication": ["User", "Session", "PasswordResetToken"],
  "Project core, workflow, and participants": [
    "Project",
    "ProjectFormDraft",
    "ProjectCoOwner",
    "ProjectCollaborator",
    "ProjectCollaboratorVisibilityPause",
    "ProjectExecutor",
    "ProjectWorkflowStage",
    "ProjectStage",
    "ProjectTagAssignment",
  ],
  "Stage 1 inquiry and contacts": [
    "ContactDirectoryEntry",
    "ProjectInquiry",
    "ProjectInquiryParty",
    "ProjectInquiryTargetMarket",
    "ProjectInquiryDeliverable",
    "ProjectInquiryAttachment",
  ],
  "Stage 2 research": [
    "ProjectResearchWorkspace",
    "ProjectResearchFolder",
    "ProjectResearchFolderFile",
  ],
  "Stages 3 and 4 concepts, revisions, and chat": [
    "ProjectConceptFolder",
    "ProjectRevision",
    "ProjectComment",
    "ProjectCommentMention",
    "ComparisonComment",
  ],
  "Project files, favorites, handoffs, and history": [
    "ProjectAttachment",
    "ProjectAttachmentAssetTagAssignment",
    "FileFavorite",
    "ProjectStageFileHandoff",
    "StageInvoiceRequest",
    "ProjectActivityLog",
  ],
  "Stage 5 checklist workflow": [
    "ProjectFileChecklist",
    "ProjectFileChecklistItem",
    "ProjectFileChecklistItemAttachment",
    "ProjectFileChecklistRequest",
  ],
  "Stage 6 production and handover": [
    "ProjectProductionUnit",
    "ProjectProductionUnitFile",
    "ProductionApprovalStep",
    "ProjectProductionHandover",
  ],
  "Stage 7 supervision and samples": [
    "ProjectProductionSupervision",
    "ProductionSampleRound",
    "ProductionSampleEvaluation",
    "ProductionSampleRoundParticipant",
    "ProductionSampleRoundEvidence",
    "ProductionSampleFeedback",
  ],
  "Completion and project archive": [
    "ProjectClosure",
    "ProjectCompletionWorkflow",
    "ProjectCompletionDocument",
    "ProjectArchive",
    "ArchivedProjectFile",
  ],
  "Manual archive and library business data": [
    "ArchiveArtworkMetadata",
    "ManualArchiveFile",
    "ManualArchiveFileAssetTagAssignment",
    "ManualLibraryAsset",
    "ManualLibraryAssetFavorite",
    "ManualLibraryAssetTagAssignment",
    "UserArchiveAccess",
    "UserArchiveAssetAccess",
    "ArchiveCategoryAccess",
  ],
  "Flux AI history": [
    "FluxAiConversation",
    "FluxAiMessage",
    "FluxAiSearchHistory",
  ],
  Notifications: ["Notification"],
  Calendar: ["CalendarEvent", "CalendarCollaborator"],
} as const;

function flattenTableCategories(
  categories: Record<string, readonly string[]>,
) {
  return Object.values(categories).flat();
}

export const PRESERVED_TABLES = [
  ...flattenTableCategories(PRESERVED_TABLE_CATEGORIES),
].sort();
export const DISPOSABLE_TABLES = [
  ...flattenTableCategories(DISPOSABLE_TABLE_CATEGORIES),
].sort();
export const EXPECTED_TABLES = [...PRESERVED_TABLES, ...DISPOSABLE_TABLES].sort();

const EXPECTED_RESTRICTIVE_FOREIGN_KEYS = [
  "ArchiveArtworkMetadata_ArchiveArtworkMetadata_archivedById_fkey_User_RESTRICT",
  "ArchiveArtworkMetadata_ArchiveArtworkMetadata_sourceAttachmentId_fkey_ProjectAttachment_RESTRICT",
  "ArchivedProjectFile_ArchivedProjectFile_archivedById_fkey_User_RESTRICT",
  "ArchivedProjectFile_ArchivedProjectFile_sourceAttachmentId_fkey_ProjectAttachment_RESTRICT",
  "ComparisonComment_ComparisonComment_createdById_fkey_User_RESTRICT",
  "ContactDirectoryEntry_ContactDirectoryEntry_createdById_fkey_User_RESTRICT",
  "ManualArchiveFile_ManualArchiveFile_uploadedById_fkey_User_RESTRICT",
  "ManualArchiveFileAssetTagAssignment_ManualArchiveFileAssetTagAssignment_tagId_fkey_AssetTag_RESTRICT",
  "ManualLibraryAsset_ManualLibraryAsset_uploadedById_fkey_User_RESTRICT",
  "ManualLibraryAssetTagAssignment_ManualLibraryAssetTagAssignment_tagId_fkey_AssetTag_RESTRICT",
  "ProductionApprovalStep_ProductionApprovalStep_recipientUserId_fkey_User_RESTRICT",
  "ProductionApprovalStep_ProductionApprovalStep_requestedById_fkey_User_RESTRICT",
  "ProductionSampleFeedback_ProductionSampleFeedback_sentById_fkey_User_RESTRICT",
  "ProductionSampleRound_ProductionSampleRound_createdById_fkey_User_RESTRICT",
  "ProductionSampleRound_ProductionSampleRound_recipientUserId_fkey_User_RESTRICT",
  "ProductionSampleRoundEvidence_ProductionSampleRoundEvidence_addedById_fkey_User_RESTRICT",
  "ProductionSampleRoundParticipant_ProductionSampleRoundParticipant_addedById_fkey_User_RESTRICT",
  "Project_Project_createdById_fkey_User_RESTRICT",
  "Project_Project_ownerId_fkey_User_RESTRICT",
  "ProjectActivityLog_ProjectActivityLog_actorId_fkey_User_RESTRICT",
  "ProjectArchive_ProjectArchive_archivedById_fkey_User_RESTRICT",
  "ProjectArchive_ProjectArchive_finalStageId_fkey_ProjectStage_RESTRICT",
  "ProjectAttachment_ProjectAttachment_uploadedById_fkey_User_RESTRICT",
  "ProjectAttachmentAssetTagAssignment_ProjectAttachmentAssetTagAssignment_tagId_fkey_AssetTag_RESTRICT",
  "ProjectClosure_ProjectClosure_closedById_fkey_User_RESTRICT",
  "ProjectCollaboratorVisibilityPause_ProjectCollaboratorVisibilityPause_createdById_fkey_User_RESTRICT",
  "ProjectComment_ProjectComment_authorId_fkey_User_RESTRICT",
  "ProjectCompletionDocument_ProjectCompletionDocument_uploadedById_fkey_User_RESTRICT",
  "ProjectConceptFolder_ProjectConceptFolder_approvedAttachmentId_fkey_ProjectAttachment_RESTRICT",
  "ProjectConceptFolder_ProjectConceptFolder_projectId_assignedExecutorId_fkey_ProjectExecutor_RESTRICT",
  "ProjectConceptFolder_ProjectConceptFolder_sourceStage3ApprovedAttachmentId_fkey_ProjectAttachment_RESTRICT",
  "ProjectConceptFolder_ProjectConceptFolder_sourceStage3ConceptId_fkey_ProjectConceptFolder_RESTRICT",
  "ProjectFileChecklistRequest_ProjectFileChecklistRequest_recipientUserId_fkey_User_RESTRICT",
  "ProjectFileChecklistRequest_ProjectFileChecklistRequest_requestedById_fkey_User_RESTRICT",
  "ProjectInquiryParty_ProjectInquiryParty_contactId_fkey_ContactDirectoryEntry_RESTRICT",
  "ProjectInquiryParty_ProjectInquiryParty_userId_fkey_User_RESTRICT",
  "ProjectProductionHandover_ProjectProductionHandover_handedOverById_fkey_User_RESTRICT",
  "ProjectProductionHandover_ProjectProductionHandover_recipientUserId_fkey_User_RESTRICT",
  "ProjectProductionHandover_ProjectProductionHandover_requestedById_fkey_User_RESTRICT",
  "ProjectProductionUnit_ProjectProductionUnit_createdById_fkey_User_RESTRICT",
  "ProjectProductionUnitFile_ProjectProductionUnitFile_addedById_fkey_User_RESTRICT",
  "ProjectResearchFolderFile_ProjectResearchFolderFile_addedById_fkey_User_RESTRICT",
  "ProjectRevision_ProjectRevision_createdById_fkey_User_RESTRICT",
  "ProjectStageFileHandoff_ProjectStageFileHandoff_handedOffById_fkey_User_RESTRICT",
  "ProjectTagAssignment_ProjectTagAssignment_tagId_fkey_ProjectTag_RESTRICT",
  "RolePermission_RolePermission_permissionKey_fkey_PermissionDefinition_RESTRICT",
  "StageInvoiceRequest_StageInvoiceRequest_requestedById_fkey_User_RESTRICT",
  "StageInvoiceRequest_StageInvoiceRequest_requestedFromId_fkey_User_RESTRICT",
].sort();

type SqlClient = PrismaClient | Prisma.TransactionClient;

export type ForeignKeyRecord = {
  constraintName: string;
  childTable: string;
  parentTable: string;
  onDelete: "NO ACTION" | "RESTRICT" | "CASCADE" | "SET NULL" | "SET DEFAULT";
};

type DatabaseIdentity = {
  database: string;
  schema: string;
  user: string;
  neonProjectId: string | null;
  neonBranchId: string | null;
  neonEndpointId: string | null;
};

type TargetConfig = {
  version: number;
  remoteDevelopmentTargets: Array<{
    label: string;
    host: string;
    database: string;
    neonProjectId: string;
    neonBranchId: string;
    neonEndpointId: string;
  }>;
  localDisposableDatabasePrefix: string;
};

type SeedAccountInput = {
  name: string;
  email: string;
  passwordEnv: string;
};

export type SeedManifest = {
  version: number;
  environment: string;
  approvedForExecution: boolean;
  superAdmin: SeedAccountInput;
  admins: SeedAccountInput[];
  users: SeedAccountInput[];
};

type ResolvedSeedAccount = SeedAccountInput & {
  email: string;
  role: UserRole;
  password: string;
  passwordHash: string;
};

type StorageKeySource = {
  table: string;
  id: string;
};

type StorageKeyRecord = {
  bucket: string | null;
  key: string;
  sources: StorageKeySource[];
  deletionStatus: "pending" | "deleted" | "failed";
  deletionError?: string;
};

type S3KeyReport = {
  version: 1;
  generatedAt: string;
  mode: "dry-run" | "execute";
  target: {
    host: string;
    port: string;
    database: string;
    schema: string;
    neonProjectId: string | null;
    neonBranchId: string | null;
    neonEndpointId: string | null;
  };
  databaseResetCommitted: boolean;
  s3CleanupRequested: boolean;
  s3CleanupCompleted: boolean;
  keys: StorageKeyRecord[];
};

type CliOptions = {
  execute: boolean;
  manifestPath?: string;
  s3ReportPath?: string;
  deleteS3: boolean;
  s3Only: boolean;
  help: boolean;
};

type PreservedSnapshot = Record<string, { count: number; digest: string }>;

function quoteIdentifier(identifier: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, "utf8");

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function parseCliOptions(argv: string[]): CliOptions {
  const options: CliOptions = {
    execute: false,
    deleteS3: false,
    s3Only: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case "--dry-run":
        break;
      case "--execute":
        options.execute = true;
        break;
      case "--delete-s3":
        options.deleteS3 = true;
        break;
      case "--s3-only":
        options.s3Only = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--manifest":
        options.manifestPath = argv[index + 1];
        index += 1;
        break;
      case "--s3-report":
        options.s3ReportPath = argv[index + 1];
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (options.deleteS3 && !options.execute) {
    throw new Error("--delete-s3 requires --execute.");
  }

  if (options.s3Only && !options.s3ReportPath) {
    throw new Error("--s3-only requires --s3-report <path>.");
  }

  return options;
}

function printUsage() {
  console.log(`Usage:
  pnpm development-data:reset [--dry-run] [--manifest <path>] [--s3-report <path>]
  pnpm development-data:reset --execute --manifest <path> [--s3-report <path>] [--delete-s3]
  pnpm development-data:reset --s3-only --s3-report <path> [--dry-run|--execute]

Default mode is dry-run. Database mutation requires --execute and all environment guards.`);
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
}

function getTargetConfig(): TargetConfig {
  const configPath = path.join(PROJECT_ROOT, "scripts/reset-development-targets.json");
  const parsed = readJsonFile(configPath) as TargetConfig;

  if (
    parsed.version !== 1 ||
    !Array.isArray(parsed.remoteDevelopmentTargets) ||
    !parsed.localDisposableDatabasePrefix
  ) {
    throw new Error(`Invalid reset target configuration: ${configPath}`);
  }

  return parsed;
}

function getDatabaseUrl() {
  const value = process.env.DATABASE_URL;

  if (!value) {
    throw new Error("DATABASE_URL is required.");
  }

  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));

  if (!url.hostname || !database) {
    throw new Error("DATABASE_URL must include a host and database name.");
  }

  return {
    url,
    host: url.hostname.toLowerCase(),
    port: url.port || "5432",
    database,
    targetLabel: `${url.hostname.toLowerCase()}:${url.port || "5432"}/${database}`,
  };
}

function isLoopbackHost(host: string) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function assertKnownDevelopmentTarget(
  targetConfig: TargetConfig,
  databaseUrl: ReturnType<typeof getDatabaseUrl>,
  identity: DatabaseIdentity,
) {
  if (identity.database !== databaseUrl.database || identity.schema !== "public") {
    throw new Error(
      `Database identity mismatch. URL=${databaseUrl.database}/public actual=${identity.database}/${identity.schema}.`,
    );
  }

  if (isLoopbackHost(databaseUrl.host)) {
    if (!databaseUrl.database.startsWith(targetConfig.localDisposableDatabasePrefix)) {
      throw new Error(
        `Local reset databases must start with ${targetConfig.localDisposableDatabasePrefix}.`,
      );
    }

    return "local disposable PostgreSQL";
  }

  const match = targetConfig.remoteDevelopmentTargets.find(
    (target) =>
      target.host.toLowerCase() === databaseUrl.host &&
      target.database === databaseUrl.database &&
      target.neonProjectId === identity.neonProjectId &&
      target.neonBranchId === identity.neonBranchId &&
      target.neonEndpointId === identity.neonEndpointId,
  );

  if (!match) {
    throw new Error(
      "DATABASE_URL is not the repository-pinned development Neon branch. Production and arbitrary remote databases are refused.",
    );
  }

  return match.label;
}

function assertExecuteGuards(targetLabel: string) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Reset execution is disabled when NODE_ENV=production.");
  }

  if (process.env.RESET_DEVELOPMENT_DATA_ENVIRONMENT !== "development") {
    throw new Error(
      "Set RESET_DEVELOPMENT_DATA_ENVIRONMENT=development to prove the intended environment.",
    );
  }

  if (process.env.RESET_DEVELOPMENT_DATA_TARGET !== targetLabel) {
    throw new Error(
      `Set RESET_DEVELOPMENT_DATA_TARGET exactly to ${targetLabel}.`,
    );
  }

  if (process.env.RESET_DEVELOPMENT_DATA_CONFIRM !== RESET_CONFIRMATION) {
    throw new Error(
      `Set RESET_DEVELOPMENT_DATA_CONFIRM=${RESET_CONFIRMATION} to authorize the reset.`,
    );
  }
}

function assertS3ExecuteGuard(targetLabel: string) {
  if (process.env.RESET_DEVELOPMENT_DATA_TARGET !== targetLabel) {
    throw new Error(`Set RESET_DEVELOPMENT_DATA_TARGET exactly to ${targetLabel}.`);
  }

  if (process.env.RESET_DEVELOPMENT_S3_CONFIRM !== S3_CONFIRMATION) {
    throw new Error(
      `Set RESET_DEVELOPMENT_S3_CONFIRM=${S3_CONFIRMATION} to authorize recorded-key deletion.`,
    );
  }
}

async function getDatabaseIdentity(client: SqlClient): Promise<DatabaseIdentity> {
  const rows = await client.$queryRawUnsafe<
    Array<{
      database: string;
      schema: string;
      user: string;
      neon_project_id: string | null;
      neon_branch_id: string | null;
      neon_endpoint_id: string | null;
    }>
  >(`
    SELECT
      current_database()::text AS database,
      current_schema()::text AS schema,
      current_user::text AS user,
      current_setting('neon.project_id', true) AS neon_project_id,
      current_setting('neon.branch_id', true) AS neon_branch_id,
      current_setting('neon.endpoint_id', true) AS neon_endpoint_id
  `);
  const row = rows[0];

  if (!row) {
    throw new Error("Could not read database identity.");
  }

  return {
    database: row.database,
    schema: row.schema,
    user: row.user,
    neonProjectId: row.neon_project_id || null,
    neonBranchId: row.neon_branch_id || null,
    neonEndpointId: row.neon_endpoint_id || null,
  };
}

async function getTableNames(client: SqlClient) {
  const rows = await client.$queryRawUnsafe<Array<{ table_name: string }>>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  return rows.map((row) => row.table_name);
}

async function getForeignKeys(client: SqlClient): Promise<ForeignKeyRecord[]> {
  const rows = await client.$queryRawUnsafe<
    Array<{
      constraint_name: string;
      child_table: string;
      parent_table: string;
      on_delete: ForeignKeyRecord["onDelete"];
    }>
  >(`
    SELECT
      constraint_record.conname::text AS constraint_name,
      child_table.relname::text AS child_table,
      parent_table.relname::text AS parent_table,
      CASE constraint_record.confdeltype
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
      END AS on_delete
    FROM pg_constraint constraint_record
    JOIN pg_class child_table ON child_table.oid = constraint_record.conrelid
    JOIN pg_class parent_table ON parent_table.oid = constraint_record.confrelid
    JOIN pg_namespace namespace_record ON namespace_record.oid = child_table.relnamespace
    WHERE constraint_record.contype = 'f'
      AND namespace_record.nspname = current_schema()
    ORDER BY child_table.relname, constraint_record.conname
  `);

  return rows.map((row) => ({
    constraintName: row.constraint_name,
    childTable: row.child_table,
    parentTable: row.parent_table,
    onDelete: row.on_delete,
  }));
}

function foreignKeySignature(foreignKey: ForeignKeyRecord) {
  return [
    foreignKey.childTable,
    foreignKey.constraintName,
    foreignKey.parentTable,
    foreignKey.onDelete,
  ].join("_");
}

export function validateDatabaseShape(
  tableNames: string[],
  foreignKeys: ForeignKeyRecord[],
) {
  const actualTables = [...tableNames].sort();
  const missingTables = EXPECTED_TABLES.filter(
    (table) => !actualTables.includes(table),
  );
  const unknownTables = actualTables.filter(
    (table) => !EXPECTED_TABLES.includes(table),
  );

  if (missingTables.length > 0 || unknownTables.length > 0) {
    throw new Error(
      [
        "Database table set does not match the audited 69-migration schema.",
        missingTables.length > 0 ? `Missing: ${missingTables.join(", ")}` : "",
        unknownTables.length > 0 ? `Unknown: ${unknownTables.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  const restrictiveSignatures = foreignKeys
    .filter(
      (foreignKey) =>
        foreignKey.onDelete === "RESTRICT" ||
        foreignKey.onDelete === "NO ACTION",
    )
    .map(foreignKeySignature)
    .sort();
  const unknownRestrictiveDependencies = restrictiveSignatures.filter(
    (signature) => !EXPECTED_RESTRICTIVE_FOREIGN_KEYS.includes(signature),
  );
  const missingRestrictiveDependencies = EXPECTED_RESTRICTIVE_FOREIGN_KEYS.filter(
    (signature) => !restrictiveSignatures.includes(signature),
  );

  if (
    unknownRestrictiveDependencies.length > 0 ||
    missingRestrictiveDependencies.length > 0
  ) {
    throw new Error(
      [
        "RESTRICT/NO ACTION dependency graph differs from the audited graph; reset aborted.",
        unknownRestrictiveDependencies.length > 0
          ? `Unknown: ${unknownRestrictiveDependencies.join(", ")}`
          : "",
        missingRestrictiveDependencies.length > 0
          ? `Missing: ${missingRestrictiveDependencies.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  const disposableSet = new Set(DISPOSABLE_TABLES);
  const unsafeInboundDependencies = foreignKeys.filter(
    (foreignKey) =>
      disposableSet.has(foreignKey.parentTable) &&
      !disposableSet.has(foreignKey.childTable),
  );

  if (unsafeInboundDependencies.length > 0) {
    throw new Error(
      `Preserved/unknown tables depend on disposable rows: ${unsafeInboundDependencies
        .map(foreignKeySignature)
        .join(", ")}`,
    );
  }
}

export function deriveDeletionOrder(
  tableNames: readonly string[],
  foreignKeys: ForeignKeyRecord[],
) {
  const tableSet = new Set(tableNames);
  const outgoing = new Map<string, Set<string>>(
    tableNames.map((table) => [table, new Set<string>()]),
  );
  const incomingCount = new Map<string, number>(
    tableNames.map((table) => [table, 0]),
  );

  for (const foreignKey of foreignKeys) {
    if (
      !tableSet.has(foreignKey.childTable) ||
      !tableSet.has(foreignKey.parentTable) ||
      foreignKey.childTable === foreignKey.parentTable ||
      foreignKey.onDelete === "SET NULL" ||
      foreignKey.onDelete === "SET DEFAULT"
    ) {
      continue;
    }

    const dependencies = outgoing.get(foreignKey.childTable);

    if (!dependencies || dependencies.has(foreignKey.parentTable)) {
      continue;
    }

    dependencies.add(foreignKey.parentTable);
    incomingCount.set(
      foreignKey.parentTable,
      (incomingCount.get(foreignKey.parentTable) ?? 0) + 1,
    );
  }

  const ready = tableNames
    .filter((table) => incomingCount.get(table) === 0)
    .sort();
  const deletionOrder: string[] = [];

  while (ready.length > 0) {
    const table = ready.shift();

    if (!table) {
      break;
    }

    deletionOrder.push(table);

    for (const parentTable of outgoing.get(table) ?? []) {
      const nextCount = (incomingCount.get(parentTable) ?? 0) - 1;
      incomingCount.set(parentTable, nextCount);

      if (nextCount === 0) {
        ready.push(parentTable);
        ready.sort();
      }
    }
  }

  if (deletionOrder.length !== tableNames.length) {
    const cycleTables = tableNames.filter(
      (table) => !deletionOrder.includes(table),
    );
    throw new Error(
      `Deletion graph contains an undeclared cycle: ${cycleTables.join(", ")}`,
    );
  }

  return deletionOrder;
}

async function verifyMigrationLedger(client: SqlClient) {
  const migrationsPath = path.join(PROJECT_ROOT, "prisma/migrations");
  const localMigrations = fs
    .readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const rows = await client.$queryRawUnsafe<
    Array<{
      migration_name: string;
      finished: boolean;
      rolled_back: boolean;
      applied_steps_count: number;
    }>
  >(`
    SELECT
      migration_name,
      (finished_at IS NOT NULL) AS finished,
      (rolled_back_at IS NOT NULL) AS rolled_back,
      applied_steps_count
    FROM "_prisma_migrations"
    ORDER BY migration_name
  `);
  const successfulMigrations = rows
    .filter((row) => row.finished && !row.rolled_back)
    .map((row) => row.migration_name)
    .sort();
  const unresolvedRows = rows.filter(
    (row) => !row.finished && !row.rolled_back,
  );

  if (
    localMigrations.length !== EXPECTED_MIGRATION_COUNT ||
    successfulMigrations.length !== EXPECTED_MIGRATION_COUNT ||
    new Set(successfulMigrations).size !== EXPECTED_MIGRATION_COUNT ||
    unresolvedRows.length > 0 ||
    JSON.stringify(localMigrations) !== JSON.stringify(successfulMigrations)
  ) {
    throw new Error(
      `Migration ledger is not the expected clean ${EXPECTED_MIGRATION_COUNT}-migration baseline. Local=${localMigrations.length} applied=${successfulMigrations.length} unresolved=${unresolvedRows.length}.`,
    );
  }

  return { local: localMigrations.length, applied: successfulMigrations.length };
}

async function getTableCounts(client: SqlClient, tables = EXPECTED_TABLES) {
  const sql = tables
    .map(
      (table) =>
        `SELECT '${table}'::text AS table_name, COUNT(*)::int AS row_count FROM ${quoteIdentifier(table)}`,
    )
    .join(" UNION ALL ");
  const rows = await client.$queryRawUnsafe<
    Array<{ table_name: string; row_count: number }>
  >(sql);

  return Object.fromEntries(
    rows.map((row) => [row.table_name, Number(row.row_count)]),
  ) as Record<string, number>;
}

async function getPreservedSnapshot(client: SqlClient): Promise<PreservedSnapshot> {
  const snapshot: PreservedSnapshot = {};

  for (const table of PRESERVED_TABLES) {
    const rows = await client.$queryRawUnsafe<
      Array<{ row_count: number; digest: string }>
    >(`
      SELECT
        COUNT(*)::int AS row_count,
        md5(COALESCE(string_agg(row_json, E'\\n' ORDER BY row_json), '')) AS digest
      FROM (
        SELECT to_jsonb(table_row)::text AS row_json
        FROM ${quoteIdentifier(table)} AS table_row
      ) AS preserved_rows
    `);
    const row = rows[0];

    if (!row) {
      throw new Error(`Could not fingerprint preserved table ${table}.`);
    }

    snapshot[table] = {
      count: Number(row.row_count),
      digest: row.digest,
    };
  }

  return snapshot;
}

function assertPreservedSnapshotUnchanged(
  before: PreservedSnapshot,
  after: PreservedSnapshot,
) {
  for (const table of PRESERVED_TABLES) {
    if (
      before[table]?.count !== after[table]?.count ||
      before[table]?.digest !== after[table]?.digest
    ) {
      throw new Error(`Preserved table changed during reset: ${table}`);
    }
  }
}

function assertAllowedObjectKeys(
  value: Record<string, unknown>,
  allowedKeys: string[],
  label: string,
) {
  const unknownKeys = Object.keys(value).filter(
    (key) => !allowedKeys.includes(key),
  );

  if (unknownKeys.length > 0) {
    throw new Error(`${label} contains unknown fields: ${unknownKeys.join(", ")}`);
  }
}

function validateAccountInput(value: unknown, label: string): SeedAccountInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  const account = value as Record<string, unknown>;
  assertAllowedObjectKeys(account, ["name", "email", "passwordEnv"], label);

  const name = typeof account.name === "string" ? account.name.trim() : "";
  const email =
    typeof account.email === "string"
      ? normalizeAuthEmail(account.email)
      : "";
  const passwordEnv =
    typeof account.passwordEnv === "string" ? account.passwordEnv.trim() : "";

  if (!name) {
    throw new Error(`${label}.name is required.`);
  }

  if (!email || !email.includes("@")) {
    throw new Error(`${label}.email must be a valid email address.`);
  }

  if (!/^[A-Z][A-Z0-9_]*$/.test(passwordEnv)) {
    throw new Error(`${label}.passwordEnv must be an uppercase environment variable name.`);
  }

  return { name, email, passwordEnv };
}

export function validateSeedManifestStructure(
  value: unknown,
  options: { forExecution: boolean },
): SeedManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Seed manifest must be a JSON object.");
  }

  const manifest = value as Record<string, unknown>;
  assertAllowedObjectKeys(
    manifest,
    [
      "version",
      "environment",
      "approvedForExecution",
      "superAdmin",
      "admins",
      "users",
    ],
    "Seed manifest",
  );

  if (manifest.version !== 1 || manifest.environment !== "development") {
    throw new Error("Seed manifest must use version 1 and environment=development.");
  }

  if (!Array.isArray(manifest.admins) || !Array.isArray(manifest.users)) {
    throw new Error("Seed manifest admins and users must be arrays.");
  }

  const parsed: SeedManifest = {
    version: 1,
    environment: "development",
    approvedForExecution: manifest.approvedForExecution === true,
    superAdmin: validateAccountInput(manifest.superAdmin, "superAdmin"),
    admins: manifest.admins.map((account, index) =>
      validateAccountInput(account, `admins[${index}]`),
    ),
    users: manifest.users.map((account, index) =>
      validateAccountInput(account, `users[${index}]`),
    ),
  };

  if (parsed.superAdmin.email !== CANONICAL_ROOT_EMAIL) {
    throw new Error(
      `The sole SUPER_ADMIN must be ${CANONICAL_ROOT_EMAIL}.`,
    );
  }

  const emails = [
    parsed.superAdmin.email,
    ...parsed.admins.map((account) => account.email),
    ...parsed.users.map((account) => account.email),
  ];
  const duplicateEmails = emails.filter(
    (email, index) => emails.indexOf(email) !== index,
  );

  if (duplicateEmails.length > 0) {
    throw new Error(
      `Seed manifest contains duplicate emails: ${[...new Set(duplicateEmails)].join(", ")}`,
    );
  }

  if (options.forExecution) {
    if (!parsed.approvedForExecution) {
      throw new Error("Seed manifest approvedForExecution must be true.");
    }

    if (parsed.admins.length === 0) {
      throw new Error(
        "At least one approved management ADMIN is required; do not invent the Admin list.",
      );
    }
  }

  return parsed;
}

function loadSeedManifest(
  manifestPath: string | undefined,
  options: { forExecution: boolean },
) {
  if (!manifestPath) {
    if (options.forExecution) {
      throw new Error("--manifest <path> is required for execution.");
    }

    return null;
  }

  const absolutePath = path.resolve(PROJECT_ROOT, manifestPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Seed manifest not found: ${absolutePath}`);
  }

  return validateSeedManifestStructure(readJsonFile(absolutePath), options);
}

function resolveSeedAccounts(manifest: SeedManifest): ResolvedSeedAccount[] {
  const withRoles = [
    { ...manifest.superAdmin, role: UserRole.SUPER_ADMIN },
    ...manifest.admins.map((account) => ({ ...account, role: UserRole.ADMIN })),
    ...manifest.users.map((account) => ({ ...account, role: UserRole.USER })),
  ];

  return withRoles.map((account) => {
    const password = process.env[account.passwordEnv];

    if (!password) {
      throw new Error(
        `Missing seed password environment variable: ${account.passwordEnv}`,
      );
    }

    const passwordErrors = getPasswordValidationErrors(password);

    if (passwordErrors.length > 0) {
      throw new Error(
        `Password in ${account.passwordEnv} is invalid: ${passwordErrors.join(" ")}`,
      );
    }

    return {
      ...account,
      password,
      passwordHash: hashAuthPassword(password),
    };
  });
}

async function collectStorageKeys(client: SqlClient): Promise<StorageKeyRecord[]> {
  const storageRows = await client.$queryRawUnsafe<
    Array<{
      source_table: string;
      source_id: string;
      bucket: string;
      storage_key: string;
    }>
  >(`
    SELECT 'ProjectAttachment'::text AS source_table, id AS source_id, bucket, "storageKey" AS storage_key FROM "ProjectAttachment"
    UNION ALL
    SELECT 'ArchivedProjectFile', id, bucket, "storageKey" FROM "ArchivedProjectFile"
    UNION ALL
    SELECT 'ProjectCompletionDocument', id, bucket, "storageKey" FROM "ProjectCompletionDocument"
    UNION ALL
    SELECT 'ManualArchiveFile', id, bucket, "storageKey" FROM "ManualArchiveFile"
    UNION ALL
    SELECT 'ManualLibraryAsset', id, bucket, "storageKey" FROM "ManualLibraryAsset"
  `);
  const avatarRows = await client.$queryRawUnsafe<
    Array<{ source_id: string; storage_key: string }>
  >(`
    SELECT id AS source_id, "avatarUrl" AS storage_key
    FROM "User"
    WHERE "avatarUrl" IS NOT NULL AND BTRIM("avatarUrl") <> ''
  `);
  const records = [
    ...storageRows.map((row) => ({
      table: row.source_table,
      id: row.source_id,
      bucket: row.bucket,
      key: row.storage_key,
    })),
    ...avatarRows.map((row) => ({
      table: "User",
      id: row.source_id,
      bucket: process.env.AWS_S3_BUCKET || null,
      key: row.storage_key,
    })),
  ];
  const deduplicated = new Map<string, StorageKeyRecord>();

  for (const record of records) {
    const key = record.key.trim();

    if (!key) {
      throw new Error(`Empty storage key on ${record.table}:${record.id}.`);
    }

    const dedupeKey = `${record.bucket ?? ""}\u0000${key}`;
    const existing = deduplicated.get(dedupeKey);

    if (existing) {
      existing.sources.push({ table: record.table, id: record.id });
      continue;
    }

    deduplicated.set(dedupeKey, {
      bucket: record.bucket,
      key,
      sources: [{ table: record.table, id: record.id }],
      deletionStatus: "pending",
    });
  }

  return [...deduplicated.values()].sort((left, right) =>
    `${left.bucket ?? ""}/${left.key}`.localeCompare(
      `${right.bucket ?? ""}/${right.key}`,
    ),
  );
}

function getDefaultS3ReportPath(targetLabel: string) {
  const safeTarget = targetLabel.replace(/[^A-Za-z0-9_.-]+/g, "-");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(
    PROJECT_ROOT,
    ".tmp",
    `reset-development-data-s3-${safeTarget}-${timestamp}.json`,
  );
}

function writeS3Report(filePath: string, report: S3KeyReport) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function deleteRecordedS3Keys(
  report: S3KeyReport,
  reportPath: string,
) {
  for (const record of report.keys) {
    try {
      await deleteObjectIfNeeded(record.key, record.bucket ?? undefined);
      record.deletionStatus = "deleted";
      delete record.deletionError;
    } catch (error) {
      record.deletionStatus = "failed";
      record.deletionError =
        error instanceof Error ? error.message : "Unknown S3 deletion failure";
    }
  }

  report.s3CleanupCompleted = report.keys.every(
    (record) => record.deletionStatus === "deleted",
  );
  writeS3Report(reportPath, report);

  const failures = report.keys.filter(
    (record) => record.deletionStatus === "failed",
  );

  if (failures.length > 0) {
    throw new Error(
      `${failures.length} recorded S3 object(s) could not be deleted. The report retains every key for an idempotent retry.`,
    );
  }
}

function printCategoryTableList(
  heading: string,
  categories: Record<string, readonly string[]>,
) {
  console.log(`\n${heading}`);

  for (const [category, tables] of Object.entries(categories)) {
    console.log(`- ${category}: ${tables.join(", ")}`);
  }
}

function printCounts(
  heading: string,
  counts: Record<string, number>,
  tables: readonly string[],
) {
  console.log(`\n${heading}`);

  for (const table of tables) {
    console.log(`- ${table}: ${counts[table] ?? 0}`);
  }
}

function printSeedProjection(manifest: SeedManifest | null) {
  console.log("\nProjected users after reset/seed");

  if (!manifest) {
    console.log("- BLOCKED: no seed manifest supplied");
    console.log("- SUPER_ADMIN: 1 required");
    console.log("- ADMIN: unknown; approved real list required");
    console.log("- USER: unknown; approved real list required");
    return;
  }

  console.log(`- SUPER_ADMIN: 1 (${manifest.superAdmin.email})`);
  console.log(
    `- ADMIN: ${manifest.admins.length}${
      manifest.admins.length > 0
        ? ` (${manifest.admins.map((account) => account.email).join(", ")})`
        : ""
    }`,
  );
  console.log(
    `- USER: ${manifest.users.length}${
      manifest.users.length > 0
        ? ` (${manifest.users.map((account) => account.email).join(", ")})`
        : ""
    }`,
  );
  console.log(
    `- Manifest execution approval: ${manifest.approvedForExecution ? "yes" : "no"}`,
  );
}

async function lockResetTables(client: Prisma.TransactionClient) {
  await client.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(hashtext('${RESET_ADVISORY_LOCK}'))`,
  );
  await client.$executeRawUnsafe(
    `LOCK TABLE ${DISPOSABLE_TABLES.map(quoteIdentifier).join(", ")} IN ACCESS EXCLUSIVE MODE`,
  );
  await client.$executeRawUnsafe(
    `LOCK TABLE ${PRESERVED_TABLES.map(quoteIdentifier).join(", ")} IN SHARE MODE`,
  );
}

async function deleteDisposableRows(
  client: Prisma.TransactionClient,
  deletionOrder: string[],
) {
  const deletedCounts: Record<string, number> = {};

  for (const table of deletionOrder) {
    if (table === "ProjectConceptFolder") {
      const promotedCount = await client.$executeRawUnsafe(
        `DELETE FROM "ProjectConceptFolder" WHERE "sourceStage3ConceptId" IS NOT NULL`,
      );
      const remainingCount = await client.$executeRawUnsafe(
        `DELETE FROM "ProjectConceptFolder"`,
      );
      deletedCounts[table] = promotedCount + remainingCount;
      continue;
    }

    deletedCounts[table] = await client.$executeRawUnsafe(
      `DELETE FROM ${quoteIdentifier(table)}`,
    );
  }

  return deletedCounts;
}

async function assertAllDisposableRowsCleared(client: SqlClient) {
  const counts = await getTableCounts(client, DISPOSABLE_TABLES);
  const nonZeroTables = DISPOSABLE_TABLES.filter(
    (table) => (counts[table] ?? 0) !== 0,
  );

  if (nonZeroTables.length > 0) {
    throw new Error(
      `Disposable rows remain after deletion: ${nonZeroTables
        .map((table) => `${table}=${counts[table]}`)
        .join(", ")}`,
    );
  }
}

async function seedUsers(
  client: Prisma.TransactionClient,
  accounts: ResolvedSeedAccount[],
) {
  for (const account of accounts) {
    await client.user.create({
      data: {
        name: account.name,
        email: account.email,
        passwordHash: account.passwordHash,
        role: account.role,
      },
    });
  }
}

async function verifySeededUsers(
  client: SqlClient,
  accounts: ResolvedSeedAccount[],
) {
  const users = await client.user.findMany({
    select: {
      email: true,
      name: true,
      role: true,
      passwordHash: true,
    },
    orderBy: { email: "asc" },
  });
  const expectedByEmail = new Map(
    accounts.map((account) => [account.email, account]),
  );

  if (users.length !== accounts.length) {
    throw new Error(
      `Seeded user count mismatch. Expected=${accounts.length} actual=${users.length}.`,
    );
  }

  for (const user of users) {
    const expected = expectedByEmail.get(user.email);

    if (
      !expected ||
      user.name !== expected.name ||
      user.role !== expected.role ||
      !verifyAuthPassword(expected.password, user.passwordHash)
    ) {
      throw new Error(`Seeded account verification failed: ${user.email}`);
    }
  }

  const roleCounts = Object.fromEntries(
    Object.values(UserRole).map((role) => [
      role,
      users.filter((user) => user.role === role).length,
    ]),
  ) as Record<UserRole, number>;
  const expectedRoleCounts: Record<UserRole, number> = {
    SUPER_ADMIN: 1,
    ADMIN: accounts.filter((account) => account.role === UserRole.ADMIN).length,
    USER: accounts.filter((account) => account.role === UserRole.USER).length,
  };

  for (const role of Object.values(UserRole)) {
    if (roleCounts[role] !== expectedRoleCounts[role]) {
      throw new Error(
        `Role count mismatch for ${role}. Expected=${expectedRoleCounts[role]} actual=${roleCounts[role]}.`,
      );
    }
  }

  const rootUsers = users.filter((user) => user.role === UserRole.SUPER_ADMIN);

  if (
    rootUsers.length !== 1 ||
    rootUsers[0]?.email !== CANONICAL_ROOT_EMAIL
  ) {
    throw new Error("Exactly one canonical protected SUPER_ADMIN was not seeded.");
  }

  return roleCounts;
}

async function verifyPostResetBusinessState(client: SqlClient) {
  const tablesExpectedEmpty = DISPOSABLE_TABLES.filter(
    (table) => table !== "User",
  );
  const counts = await getTableCounts(client, tablesExpectedEmpty);
  const nonZeroTables = tablesExpectedEmpty.filter(
    (table) => (counts[table] ?? 0) !== 0,
  );

  if (nonZeroTables.length > 0) {
    throw new Error(
      `Post-reset business data is not empty: ${nonZeroTables
        .map((table) => `${table}=${counts[table]}`)
        .join(", ")}`,
    );
  }

  return counts;
}

function buildS3Report(
  mode: S3KeyReport["mode"],
  databaseUrl: ReturnType<typeof getDatabaseUrl>,
  identity: DatabaseIdentity,
  keys: StorageKeyRecord[],
  deleteS3: boolean,
): S3KeyReport {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    mode,
    target: {
      host: databaseUrl.host,
      port: databaseUrl.port,
      database: identity.database,
      schema: identity.schema,
      neonProjectId: identity.neonProjectId,
      neonBranchId: identity.neonBranchId,
      neonEndpointId: identity.neonEndpointId,
    },
    databaseResetCommitted: false,
    s3CleanupRequested: deleteS3,
    s3CleanupCompleted: false,
    keys,
  };
}

async function runS3Only(options: CliOptions) {
  const reportPath = path.resolve(PROJECT_ROOT, options.s3ReportPath!);
  const report = readJsonFile(reportPath) as S3KeyReport;

  if (
    report.version !== 1 ||
    !Array.isArray(report.keys) ||
    !report.target?.host ||
    !report.target.database
  ) {
    throw new Error("Invalid S3 reset report.");
  }

  const targetLabel = `${report.target.host}:${report.target.port || "5432"}/${report.target.database}`;
  console.log(`Recorded S3 keys: ${report.keys.length}`);
  console.log(`Source reset committed: ${report.databaseResetCommitted ? "yes" : "no"}`);
  console.log(`Report: ${reportPath}`);

  if (!options.execute) {
    console.log("DRY RUN: no S3 objects deleted.");
    return;
  }

  if (!report.databaseResetCommitted) {
    throw new Error("S3-only execution requires a report from a committed DB reset.");
  }

  assertS3ExecuteGuard(targetLabel);
  report.s3CleanupRequested = true;
  await deleteRecordedS3Keys(report, reportPath);
  console.log(`Deleted ${report.keys.length} explicitly recorded S3 object(s).`);
}

async function runReset(options: CliOptions) {
  const targetConfig = getTargetConfig();
  const databaseUrl = getDatabaseUrl();
  const prisma = new PrismaClient();

  try {
    const identity = await getDatabaseIdentity(prisma);
    const knownTargetLabel = assertKnownDevelopmentTarget(
      targetConfig,
      databaseUrl,
      identity,
    );
    const migrationStatus = await verifyMigrationLedger(prisma);
    const tableNames = await getTableNames(prisma);
    const foreignKeys = await getForeignKeys(prisma);
    validateDatabaseShape(tableNames, foreignKeys);
    const deletionOrder = deriveDeletionOrder(DISPOSABLE_TABLES, foreignKeys);
    const counts = await getTableCounts(prisma);
    const preservedSnapshot = await getPreservedSnapshot(prisma);
    const storageKeys = await collectStorageKeys(prisma);
    const manifest = loadSeedManifest(options.manifestPath, {
      forExecution: options.execute,
    });
    const reportPath = path.resolve(
      PROJECT_ROOT,
      options.s3ReportPath ?? getDefaultS3ReportPath(databaseUrl.targetLabel),
    );
    const dryRunReport = buildS3Report(
      options.execute ? "execute" : "dry-run",
      databaseUrl,
      identity,
      storageKeys,
      options.deleteS3,
    );

    console.log(`Mode: ${options.execute ? "EXECUTE" : "DRY RUN"}`);
    console.log(`Target URL identity: ${databaseUrl.targetLabel}`);
    console.log(`Database identity: ${identity.database}/${identity.schema}`);
    console.log(`Target classification: ${knownTargetLabel}`);
    console.log(
      `Migrations: ${migrationStatus.applied}/${migrationStatus.local} applied and clean`,
    );
    console.log(`Audited tables: ${tableNames.length}`);
    console.log(`Audited foreign keys: ${foreignKeys.length}`);
    printCategoryTableList("Tables/data to delete", DISPOSABLE_TABLE_CATEGORIES);
    printCategoryTableList("Tables/data to preserve", PRESERVED_TABLE_CATEGORIES);
    printCounts("Existing disposable row counts", counts, DISPOSABLE_TABLES);
    printCounts("Preserved row counts", counts, PRESERVED_TABLES);
    console.log(`\nEnumerated S3 keys: ${storageKeys.length}`);
    console.log(`S3 key report: ${reportPath}`);
    console.log("\nDerived FK-safe deletion order");
    deletionOrder.forEach((table, index) =>
      console.log(`${index + 1}. ${table}`),
    );
    console.log(
      "Special case: promoted ProjectConceptFolder rows are deleted before their Stage 3 source rows.",
    );
    printSeedProjection(manifest);
    console.log("\nProjected business state");
    console.log("- Project: 0");
    console.log("- All project/Stage 1-7 tables: 0");
    console.log("- Notification: 0");
    console.log("- Session: 0");
    console.log("- Archive/library business tables: 0");
    console.log(
      `- Preserved system fingerprint tables: ${Object.keys(preservedSnapshot).length}`,
    );

    if (!options.execute) {
      writeS3Report(reportPath, dryRunReport);
      console.log("\nDRY RUN COMPLETE: no database or S3 rows were mutated.");
      return;
    }

    if (!manifest) {
      throw new Error("Execution requires a seed manifest.");
    }

    assertExecuteGuards(databaseUrl.targetLabel);

    if (options.deleteS3) {
      assertS3ExecuteGuard(databaseUrl.targetLabel);
    }

    const accounts = resolveSeedAccounts(manifest);
    const transactionResult = await prisma.$transaction(
      async (tx) => {
        await lockResetTables(tx);

        const lockedIdentity = await getDatabaseIdentity(tx);
        assertKnownDevelopmentTarget(
          targetConfig,
          databaseUrl,
          lockedIdentity,
        );
        await verifyMigrationLedger(tx);
        const lockedTableNames = await getTableNames(tx);
        const lockedForeignKeys = await getForeignKeys(tx);
        validateDatabaseShape(lockedTableNames, lockedForeignKeys);
        const lockedDeletionOrder = deriveDeletionOrder(
          DISPOSABLE_TABLES,
          lockedForeignKeys,
        );
        const systemBefore = await getPreservedSnapshot(tx);
        const lockedStorageKeys = await collectStorageKeys(tx);
        const preDeleteReport = buildS3Report(
          "execute",
          databaseUrl,
          lockedIdentity,
          lockedStorageKeys,
          options.deleteS3,
        );

        writeS3Report(reportPath, preDeleteReport);
        const deletedCounts = await deleteDisposableRows(tx, lockedDeletionOrder);
        await assertAllDisposableRowsCleared(tx);
        await seedUsers(tx, accounts);
        const roleCounts = await verifySeededUsers(tx, accounts);
        await verifyPostResetBusinessState(tx);

        const systemAfter = await getPreservedSnapshot(tx);
        assertPreservedSnapshotUnchanged(systemBefore, systemAfter);
        await verifyMigrationLedger(tx);

        return {
          committedReport: preDeleteReport,
          deletedCounts,
          roleCounts,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 30_000,
        timeout: 120_000,
      },
    );

    const { committedReport, deletedCounts } = transactionResult;
    committedReport.databaseResetCommitted = true;
    writeS3Report(reportPath, committedReport);

    const postCounts = await verifyPostResetBusinessState(prisma);
    const finalRoleCounts = await verifySeededUsers(prisma, accounts);
    await verifyMigrationLedger(prisma);
    const systemAfterCommit = await getPreservedSnapshot(prisma);
    assertPreservedSnapshotUnchanged(preservedSnapshot, systemAfterCommit);

    console.log("\nDATABASE RESET AND USER SEED COMMITTED");
    console.log(
      `Deleted rows reported by ordered statements: ${Object.values(deletedCounts).reduce((sum, count) => sum + count, 0)}`,
    );
    console.log(
      `Seeded roles: SUPER_ADMIN=${finalRoleCounts.SUPER_ADMIN} ADMIN=${finalRoleCounts.ADMIN} USER=${finalRoleCounts.USER}`,
    );
    console.log(`Project=${postCounts.Project ?? 0}`);
    console.log(`Session=${postCounts.Session ?? 0}`);
    console.log(`Notification=${postCounts.Notification ?? 0}`);
    console.log(`PermissionDefinition=${systemAfterCommit.PermissionDefinition.count}`);
    console.log(`_prisma_migrations=${systemAfterCommit._prisma_migrations.count}`);
    console.log(`S3 report: ${reportPath}`);

    if (options.deleteS3) {
      await deleteRecordedS3Keys(committedReport, reportPath);
      console.log(
        `Deleted ${committedReport.keys.length} explicitly enumerated S3 object(s).`,
      );
    } else {
      console.log(
        `S3 cleanup deferred; ${committedReport.keys.length} enumerated key(s) remain in the report.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  loadEnvFile(path.join(PROJECT_ROOT, ".env"));
  loadEnvFile(path.join(PROJECT_ROOT, ".env.local"));

  const options = parseCliOptions(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  if (options.s3Only) {
    await runS3Only(options);
    return;
  }

  await runReset(options);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
