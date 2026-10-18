-- Additive, offline-authored candidate. DO NOT APPLY before deployed migration
-- history (including the seven absent Tasker migrations) has been reconciled.
-- No existing table or record is altered; no accounts are mapped or activated.
BEGIN;

CREATE TYPE "BusinessRole" AS ENUM (
  'DIRECTOR', 'SENIOR_PROJECT_MANAGER', 'JUNIOR_PROJECT_MANAGER', 'DESIGNER', 'DIGITAL_LEAD'
);
CREATE TYPE "TechnicalPrivilege" AS ENUM ('TECHNICAL_ADMIN');
CREATE TYPE "AuthorizationAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

CREATE TABLE "UserAuthorization" (
  "userId" TEXT NOT NULL,
  "businessRole" "BusinessRole",
  "technicalPrivileges" "TechnicalPrivilege"[] NOT NULL DEFAULT ARRAY[]::"TechnicalPrivilege"[],
  "accountStatus" "AuthorizationAccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "authorizationVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserAuthorization_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "UserAuthorization_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "UserAuthorization_version_positive" CHECK ("authorizationVersion" > 0),
  CONSTRAINT "UserAuthorization_director_active" CHECK (
    "businessRole" IS DISTINCT FROM 'DIRECTOR' OR "accountStatus" = 'ACTIVE'
  ),
  -- Set semantics for the single currently supported technical privilege.
  CONSTRAINT "UserAuthorization_technical_privileges_set" CHECK (
    "technicalPrivileges" = ARRAY[]::"TechnicalPrivilege"[] OR
    "technicalPrivileges" = ARRAY['TECHNICAL_ADMIN']::"TechnicalPrivilege"[]
  )
);

-- Allows zero Directors during bootstrap; concurrent attempts cannot create two.
CREATE UNIQUE INDEX "UserAuthorization_one_active_director"
  ON "UserAuthorization" ("businessRole")
  WHERE "businessRole" = 'DIRECTOR' AND "accountStatus" = 'ACTIVE';

CREATE TABLE "UserAuthorizationChange" (
  "userId" TEXT NOT NULL,
  "authorizationVersion" INTEGER NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "changeId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserAuthorizationChange_pkey" PRIMARY KEY ("userId", "authorizationVersion"),
  CONSTRAINT "UserAuthorizationChange_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "UserAuthorizationChange_actorUserId_fkey" FOREIGN KEY ("actorUserId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "UserAuthorizationChange_version_positive" CHECK ("authorizationVersion" > 0),
  CONSTRAINT "UserAuthorizationChange_reason_required" CHECK ("reason" ~ '[^[:space:]]'),
  CONSTRAINT "UserAuthorizationChange_id_required" CHECK ("changeId" ~ '[^[:space:]]')
);
CREATE INDEX "UserAuthorizationChange_actorUserId_createdAt_idx"
  ON "UserAuthorizationChange"("actorUserId", "createdAt");
CREATE INDEX "UserAuthorizationChange_changeId_idx" ON "UserAuthorizationChange"("changeId");

