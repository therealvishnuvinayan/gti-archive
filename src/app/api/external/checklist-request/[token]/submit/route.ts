import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  checkExternalRequestRateLimit,
  getExternalRequestClientIp,
} from "@/lib/external-request-rate-limit";
import type { StageFiveChecklistValue } from "@/lib/stage-five";
import { submitExternalChecklistResponse } from "@/lib/stage-five-external";
import { publishProjectActivityUpdatedAfterResponse } from "@/lib/realtime/server";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const rateLimit = checkExternalRequestRateLimit({
    token,
    clientIp: getExternalRequestClientIp(request.headers),
    scope: "submit",
    limit: 10,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many submission attempts. Please try again shortly." },
      {
        status: 429,
        headers: { ...NO_STORE_HEADERS, "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }
  let payload: { value?: StageFiveChecklistValue; attachmentIds?: string[] } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid response." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const result = await submitExternalChecklistResponse(token, {
    value: payload.value ?? {},
    attachmentIds: Array.isArray(payload.attachmentIds) ? payload.attachmentIds : [],
  });
  if (!("error" in result)) {
    revalidatePath(`/projects/${result.projectId}`);
    revalidatePath(`/projects/${result.projectId}/stages/5`);
    publishProjectActivityUpdatedAfterResponse({
      projectId: result.projectId,
      stageId: null,
      eventType: "timeline_updated",
      changedEntityId: result.requestId,
      actorId: null,
    });
  }
  return "error" in result
    ? NextResponse.json(result, { status: 400, headers: NO_STORE_HEADERS })
    : NextResponse.json(
        { status: result.status },
        { status: 200, headers: NO_STORE_HEADERS },
      );
}
