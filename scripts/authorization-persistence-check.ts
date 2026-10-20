import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  authorizationAccountStatusValues,
  isAuthorizationAssignment,
  planAuthorizationAssignmentChange as plan,
  type AuthorizationAssignment,
  type AuthorizationAssignmentPlan,
  type AuthorizationChangeCommand,
  type AuthorizationSnapshot,
} from "../src/lib/authorization/assignment-plans";
import { businessRoleValues, technicalPrivilegeValues } from "../src/lib/authorization/definitions";
import { getBusinessRoleEligibility, getTechnicalPrivilegeEligibility } from "../src/lib/authorization/eligibility";

const attribution = { actorUserId: "operator", reason: "Approved assignment", changeId: "change-1" };
const unassigned: AuthorizationAssignment = { businessRole: null, technicalPrivileges: [], accountStatus: "ACTIVE" };
const account = (userId: string, assignment: Partial<AuthorizationAssignment> = {}): AuthorizationSnapshot => ({
  userId, ...unassigned, ...assignment, authorizationVersion: 1,
});
const director = account("director", { businessRole: "DIRECTOR" });
const designer = account("designer", { businessRole: "DESIGNER" });
const maintainer = account("maintainer", { technicalPrivileges: ["TECHNICAL_ADMIN"] });

function prepared(result: AuthorizationAssignmentPlan) {
  assert.ok(result.decision === "REQUIRES_AUTHORIZED_TRANSACTION");
  return result;
}
function rejected(result: AuthorizationAssignmentPlan, reason: string) {
  assert.deepEqual(result, { decision: "REJECTED", reason });
}
function setCommand(row: AuthorizationSnapshot, assignment: unknown): AuthorizationChangeCommand {
  return { kind: "SET_ASSIGNMENT", userId: row.userId, expectedVersion: row.authorizationVersion, assignment };
}
function applyToFixture(state: readonly AuthorizationSnapshot[], result: AuthorizationAssignmentPlan) {
  const changes = prepared(result).changes;
  return [...state.filter((row) => !changes.some((change) => change.userId === row.userId)), ...changes.map((change) => change.after)];
}

// No mappings or Director is a valid initial state. Initialization never derives legacy roles.
const initial = prepared(plan([], { kind: "SET_ASSIGNMENT", userId: "unmapped", expectedVersion: null, assignment: unassigned }, attribution));
assert.equal(initial.changes[0].before, null);
assert.deepEqual(initial.changes[0].after, account("unmapped"));
for (const businessRole of businessRoleValues) {
  assert.ok(isAuthorizationAssignment({ ...unassigned, businessRole }));
  if (businessRole !== "DIRECTOR") {
    const result = prepared(plan([], { kind: "SET_ASSIGNMENT", userId: "target", expectedVersion: null, assignment: { ...unassigned, businessRole } }, attribution));
    assert.equal(result.changes[0].after.businessRole, businessRole);
    assert.deepEqual(result.changes[0].after.technicalPrivileges, []);
  }
}
for (const businessRole of ["SUPER_ADMIN", "ADMIN", "USER", "TECHNICAL_ADMIN", "director", "UNKNOWN", undefined]) {
  rejected(plan([designer], setCommand(designer, { ...unassigned, businessRole }), attribution), "INVALID_ASSIGNMENT");
}
for (const technicalPrivileges of [["DIRECTOR"], ["SUPER_ADMIN"], ["DEPLOY_ADMIN"], ["TECHNICAL_ADMIN", "TECHNICAL_ADMIN"], [null], Array(1), null]) {
  rejected(plan([designer], setCommand(designer, { ...unassigned, technicalPrivileges }), attribution), "INVALID_ASSIGNMENT");
}
for (const assignment of [null, {}, { ...unassigned, accountStatus: "DISABLED" }]) {
  rejected(plan([designer], setCommand(designer, assignment), attribution), "INVALID_ASSIGNMENT");
}
rejected(plan([], { kind: "UNKNOWN" } as unknown as AuthorizationChangeCommand, attribution), "UNSUPPORTED_COMMAND");

// Bootstrap is explicit and does not grant technical privileges.
const bootstrapCommand: AuthorizationChangeCommand = { kind: "BOOTSTRAP_DIRECTOR", userId: "director", expectedVersion: null };
const bootstrap = prepared(plan([], bootstrapCommand, attribution));
assert.deepEqual(bootstrap.changes[0].after, director);
rejected(plan([director], bootstrapCommand, attribution), "DIRECTOR_ALREADY_EXISTS");
rejected(plan([], { kind: "SET_ASSIGNMENT", userId: "director", expectedVersion: null, assignment: director }, attribution), "USE_DIRECTOR_OPERATION");
rejected(plan([director, { ...director, userId: "second" }], setCommand(director, director), attribution), "INVALID_STATE");
rejected(plan([{ ...director, accountStatus: "SUSPENDED" }], bootstrapCommand, attribution), "INVALID_STATE");
rejected(plan([designer, designer], setCommand(designer, designer), attribution), "INVALID_STATE");