-- Future authorized writer must set transaction-local flux.authorization_actor_id,
-- flux.authorization_reason and flux.authorization_change_id. These values record
-- attribution; they do NOT authorize the actor. No writer is activated in Phase 1.2.
CREATE FUNCTION flux_v2_authorization_before_write() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."userId" IS DISTINCT FROM OLD."userId" THEN
      RAISE EXCEPTION 'Authorization identity cannot be changed';
    END IF;
    IF ROW(NEW."businessRole", NEW."technicalPrivileges", NEW."accountStatus")
       IS NOT DISTINCT FROM ROW(OLD."businessRole", OLD."technicalPrivileges", OLD."accountStatus") THEN
      IF NEW."authorizationVersion" <> OLD."authorizationVersion" THEN
        RAISE EXCEPTION 'Authorization version changes require an assignment or status change';
      END IF;
      RETURN NEW;
    END IF;
    NEW."authorizationVersion" := OLD."authorizationVersion" + 1;
  ELSE
    NEW."authorizationVersion" := 1;
  END IF;

  IF coalesce(current_setting('flux.authorization_actor_id', true), '') !~ '[^[:space:]]'
     OR coalesce(current_setting('flux.authorization_reason', true), '') !~ '[^[:space:]]'
     OR coalesce(current_setting('flux.authorization_change_id', true), '') !~ '[^[:space:]]' THEN
    RAISE EXCEPTION 'Authorization changes require an actor, reason and change ID';
  END IF;
  NEW."updatedAt" := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UserAuthorization_before_write"
  BEFORE INSERT OR UPDATE ON "UserAuthorization"
  FOR EACH ROW EXECUTE FUNCTION flux_v2_authorization_before_write();

CREATE FUNCTION flux_v2_authorization_audit() RETURNS TRIGGER AS $$
DECLARE
  previous_snapshot JSONB;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."authorizationVersion" = OLD."authorizationVersion" THEN RETURN NULL; END IF;
    previous_snapshot := to_jsonb(OLD) - 'createdAt' - 'updatedAt';
  END IF;
  INSERT INTO "UserAuthorizationChange" (
    "userId", "authorizationVersion", "actorUserId", "changeId", "reason", "before", "after"
  ) VALUES (
    NEW."userId", NEW."authorizationVersion",
    btrim(current_setting('flux.authorization_actor_id')),
    btrim(current_setting('flux.authorization_change_id')),
    btrim(current_setting('flux.authorization_reason')),
    previous_snapshot, to_jsonb(NEW) - 'createdAt' - 'updatedAt'
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UserAuthorization_audit"
  AFTER INSERT OR UPDATE ON "UserAuthorization"
  FOR EACH ROW EXECUTE FUNCTION flux_v2_authorization_audit();

-- Demote the outgoing Director, then promote the replacement in ONE transaction.
-- Immediate uniqueness prevents two Directors; this deferred check prevents zero
-- at commit after a Director has existed, while permitting initial empty setup.
CREATE FUNCTION flux_v2_authorization_preserve_director() RETURNS TRIGGER AS $$
BEGIN
  IF OLD."businessRole" = 'DIRECTOR' AND NEW."businessRole" IS DISTINCT FROM 'DIRECTOR'
     AND NOT EXISTS (
       SELECT 1 FROM "UserAuthorization"
       WHERE "businessRole" = 'DIRECTOR' AND "accountStatus" = 'ACTIVE'
     ) THEN
    RAISE EXCEPTION 'The Director must be replaced atomically, never removed alone';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "UserAuthorization_preserve_director"
  AFTER UPDATE ON "UserAuthorization"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION flux_v2_authorization_preserve_director();

CREATE FUNCTION flux_v2_authorization_retain_history() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'V2 authorization records and history must be retained; suspend access instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "UserAuthorization_no_delete"
  BEFORE DELETE ON "UserAuthorization"
  FOR EACH ROW EXECUTE FUNCTION flux_v2_authorization_retain_history();
CREATE TRIGGER "UserAuthorization_no_truncate"
  BEFORE TRUNCATE ON "UserAuthorization"
  FOR EACH STATEMENT EXECUTE FUNCTION flux_v2_authorization_retain_history();
CREATE TRIGGER "UserAuthorizationChange_append_only"
  BEFORE UPDATE OR DELETE ON "UserAuthorizationChange"
  FOR EACH ROW EXECUTE FUNCTION flux_v2_authorization_retain_history();
CREATE TRIGGER "UserAuthorizationChange_no_truncate"
  BEFORE TRUNCATE ON "UserAuthorizationChange"
  FOR EACH STATEMENT EXECUTE FUNCTION flux_v2_authorization_retain_history();

COMMIT;
