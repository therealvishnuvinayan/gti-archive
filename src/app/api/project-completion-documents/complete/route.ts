import { NextResponse } from "next/server";
import { ProjectCompletionDocumentType } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { finalizeProjectCompletionDocumentUpload } from "@/lib/project-completion";

function isProjectCompletionDocumentType(
  value: unknown,
): value is ProjectCompletionDocumentType {
  return Object.values(ProjectCompletionDocumentType).includes(
    value as ProjectCompletionDocumentType,
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: {
    projectId?: string;
    documentType?: ProjectCompletionDocumentType;
    originalFileName?: string;
    mimeType?: string;
    fileSize?: number;
    storageKey?: string;
    failed?: boolean;
  } = {};

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid completion request." }, { status: 400 });
  }

  if (
    !payload.projectId ||
    !payload.originalFileName ||
    !payload.mimeType ||
    typeof payload.fileSize !== "number" ||
    !payload.storageKey ||
    !isProjectCompletionDocumentType(payload.documentType)
  ) {
    return NextResponse.json({ error: "Missing required completion fields." }, { status: 400 });
  }

  try {
    await finalizeProjectCompletionDocumentUpload(user, {
      projectId: payload.projectId,
      documentType: payload.documentType,
      originalFileName: payload.originalFileName,
      mimeType: payload.mimeType,
      fileSize: payload.fileSize,
      storageKey: payload.storageKey,
      failed: payload.failed,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to finalise the completion document upload.";

    return NextResponse.json(
      { error: message },
      {
        status: /permission|access|owner|executor/i.test(message) ? 403 : 400,
      },
    );
  }
}
