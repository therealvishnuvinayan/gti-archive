import "server-only";
import { readCurrentSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createRoleAssignmentService } from "./role-assignment-service";

// Root client composition: the assignment service owns its transaction/locks.
// Never nest this inside a project/workspace authorization transaction.
export const administration = createRoleAssignmentService({ database: prisma, readSessionToken: readCurrentSessionToken });