// Technical privileges can be granted/revoked independently; neither domain implies the other.
const grant = prepared(plan([designer], setCommand(designer, { ...designer, technicalPrivileges: ["TECHNICAL_ADMIN"] }), attribution));
assert.equal(grant.changes[0].after.businessRole, "DESIGNER");
assert.equal(grant.changes[0].after.authorizationVersion, 2);
const revoke = prepared(plan([grant.changes[0].after], setCommand(grant.changes[0].after, designer), attribution));
assert.equal(revoke.changes[0].after.authorizationVersion, 3);
assert.deepEqual(revoke.changes[0].after.technicalPrivileges, []);
assert.equal(getBusinessRoleEligibility(maintainer.businessRole, "project.approveCompletion").decision, "DENY");
assert.equal(getTechnicalPrivilegeEligibility(director.technicalPrivileges, "technical.maintenance").decision, "DENY");

// Changes, suspension and reactivation advance versions; no-op and stale writes cannot.
const changedRole = prepared(plan([designer], setCommand(designer, { ...designer, businessRole: "DIGITAL_LEAD" }), attribution));
assert.equal(changedRole.changes[0].after.authorizationVersion, 2);
const suspension = prepared(plan([designer], setCommand(designer, { ...designer, accountStatus: "SUSPENDED" }), attribution));
assert.equal(suspension.changes[0].after.businessRole, "DESIGNER");
assert.equal(suspension.changes[0].after.authorizationVersion, 2);
const reactivation = prepared(plan([suspension.changes[0].after], setCommand(suspension.changes[0].after, designer), attribution));
assert.equal(reactivation.changes[0].after.authorizationVersion, 3);
assert.equal(reactivation.changes[0].after.accountStatus, "ACTIVE");
assert.deepEqual(plan([designer], setCommand(designer, designer), attribution), { decision: "NO_CHANGE" });
rejected(plan([designer], { ...setCommand(designer, maintainer), expectedVersion: 0 } as AuthorizationChangeCommand, attribution), "STALE_VERSION");
const exhausted = { ...designer, authorizationVersion: 2_147_483_647 };
rejected(plan([exhausted], setCommand(exhausted, { ...designer, accountStatus: "SUSPENDED" }), attribution), "VERSION_EXHAUSTED");
rejected(plan([director], setCommand(director, { ...director, accountStatus: "SUSPENDED" }), attribution), "DIRECTOR_TRANSFER_REQUIRED");
rejected(plan([director], setCommand(director, unassigned), attribution), "DIRECTOR_TRANSFER_REQUIRED");

// Transfer is a two-account atomic plan with distinct identities and version checks.
const transferCommand: AuthorizationChangeCommand = {
  kind: "TRANSFER_DIRECTOR", fromUserId: "director", toUserId: "maintainer",
  fromExpectedVersion: 1, toExpectedVersion: 1, outgoingBusinessRole: "SENIOR_PROJECT_MANAGER",
};
const state = [director, maintainer];
const unchanged = structuredClone(state);
const transfer = prepared(plan(state, transferCommand, attribution));
assert.deepEqual(state, unchanged);
assert.equal(transfer.changes.length, 2);
assert.equal(transfer.changes[0].userId, "director");
assert.equal(transfer.changes[0].after.businessRole, "SENIOR_PROJECT_MANAGER");
assert.equal(transfer.changes[1].after.businessRole, "DIRECTOR");
assert.deepEqual(transfer.changes[0].after.technicalPrivileges, []);
assert.deepEqual(transfer.changes[1].after.technicalPrivileges, ["TECHNICAL_ADMIN"]);
for (const change of transfer.changes) assert.equal(change.after.authorizationVersion, 2);
assert.equal(applyToFixture(state, transfer).filter((row) => row.businessRole === "DIRECTOR").length, 1);
rejected(plan(state, { ...transferCommand, toUserId: "director" }, attribution), "INVALID_TRANSFER");
rejected(plan(state, { ...transferCommand, fromUserId: "maintainer" }, attribution), "INVALID_TRANSFER");
rejected(plan(state, { ...transferCommand, outgoingBusinessRole: "DIRECTOR" }, attribution), "INVALID_TRANSFER");
rejected(plan(state, { ...transferCommand, outgoingBusinessRole: "SUPER_ADMIN" }, attribution), "INVALID_TRANSFER");
rejected(plan(state, { ...transferCommand, fromExpectedVersion: 0 }, attribution), "STALE_VERSION");
rejected(plan(state, { ...transferCommand, toExpectedVersion: null }, attribution), "STALE_VERSION");
rejected(plan([director, { ...maintainer, accountStatus: "SUSPENDED" }], transferCommand, attribution), "SUSPENDED_DIRECTOR_TARGET");
rejected(plan([{ ...designer, accountStatus: "SUSPENDED" }], { kind: "BOOTSTRAP_DIRECTOR", userId: "designer", expectedVersion: 1 }, attribution), "SUSPENDED_DIRECTOR_TARGET");
const transferToUnmapped = prepared(plan([director], { ...transferCommand, toUserId: "new", toExpectedVersion: null, outgoingBusinessRole: null }, attribution));
assert.equal(transferToUnmapped.changes[1].before, null);
assert.equal(transferToUnmapped.changes[1].after.authorizationVersion, 1);

