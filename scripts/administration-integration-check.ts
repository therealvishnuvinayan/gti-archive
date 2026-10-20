import assert from "node:assert/strict";
import { workspaceFixture } from "./workspace-test-fixture";
import { createVersionedSessionToken } from "../src/lib/authorization/session";
import type { AdministrationResult } from "../src/lib/authorization/administration-types";

function denied(result: AdministrationResult<unknown>, code?: string) {
  assert.equal(result.ok, false);
  if (!result.ok && code) assert.equal(result.code, code, result.message);
}
function applied<T extends { status: string }>(result: AdministrationResult<T>) {
  assert.ok(result.ok, JSON.stringify(result)); assert.equal(result.data.status, "APPLIED"); return result.data;
}
async function main() {
  const f = await workspaceFixture("flux_v2_administration_test"), db = f.db;
  try {
    const actions = f.load("src/app/(dashboard)/users/v2-actions.js") as typeof import("../src/app/(dashboard)/users/v2-actions");
    const { administration } = f.load("src/lib/authorization/administration.js") as typeof import("../src/lib/authorization/administration");
    const auth = f.load("src/lib/auth.js") as typeof import("../src/lib/auth");
    const usersBefore = await db.user.findMany({ orderBy: { id: "asc" } });
    const originalHistory = await db.userAuthorizationChange.findMany({ orderBy: [{ userId: "asc" }, { authorizationVersion: "asc" }] });
    await db.project.create({ data: { id: "owned", name: "Retained ownership", ownerId: "spm", createdById: "director" } });
    const projectsBefore = await db.project.findMany();
    const role = { userId: "spm", expectedVersion: 1, businessRole: "DESIGNER", reason: "Reviewed business reassignment", confirmation: "CHANGE BUSINESS ROLE" };
    const status = { userId: "spm", expectedVersion: 1, accountStatus: "SUSPENDED", reason: "Reviewed suspension", confirmation: "CHANGE ACCOUNT STATUS" };
    const technical = { userId: "designer2", expectedVersion: 1, technicalPrivileges: ["TECHNICAL_ADMIN"], reason: "Technical rotation", confirmation: "CHANGE TECHNICAL PRIVILEGES" };
    const transfer = { toUserId: "outsider", fromExpectedVersion: 1, toExpectedVersion: 1, outgoingBusinessRole: "SENIOR_PROJECT_MANAGER", reason: "Approved handover", confirmation: "TRANSFER DIRECTOR" };
    async function fresh(id: string) {
      const row = await db.userAuthorization.findUnique({ where: { userId: id } });
      const token = createVersionedSessionToken(row?.authorizationVersion ?? null);
      await db.session.create({ data: { userId: id, token, expiresAt: new Date(Date.now() + 3600000) } });
      f.tokens.set(id, token); return f.user(id);
    }
    async function version(id: string) { return (await db.userAuthorization.findUniqueOrThrow({ where: { userId: id } })).authorizationVersion; }

    f.setToken(null);
    denied(await actions.changeBusinessRoleAction(role), "UNAUTHENTICATED");
    await assert.rejects(() => administration.getAdministrationDirectory("business"), /UNAUTHENTICATED/);
    for (const id of ["spm", "jpm", "designer", "digital", "tech", "unassigned"]) {
      await f.user(id);
      denied(await actions.changeBusinessRoleAction(role));
      denied(await actions.changeBusinessStatusAction(status));
      denied(await actions.transferDirectorAction(transfer));
      denied(await actions.loadAdministrationHistoryAction("business", { userId: "director", beforeVersion: null }));
      await assert.rejects(() => administration.getAdministrationDirectory("business"));
      if (id !== "tech") {
        denied(await actions.changeTechnicalPrivilegesAction(technical));
        await assert.rejects(() => administration.getAdministrationDirectory("technical"));
        denied(await actions.loadAdministrationHistoryAction("technical", { userId: "tech", beforeVersion: null }));
      }
    }
    await f.user("director");
    denied(await actions.changeTechnicalPrivilegesAction(technical), "TECHNICAL_AUTHORITY_REQUIRED");
    await assert.rejects(() => administration.getAdministrationDirectory("technical"), /TECHNICAL_AUTHORITY_REQUIRED/);
    denied(await actions.loadAdministrationHistoryAction("technical", { userId: "tech", beforeVersion: null }));
    const directory = await administration.getAdministrationDirectory("business");
    assert.equal(directory.accounts.length, 9);
    assert.equal(directory.accounts.find(row => row.id === "tech")?.canChangeStatus, false);
    assert.equal(directory.accounts.find(row => row.id === "director")?.canChangeStatus, false);
    assert.ok(!JSON.stringify(directory).includes("TECHNICAL_ADMIN"));
    assert.ok(!/passwordHash|inviteToken|session|technicalPrivileges/.test(JSON.stringify(directory)));
    const deniedBefore = await db.userAuthorizationChange.count();
    for (const extra of [{ actorUserId: "director" }, { role: "DIRECTOR" }, { technicalPrivileges: ["TECHNICAL_ADMIN"] }, { authorizationVersion: 1 }]) {
      denied(await actions.changeBusinessRoleAction({ ...role, ...extra }), "INVALID_INPUT");
    }
    denied(await actions.changeBusinessRoleAction({ ...role, confirmation: "" }), "CONFIRMATION_REQUIRED");
    denied(await actions.changeBusinessRoleAction({ ...role, reason: " " }), "INVALID_REASON");
    denied(await actions.changeBusinessRoleAction({ ...role, expectedVersion: 0 }), "INVALID_VERSION");
    denied(await actions.changeBusinessRoleAction({ ...role, businessRole: "DIRECTOR" }), "USE_DIRECTOR_OPERATION");
    denied(await actions.changeBusinessRoleAction({ ...role, userId: "director" }), "DIRECTOR_TRANSFER_REQUIRED");
    denied(await actions.changeBusinessStatusAction({ ...status, userId: "director" }), "DIRECTOR_TRANSFER_REQUIRED");
    denied(await actions.changeBusinessStatusAction({ ...status, userId: "tech" }), "TECHNICAL_AUTHORITY_REQUIRED");
    denied(await actions.transferDirectorAction({ ...transfer, toUserId: "director" }), "INVALID_TRANSFER");
    denied(await actions.transferDirectorAction({ ...transfer, actorUserId: "director" }), "INVALID_INPUT");
    assert.equal(await db.userAuthorizationChange.count(), deniedBefore);

    const changed = applied(await actions.changeBusinessRoleAction(role));
    assert.equal(changed.signInRequired, false);
    assert.ok(!JSON.stringify(changed).includes("assignments"));
    f.setToken(f.tokens.get("spm")!); assert.equal(await auth.getCurrentActor(), null);
    await f.user("director");
    denied(await actions.changeBusinessRoleAction(role), "STALE_VERSION");
    const noChange = await actions.changeBusinessRoleAction({ ...role, expectedVersion: 2 });
    assert.ok(noChange.ok); assert.equal(noChange.data.status, "NO_CHANGE");
    assert.equal(await db.userAuthorizationChange.count(), deniedBefore + 1);
    const history = await actions.loadAdministrationHistoryAction("business", { userId: "spm", beforeVersion: null });
    assert.ok(history.ok); assert.equal(history.data.entries[0].actor.id, "director");
    assert.equal(history.data.entries[0].reason, role.reason);
    assert.equal(history.data.entries[0].changeId, changed.changeId);
    assert.match(history.data.entries[0].before, /Senior Project Manager/);
    assert.match(history.data.entries[0].after, /Designer/);

    applied(await actions.changeBusinessStatusAction({ ...status, expectedVersion: 2 }));
    f.setToken(f.tokens.get("spm")!); assert.equal(await auth.getCurrentActor(), null);
    denied(await actions.changeBusinessRoleAction(role), "UNAUTHENTICATED");
    await f.user("director");
    denied(await actions.transferDirectorAction({ ...transfer, toUserId: "spm", toExpectedVersion: 3 }), "SUSPENDED_DIRECTOR_TARGET");
    applied(await actions.changeBusinessStatusAction({ ...status, expectedVersion: 3, accountStatus: "ACTIVE" }));
    f.setToken(f.tokens.get("spm")!); assert.equal(await auth.getCurrentActor(), null);
    await fresh("spm"); denied(await actions.changeBusinessRoleAction(role), "BUSINESS_AUTHORITY_REQUIRED");
    await f.user("director");
    applied(await actions.changeBusinessRoleAction({ ...role, userId: "unassigned", expectedVersion: null }));
    f.setToken(f.tokens.get("unassigned")!); assert.equal(await auth.getCurrentActor(), null);

    await f.user("tech");
    const technicalDirectory = await administration.getAdministrationDirectory("technical");
    assert.ok(!/DIRECTOR|SENIOR_PROJECT_MANAGER|JUNIOR_PROJECT_MANAGER|DESIGNER|DIGITAL_LEAD|passwordHash|inviteToken/.test(JSON.stringify(technicalDirectory)));
    applied(await actions.changeTechnicalPrivilegesAction(technical));
    assert.equal((await db.userAuthorization.findUniqueOrThrow({ where: { userId: "designer2" } })).businessRole, "DESIGNER");
    await f.user("director");
    denied(await actions.changeBusinessStatusAction({ ...status, userId: "designer2", expectedVersion: 2 }), "TECHNICAL_AUTHORITY_REQUIRED");
    const businessHistory = await actions.loadAdministrationHistoryAction("business", { userId: "designer2", beforeVersion: null });
    assert.ok(businessHistory.ok); assert.ok(!JSON.stringify(businessHistory).includes("Technical rotation"));
    applied(await actions.changeBusinessRoleAction({ ...role, userId: "designer2", expectedVersion: 2, businessRole: "DIGITAL_LEAD" }));
    assert.deepEqual((await db.userAuthorization.findUniqueOrThrow({ where: { userId: "designer2" } })).technicalPrivileges, ["TECHNICAL_ADMIN"]);
    await f.user("tech");
    const technicalHistory = await actions.loadAdministrationHistoryAction("technical", { userId: "designer2", beforeVersion: null });
    assert.ok(technicalHistory.ok); assert.ok(!JSON.stringify(technicalHistory).includes(role.reason));
    denied(await actions.changeBusinessStatusAction({ ...status, userId: "tech" }), "BUSINESS_AUTHORITY_REQUIRED");
    applied(await actions.changeTechnicalPrivilegesAction({ ...technical, expectedVersion: 3, technicalPrivileges: [] }));

    await f.user("director");
    const concurrent = await Promise.all([
      actions.changeBusinessRoleAction({ ...role, userId: "jpm", businessRole: "DESIGNER" }),
      actions.changeBusinessRoleAction({ ...role, userId: "jpm", businessRole: "DIGITAL_LEAD" }),
    ]);
    assert.equal(concurrent.filter(result => result.ok).length, 1);
    denied(concurrent.find(result => !result.ok)!, "STALE_VERSION");
    // More than one history page: cursor is version based, including filtered-out
    // domain events; old entries remain reachable without exposing raw snapshots.
    for (let i = 0; i < 51; i++) applied(await actions.changeBusinessRoleAction({ ...role, userId: "designer",
      expectedVersion: await version("designer"), businessRole: i % 2 === 0 ? "DIGITAL_LEAD" : "DESIGNER" }));
    const firstPage = await actions.loadAdministrationHistoryAction("business", { userId: "designer", beforeVersion: null });
    assert.ok(firstPage.ok); assert.equal(firstPage.data.entries.length, 50); assert.equal(firstPage.data.nextBeforeVersion, 3);
    const lastPage = await actions.loadAdministrationHistoryAction("business", { userId: "designer", beforeVersion: 3 });
    assert.ok(lastPage.ok); assert.equal(lastPage.data.entries.length, 2); assert.equal(lastPage.data.nextBeforeVersion, null);

    const handedOver = applied(await actions.transferDirectorAction(transfer));
    assert.equal(handedOver.signInRequired, true);
    assert.equal(await auth.getCurrentActor(), null);
    assert.equal(await db.userAuthorization.count({ where: { businessRole: "DIRECTOR" } }), 1);
    const transferAudit = await db.userAuthorizationChange.findMany({ where: { changeId: handedOver.changeId } });
    assert.equal(transferAudit.length, 2); assert.ok(transferAudit.every(row => row.actorUserId === "director" && row.reason === transfer.reason));
    denied(await actions.transferDirectorAction(transfer), "UNAUTHENTICATED");
    await fresh("director"); denied(await actions.transferDirectorAction(transfer), "BUSINESS_AUTHORITY_REQUIRED");
    f.setToken(f.tokens.get("outsider")!); assert.equal(await auth.getCurrentActor(), null);
    await fresh("outsider");
    assert.equal((await administration.getAdministrationDirectory("business")).actorId, "outsider");
    applied(await actions.changeBusinessRoleAction({ ...role, expectedVersion: await version("spm"), businessRole: "SENIOR_PROJECT_MANAGER" }));
    await f.user("tech");
    const removed = applied(await actions.changeTechnicalPrivilegesAction({ ...technical, userId: "tech", technicalPrivileges: [] }));
    assert.equal(removed.signInRequired, true); assert.equal(await auth.getCurrentActor(), null);
    denied(await actions.changeTechnicalPrivilegesAction(technical), "UNAUTHENTICATED");

    assert.deepEqual(await db.user.findMany({ orderBy: { id: "asc" } }), usersBefore);
    assert.deepEqual(await db.project.findMany(), projectsBefore);
    for (const row of originalHistory) assert.deepEqual(await db.userAuthorizationChange.findUniqueOrThrow({
      where: { userId_authorizationVersion: { userId: row.userId, authorizationVersion: row.authorizationVersion } },
    }), row);
    assert.equal(await db.manualArchiveFile.count(), 0); assert.equal(await db.manualLibraryAsset.count(), 0);
    console.log("PASS: administration actions/read models; genuine fixture sessions; reason/confirmation/forgery validation; domain separation; no-op/replay/concurrency; suspension/reactivation; immutable paginated history; Director transfer; immediate invalidation; unchanged nine User records/passwords and existing project ownership/audit rows.");
  } finally { await f.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
