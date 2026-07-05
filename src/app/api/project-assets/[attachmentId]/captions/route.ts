import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/auth";
import {
  createSubmissionCaption,
  getSubmissionCaptionsForAttachment,
} from "@/lib/comparison";
import { PROJECTS_CACHE_TAG } from "@/lib/projects";

type CaptionRouteParams = {
  params: Promise<{
    attachmentId: string;
  }>;
};

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function GET(_request: NextRequest, { params }: CaptionRouteParams) {
  const user = await requireUser();
  const { attachmentId } = await params;

  try {
    const result = await getSubmissionCaptionsForAttachment(user, attachmentId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load captions for this submission.",
      },
      { status: 403 },
    );
  }
}

export async function POST(request: NextRequest, { params }: CaptionRouteParams) {
  const user = await requireUser();
  const { attachmentId } = await params;

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid caption request." }, { status: 400 });
  }

  const body =
    payload && typeof payload === "object" && "body" in payload
      ? String(payload.body ?? "")
      : "";
  const xPercent =
    payload && typeof payload === "object" && "xPercent" in payload
      ? getNumber(payload.xPercent)
      : null;
  const yPercent =
    payload && typeof payload === "object" && "yPercent" in payload
      ? getNumber(payload.yPercent)
      : null;

  if (xPercent === null || yPercent === null) {
    return NextResponse.json(
      { error: "Caption position is invalid." },
      { status: 400 },
    );
  }

  try {
    const caption = await createSubmissionCaption(user, {
      attachmentId,
      xPercent,
      yPercent,
      body,
    });

    revalidateTag(PROJECTS_CACHE_TAG, "max");

    return NextResponse.json({ caption });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to add the caption right now.",
      },
      { status: 403 },
    );
  }
}
