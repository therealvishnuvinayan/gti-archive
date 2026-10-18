import { runProjectMutation } from "@/lib/authorization/project-write";
import { refreshProjectReader, requireProjectResourceRead } from "@/lib/authorization/project-read";
import { Prisma } from "@prisma/client";

import { prisma, withPrismaRetry } from "@/lib/prisma";
import { assertProjectAccess } from "@/lib/project-history";

const FORM_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,190}$/;
const MAX_DRAFT_BYTES = 2 * 1024 * 1024;
const MAX_CLIENT_ID_LENGTH = 64;

type ProjectDraftUser = Parameters<typeof assertProjectAccess>[0];

export type ProjectFormDraftPayload = Record<string, unknown>;

export type SaveProjectFormDraftInput = {
  projectId: string;
  formKey: string;
  payload: ProjectFormDraftPayload;
  clientId: string;
  clientRevision: number;
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
  user = await refreshProjectReader(user);
  await requireProjectResourceRead('structured', projectId, 'project.view', user);

  validateFormKey(formKey);
  await assertProjectAccess(user, projectId);

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
      },
    }),
  );

  return draft
    ? {
        payload: draft.payload as ProjectFormDraftPayload,
        revision: draft.clientRevision,
        updatedAt: draft.updatedAt.toISOString(),
      }
    : null;
}

async function saveProjectFormDraftImplementation(
  user: ProjectDraftUser,
  input: SaveProjectFormDraftInput,
) {
  validateFormKey(input.formKey);
  validatePayload(input.payload);
  validateClient(input);
  await assertProjectAccess(user, input.projectId);

  return withPrismaRetry(async () => {
    const key = {
      projectId: input.projectId,
      userId: user.id,
      formKey: input.formKey,
    } as const;
    const data = {
      payload: input.payload as Prisma.InputJsonValue,
      clientId: input.clientId,
      clientRevision: input.clientRevision,
    } as const;
    const updateExisting = () =>
      prisma.projectFormDraft.updateMany({
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
        await prisma.projectFormDraft.create({
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

    const draft = await prisma.projectFormDraft.findUniqueOrThrow({
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
  });
}

async function deleteProjectFormDraftImplementation(
  user: ProjectDraftUser,
  projectId: string,
  formKey: string,
) {
  validateFormKey(formKey);
  await assertProjectAccess(user, projectId);

  await withPrismaRetry(() =>
    prisma.projectFormDraft.deleteMany({
      where: {
        projectId,
        userId: user.id,
        formKey,
      },
    }),
  );
}

export async function saveProjectFormDraft(
  user: ProjectDraftUser,
  input: SaveProjectFormDraftInput,
) {
  const stageKey = input.formKey === "stage-one-project-inquiry" ? "PROJECT_INQUIRY"
    : input.formKey.startsWith("stage-two-text-file:") ? "PROJECT_RESEARCH_AND_PLANNING"
    : input.formKey.startsWith("concept-details:CONCEPT_CREATION:") ? "CONCEPT_CREATION"
    : input.formKey.startsWith("concept-details:PROJECT_DEVELOPMENT:") ? "PROJECT_DEVELOPMENT"
    : /^(stage-five-information-request|stage-five-checklist):/.test(input.formKey) ? "FINAL_LAYOUT"
    : /^(stage-six-approver|stage-six-handover):/.test(input.formKey) ? "PRODUCTION_AND_HANDOVER"
    : /^(stage-seven-sample-request|stage-seven-sample-review):/.test(input.formKey) ? "IMPLEMENTATION_AND_SUPERVISION"
    : null;
  if (!stageKey) throw new Error("This form draft is not supported by project authorization.");
  return runProjectMutation(user, "saveProjectFormDraft", { kind: "workflow", id: `${input.projectId}~${stageKey}` }, async (trustedUser) =>
    saveProjectFormDraftImplementation(trustedUser, input), input);
}

export async function deleteProjectFormDraft(
  user: ProjectDraftUser,
  projectId: string,
  formKey: string,
) {
  return runProjectMutation(user, "deleteProjectFormDraft", { kind: "structured", id: projectId }, async (trustedUser) =>
    deleteProjectFormDraftImplementation(trustedUser, projectId, formKey), { projectId });
}
