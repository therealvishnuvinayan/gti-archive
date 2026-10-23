import nodeAssert from "node:assert/strict";
let assertions = 0;
const assert: typeof nodeAssert = new Proxy(nodeAssert, { get(target, property) { const value = Reflect.get(target, property); return typeof value === "function" && property !== "AssertionError" ? (...args: unknown[]) => { assertions++; return Reflect.apply(value, target, args); } : value; } });
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import { realpathSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import type { PrismaClient } from "@prisma/client";


const root = realpathSync(process.env.FLUX_TASKER_TEST_ROOT ?? "missing");
assert.ok(root.startsWith("/private/tmp/flux-v2-tasker-")); assert.equal(statSync(root).mode & 0o777, 0o700);
const url = `postgresql://flux_tasker_test@localhost:55432/flux_tasker_test?host=${encodeURIComponent(join(root, "s"))}&connect_timeout=5`;
assert.equal(process.env.FLUX_TASKER_TEST_URL, url);
const requireLocal = createRequire(__filename), Client = (requireLocal(join(root, "client")) as { PrismaClient: typeof PrismaClient }).PrismaClient;
const db = new Client({ datasourceUrl: url }), authStore = new AsyncLocalStorage<string>();
let token: string | null = null;
async function as(id: string) { token = (await db.session.findFirstOrThrow({ where: { userId: id } })).token; }
async function asConcurrent<T>(id: string, fn: () => Promise<T>) { const session = await db.session.findFirstOrThrow({ where: { userId: id } }); return authStore.run(session.token, fn); }

async function main() {
  assert.deepEqual((await db.$queryRaw<Array<{ dir: string; tcp: string }>>`SELECT current_setting('data_directory') AS dir,current_setting('listen_addresses') AS tcp`)[0], { dir: join(root, "data"), tcp: "" });
  const mod = requireLocal("node:module") as { _load: (name: string, ...args: unknown[]) => unknown }, original = mod._load, compiled = dirname(dirname(__filename));
  let external = 0;
  global.fetch = async () => { external++; throw new Error("External requests forbidden"); };
  mod._load = function (name, ...args) {
    if (name === "@prisma/client") return requireLocal(join(root, "client"));
    if (["@/lib/prisma", "../prisma", "./prisma"].includes(name)) return { prisma: db, withPrismaRetry: (fn: () => unknown) => fn() };
    if (name === "next/headers") return { cookies: async () => ({ get: () => (authStore.getStore() ?? token) ? { value: authStore.getStore() ?? token } : undefined }) };
    if (name === "next/cache") return { unstable_cache: (fn: unknown) => fn, revalidatePath: () => {}, revalidateTag: () => {} };
    if (name === "next/server") return { after: () => {}, NextResponse: { json: (v: unknown, init?: ResponseInit) => Response.json(v, init) } };
    if (name === "react") return { cache: (fn: unknown) => fn };
    if (name === "next/navigation") return { redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } };
    return original.call(this, name.startsWith("@/") ? resolve(compiled, "src", name.slice(2)) : name, ...args);
  };
  const runtime = requireLocal(join(compiled, "src/lib/stage-runtime/service.js")) as typeof import("../src/lib/stage-runtime/service");
  const creation = requireLocal(join(compiled, "src/lib/runtime-integration/creation.js")) as typeof import("../src/lib/runtime-integration/creation");
  const events = requireLocal(join(compiled, "src/lib/events/contracts.js")) as typeof import("../src/lib/events/contracts");
  for (const key of ["SHARED_FILE_IDENTITY","APPROVAL_ENGINE","SHARED_EVENTS","UNIVERSAL_TASKER","TASKER_DELIVERABLES","TASKER_CONCEPTS","TASKER_SISTERS","STAGE_BUILDER_DRAFTS","STAGE_BUILDER_PUBLICATION","STAGE_RUNTIME"]) process.env[`FLUX_${key}`] = "1";
  await as("director"); process.env.FLUX_RUNTIME_INTEGRATION = "0";
  await assert.rejects(creation.runtimeCreationRequests(), /RUNTIME_INTEGRATION_DISABLED/);
  await as("spm"); await assert.rejects(runtime.runtimeCreationOptions());
  process.env.FLUX_RUNTIME_INTEGRATION = "1";
  const accounts = JSON.stringify(await db.user.findMany({ orderBy: { id: "asc" }, include: { authorization: true } }));
  const pv = await db.publishedWorkflowVersion.findFirstOrThrow({ where: { validationStatus: "VALID" } });
  const input = { commandId: randomUUID(), publishedVersionId: pv.id, definitionHash: pv.configurationHash, title: "SPM integration project", description: "Synthetic integration", ownerId: "spm", coOwnerIds: ["jpm"], executorIds: ["designer"] };
  const spm = await runtime.createRuntimeProject(input); assert.equal((await db.runtimeProject.findUniqueOrThrow({ where: { id: spm.projectId } })).createdById,"spm");
  assert.deepEqual(await runtime.createRuntimeProject(input), spm);
  await assert.rejects(runtime.createRuntimeProject({ ...input, commandId: randomUUID(), ownerId: "director" }));
  await assert.rejects(runtime.createRuntimeProject({ ...input, commandId: randomUUID(), publishedVersionId: "unapproved" }));
  await as("jpm"); await assert.rejects(runtime.createRuntimeProject({ ...input, ownerId: "jpm", coOwnerIds: ["spm"] }));
  const proposed = { ...input, commandId: randomUUID(), ownerId: "jpm", coOwnerIds: ["spm"] };
  await assert.rejects(creation.requestRuntimeCreation({ creation: { ...proposed, coOwnerIds: [] }, reason: "Missing mandatory SPM" }), /SPM_CO_OWNER_REQUIRED/);
  const before = await db.runtimeProject.count();
  const request = { creation: proposed, reason: "Genuine JPM approval request" };
  const req = await creation.requestRuntimeCreation(request); assert.equal(await db.runtimeProject.count(),before);
  assert.deepEqual(await creation.requestRuntimeCreation(request),req);
  const row = await db.runtimeCreationRequest.findUniqueOrThrow({ where: { id: req.requestId } });
  await as("director");
  const rejection = { commandId: randomUUID(), requestId: row.id, snapshotHash: row.snapshotHash, outcome: "REJECT", confirmed: true, reason: "Revise the project scope" };
  assert.equal((await creation.decideRuntimeCreation(rejection)).outcome,"REJECT"); assert.equal(await db.runtimeProject.count(),before);
  await assert.rejects(creation.decideRuntimeCreation({ ...rejection, commandId: randomUUID(), outcome: "APPROVE" }), /REQUEST_ALREADY_DECIDED/);
  await as("jpm"); const next = await creation.requestRuntimeCreation({ ...request, creation: { ...proposed, commandId: randomUUID() } });
  const pending = await db.runtimeCreationRequest.findUniqueOrThrow({ where: { id: next.requestId } });
  const approval = { ...rejection, commandId: randomUUID(), requestId: pending.id, snapshotHash: pending.snapshotHash, outcome: "APPROVE", reason: "Exact participants and approved version reviewed" };
  const decisions = await Promise.allSettled([asConcurrent("director",()=>creation.decideRuntimeCreation(approval)),asConcurrent("director",()=>creation.decideRuntimeCreation(approval))]);
  assert.ok(decisions.some(d=>d.status==="fulfilled")); assert.equal(await db.runtimeProject.count(),before+1);
  await as("director"); const approved = await creation.decideRuntimeCreation(approval); assert.ok(approved.projectId);
  const project = await db.runtimeProject.findUniqueOrThrow({ where: { id: approved.projectId! }, include: { participants: true, stages: true } });
  assert.equal(project.createdById,"jpm"); assert.equal(project.ownerId,"jpm"); assert.equal(project.publishedVersionId,pv.id);
  assert.ok(project.participants.some(p=>p.userId==="spm"&&p.role==="CO_OWNER")); assert.ok(project.stages.length>0);
  await assert.rejects(db.runtimeParticipant.deleteMany({ where: { projectId: project.id, userId: "spm" } }));
  await as("jpm"); await assert.rejects(creation.decideRuntimeCreation(approval));
  await assert.rejects(db.runtimeCreationRequest.update({ where: { id: pending.id }, data: { reason: "rewrite approved history" } }));
  const requestCount = await db.runtimeCreationRequest.count();
  await db.$executeRawUnsafe(`CREATE FUNCTION fixture_creation_outbox_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventId" LIKE 'runtime-creation:%' THEN RAISE EXCEPTION 'forced creation outbox failure'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe(`CREATE TRIGGER fixture_creation_outbox_failure BEFORE INSERT ON "EventOutbox" FOR EACH ROW EXECUTE FUNCTION fixture_creation_outbox_failure()`);
  try { await assert.rejects(creation.requestRuntimeCreation({ ...request, creation: { ...proposed, commandId: randomUUID() } })); }
  finally { await db.$executeRawUnsafe('DROP TRIGGER fixture_creation_outbox_failure ON "EventOutbox"'); await db.$executeRawUnsafe('DROP FUNCTION fixture_creation_outbox_failure()'); }
  assert.equal(await db.runtimeCreationRequest.count(), requestCount);
  await as("spm2"); assert.equal((await creation.runtimeCreationRequests()).requests.length, 0);
  for(const who of ["designer","designer2","digital","tech"]){ await as(who); await assert.rejects(creation.runtimeCreationRequests()); await assert.rejects(runtime.runtimeCreationOptions()); }
  for(const e of await db.businessEvent.findMany({ where:{ type:{in:["RUNTIME_CREATION_REQUESTED","RUNTIME_CREATION_DECIDED"]} } })){ assert.ok(events.decodeBusinessEvent(e)); assert.ok(await db.eventOutbox.findUnique({where:{eventId:e.id}})); }
  assert.equal(JSON.stringify(await db.user.findMany({ orderBy: { id: "asc" }, include: { authorization: true } })),accounts); assert.equal(external,0);
  console.log(`PASS runtime creation governance: ${assertions} assertions; direct SPM, exact JPM request/Director rejection/approval, concurrency/replay, ownership, immutable participants and event/outbox integrity.`);
}
main().catch(error=>{ console.error(error);process.exitCode=1; }).finally(()=>db.$disconnect());
