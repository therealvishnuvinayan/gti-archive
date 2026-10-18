import "server-only";

import { readCurrentSessionToken } from "../auth";
import { prisma } from "../prisma";
import { createAuthorizationService, type ResourcePolicies } from "./policy";
import { projectReadPolicies } from "./project-read-policies";
import { projectWritePolicies } from "./project-write-policies";
import { projectGovernancePolicies } from "./project-governance-policies";
import { libraryPolicies } from "./library-policies";
import { archivePolicies } from "./archive-policies";

// Native reads/writes remain registered; governed creation and final completion
// use the Phase 1.5D policies. Deletion, template publishing and Tasker stay closed.
const integratedResourcePolicies: ResourcePolicies = { ...projectReadPolicies, ...projectWritePolicies, ...projectGovernancePolicies, ...archivePolicies, ...libraryPolicies };

export const runtimeAuthorization = createAuthorizationService({
  database: prisma,
  readSessionToken: readCurrentSessionToken,
  policies: integratedResourcePolicies,
});
