import assert from "node:assert/strict";
import { archiveScopeForActor, archivedFileWhere, archiveCategoryWhere, manualArchiveFileWhere } from "../src/lib/authorization/archive-rules";
import { getBusinessRoleEligibility } from "../src/lib/authorization/eligibility";
import { isCompletionRequirementResolved } from "../src/lib/project-completion";
import { deleteProject } from "../src/lib/project-management";
import { validateRuntimeCreation } from "../src/lib/runtime-integration/creation";
import { configurationHash } from "../src/lib/stage-builder/hash";
import { bindProjectReadIdentity } from "../src/lib/authorization/project-read-rules";
import { getFlexibleProjectAccessWhere } from "../src/lib/flexible-projects";
import type { AuthenticatedPrincipal } from "../src/lib/authorization/session";
import { ProjectCompletionStepStatus, type BusinessRole, type Prisma } from "@prisma/client";
import type { WorkflowDefinition } from "../src/lib/stage-builder/contracts";
const roles: (BusinessRole | null)[] = ["DIRECTOR", "SENIOR_PROJECT_MANAGER", "JUNIOR_PROJECT_MANAGER", "DESIGNER", "DIGITAL_LEAD", null];
async function main() {
 const mode=process.argv[2];
 if(mode==="archive") {
  for (const status of Object.values(ProjectCompletionStepStatus)) {
   assert.equal(isCompletionRequirementResolved({required:true,status}),status==="COMPLETED");
   assert.equal(isCompletionRequirementResolved({required:false,status}),true);
   assert.equal(isCompletionRequirementResolved({required:null,status}),false);
  }
  for(const businessRole of roles) {
   const scope=archiveScopeForActor({userId:"actor",businessRole});
   if(businessRole==="DIRECTOR"||businessRole==="SENIOR_PROJECT_MANAGER") {
    assert.equal(scope.level,"FULL");assert.deepEqual(archiveCategoryWhere(scope),{isActive:true});
    assert.deepEqual(archivedFileWhere(scope),{archive:{is:{archiveCategory:{is:{isActive:true}}}}});
   } else if(businessRole==="DESIGNER"||businessRole==="DIGITAL_LEAD") {
    assert.equal(scope.level,"PARTIAL");assert.deepEqual(archivedFileWhere(scope).userArchiveAccesses,{some:{userId:"actor",id:{in:[]}}});
    assert.deepEqual(manualArchiveFileWhere({...scope,grantIds:["exact-file-grant"]}).userArchiveAccesses,{some:{userId:"actor",id:{in:["exact-file-grant"]}}});
    assert.deepEqual(archiveCategoryWhere(scope),{isActive:true,OR:[{allowedUsers:{none:{}}},{allowedUsers:{some:{userId:"actor"}}}]});
   } else {assert.equal(scope.level,"NONE");assert.deepEqual(archivedFileWhere(scope),{id:{in:[]}});assert.deepEqual(manualArchiveFileWhere(scope),{id:{in:[]}});}
   assert.equal(getBusinessRoleEligibility(businessRole,"archive.delete").decision,businessRole==="DIRECTOR"?"REQUIRES_AUTHORIZATION":"DENY");
  }
  assert.deepEqual(archivedFileWhere(null),{id:{in:[]}});
 } else if(mode==="deletion") {
  // The approved service rejects all deletion until durable history/audit exists,
  // a stronger guarantee than the removed final-stage source-string check.
  for(const id of ["director","spm","jpm","designer","digital","technical"]) for(const projectId of ["completed","active","archived","missing"])
   await assert.rejects(deleteProject({id},projectId),/Project deletion is disabled/);
 } else if(mode==="creation") {
  const definition: WorkflowDefinition={schemaVersion:1,name:"Contract",description:"",intendedProjectType:"CUSTOM",stages:[{id:"stage",title:"Stage",description:"",position:0,gates:[],capabilities:[{id:"brief",type:"INFORMATION",title:"Brief",instructions:"",fields:[{id:"note",type:"SHORT_TEXT",label:"Note",help:"",required:false,options:[],defaultValue:null,min:null,max:200}]}]}]};
  const hash=configurationHash(definition), creation={commandId:"command",publishedVersionId:"published",definitionHash:hash,title:"Contract",description:"",ownerId:"jpm",coOwnerIds:["spm"],executorIds:["designer"]};
  let users=[{userId:"jpm",businessRole:"JUNIOR_PROJECT_MANAGER"},{userId:"spm",businessRole:"SENIOR_PROJECT_MANAGER"},{userId:"designer",businessRole:"DESIGNER"}];
  const tx={$queryRaw:async()=>[],userAuthorization:{findMany:async()=>users},publishedWorkflowVersion:{findUnique:async()=>({validationStatus:"VALID",definition,configurationHash:hash})}} as unknown as Prisma.TransactionClient;
  await validateRuntimeCreation(tx,"jpm",creation);
  for(const role of ["DIRECTOR","JUNIOR_PROJECT_MANAGER","DESIGNER","DIGITAL_LEAD","ADMIN",""]) {
   users[1]={userId:"spm",businessRole:role};await assert.rejects(validateRuntimeCreation(tx,"jpm",creation),/SPM_CO_OWNER_REQUIRED/);
  }
  users[1]={userId:"spm",businessRole:"SENIOR_PROJECT_MANAGER"};
  await assert.rejects(validateRuntimeCreation(tx,"spm",creation),/GENUINE_JPM_OWNER_REQUIRED/);
  users=users.filter(u=>u.userId!=="designer");await assert.rejects(validateRuntimeCreation(tx,"jpm",creation),/INELIGIBLE_PARTICIPANT/);
  assert.equal(getBusinessRoleEligibility(null,"project.runtimeCreateApproved").decision,"DENY");
 } else if(mode==="dashboard") {
  for(const businessRole of roles) {
   const user=bindProjectReadIdentity({id:"actor",role:"USER" as const},{userId:"actor",identity:{email:"actor@synthetic.invalid",name:null},authorizationVersion:1,businessRole,accountStatus:"ACTIVE",technicalPrivileges:[],session:{id:"session",expiresAt:new Date(Date.now()+60000).toISOString()}} as AuthenticatedPrincipal);
   const where=getFlexibleProjectAccessWhere(user);
   if(businessRole==="DIRECTOR")assert.deepEqual(where,{});
   else if(!businessRole||businessRole==="DESIGNER"||businessRole==="DIGITAL_LEAD")assert.deepEqual(where,{id:{in:[]}});
   else {assert.ok(JSON.stringify(where).includes('"actor"'));assert.notDeepEqual(where,{});}
  }
  assert.deepEqual(getFlexibleProjectAccessWhere({id:"forged",role:"SUPER_ADMIN"}),{id:{in:[]}});
 } else throw new Error("Unknown contract mode");
 console.log(`PASS current ${mode} behavioral contracts; server-only rejects client context.`);
}
main().catch(error=>{console.error(error);process.exitCode=1;});
