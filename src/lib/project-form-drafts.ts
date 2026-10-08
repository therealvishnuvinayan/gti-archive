import { Prisma } from "@prisma/client";

import { prisma, withPrismaRetry } from "@/lib/prisma";
import { assertProjectAccess } from "@/lib/project-history";
import { applyFieldPatches, checkTaskerFormRevision, lockTaskerProject } from "@/lib/tasker/field-changes";
import { TaskerError } from "@/lib/tasker/errors";
import { isGlobalProjectAdministrator } from "@/lib/permissions/resolver";

const FORM_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,190}$/;
const MAX_DRAFT_BYTES = 2 * 1024 * 1024;
const MAX_CLIENT_ID_LENGTH = 64;

type ProjectDraftUser = Parameters<typeof assertProjectAccess>[0];

async function assertDraftAccess(user: ProjectDraftUser, projectId: string, formKey: string) {
  await assertProjectAccess(user, projectId);
  if (!/^stage-(one|two|five|six|seven)-/.test(formKey) || isGlobalProjectAdministrator(user)) return;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true, coOwners: { select: { userId: true } } } });
  if (project?.ownerId !== user.id && !project?.coOwners.some((c) => c.userId === user.id)) throw new TaskerError("You do not have access to this stage form. Respond through your task instead.", 403);
}

export type ProjectFormDraftPayload = Record<string, unknown>;

export type SaveProjectFormDraftInput = {
  projectId: string;
  formKey: string;
  payload: ProjectFormDraftPayload;
  clientId: string;
  clientRevision: number;
  taskerRevision?: number;
};

function validateFormKey(formKey: string) {
  if (!FORM_KEY_PATTERN.test(formKey)) {
    throw new Error("The form draft key is invalid.");
  }
}

function validatePayload(payload: unknown): asserts payload is ProjectFormDraftPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("The form draft payload must be an object.");
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    throw new Error("The form draft payload is not serializable.");
  }

  if (Buffer.byteLength(serialized, "utf8") > MAX_DRAFT_BYTES) {
    throw new Error("This form draft is too large to autosave.");
  }
}

function validateClient(input: Pick<SaveProjectFormDraftInput, "clientId" | "clientRevision">) {
  if (!input.clientId || input.clientId.length > MAX_CLIENT_ID_LENGTH) {
    throw new Error("The autosave client id is invalid.");
  }
  if (!Number.isSafeInteger(input.clientRevision) || input.clientRevision < 0) {
    throw new Error("The autosave revision is invalid.");
  }
}

export async function getProjectFormDraft(
  user: ProjectDraftUser,
  projectId: string,
  formKey: string,
) {
  validateFormKey(formKey);
  await assertDraftAccess(user, projectId, formKey);

  const draft = await withPrismaRetry(() =>
    prisma.projectFormDraft.findUnique({
      where: {
        projectId_userId_formKey: {
          projectId,
          userId: user.id,
          formKey,
        },
      },
      select: {
        payload: true,
        clientRevision: true,
        updatedAt: true,
        taskerRevision: true,
      },
    }),
  );

  const changes = await getTaskerFormChanges(user, projectId, formKey, draft?.taskerRevision ?? 0);
  return draft
    ? {
        payload: applyFieldPatches(draft.payload as ProjectFormDraftPayload, changes.patches),
        revision: draft.clientRevision,
        taskerRevision: changes.revision,
        updatedAt: draft.updatedAt.toISOString(),
      }
    : changes.patches.length ? { payload: applyFieldPatches<ProjectFormDraftPayload>({}, changes.patches), isTaskerOverlay: true, revision: 0, taskerRevision: changes.revision, updatedAt: new Date().toISOString() } : null;
}

export async function getTaskerFormChanges(user: ProjectDraftUser, projectId: string, formKey: string, since = 0) {
  validateFormKey(formKey);
  await assertDraftAccess(user, projectId, formKey);
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true, coOwners: { select: { userId: true } } } });
  // Task recipients respond in Tasker. Shared form data is for existing stage managers only.
  if (!isGlobalProjectAdministrator(user) && project?.ownerId !== user.id && !project?.coOwners.some((c) => c.userId === user.id)) return { revision: 0, patches: [] };
  const rows = await prisma.taskerFieldChange.findMany({ where: { projectId, formKey }, orderBy: { id: "asc" } });
  return { revision: rows.at(-1)?.id ?? 0, patches: rows.filter((r) => r.id > since && !r.consumedAt).map((r) => ({ id: r.id, path: r.path, value: r.value })) };
}

export async function saveProjectFormDraft(
  user: ProjectDraftUser,
  input: SaveProjectFormDraftInput,
) {
  validateFormKey(input.formKey);
  validatePayload(input.payload);
  validateClient(input);
  await assertDraftAccess(user, input.projectId, input.formKey);

  return withPrismaRetry(() => prisma.$transaction(async (tx) => {
    if (!(await checkTaskerFormRevision(tx, input.projectId, input.formKey, input.taskerRevision ?? 0))) throw new TaskerError("Tasker updated this form. Review the accepted input before saving.", 409);
    const key = {
      projectId: input.projectId,
      userId: user.id,
      formKey: input.formKey,
    } as const;
    const data = {
      payload: input.payload as Prisma.InputJsonValue,
      clientId: input.clientId,
      clientRevision: input.clientRevision,
      taskerRevision: input.taskerRevision ?? 0,
    } as const;
    const updateExisting = () =>
      tx.projectFormDraft.updateMany({
        where: {
          ...key,
          OR: [
            { clientId: { not: input.clientId } },
            { clientRevision: { lte: input.clientRevision } },
          ],
        },
        data,
      });

    let updated = await updateExisting();
    if (updated.count === 0) {
      try {
        await tx.projectFormDraft.create({
          data: { ...key, ...data },
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002"
        ) {
          throw error;
        }
        // Another request inserted the row first. Re-run the guarded update so
        // the higher revision wins without a read-then-write race.
        updated = await updateExisting();
      }
    }

    const draft = await tx.projectFormDraft.findUniqueOrThrow({
      where: {
        projectId_userId_formKey: key,
      },
      select: {
        clientId: true,
        clientRevision: true,
        updatedAt: true,
      },
    });
    const ignored =
      updated.count === 0 &&
      draft.clientId === input.clientId &&
      draft.clientRevision > input.clientRevision;

    return {
      revision: draft.clientRevision,
      updatedAt: draft.updatedAt.toISOString(),
      ignored,
    };
  }));
}

export async function deleteProjectFormDraft(
  user: ProjectDraftUser,
  projectId: string,
  formKey: string,
) {
  validateFormKey(formKey);
  await assertDraftAccess(user, projectId, formKey);

  await withPrismaRetry(() => prisma.$transaction(async (tx) => {
    await lockTaskerProject(tx, projectId);
    await tx.projectFormDraft.deleteMany({
      where: {
        projectId,
        userId: user.id,
        formKey,
      },
    });
  }));
}
