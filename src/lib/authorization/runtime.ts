import "server-only";
import { taskPolicies } from "./task-policies";
import { workspacePolicies } from "./workspace-policies";
import { stageDraftPolicies } from "./stage-draft-policies";
import { workflowPublicationPolicies } from "./workflow-publication-policies";

import { readCurrentSessionToken } from "../auth";
import { prisma } from "../prisma";
import { createAuthorizationService, type ResourcePolicies } from "./policy";
import { projectReadPolicies } from "./project-read-policies";
import { projectWritePolicies } from "./project-write-policies";
import { projectGovernancePolicies } from "./project-governance-policies";
import { libraryPolicies } from "./library-policies";
import { archivePolicies } from "./archive-policies";

// Native reads/writes remain registered; governed creation and final completion
// use the Phase 1.5D policies. Workflow publication has its own default-off
// typed policy; it grants no project creation or runtime-stage authority.
const integratedResourcePolicies: ResourcePolicies = { ...projectReadPolicies, ...projectWritePolicies, ...projectGovernancePolicies, ...archivePolicies, ...libraryPolicies, ...workspacePolicies, ...taskPolicies, ...stageDraftPolicies, ...workflowPublicationPolicies };

export const runtimeAuthorization = createAuthorizationService({
  database: prisma,
  readSessionToken: readCurrentSessionToken,
  policies: integratedResourcePolicies,
});
