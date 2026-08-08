#!/bin/zsh
set -euo pipefail

while IFS='=' read -r key value; do
  [[ "$key" =~ '^[A-Za-z_][A-Za-z0-9_]*$' ]] || continue
  value="${value%$'\r'}"
  if [[ ("${value:0:1}" == '"' && "${value: -1}" == '"') ||
        ("${value:0:1}" == "'" && "${value: -1}" == "'") ]]; then
    value="${value:1:-1}"
  fi
  export "$key=$value"
done < .env

chain_schema="codex_stage2_chain_20260807"
backfill_schema="codex_stage2_backfill_20260807"
temporary_root="$(mktemp -d)"
postgres_data="$temporary_root/postgres-data"
postgres_socket="$temporary_root/postgres-socket"
postgres_port="55439"

if [[ ! "$chain_schema" =~ '^codex_stage2_[a-z0-9_]+$' ]] ||
   [[ ! "$backfill_schema" =~ '^codex_stage2_[a-z0-9_]+$' ]]; then
  echo "Unsafe disposable schema name."
  exit 1
fi

schema_url() {
  node -e 'const url = new URL(process.argv[1]); url.searchParams.set("schema", process.argv[2]); process.stdout.write(url.toString())' "$DATABASE_URL" "$1"
}

cleanup() {
  if [[ -d "$postgres_data" ]]; then
    pg_ctl -D "$postgres_data" -m fast -w stop >/dev/null 2>&1 || true
  fi
  rm -rf "$temporary_root"
}
trap cleanup EXIT

mkdir -p "$postgres_socket"
initdb -D "$postgres_data" -A trust --no-locale >/dev/null
pg_ctl -D "$postgres_data" -o "-F -p $postgres_port -k $postgres_socket" -w start >/dev/null
postgres_user="$(id -un)"
DATABASE_URL="postgresql://$postgres_user@127.0.0.1:$postgres_port/postgres"
export DATABASE_URL
export AWS_S3_BUCKET="stage-two-integration.invalid"
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="stage-two-integration"
export AWS_SECRET_ACCESS_KEY="stage-two-integration"
export S3_USE_ACCELERATE_ENDPOINT="false"

chain_url="$(schema_url "$chain_schema")"
backfill_url="$(schema_url "$backfill_schema")"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE SCHEMA \"$chain_schema\"; CREATE SCHEMA \"$backfill_schema\";" >/dev/null
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "SELECT 1" >/dev/null

DATABASE_URL="$chain_url" pnpm prisma migrate deploy
DATABASE_URL="$chain_url" pnpm project-create:v2-integration-check
DATABASE_URL="$chain_url" pnpm stage-two:integration-check

mkdir -p "$temporary_root/prisma/migrations"
cp prisma/schema.prisma "$temporary_root/prisma/schema.prisma"
cp prisma/migrations/migration_lock.toml "$temporary_root/prisma/migrations/migration_lock.toml"
for migration in prisma/migrations/*; do
  if [[ -d "$migration" && "${migration:t}" != "20260807210000_project_research_workspaces" ]]; then
    cp -R "$migration" "$temporary_root/prisma/migrations/"
  fi
done

DATABASE_URL="$backfill_url" pnpm prisma migrate deploy --schema "$temporary_root/prisma/schema.prisma"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL >/dev/null
SET search_path TO "$backfill_schema";
INSERT INTO "User" ("id", "email", "passwordHash", "role", "collaboratorType", "createdAt", "updatedAt") VALUES
  ('backfill-owner', 'backfill-owner@example.test', 'x', 'ADMIN', 'GTI_INTERNAL_CLIENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('backfill-co-owner', 'backfill-co@example.test', 'x', 'COLLABORATOR', 'GTI_INTERNAL_CLIENT', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('backfill-executor', 'backfill-executor@example.test', 'x', 'COLLABORATOR', 'EXTERNAL_AGENCY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('backfill-collaborator', 'backfill-collaborator@example.test', 'x', 'COLLABORATOR', 'EXTERNAL_VENDOR', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "Project" ("id", "name", "ownerId", "createdById", "createdAt", "updatedAt")
VALUES ('backfill-project', 'Backfill Project', 'backfill-owner', 'backfill-owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "ProjectCoOwner" ("projectId", "userId", "createdAt") VALUES ('backfill-project', 'backfill-co-owner', CURRENT_TIMESTAMP);
INSERT INTO "ProjectExecutor" ("projectId", "userId", "createdAt", "updatedAt") VALUES ('backfill-project', 'backfill-executor', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "ProjectCollaborator" ("projectId", "userId", "participantType", "createdAt") VALUES
  ('backfill-project', 'backfill-executor', 'EXTERNAL_AGENCY', CURRENT_TIMESTAMP),
  ('backfill-project', 'backfill-collaborator', 'EXTERNAL_VENDOR', CURRENT_TIMESTAMP);
INSERT INTO "ContactDirectoryEntry" ("id", "name", "createdById", "createdAt", "updatedAt")
VALUES ('manual-contact-without-user', 'Manual Contact', 'backfill-owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
SQL

DATABASE_URL="$backfill_url" pnpm prisma migrate deploy

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<SQL
SET search_path TO "$backfill_schema";
DO \$\$
BEGIN
  IF (SELECT COUNT(*) FROM "ProjectResearchWorkspace" WHERE "projectId" = 'backfill-project') <> 4 THEN
    RAISE EXCEPTION 'Backfill did not create exactly four deduplicated participant workspaces';
  END IF;
  IF (SELECT COUNT(*) FROM "ProjectWorkflowStage" WHERE "projectId" = 'backfill-project') <> 7 THEN
    RAISE EXCEPTION 'Reconciliation did not create exactly seven workflow rows';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "ProjectResearchWorkspace" workspace
    LEFT JOIN "ProjectResearchFolder" folder ON folder."workspaceId" = workspace."id"
    WHERE workspace."projectId" = 'backfill-project'
    GROUP BY workspace."id"
    HAVING COUNT(folder."id") <> 7
  ) THEN
    RAISE EXCEPTION 'Backfill did not create exactly seven folders per workspace';
  END IF;
  IF EXISTS (SELECT 1 FROM "ProjectResearchWorkspace" WHERE "ownerUserId" = 'manual-contact-without-user') THEN
    RAISE EXCEPTION 'Manual contact incorrectly received a workspace';
  END IF;
END \$\$;
SQL

echo "Disposable full-chain, Stage 2 integration, and existing-project backfill checks passed."
