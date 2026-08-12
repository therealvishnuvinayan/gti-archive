import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import {
  checkExternalRequestRateLimit,
  getExternalRequestClientIp,
} from "@/lib/external-request-rate-limit";
import { publishProjectActivityUpdatedAfterResponse } from "@/lib/realtime/server";
import { decideProductionApproval } from "@/lib/stage-six";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const limit = checkExternalRequestRateLimit({ token, clientIp: getExternalRequestClientIp(request.headers), scope: "decision", limit: 12 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: { ...privateHeaders, "Retry-After": String(limit.retryAfterSeconds) } });
  let payload: { decision?: string; comment?: string } = {};
  try { payload = (await request.json()) as typeof payload; } catch { return NextResponse.json({ error: "Invalid decision request." }, { status: 400, headers: privateHeaders }); }
  if (payload.decision !== "APPROVE" && payload.decision !== "REJECT") return NextResponse.json({ error: "Choose Approve or Reject." }, { status: 400, headers: privateHeaders });
  const result = await decideProductionApproval({ kind: "external", token }, { decision: payload.decision, comment: payload.comment });
  if (!("error" in result)) {
    revalidatePath(`/projects/${result.projectId}/stages/6`);
    publishProjectActivityUpdatedAfterResponse({
      projectId: result.projectId,
      stageId: null,
      eventType: "timeline_updated",
      changedEntityId: result.productionUnitId,
      actorId: null,
    });
  }
  return "error" in result
    ? NextResponse.json(result, { status: 400, headers: privateHeaders })
    : NextResponse.json(result, { headers: privateHeaders });
}
