import { NextResponse } from "next/server";
import { ProjectCompletionDocumentType } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { getApplicationUrl } from "@/lib/secure-external-token";
import { getCompletionDocumentReviews, issueCompletionDocumentAccess, reviewCompletionDocument, revokeCompletionDocumentAccess, reopenCompletionDocument } from "@/lib/completion-documents/service";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try { return NextResponse.json(await getCompletionDocumentReviews(user, new URL(request.url).searchParams.get("projectId") ?? ""), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "Completion documents are unavailable for this account." }, { status: 403 }); }
}
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  // Next's internal URL can use a different host behind a proxy. Compare with
  // server-owned application configuration, never a caller-supplied Host header.
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(getApplicationUrl()).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const data = await request.json();
    if (typeof data.projectId !== "string") throw new Error("Project is required.");
    let result;
    if (data.command === "REVIEW" && typeof data.submissionId === "string" && ["ACCEPT", "REJECT"].includes(data.decision) && typeof data.reason === "string") {
      result = await reviewCompletionDocument(user, { projectId: data.projectId, submissionId: data.submissionId, decision: data.decision, reason: data.reason });
    } else if (data.command === "REOPEN" && Object.values(ProjectCompletionDocumentType).includes(data.type) && typeof data.reason === "string") {
      result = await reopenCompletionDocument(user, { projectId: data.projectId, type: data.type, reason: data.reason });
    } else if (data.command === "ISSUE" && Object.values(ProjectCompletionDocumentType).includes(data.type) && typeof data.recipientEmail === "string") {
      result = await issueCompletionDocumentAccess(user, { projectId: data.projectId, type: data.type, recipientEmail: data.recipientEmail });
    } else if (data.command === "REVOKE" && typeof data.accessId === "string") {
      await revokeCompletionDocumentAccess(user, { projectId: data.projectId, accessId: data.accessId });
      result = { revoked: true };
    } else throw new Error("Invalid completion document command.");
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update completion documents." }, { status: 400 }); }
}
