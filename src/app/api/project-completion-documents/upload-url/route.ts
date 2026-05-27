import { NextResponse } from "next/server";
import { ProjectCompletionDocumentType } from "@prisma/client";

import { getCurrentUser } from "@/lib/auth";
import { requestProjectCompletionDocumentUpload } from "@/lib/project-completion";

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
  } = {};

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  if (
    !payload.projectId ||
    !payload.originalFileName ||
    !payload.mimeType ||
    typeof payload.fileSize !== "number" ||
    !isProjectCompletionDocumentType(payload.documentType)
  ) {
    return NextResponse.json({ error: "Missing required upload fields." }, { status: 400 });
  }

  try {
    const result = await requestProjectCompletionDocumentUpload(user, {
      projectId: payload.projectId,
      documentType: payload.documentType,
      originalFileName: payload.originalFileName,
      mimeType: payload.mimeType,
      fileSize: payload.fileSize,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to prepare the completion document upload.";

    return NextResponse.json(
      { error: message },
      {
        status: /permission|access|owner|executor/i.test(message) ? 403 : 400,
      },
    );
  }
}
