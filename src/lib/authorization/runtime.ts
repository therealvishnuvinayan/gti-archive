import "server-only";

import { readCurrentSessionToken } from "../auth";
import { prisma } from "../prisma";
import { createAuthorizationService, type ResourcePolicies } from "./policy";
import { projectReadPolicies } from "./project-read-policies";
import { projectWritePolicies } from "./project-write-policies";

// Phase 1.5C adds only the enumerated native project mutations. Creation,
// unrestricted deletion, template publishing and Universal Tasker remain closed.
const integratedResourcePolicies: ResourcePolicies = { ...projectReadPolicies, ...projectWritePolicies };

export const runtimeAuthorization = createAuthorizationService({
  database: prisma,
  readSessionToken: readCurrentSessionToken,
  policies: integratedResourcePolicies,
});