// Audit attribution is the actual actor, never replaced by the outgoing/incoming Director.
assert.deepEqual(transfer.attribution, attribution);
assert.deepEqual(transfer.changes[0].before, director);
assert.deepEqual(transfer.changes[1].before, maintainer);
for (const field of ["actorUserId", "reason", "changeId"] as const) {
  rejected(plan([], bootstrapCommand, { ...attribution, [field]: " \n " }), "INVALID_ATTRIBUTION");
}
const trimmed = prepared(plan([], bootstrapCommand, { actorUserId: " operator ", reason: " approved ", changeId: " transfer-2 " }));
assert.deepEqual(trimmed.attribution, { actorUserId: "operator", reason: "approved", changeId: "transfer-2" });

// Static schema/SQL checks supplement pure transition tests. They do NOT execute
// PostgreSQL constraints, triggers or concurrent transactions; that needs a later approved DB test.
const schema = readFileSync("prisma/schema.prisma", "utf8");
const sql = readFileSync("prisma/migrations/20261018120000_v2_authorization_foundation/migration.sql", "utf8");
function enumValues(name: string) {
  const body = schema.match(new RegExp(`enum ${name} \\{([^}]+)\\}`))?.[1];
  assert.ok(body, name);
  return body.trim().split(/\s+/);
}
assert.deepEqual(enumValues("BusinessRole"), [...businessRoleValues]);
assert.deepEqual(enumValues("TechnicalPrivilege"), [...technicalPrivilegeValues]);
assert.deepEqual(enumValues("AuthorizationAccountStatus"), [...authorizationAccountStatusValues]);
assert.deepEqual(enumValues("UserRole"), ["SUPER_ADMIN", "ADMIN", "USER"]);
for (const [name, values] of [["BusinessRole", businessRoleValues], ["TechnicalPrivilege", technicalPrivilegeValues], ["AuthorizationAccountStatus", authorizationAccountStatusValues]] as const) {
  const declaration = sql.match(new RegExp(`CREATE TYPE "${name}" AS ENUM \\(([^)]+)\\)`))?.[1];
  assert.ok(declaration, name);
  assert.deepEqual([...declaration.matchAll(/'([^']+)'/g)].map((match) => match[1]), [...values]);
}
assert.match(schema, /authorization\s+UserAuthorization\?/);
assert.match(schema, /businessRole\s+BusinessRole\?/);
assert.match(schema, /technicalPrivileges\s+TechnicalPrivilege\[\]\s+@default\(\[\]\)/);
assert.match(schema, /authorizationVersion\s+Int\s+@default\(1\)/);
assert.match(sql, /CREATE UNIQUE INDEX "UserAuthorization_one_active_director"[\s\S]+WHERE "businessRole" = 'DIRECTOR' AND "accountStatus" = 'ACTIVE'/);
assert.match(sql, /DEFERRABLE INITIALLY DEFERRED/);
assert.match(sql, /NEW\."authorizationVersion" := OLD\."authorizationVersion" \+ 1/);
assert.match(sql, /INSERT INTO "UserAuthorizationChange"/);
assert.match(sql, /to_jsonb\(OLD\) - 'createdAt' - 'updatedAt'/);
assert.match(sql, /current_setting\('flux.authorization_actor_id'/);
assert.match(sql, /BEFORE UPDATE OR DELETE ON "UserAuthorizationChange"/);
assert.match(sql, /BEFORE DELETE ON "UserAuthorization"/);
assert.match(sql, /BEFORE TRUNCATE ON "UserAuthorization"/);
assert.match(sql, /REFERENCES "User"\("id"\) ON DELETE RESTRICT ON UPDATE RESTRICT/);
assert.doesNotMatch(sql, /ALTER TABLE|DROP TABLE|DELETE FROM|INSERT INTO "User"|UPDATE "User"/);
assert.deepEqual([...sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((match) => match[1]), ["UserAuthorization", "UserAuthorizationChange"]);

console.log("V2 authorization persistence checks passed: assignments, bootstrap/transfer, suspension, versions, attribution, and static schema/SQL contracts (no DB execution).");
