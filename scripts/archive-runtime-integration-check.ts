import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";
import type { RuntimeArchiveCommand } from "../src/lib/archive-runtime/contracts";
type Harness = { db: PrismaClient; user: (id: string) => Promise<NonNullable<Awaited<ReturnType<typeof import("../src/lib/auth").getCurrentUser>>>>; require: NodeRequire; compiledRoot: string; seedObject: (key: string) => unknown };
export async function runRuntimeArchiveChecks(h: Harness) {
  const {db,user,seedObject} = h, load = (path: string) => h.require(join(h.compiledRoot,path));
  const drafts = load("src/lib/stage-builder/service.js") as typeof import("../src/lib/stage-builder/service");
  const workflows = load("src/lib/stage-builder/publication.js") as typeof import("../src/lib/stage-builder/publication");
  const runtime = load("src/lib/stage-runtime/service.js") as typeof import("../src/lib/stage-runtime/service");
  const completion = load("src/lib/runtime-completion/service.js") as typeof import("../src/lib/runtime-completion/service");
  const tasks = load("src/lib/tasker/service.js") as typeof import("../src/lib/tasker/service");
  const service = load("src/lib/archive-runtime/service.js") as typeof import("../src/lib/archive-runtime/service");
  const archives = load("src/lib/archives.js") as typeof import("../src/lib/archives");
  const folders = load("src/lib/archive-folders/service.js") as typeof import("../src/lib/archive-folders/service");
  const access = load("src/lib/archive-sharing/service.js") as typeof import("../src/lib/archive-sharing/service");
  const review = load("src/lib/archive-verification/service.js") as typeof import("../src/lib/archive-verification/service");
  const files = load("src/lib/files/access.js") as typeof import("../src/lib/files/access");
  const events = load("src/lib/events/contracts.js") as typeof import("../src/lib/events/contracts");
  for(const flag of ["SHARED_FILE_IDENTITY","APPROVAL_ENGINE","SHARED_EVENTS","UNIVERSAL_TASKER","TASKER_DELIVERABLES","TASKER_CONCEPTS","TASKER_SISTERS","STAGE_BUILDER_DRAFTS","STAGE_BUILDER_PUBLICATION","STAGE_RUNTIME","RUNTIME_INTEGRATION","ARCHIVE_FOLDERS","ARCHIVE_VERIFICATION","ARCHIVE_SHARING","ARCHIVE_RUNTIME"])process.env[`FLUX_${flag}`]="1";
  let denials=0;
  const denied=async(fn:()=>Promise<unknown>)=>{await assert.rejects(fn,e=>{if(e instanceof TypeError || e instanceof ReferenceError || e instanceof assert.AssertionError)throw e;return true;});denials++;};
  const director=await user("director");
  const definition: import("../src/lib/stage-builder/contracts").WorkflowDefinition={schemaVersion:1,name:"Archive runtime fixture",description:"Non-sensitive artwork outputs",intendedProjectType:"CUSTOM",stages:[{id:"artwork",title:"Artwork outputs",description:"Synthetic output review",position:0,gates:[],capabilities:[
    {id:"accepted",type:"FILE_REQUIREMENT",title:"Reviewed artwork",instructions:"Synthetic non-sensitive artwork",acceptedTypes:["application/pdf"],minFiles:1,maxFiles:3,required:true,acceptance:"REVIEWER",acceptedVersionsGate:true},
    {id:"sealed",type:"FILE_REQUIREMENT",title:"Sealed artwork",instructions:"No separate review configured",acceptedTypes:["application/pdf"],minFiles:1,maxFiles:2,required:true,acceptance:"NONE",acceptedVersionsGate:false},
  ]}]};
  const draft=await drafts.createDraft({commandId:randomUUID(),definition});
  const proposal=await workflows.submitWorkflowDraft(draft.workflowId,{commandId:randomUUID(),expectedRevision:draft.revision,configurationHash:draft.configurationHash,changeSummary:"Reviewed isolated artwork workflow"});
  const approval=await workflows.decideWorkflowPublication(proposal.id,{expected:{...proposal.expected,commandId:randomUUID()},configurationHash:proposal.configurationHash,confirmed:true,outcome:"APPROVE",reason:"Independent published workflow"});
  const pv=await db.publishedWorkflowVersion.findUniqueOrThrow({where:{id:approval.publishedVersion!.id}});
  const create=()=>runtime.createRuntimeProject({commandId:randomUUID(),publishedVersionId:pv.id,definitionHash:pv.configurationHash,title:"Completed Archive artwork",description:"Synthetic only",ownerId:"spm",coOwnerIds:[],executorIds:[]});
  const {projectId}=await create(), active=await create();
  await denied(()=>service.readRuntimeArchivePublication(director,projectId));
  const stage=await db.runtimeStage.findFirstOrThrow({where:{projectId}});
  const command=async(action:string,extra={})=>runtime.runtimeStageCommand(projectId,stage.id,{commandId:randomUUID(),expectedRevision:(await db.runtimeStage.findUniqueOrThrow({where:{id:stage.id}})).revision,action,...extra});
  for(const [name,capabilityId] of [["runtime-accepted.pdf","accepted"],["runtime-second.pdf","accepted"],["runtime-sealed.pdf","sealed"]]) {
    await user("spm");const uploaded=await command("UPLOAD_PREPARED",{capabilityId,fileName:name,mimeType:"application/pdf",fileSize:100,supersedesId:null}) as {submissionId:string};
    let s=await db.runtimeFileSubmission.findUniqueOrThrow({where:{id:uploaded.submissionId}});seedObject(s.stagingKey);
    await command("FILE_SUBMITTED",{submissionId:s.id});
    if(name==="runtime-accepted.pdf") {
      await user("director");await command("FILE_DECIDED",{submissionId:s.id,outcome:"REJECT",reason:"Synthetic rejected historical version"});
      await user("spm");
      for(const fail of [true,false]) {
        const next=await command("UPLOAD_PREPARED",{capabilityId,fileName:name,mimeType:"application/pdf",fileSize:100,supersedesId:s.id}) as {submissionId:string};
        s=await db.runtimeFileSubmission.findUniqueOrThrow({where:{id:next.submissionId}});
        if(!fail)seedObject(s.stagingKey);
        await command("FILE_SUBMITTED",{submissionId:s.id});
        assert.equal((await db.runtimeFileSubmission.findUniqueOrThrow({where:{id:s.id}})).state,fail?"FAILED":"SUBMITTED");
      }
    }
    if(capabilityId==="accepted"){await user("director");await command("FILE_DECIDED",{submissionId:s.id,outcome:"APPROVE",reason:"Exact artwork review"});}
  }
  // A genuine Tasker deliverable is accepted into the stage and final completion,
  // but its lineage must still exclude it and its private conversation from Archive.
  await user("spm");
  const task=await tasks.createTask({commandId:randomUUID(),contextTarget:`runtime:${projectId}`,type:"FILE_UPLOAD",destination:`runtime-file:${stage.id}:sealed`,inputMode:"FILE",title:"Private Tasker evidence",brief:"Protected task context",deadline:"2026-11-20T12:00:00Z",priority:"NORMAL",executorId:"designer",spectatorIds:[]});
  const taskCommand=async(action:string,extra={})=>tasks.mutateTask(task.id,{commandId:randomUUID(),expectedVersion:(await tasks.getTask(task.id)).version,action,text:"Private task reason",...extra});
  await user("designer");
  const prepared=await taskCommand("PREPARE_UPLOAD",{fileName:"private-tasker.pdf",mimeType:"application/pdf",fileSize:100});
  const upload=await db.universalTaskUpload.findUniqueOrThrow({where:{id:prepared.uploadId}});seedObject(upload.stagingKey);
  await taskCommand("FINALIZE_UPLOAD",{uploadId:upload.id});await taskCommand("MESSAGE",{text:"Private conversation must never become an Archive file"});
  await taskCommand("SUBMIT",{fileIds:[upload.id]});await taskCommand("REQUEST_COMPLETION");
  await user("spm");await taskCommand("APPROVE");
  const taskBinding=await db.runtimeTaskPublication.findFirstOrThrow({where:{submission:{stageId:stage.id}}});
  await user("spm");await command("COMPLETED",{reason:"Stage output completed"});
  await user("director");await denied(()=>service.readRuntimeArchivePublication(director,projectId));
  const completionCommand=async(action:string,extra={})=>{const v=await completion.getRuntimeCompletion(projectId);return completion.runtimeCompletionCommand(projectId,{commandId:randomUUID(),expectedRevision:v.revision,expectedProjectRevision:v.projectRevision,expectedPolicyRevision:v.policyRevision,action,...extra});};
  await completionCommand("POLICY_APPROVED",{settings:{AUTHORITY_APPROVAL_PROOF:"NOT_APPLICABLE",COPYRIGHT_TRANSFER:"OPTIONAL",INVOICE:"OPTIONAL"},reason:"No required documents for synthetic artwork",confirmed:true});
  await user("spm");
  // Genuine sensitive completion document, kept outside the Archive manifest.
  const doc=await completionCommand("UPLOAD_PREPARED",{category:"INVOICE",fileName:"private-invoice.pdf",mimeType:"application/pdf",fileSize:100});
  const docRow=await db.runtimeDocumentSubmission.findUniqueOrThrow({where:{id:String(doc.submissionId)}});seedObject(docRow.stagingKey);
  await completionCommand("DOCUMENT_SUBMITTED",{submissionId:docRow.id});
  await completionCommand("COMPLETION_REQUESTED",{reason:"Actual Owner requests final completion",confirmed:true});
  await user("director");const pending=(await completion.getRuntimeCompletion(projectId)).requests.find(r=>r.state==="PENDING")!;
  await completionCommand("COMPLETION_DECIDED",{requestId:pending.id,requestHash:pending.hash,outcome:"APPROVE",reason:"Actual Director final approval",confirmed:true});
  assert.equal((await db.runtimeProject.findUniqueOrThrow({where:{id:projectId}})).state,"COMPLETED");
  const native=JSON.stringify([await db.project.findMany({orderBy:{id:"asc"}}),await db.projectArchive.findMany({orderBy:{id:"asc"}}),await db.manualArchiveFile.findMany({orderBy:{id:"asc"}})]);
  const source=async()=>JSON.stringify([await db.runtimeProject.findMany({orderBy:{id:"asc"}}),await db.runtimeStage.findMany({orderBy:{id:"asc"}}),await db.runtimeFileSubmission.findMany({orderBy:{id:"asc"}}),await db.runtimeCompletionDecision.findMany({orderBy:{id:"asc"}}),await db.runtimeCompletionRequest.findMany({orderBy:{id:"asc"}}),await db.runtimeDocumentSubmission.findMany({orderBy:{id:"asc"}}),await db.sharedFileVersion.findMany({orderBy:{id:"asc"}}),await db.sharedFileReference.findMany({orderBy:{id:"asc"}}),await db.sharedFileProvenance.findMany({orderBy:{id:"asc"}})]);
  const preserved=await source();
  const view=await service.readRuntimeArchivePublication(director,projectId);assert.equal(view.files.filter(f=>f.eligible).length,3);assert.ok(view.exclusions.some(e=>e.includes("invoices")));assert.ok(!JSON.stringify(view.files).includes("private-invoice"));
  const eligible=view.files.filter(f=>f.eligible);
  assert.equal(view.files.find(f=>f.submissionId===taskBinding.submissionId)?.eligible,false);
  assert.equal(view.files.filter(f=>["REJECTED","FAILED"].includes(f.state)).length,2);
  for(const role of ["spm","jpm","designer","digital","tech","unassigned"]){const actor=await user(role);await denied(()=>service.readRuntimeArchivePublication(actor,projectId));}
  await user("director");
  const folder=await folders.organizeArchive(director,{commandId:randomUUID(),categoryId:"open",action:"create",name:"Runtime artwork",description:"",icon:"folder",parentId:null});
  const makeCommand=(selected=eligible.slice(0,2)):RuntimeArchiveCommand=>({commandId:randomUUID(),reason:"Explicit non-sensitive artwork publication",confirmed:true,manifest:{projectId,finalDecisionId:view.finalDecision.id,publishedVersionId:view.project.publishedVersionId,categoryId:"open",folderId:folder.id,nonSensitiveConfirmed:true,files:selected.map(f=>({submissionId:f.submissionId,referenceId:f.referenceId!,versionId:f.versionId}))}});
  const publish=makeCommand();
  for(const excluded of view.files.filter(f=>!f.eligible))await denied(()=>service.publishRuntimeArchive(director,makeCommand([excluded])));
  for(const invalid of [{...publish,confirmed:false},{...publish,reason:" "},{...publish,manifest:{...publish.manifest,nonSensitiveConfirmed:false}},{...publish,manifest:{...publish.manifest,files:[]}},{...publish,manifest:{...publish.manifest,files:[{submissionId:upload.id,referenceId:"private-conversation",versionId:upload.versionId}]}}])await denied(()=>service.publishRuntimeArchive(director,invalid));
  for(const manifest of [{...publish.manifest,projectId:active.projectId},{...publish.manifest,finalDecisionId:"forged"},{...publish.manifest,categoryId:"missing"},{...publish.manifest,publishedVersionId:"wrong"},{...publish.manifest,files:[{...publish.manifest.files[0],versionId:docRow.versionId}]},{...publish.manifest,files:[{...publish.manifest.files[0],referenceId:"wrong"}]}])await denied(()=>service.publishRuntimeArchive(director,{...publish,manifest}));
  const result=await service.publishRuntimeArchive(director,publish);assert.deepEqual(await service.publishRuntimeArchive(director,publish),result);
  const spm=await user("spm");await denied(()=>service.publishRuntimeArchive(spm,publish));await user("director");
  await denied(()=>service.publishRuntimeArchive({...director,id:"spm"},publish));
  await denied(()=>service.publishRuntimeArchive(director,{...publish,reason:"Changed command"}));
  await denied(()=>service.publishRuntimeArchive(director,{...publish,commandId:randomUUID()}));
  let archived=await db.runtimeArchiveFile.findMany({where:{publicationId:result.publicationId},orderBy:{id:"asc"}});assert.equal(archived.length,2);
  assert.deepEqual(new Set(archived.map(f=>f.versionId)),new Set(publish.manifest.files.map(f=>f.versionId)));
  assert.equal((await folders.readArchiveFolder(director,{categoryId:"open",folderId:folder.id})).total,2);
  const categories=load("src/lib/archive-categories.js") as typeof import("../src/lib/archive-categories");
  const category=(await categories.getArchiveCategoryBySlug("open"))!;
  assert.equal((await archives.listArchivedFilesByCategory(director,category)).filter(f=>f.recordType==="RUNTIME_ARCHIVE_FILE").length,2);
  assert.ok((await archives.searchArchivesForUser({user:director,query:"runtime-"})).results.some(r=>r.recordType==="RUNTIME_ARCHIVE_FILE"));
  await denied(()=>db.manualArchiveFile.create({data:{id:archived[0].id,archiveCategoryId:"open",fileName:"collision.pdf",originalFileName:"collision.pdf",mimeType:"application/pdf",fileSize:100,bucket:"fixture-no-network",storageKey:"collision",status:"READY",uploadedById:"director"}}));
  const a=archived[0], b=archived[1], sourceA={sourceKind:"runtime" as const,sourceId:a.id,categoryId:"open"};
  assert.equal((await review.readArchiveVerification(director,sourceA)).status,"NOT VERIFIED");
  const opened=await files.openSharedFileVersion({kind:"runtime-archive-file",id:a.id},a.versionId);assert.equal((await new Response(opened.body.transformToWebStream()).arrayBuffer()).byteLength,100);
  await denied(()=>files.openSharedFileVersion({kind:"runtime-archive-file",id:a.id},b.versionId));
  const grant=async(recipientId:string)=>{const v=await access.readArchiveAccess(director,a.id,recipientId),u=v.users.find(u=>u.id===recipientId)!;return access.decideArchiveAccess(director,{commandId:randomUUID(),sourceKind:"runtime",sourceId:a.id,categoryId:"open",referenceId:a.referenceId,versionId:a.versionId,recipientId,action:"GRANT",reason:"Exact artwork access",confirmed:true,expiresAt:null,expectedRevision:u.revision,expectedDecisionId:u.decisionId,expectedGrantId:null});};
  await grant("designer");await grant("digital");
  const nativeGrant=await db.archiveGrantScope.findFirstOrThrow({where:{decision:{sourceKind:"runtime",sourceId:a.id,recipientId:"designer"}}});
  await denied(()=>db.userArchiveAssetAccess.update({where:{id:nativeGrant.grantId},data:{userId:"designer2"}}));
  await denied(()=>db.archiveGrantScope.delete({where:{grantId:nativeGrant.grantId}}));
  await denied(()=>db.userArchiveAssetAccess.create({data:{userId:"designer2",grantedById:"director"}}));
  await denied(()=>db.runtimeArchiveFile.create({data:{id:"forged-runtime-archive",publicationId:result.publicationId,categoryId:"open",submissionId:a.submissionId,referenceId:a.referenceId,versionId:a.versionId}}));
  const designer=await user("designer");assert.equal((await folders.readArchiveFolder(designer,{categoryId:"open",folderId:folder.id})).total,1);await files.openSharedFileVersion({kind:"runtime-archive-file",id:a.id},a.versionId);await denied(()=>files.openSharedFileVersion({kind:"runtime-archive-file",id:b.id},b.versionId));
  const reviewCommand={...sourceA,commandId:randomUUID(),versionId:a.versionId,expectedRevision:0,expectedDecisionId:null,action:"VERIFY",reason:"Exact runtime Archive review",confirmed:true};
  for(const role of ["designer","spm","digital","jpm","tech"]){const actor=await user(role);await denied(()=>review.decideArchiveVerification(actor,reviewCommand));await denied(()=>archives.deleteArchivedFileForUser(actor,a.id));}
  // New preview/download grants cannot manufacture Digital Lead verification.
  await user("director");const verified=await review.decideArchiveVerification(director,reviewCommand);
  await folders.organizeArchive(director,{commandId:randomUUID(),categoryId:"open",action:"move-file",fileKind:"runtime",fileId:a.id,expectedRevision:1,folderId:null});
  assert.equal((await review.readArchiveVerification(director,sourceA)).status,"VERIFIED");
  await review.decideArchiveVerification(director,{...reviewCommand,commandId:randomUUID(),action:"REVOKE",expectedRevision:verified.revision,expectedDecisionId:verified.decisionId,reason:"Director revocation"});
  const accessView=await access.readArchiveAccess(director,a.id),g=accessView.grants.find(g=>g.id==="designer")!;
  await access.decideArchiveAccess(director,{commandId:randomUUID(),sourceKind:"runtime",sourceId:a.id,categoryId:"open",referenceId:a.referenceId,versionId:a.versionId,recipientId:"designer",action:"REVOKE",reason:"Artwork access revoked",confirmed:true,expiresAt:null,expectedRevision:g.revision,expectedDecisionId:g.decisionId,expectedGrantId:g.grantId});
  await user("designer");await denied(()=>files.openSharedFileVersion({kind:"runtime-archive-file",id:a.id},a.versionId));
  await user("director");
  const expiresAt=new Date(Date.now()+1600).toISOString();
  await access.decideArchiveAccess(director,{commandId:randomUUID(),sourceKind:"runtime",sourceId:b.id,categoryId:"open",referenceId:b.referenceId,versionId:b.versionId,recipientId:"designer",action:"GRANT",reason:"Short synthetic expiry",confirmed:true,expiresAt,expectedRevision:0,expectedDecisionId:null,expectedGrantId:null});
  await user("designer");await files.openSharedFileVersion({kind:"runtime-archive-file",id:b.id},b.versionId);
  await new Promise(resolve=>setTimeout(resolve,1750));await denied(()=>files.openSharedFileVersion({kind:"runtime-archive-file",id:b.id},b.versionId));
  await user("director");
  const third=makeCommand(eligible.slice(2));
  await db.$executeRawUnsafe(`CREATE FUNCTION phase64_reject_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."eventId" LIKE 'archive-runtime:%' THEN RAISE EXCEPTION 'forced outbox rollback'; END IF; RETURN NEW; END $$`);
  await db.$executeRawUnsafe('CREATE TRIGGER phase64_reject_outbox BEFORE INSERT ON "EventOutbox" FOR EACH ROW EXECUTE FUNCTION phase64_reject_outbox()');
  await denied(()=>service.publishRuntimeArchive(director,third));assert.equal(await db.runtimeArchivePublication.count(),1);assert.equal(await db.runtimeArchiveFile.count(),2);
  await db.$executeRawUnsafe('DROP TRIGGER phase64_reject_outbox ON "EventOutbox"');await db.$executeRawUnsafe('DROP FUNCTION phase64_reject_outbox()');
  const race=await Promise.allSettled([service.publishRuntimeArchive(director,third),service.publishRuntimeArchive(director,{...third,commandId:randomUUID()})]);assert.equal(race.filter(r=>r.status==="fulfilled").length,1);assert.equal(await db.runtimeArchiveFile.count(),3);
  await denied(()=>command("FIELDS",{values:{}}));await denied(()=>completionCommand("POLICY_APPROVED",{settings:{AUTHORITY_APPROVAL_PROOF:"NOT_APPLICABLE",COPYRIGHT_TRANSFER:"NOT_APPLICABLE",INVOICE:"NOT_APPLICABLE"},reason:"Attempt mutation",confirmed:true}));
  await denied(()=>db.runtimeArchivePublication.update({where:{id:result.publicationId},data:{reason:"rewrite"}}));await denied(()=>db.runtimeArchiveFile.update({where:{id:a.id},data:{versionId:b.versionId}}));
  await archives.deleteArchivedFileForUser(director,a.id);assert.equal(await db.runtimeArchiveFile.count({where:{id:a.id}}),0);assert.equal((await db.retainedArchiveSource.findUniqueOrThrow({where:{id:a.referenceId}})).runtimeSourceId,a.id);assert.equal(await db.archiveVerificationDecision.count({where:{referenceId:a.referenceId}}),2);
  await denied(()=>service.publishRuntimeArchive(director,makeCommand(eligible.filter(f=>f.versionId===a.versionId))));
  assert.equal(await source(),preserved);assert.equal(JSON.stringify([await db.project.findMany({orderBy:{id:"asc"}}),await db.projectArchive.findMany({orderBy:{id:"asc"}}),await db.manualArchiveFile.findMany({orderBy:{id:"asc"}})]),native);
  for(const e of await db.businessEvent.findMany({where:{type:"ARCHIVE_RUNTIME_PUBLISHED"}})){assert.equal(events.decodeBusinessEvent(e).type,"ARCHIVE_RUNTIME_PUBLISHED");assert.equal(await db.eventOutbox.count({where:{eventId:e.id}}),1);}
  const route=load("src/app/api/archives/runtime/route.js") as typeof import("../src/app/api/archives/runtime/route");
  process.env.APP_URL="http://localhost";
  assert.equal((await route.POST(new Request("http://localhost/api/archives/runtime",{method:"POST",headers:{origin:"http://wrong.invalid","content-type":"application/json"},body:JSON.stringify(publish)}))).status,403);
  await user("designer");assert.equal((await route.GET(new Request(`http://localhost/api/archives/runtime?projectId=${projectId}`))).status,403);await user("director");
  process.env.FLUX_ARCHIVE_RUNTIME="0";await denied(()=>service.readRuntimeArchivePublication(director,projectId));await denied(()=>files.openSharedFileVersion({kind:"runtime-archive-file",id:b.id},b.versionId));process.env.FLUX_ARCHIVE_RUNTIME="1";
  archived=await db.runtimeArchiveFile.findMany();assert.equal(archived.length,2);
  console.log(`PASS Phase 6.4: genuine Owner request/Director completion; selected accepted and sealed stage evidence; typed publication, browse/search/folders, exact protected bytes, grants/revocation, independent review/revocation, deletion retention, replay/race/outbox rollback; ${denials} denied attacks. All source and native records unchanged.`);
}
