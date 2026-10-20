import type { BusinessRole, PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { projectTransactionClient } from "../src/lib/authorization/project-transaction";
import { createVersionedSessionToken } from "../src/lib/authorization/session";
import { allPermissionKeys } from "../src/lib/permissions/definitions";

export async function workspaceFixture(database: "flux_v2_workspace_test" | "flux_v2_search_test" | "flux_v2_administration_test") {
const root = realpathSync(process.env.FLUX_AUTH_TEST_ROOT ?? "missing-isolated-root");
const temporaryParent = realpathSync(process.platform === "darwin" ? "/private/tmp" : tmpdir());
assert.ok(root.startsWith(temporaryParent + "/flux-v2-auth-pg-"));
assert.equal(statSync(root).mode & 0o777, 0o700);
const socket = join(root, "s");
assert.ok(statSync(join(socket, ".s.PGSQL.55432")).isSocket());
const url = `postgresql://flux_v2_test@localhost:55432/${database}?host=${encodeURIComponent(socket)}&connect_timeout=5`;
assert.equal(process.env.FLUX_AUTH_TEST_URL, url);
assert.equal(process.env.FLUX_AUTH_TEST_CLIENT, join(root, "client"));
const localRequire = createRequire(__filename);
const { PrismaClient: Client } = localRequire(join(root, "client")) as {PrismaClient: typeof PrismaClient};
const db = new Client({datasourceUrl:url});
let token: string | null = null;
const roles: Array<[string, BusinessRole | null]> = [["director","DIRECTOR"],["spm","SENIOR_PROJECT_MANAGER"],["jpm","JUNIOR_PROJECT_MANAGER"],["designer","DESIGNER"],["digital","DIGITAL_LEAD"],["tech",null],["unassigned",null],["outsider","SENIOR_PROJECT_MANAGER"],["designer2","DESIGNER"]];
const tokens = new Map<string,string>();
async function seed() {
 const [identity] = await db.$queryRaw<Array<{directory:string,tcp:string,database:string}>>`SELECT current_setting('data_directory') AS directory,current_setting('listen_addresses') AS tcp,current_database() AS database`;
 assert.deepEqual(identity,{directory:join(root,"data"),tcp:"",database});
 assert.equal(await db.user.count(),0);
 for(const [id] of roles) await db.user.create({data:{id,email:`${id}@example.invalid`,passwordHash:"synthetic-unusable-hash",name:id,role:id==="tech"?"SUPER_ADMIN":"ADMIN"}});
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Isolated project governance fixtures',true),set_config('flux.authorization_change_id',${randomUUID()},true)`;
  for(const [userId,businessRole] of roles.filter(([id])=>id!=="unassigned")) await tx.userAuthorization.create({data:{userId,businessRole,technicalPrivileges:userId==="tech"?["TECHNICAL_ADMIN"]:[],accountStatus:"ACTIVE",authorizationVersion:1}});
 });
 for(const [id] of roles){const t=createVersionedSessionToken(id==="unassigned"?null:1); await db.session.create({data:{userId:id,token:t,expiresAt:new Date(Date.now()+3600000)}});tokens.set(id,t);}
}

await seed();
 const moduleApi = localRequire("node:module") as { _load: (name: string, ...args: unknown[]) => unknown };
 const original = moduleApi._load, compiledRoot = dirname(dirname(__filename));
 moduleApi._load = function(name, ...args) {
  if (name === "ably") return { Rest: class { auth = { createTokenRequest: async (input: unknown) => input }; } };
  if (name === "@prisma/client") return localRequire(join(root, "client"));
  if (name === "@/lib/rich-text") return { sanitizeRichText: (value: string | null) => value ?? "", richTextToPlainText: (value: string | null) => value ?? "", isRichTextEmpty: (value: string | null) => !value };
  if (name === "@/lib/realtime/server") return new Proxy({}, { get: () => async () => false });
  if (name === "next/headers") return { cookies: async () => ({ get: () => token ? { value: token } : undefined }) };
  if (name === "next/cache") return { unstable_cache: (fn: unknown) => fn, revalidatePath: () => {}, revalidateTag: () => {} };
  if (name === "next/navigation") return { redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } };
  if (name === "next/server") return { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init), redirect: (url: string) => Response.redirect(url) }, after: () => {} };
  if (name === "react") return { cache: (fn: unknown) => fn };
  if (["@/lib/prisma", "../prisma", "./prisma"].includes(name)) return { prisma: projectTransactionClient(db), withPrismaRetry: (fn: () => unknown) => fn() };
  if (name === "@/lib/permissions/profiles") return { getPermissionProfileSnapshotForUser: async () => ({ effectivePermissions: new Set(allPermissionKeys), rolePermissions: new Set(allPermissionKeys), archiveAccessGranted: true, archiveAccessLevel: "FULL" }) };
  if (["@/lib/s3", "@/lib/storage/s3"].includes(name)) return {
   ...original.call(this, join(compiledRoot, "src/lib/storage/s3.js"), ...args) as typeof import("../src/lib/storage/s3"),
   createPresignedDownloadUrl: async () => "http://fixture.invalid/download",
   createPresignedPreviewUrl: async () => "http://fixture.invalid/preview",
   deleteObjectIfNeeded: async () => { throw new Error("Unexpected storage mutation"); },
  };
  return original.call(this, name.startsWith("@/") ? resolve(compiledRoot, "src", name.slice(2)) : name, ...args);
 };
 const auth = localRequire(join(compiledRoot, "src/lib/auth.js")) as typeof import("../src/lib/auth");
 async function user(id: string) { token = tokens.get(id) ?? null; const value = await auth.getCurrentUser(); assert.ok(value); return value; }
 function load(path: string) { return localRequire(join(compiledRoot, path)); }
 return { db, user, load, tokens, setToken: (value: string | null) => { token = value; },
   close: async () => { moduleApi._load = original; await db.$disconnect(); } };
}
