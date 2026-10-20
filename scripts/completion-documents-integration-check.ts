import type { BusinessRole, PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { projectTransactionClient } from "../src/lib/authorization/project-transaction";
import { createVersionedSessionToken } from "../src/lib/authorization/session";
import { PROJECT_WORKFLOW_STAGE_DEFINITIONS } from "../src/lib/project-workflow";
import { allPermissionKeys } from "../src/lib/permissions/definitions";

const root = realpathSync(process.env.FLUX_AUTH_TEST_ROOT ?? "missing-isolated-root");
const temporaryParent = realpathSync(process.platform === "darwin" ? "/private/tmp" : tmpdir());
assert.ok(root.startsWith(temporaryParent + "/flux-v2-auth-pg-"));
assert.equal(statSync(root).mode & 0o777, 0o700);
const socket = join(root, "s");
assert.ok(statSync(join(socket, ".s.PGSQL.55432")).isSocket());
const url = `postgresql://flux_v2_test@localhost:55432/flux_v2_completion_documents_test?host=${encodeURIComponent(socket)}&connect_timeout=5`;
assert.equal(process.env.FLUX_AUTH_TEST_URL, url);
assert.equal(process.env.FLUX_AUTH_TEST_CLIENT, join(root, "client"));
const localRequire = createRequire(__filename);
const { PrismaClient: Client } = localRequire(join(root, "client")) as {PrismaClient: typeof PrismaClient};
const db = new Client({datasourceUrl:url});
let token: string | null = null;
const roles: Array<[string, BusinessRole | null]> = [["director","DIRECTOR"],["spm","SENIOR_PROJECT_MANAGER"],["jpm","JUNIOR_PROJECT_MANAGER"],["designer","DESIGNER"],["digital","DIGITAL_LEAD"],["tech",null],["unassigned",null],["outsider","SENIOR_PROJECT_MANAGER"],["designer2","DESIGNER"]];
const tokens = new Map<string,string>();
const objects = new Map<string, { ContentLength: number; ContentType: string; ETag: string; VersionId?: string; ChecksumSHA256?: string; ChecksumType?: string }>();
const storageCalls = { copies: 0, reads: 0 };
async function as(id:string) { token = tokens.get(id)!; }


async function seed() {
 const [identity] = await db.$queryRaw<Array<{directory:string,tcp:string,database:string}>>`SELECT current_setting('data_directory') AS directory,current_setting('listen_addresses') AS tcp,current_database() AS database`;
 assert.deepEqual(identity,{directory:join(root,"data"),tcp:"",database:"flux_v2_completion_documents_test"});
 assert.equal(await db.user.count(),0);
 for(const [id] of roles) await db.user.create({data:{id,email:`${id}@example.invalid`,passwordHash:"synthetic-unusable-hash",name:id,role:id==="tech"?"SUPER_ADMIN":"ADMIN"}});
 await db.$transaction(async tx=>{
  await tx.$queryRaw`SELECT set_config('flux.authorization_actor_id','director',true),set_config('flux.authorization_reason','Isolated project governance fixtures',true),set_config('flux.authorization_change_id',${randomUUID()},true)`;
  for(const [userId,businessRole] of roles.filter(([id])=>id!=="unassigned")) await tx.userAuthorization.create({data:{userId,businessRole,technicalPrivileges:userId==="tech"?["TECHNICAL_ADMIN"]:[],accountStatus:"ACTIVE",authorizationVersion:1}});
 });
 for(const [id] of roles){const t=createVersionedSessionToken(id==="unassigned"?null:1); await db.session.create({data:{userId:id,token:t,expiresAt:new Date(Date.now()+3600000)}});tokens.set(id,t);}
}

async function main(){
 await seed();
 // Adoption is enabled only after the private cluster identity and fixture guard.
 const sharedFiles = process.env.FLUX_FILE_IDENTITY_TEST === "1";
 if (sharedFiles) process.env.FLUX_SHARED_FILE_IDENTITY = "1";
 const moduleApi=localRequire("node:module") as {_load:(name:string,...args:unknown[])=>unknown};
 const original=moduleApi._load, compiledRoot=dirname(dirname(__filename));
 moduleApi._load=function(name,...args){
  if(name==="@prisma/client")return localRequire(join(root,"client"));
  // This authorization suite uses plain synthetic strings; rich-text rendering
  // is not under test (the local sanitizer transitive dependency is unavailable).
  if(name==="@/lib/rich-text")return {sanitizeRichText:(value:string|null)=>value??"",richTextToPlainText:(value:string|null)=>value??"",isRichTextEmpty:(value:string|null)=>!value};
  if(name==="@/lib/realtime/server")return new Proxy({}, {get:()=>async()=>false});
  if(name==="next/headers")return{cookies:async()=>({get:()=>token?{value:token}:undefined})};
  if(name==="next/cache")return{unstable_cache:(fn:unknown)=>fn,revalidatePath:()=>{},revalidateTag:()=>{}};
  if(name==="next/navigation")return{redirect:(url:string)=>{throw new Error(`REDIRECT:${url}`);}};
  if(name==="next/server")return{NextResponse:{json:(body:unknown,init?:ResponseInit)=>Response.json(body,init),redirect:(url:string|URL,init?:ResponseInit)=>{const target=new URL(String(url));return new Response(null,{...init,status:307,headers:{...Object.fromEntries(new Headers(init?.headers)),Location:target.href}})}},after:(fn:unknown)=>{void fn;}};
  if(name==="react")return{cache:(fn:unknown)=>fn};
  if(name==="@/lib/prisma"||name==="../prisma"||name==="./prisma")return{prisma:projectTransactionClient(db),withPrismaRetry:(fn:()=>unknown)=>fn()};
  if(name==="@/lib/permissions/profiles")return{getPermissionProfileSnapshotForUser:async()=>({effectivePermissions:new Set(allPermissionKeys),rolePermissions:new Set(allPermissionKeys),archiveAccessGranted:true,archiveAccessLevel:"FULL"})};
  if(name==="@/lib/s3"||name==="@/lib/storage/s3")return {
    ...localRequire(join(compiledRoot,"src/lib/upload-validation.js")),
    getMaxAssetUploadBytes:()=>10000000, getS3BucketName:()=>"fixture-no-network", sanitizeFileName:(v:string)=>v.replace(/[^a-zA-Z0-9.]/g,"_"),
    buildProjectCompletionDocumentKey:({projectId,documentType,safeFileName}:{projectId:string;documentType:string;safeFileName:string})=>`fixture/${projectId}/${documentType}/${safeFileName}`,
    createPresignedUploadUrl:async()=>"http://fixture.invalid/upload", createPresignedDownloadUrl:async()=>"http://fixture.invalid/download", createPresignedPreviewUrl:async()=>"http://fixture.invalid/preview",
    readPinnedStoredObject:async({storageKey,objectVersionId,objectETag}:{storageKey:string;objectVersionId:string|null;objectETag:string})=>{storageCalls.reads++;const value=objects.get(storageKey);if(!value||value.ETag!==objectETag||(objectVersionId && objectVersionId!==value.VersionId))throw new Error("Conditional GET failed");return {...value,Body:{transformToWebStream:()=>new ReadableStream({start(controller){controller.enqueue(new Uint8Array(value.ContentLength));controller.close();}})}};},
    getObjectMetadata:async(key:string)=>{const value=objects.get(key);if(!value)throw new Error("Fixture object missing");return value;},
    copyStoredObject:async({sourceKey,storageKey,sourceETag}:{sourceKey:string;storageKey:string;sourceETag:string})=>{const value=objects.get(sourceKey);if(!value||value.ETag!==sourceETag)throw new Error("Conditional object copy failed");storageCalls.copies++; objects.set(storageKey,{...value});},
  };
  return original.call(this,name.startsWith("@/")?resolve(compiledRoot,"src",name.slice(2)):name,...args);
 };
 try {
  const auth = localRequire(join(compiledRoot,"src/lib/auth.js")) as typeof import("../src/lib/auth");
  const docs = localRequire(join(compiledRoot,"src/lib/project-completion.js")) as typeof import("../src/lib/project-completion");
  const reviews = localRequire(join(compiledRoot,"src/lib/completion-documents/service.js")) as typeof import("../src/lib/completion-documents/service");
  const governance = localRequire(join(compiledRoot,"src/lib/project-governance/service.js")) as typeof import("../src/lib/project-governance/service");
  const seven = localRequire(join(compiledRoot,"src/lib/stage-seven.js")) as typeof import("../src/lib/stage-seven");
  const api = localRequire(join(compiledRoot,"src/app/api/project-completion-documents/reviews/route.js")) as typeof import("../src/app/api/project-completion-documents/reviews/route");
  const externalApi = localRequire(join(compiledRoot,"src/app/api/project-completion-documents/external/route.js")) as typeof import("../src/app/api/project-completion-documents/external/route");
  async function user(id:string) { await as(id); return (await auth.getCurrentUser())!; }
  async function denied(fn:()=>Promise<unknown>) { await assert.rejects(fn, error => { if(error instanceof TypeError || error instanceof ReferenceError || error instanceof assert.AssertionError)throw error; return true; }); }
  const roleSnapshot=JSON.stringify(await db.userAuthorization.findMany({orderBy:{userId:"asc"},include:{user:{select:{email:true,passwordHash:true,role:true}}}}));
  const roleHistory=JSON.stringify(await db.userAuthorizationChange.findMany({orderBy:[{userId:"asc"},{authorizationVersion:"asc"}]}));
  async function fixture(id:string,executionType:"INTERNAL"|"EXTERNAL"="EXTERNAL") {
    await db.project.create({data:{id,name:id,ownerId:"spm",createdById:"spm",executionType,coOwners:{create:{userId:"jpm",addedById:"director"}},executors:{create:{userId:"designer",addedById:"spm"}},workflowStages:{create:PROJECT_WORKFLOW_STAGE_DEFINITIONS.map(stage=>({stageKey:stage.key,status:stage.number===7?"AVAILABLE":"COMPLETED",unlockedAt:new Date(),completedAt:stage.number===7?null:new Date()}))},stages:{create:{id:`${id}-stage`,name:"Final native task",order:1,status:"COMPLETED"}}}});
    await db.projectAttachment.create({data:{id:`${id}-file`,projectId:id,stageId:`${id}-stage`,uploadedById:"spm",fileName:"proof.pdf",originalFileName:"proof.pdf",mimeType:"application/pdf",fileSize:1,bucket:"fixture-no-network",storageKey:`fixture/${id}`,assetType:"STAGE_SUBMISSION",submissionReviewStatus:"APPROVED",status:"READY"}});
    await db.projectStageFileHandoff.create({data:{id:`${id}-handoff`,projectId:id,sourceWorkflowStageKey:"PROJECT_DEVELOPMENT",targetWorkflowStageKey:"FINAL_LAYOUT",sourceAttachmentId:`${id}-file`,handedOffById:"spm"}});
    await db.projectFileChecklist.create({data:{id:`${id}-checklist`,projectId:id,handoffId:`${id}-handoff`,sourceAttachmentId:`${id}-file`}});
    await db.projectProductionUnit.create({data:{id:`${id}-unit`,projectId:id,sourceHandoffId:`${id}-handoff`,sourceChecklistId:`${id}-checklist`,sourceAttachmentId:`${id}-file`,createdById:"spm",status:"HANDOVER_READY",supervision:{create:{projectId:id,status:"SIGNED_OFF",signedOffById:"director",signedOffAt:new Date()}}}});
    objects.set(`fixture/${id}`,{ContentLength:1,ContentType:"application/pdf",ETag:`source-${id}`});
    return {kind:"ARTWORK" as const,projectId:id};
  }
  const target=await fixture("documents-main"), other=await fixture("documents-other");
  const director=await user("director"), spm=await user("spm");
  const wrongOrigin=await api.POST(new Request("http://internal-server/reviews",{method:"POST",headers:{origin:"https://unrelated.example.invalid","Content-Type":"application/json"},body:JSON.stringify({command:"REVOKE",projectId:target.projectId,accessId:"none"})}));assert.equal(wrongOrigin.status,403);
  const configuredOrigin=await api.POST(new Request("http://internal-server/reviews",{method:"POST",headers:{origin:"http://localhost:3000","Content-Type":"application/json"},body:JSON.stringify({command:"INVALID",projectId:target.projectId})}));assert.equal(configuredOrigin.status,400);assert.equal((await configuredOrigin.json()).error,"Invalid completion document command.");

  const initial=await docs.getProjectCompletionWorkflowForUser(spm,target.projectId);assert.ok(initial?.needsInitialConfiguration);assert.equal(await db.projectCompletionWorkflow.count(),0,"Viewing does not create records");
  for(const id of ["designer","digital","tech","outsider","unassigned"]){const actor=await user(id);await denied(()=>docs.getProjectCompletionWorkflowForUser(actor,target.projectId));await denied(()=>docs.configureProjectCompletionWorkflow(actor,{projectId:target.projectId,approvalRequired:false,copyrightRequired:false,invoiceRequired:false}));const response=await api.GET(new Request(`http://localhost/reviews?projectId=${target.projectId}`));assert.equal(response.status,403);}
  await user("spm");await denied(()=>docs.configureProjectCompletionWorkflow({...spm,id:"director"},{projectId:target.projectId,approvalRequired:false,copyrightRequired:false,invoiceRequired:false}));
  await docs.configureProjectCompletionWorkflow(spm,{projectId:target.projectId,approvalRequired:true,copyrightRequired:true,invoiceRequired:true});
  await user("director");await denied(()=>governance.finalizeProjectAsDirector(director,target,"Cannot waive missing documents"));
  const jpm=await user("jpm");await docs.prepareAuthorityApprovalRequest(jpm,{projectId:target.projectId,contactUserId:"spm",selectedProjectFileIds:[`${target.projectId}-file`],note:"Review final work"});
  const requestBefore=await db.projectCompletionWorkflow.findUniqueOrThrow({where:{projectId:target.projectId}}),eventsBefore=await db.completionDocumentEvent.count();
  await docs.prepareAuthorityApprovalRequest(jpm,{projectId:target.projectId,contactUserId:"spm",selectedProjectFileIds:[`${target.projectId}-file`],note:"Review final work"});
  assert.deepEqual(await db.projectCompletionWorkflow.findUniqueOrThrow({where:{projectId:target.projectId}}),requestBefore);assert.equal(await db.completionDocumentEvent.count(),eventsBefore);
  await denied(()=>docs.prepareAuthorityApprovalRequest(jpm,{projectId:target.projectId,contactUserId:"designer",selectedProjectFileIds:[`${target.projectId}-file`]}));
  await denied(()=>docs.prepareAuthorityApprovalRequest(jpm,{projectId:target.projectId,contactUserId:"spm",selectedProjectFileIds:[`${other.projectId}-file`]}));
  console.log("PASS documents: read-only initialization, scoped SPM/JPM management, Director global access, restricted/technical/forged actor denial, selected-file association.");
  const metadata={projectId:target.projectId,documentType:"AUTHORITY_APPROVAL_PROOF" as const,originalFileName:"approval.pdf",mimeType:"application/pdf",fileSize:42};
  await user("spm");
  const staleTicket=await docs.requestProjectCompletionDocumentUpload(spm,metadata);objects.set(staleTicket.storageKey,{ContentLength:42,ContentType:"application/pdf",ETag:"stale-ticket"});
  await docs.prepareAuthorityApprovalRequest(spm,{projectId:target.projectId,contactUserId:"spm",selectedProjectFileIds:[`${target.projectId}-file`],note:"Revised request"});
  await denied(()=>docs.finalizeProjectCompletionDocumentUpload(spm,{...metadata,storageKey:staleTicket.storageKey}));
  const upload=await docs.requestProjectCompletionDocumentUpload(spm,metadata);
  await denied(()=>docs.finalizeProjectCompletionDocumentUpload(spm,{...metadata,storageKey:upload.storageKey}));
  objects.set(upload.storageKey,{ContentLength:41,ContentType:"application/pdf",ETag:"bad-size"});
  await denied(()=>docs.finalizeProjectCompletionDocumentUpload(spm,{...metadata,storageKey:upload.storageKey}));
  objects.set(upload.storageKey,{ContentLength:42,ContentType:"application/pdf",ETag:"approval-v1"});
  await denied(()=>docs.finalizeProjectCompletionDocumentUpload(spm,{...metadata,fileSize:43,storageKey:upload.storageKey}));
  await denied(()=>docs.finalizeProjectCompletionDocumentUpload(spm,{...metadata,projectId:other.projectId,storageKey:upload.storageKey}));
  await user("jpm");await denied(()=>docs.finalizeProjectCompletionDocumentUpload(jpm,{...metadata,storageKey:upload.storageKey}));
  await user("spm");await docs.finalizeProjectCompletionDocumentUpload(spm,{...metadata,storageKey:upload.storageKey});await docs.finalizeProjectCompletionDocumentUpload(spm,{...metadata,storageKey:upload.storageKey});
  const submitted=await db.completionDocumentSubmission.findUniqueOrThrow({where:{uploadKey:upload.storageKey}});
  assert.equal(submitted.status,"SUBMITTED");assert.equal(await db.completionDocumentEvent.count({where:{submissionId:submitted.id,action:"DOCUMENT_SUBMITTED"}}),1);
  assert.equal((await db.projectCompletionWorkflow.findUniqueOrThrow({where:{projectId:target.projectId}})).approvalStatus,"PENDING");
  await user("director");await denied(()=>seven.closeStageSevenProject(director,{projectId:target.projectId}));
  await reviews.reviewCompletionDocument(director,{projectId:target.projectId,submissionId:submitted.id,decision:"REJECT",reason:"Approval is unsigned"});
  await user("spm");await denied(()=>docs.finalizeProjectCompletionDocumentUpload(spm,{...metadata,storageKey:upload.storageKey}));
  const second=await docs.requestProjectCompletionDocumentUpload(spm,metadata);objects.set(second.storageKey,{ContentLength:42,ContentType:"application/pdf",ETag:"approval-v2"});await docs.finalizeProjectCompletionDocumentUpload(spm,{...metadata,storageKey:second.storageKey});
  const approved=await db.completionDocumentSubmission.findUniqueOrThrow({where:{uploadKey:second.storageKey}});
  const decision={projectId:target.projectId,submissionId:approved.id,decision:"ACCEPT" as const,reason:"Signed authority proof checked"};
  for(const id of ["designer","digital","tech","outsider"]){const actor=await user(id);await denied(()=>reviews.reviewCompletionDocument(actor,decision));await denied(()=>reviews.getCompletionSubmissionDownload(actor,approved.id));}
  await user("jpm");await denied(()=>reviews.reviewCompletionDocument(jpm,{...decision,projectId:other.projectId}));
  objects.set(`fixture/${target.projectId}`,{ContentLength:1,ContentType:"application/pdf",ETag:"changed-source-bytes"});await denied(()=>reviews.reviewCompletionDocument(jpm,decision));objects.set(`fixture/${target.projectId}`,{ContentLength:1,ContentType:"application/pdf",ETag:`source-${target.projectId}`});
  const concurrent=await Promise.allSettled([reviews.reviewCompletionDocument(jpm,decision),reviews.reviewCompletionDocument(jpm,decision)]);assert.ok(concurrent.some(r=>r.status==="fulfilled"));
  await reviews.reviewCompletionDocument(jpm,decision);
  assert.equal(await db.projectCompletionDocument.count({where:{submissionId:approved.id}}),1);assert.equal(await db.completionDocumentEvent.count({where:{submissionId:approved.id,action:"DOCUMENT_ACCEPTED"}}),1);
  const doc=await db.projectCompletionDocument.findFirstOrThrow({where:{submissionId:approved.id}});assert.equal(doc.uploadedById,"spm");assert.equal((await db.completionDocumentSubmission.findUniqueOrThrow({where:{id:approved.id}})).reviewedById,"jpm");
  objects.set(second.storageKey,{ContentLength:999,ContentType:"application/pdf",ETag:"replayed-put"});assert.equal(objects.get(approved.storageKey)?.ETag,"approval-v2");
  await assert.rejects(db.projectCompletionDocument.update({where:{id:doc.id},data:{storageKey:"rewrite"}}));await assert.rejects(db.completionDocumentSubmission.update({where:{id:approved.id},data:{reviewReason:"rewrite"}}));await assert.rejects(db.completionDocumentEvent.deleteMany({where:{projectId:target.projectId}}));
  console.log("PASS documents: verified object metadata, exact upload/actor/project binding, sealed evidence, pending review, rejection/resubmission, concurrent/idempotent review, immutable attribution/history.");
  await docs.prepareCopyrightTransferRequest(jpm,{projectId:target.projectId,contactUserId:"spm",note:"Signed copyright required"});
  const access=await reviews.issueCompletionDocumentAccess(jpm,{projectId:target.projectId,type:"COPYRIGHT_TRANSFER",recipientEmail:"external@example.invalid"});const bearer=access.path.split("#")[1];
  const externalMetadata={originalFileName:"copyright.pdf",mimeType:"application/pdf",fileSize:12};
  const expiredToken=randomBytes(32).toString("base64url"), activeAccess=await db.completionDocumentAccess.findUniqueOrThrow({where:{id:access.accessId}});
  await db.$transaction(async tx=>{await tx.$queryRaw`SELECT set_config('flux.completion_actor','jpm',true)`;await tx.completionDocumentAccess.create({data:{projectId:activeAccess.projectId,workflowId:activeAccess.workflowId,type:activeAccess.type,requestTime:activeAccess.requestTime,issuedById:"jpm",recipientEmail:"expired@example.invalid",tokenHash:createHash("sha256").update(expiredToken).digest("hex"),createdAt:new Date(Date.now()-3600000),expiresAt:new Date(Date.now()-1000)}});});
  await denied(()=>reviews.externalCompletionSubmission(expiredToken,"INFO"));
  await denied(()=>reviews.externalCompletionSubmission(expiredToken,"PREPARE",externalMetadata));
  const externalTarget=await reviews.externalCompletionSubmission(bearer,"PREPARE",externalMetadata);assert.ok("storageKey" in externalTarget);if(!("storageKey" in externalTarget))throw new Error("Missing ticket");
  const externalTicket=await db.completionDocumentSubmission.findUniqueOrThrow({where:{uploadKey:externalTarget.storageKey}});assert.equal(externalTicket.submittedById,null);assert.equal(externalTicket.externalSubmitterEmail,"external@example.invalid");
  objects.set(externalTarget.storageKey,{ContentLength:12,ContentType:"application/pdf",ETag:"external-copyright"});
  await denied(()=>reviews.externalCompletionSubmission("bad-token","PREPARE",externalMetadata));
  const invalidHttp=await externalApi.POST(new Request("http://localhost/external",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer invalid"},body:JSON.stringify({command:"PREPARE",...externalMetadata})}));assert.equal(invalidHttp.status,400);
  const replacement=await reviews.issueCompletionDocumentAccess(jpm,{projectId:target.projectId,type:"COPYRIGHT_TRANSFER",recipientEmail:"replacement@example.invalid"});
  await denied(()=>reviews.externalCompletionSubmission(bearer,"FINISH",{...externalMetadata,storageKey:externalTarget.storageKey}));
  const replacementBearer=replacement.path.split("#")[1];await denied(()=>reviews.externalCompletionSubmission(replacementBearer,"FINISH",{...externalMetadata,storageKey:externalTarget.storageKey}));
  const newTarget=await reviews.externalCompletionSubmission(replacementBearer,"PREPARE",externalMetadata);if(!("storageKey" in newTarget))throw new Error("Missing ticket");objects.set(newTarget.storageKey,{ContentLength:12,ContentType:"application/pdf",ETag:"external-v2"});
  await reviews.externalCompletionSubmission(replacementBearer,"FINISH",{...externalMetadata,storageKey:newTarget.storageKey});await reviews.externalCompletionSubmission(replacementBearer,"FINISH",{...externalMetadata,storageKey:newTarget.storageKey});
  const externalSubmission=await db.completionDocumentSubmission.findUniqueOrThrow({where:{uploadKey:newTarget.storageKey}});
  await reviews.reviewCompletionDocument(jpm,{projectId:target.projectId,submissionId:externalSubmission.id,decision:"ACCEPT",reason:"Signed transfer checked"});
  const externalDocument=await db.projectCompletionDocument.findFirstOrThrow({where:{submissionId:externalSubmission.id}});assert.equal(externalDocument.uploadedById,null);assert.equal(externalDocument.externalSubmitterEmail,"replacement@example.invalid");
  assert.equal(await db.completionDocumentEvent.count({where:{submissionId:externalSubmission.id,action:"DOCUMENT_SUBMITTED",actorId:null,externalActorEmail:"replacement@example.invalid"}}),1);
  await denied(()=>reviews.externalCompletionSubmission(replacementBearer,"PREPARE",externalMetadata));
  await reviews.revokeCompletionDocumentAccess(jpm,{projectId:target.projectId,accessId:replacement.accessId});await reviews.revokeCompletionDocumentAccess(jpm,{projectId:target.projectId,accessId:replacement.accessId});
  await denied(()=>reviews.externalCompletionSubmission(replacementBearer,"INFO"));
  console.log("PASS documents: scoped external bearer, token replacement/revocation, cross-token denial, single submission, real external-recipient attribution and manager acceptance; no email or S3 network calls.");
  await docs.requestProjectFinalInvoice(jpm,{projectId:target.projectId,contactUserId:"spm"});await denied(()=>docs.markProjectInvoiceNotRequired(jpm,{projectId:target.projectId}));
  const invoiceMeta={...metadata,documentType:"INVOICE" as const,originalFileName:"invoice.pdf"};const invoice=await docs.requestProjectCompletionDocumentUpload(jpm,invoiceMeta);objects.set(invoice.storageKey,{ContentLength:42,ContentType:"application/pdf",ETag:"invoice"});await docs.finalizeProjectCompletionDocumentUpload(jpm,{...invoiceMeta,storageKey:invoice.storageKey});const inv=await db.completionDocumentSubmission.findUniqueOrThrow({where:{uploadKey:invoice.storageKey}});
  await reviews.reviewCompletionDocument(jpm,{projectId:target.projectId,submissionId:inv.id,decision:"ACCEPT",reason:"Final invoice checked"});
  await user("spm");const pending=await governance.requestProjectCompletion(spm,target,"Owner reviewed mandatory documentation");const pendingRow=await db.projectFinalCompletionRequest.findUniqueOrThrow({where:{id:pending.requestId}});
  await user("jpm");await denied(()=>governance.requestProjectCompletion(jpm,target,"Co-owner cannot replace owner request"));await denied(()=>seven.closeStageSevenProject(jpm,{projectId:target.projectId}));
  await reviews.reopenCompletionDocument(jpm,{projectId:target.projectId,type:"INVOICE",reason:"Correct the invoice reference"});assert.equal(await db.projectCompletionDocument.count({where:{projectId:target.projectId}}),3,"Reopening preserves accepted evidence");
  await user("director");await denied(()=>governance.decideProjectCompletion(director,{requestId:pendingRow.id,snapshotHash:pendingRow.snapshotHash,decision:"APPROVE",reason:"Cannot reuse stale approval"}));await governance.decideProjectCompletion(director,{requestId:pendingRow.id,snapshotHash:pendingRow.snapshotHash,decision:"REJECT",reason:"Invoice requires revision"});
  await user("spm");await docs.requestProjectFinalInvoice(spm,{projectId:target.projectId,contactUserId:"spm"});const revised=await docs.requestProjectCompletionDocumentUpload(spm,invoiceMeta);objects.set(revised.storageKey,{ContentLength:42,ContentType:"application/pdf",ETag:"invoice-v2"});await docs.finalizeProjectCompletionDocumentUpload(spm,{...invoiceMeta,storageKey:revised.storageKey});const revisedRow=await db.completionDocumentSubmission.findUniqueOrThrow({where:{uploadKey:revised.storageKey}});await reviews.reviewCompletionDocument(spm,{projectId:target.projectId,submissionId:revisedRow.id,decision:"ACCEPT",reason:"Corrected invoice checked"});
  const final=await governance.requestProjectCompletion(spm,target,"Revised documentation ready");const finalRow=await db.projectFinalCompletionRequest.findUniqueOrThrow({where:{id:final.requestId}});
  await user("director");objects.delete(revisedRow.storageKey);await denied(()=>governance.decideProjectCompletion(director,{requestId:finalRow.id,snapshotHash:finalRow.snapshotHash,decision:"APPROVE",reason:"Missing object cannot pass"}));objects.set(revisedRow.storageKey,{ContentLength:42,ContentType:"application/pdf",ETag:"invoice-v2"});
  await governance.decideProjectCompletion(director,{requestId:finalRow.id,snapshotHash:finalRow.snapshotHash,decision:"APPROVE",reason:"Director verified all mandatory evidence"});
  const closed=await db.project.findUniqueOrThrow({where:{id:target.projectId},include:{closure:true,workflowStages:true}});assert.ok(closed.completedAt);assert.equal(closed.archivedAt,null);assert.equal(closed.ownerId,"spm");assert.equal(closed.closure?.closedById,"director");assert.equal(closed.workflowStages.find(s=>s.stageKey==="IMPLEMENTATION_AND_SUPERVISION")?.status,"COMPLETED");assert.equal(await db.projectCompletionDocument.count({where:{projectId:target.projectId}}),4);
  await denied(()=>reviews.reopenCompletionDocument(director,{projectId:target.projectId,type:"INVOICE",reason:"Completed project is immutable"}));
  const productionOnly=await fixture("documents-production-only");
  await db.projectAttachment.update({where:{id:`${productionOnly.projectId}-file`},data:{stageId:null,assetType:"GENERAL_PROJECT_ASSET"}});await db.projectStage.delete({where:{id:`${productionOnly.projectId}-stage`}});
  await docs.configureProjectCompletionWorkflow(director,{projectId:productionOnly.projectId,approvalRequired:true,copyrightRequired:false,invoiceRequired:false});
  const productionView=await docs.getProjectCompletionWorkflowForUser(director,productionOnly.projectId);assert.ok(productionView?.finalArchivedFiles.some(file=>file.id===`${productionOnly.projectId}-file`));
  await docs.prepareAuthorityApprovalRequest(director,{projectId:productionOnly.projectId,contactUserId:"spm",selectedProjectFileIds:[`${productionOnly.projectId}-file`]});
  const internal=await fixture("documents-internal","INTERNAL");await docs.configureProjectCompletionWorkflow(director,{projectId:internal.projectId,approvalRequired:false,copyrightRequired:false,invoiceRequired:true});assert.equal((await docs.getProjectCompletionWorkflowForUser(director,internal.projectId))?.invoiceRequired,true);await denied(()=>governance.finalizeProjectAsDirector(director,internal,"Internal configured requirement cannot be waived"));
  assert.equal(JSON.stringify(await db.userAuthorization.findMany({orderBy:{userId:"asc"},include:{user:{select:{email:true,passwordHash:true,role:true}}}})),roleSnapshot);assert.equal(JSON.stringify(await db.userAuthorizationChange.findMany({orderBy:[{userId:"asc"},{authorizationVersion:"asc"}]})),roleHistory);assert.equal(await db.user.count(),9);
  console.log("PASS documents: required invoices cannot be skipped; audited revisions preserve versions and invalidate completion snapshots; actual Owner request, Director-only finalization, live object verification, Stage 7 closure, INTERNAL requirements honored, nine fixture roles unchanged.");
  if (sharedFiles) {
    const { verifySharedFiles } = localRequire(join(compiledRoot,"scripts/file-identity-integration-check.js")) as typeof import("./file-identity-integration-check");
    await verifySharedFiles({ db, objects, storageCalls, user, fixture, load: (name: string) => localRequire(join(compiledRoot, name)) });
  } else {
    assert.equal(await db.sharedFile.count(), 0, "Default-off workflow does not adopt historical/new files");
  }
  if (process.env.FLUX_APPROVAL_TEST === "1") {
    const { verifyApprovalEngine } = localRequire(join(compiledRoot,"scripts/approval-engine-integration-check.js")) as typeof import("./approval-engine-integration-check");
    await verifyApprovalEngine({ db, objects, user, fixture, load: (name: string) => localRequire(join(compiledRoot, name)),
      renewSession: async (id: string) => { const assignment = await db.userAuthorization.findUniqueOrThrow({ where: { userId: id } });
        const value = createVersionedSessionToken(assignment.authorizationVersion); tokens.set(id, value);
        await db.session.create({ data: { userId: id, token: value, expiresAt: new Date(Date.now() + 3600000) } }); return user(id); } });
  }

 } finally { moduleApi._load=original; }
}
main().then(()=>console.log("PASS Phase 1.5E completion document integration on disposable PostgreSQL.")).finally(()=>db.$disconnect()).catch(error=>{console.error(error);process.exitCode=1;});
