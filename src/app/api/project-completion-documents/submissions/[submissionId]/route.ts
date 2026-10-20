import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCompletionSubmissionDownload } from "@/lib/completion-documents/service";

export async function GET(request: Request, { params }: { params: Promise<{ submissionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try { return NextResponse.redirect(new URL(await getCompletionSubmissionDownload(user, (await params).submissionId), request.url), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } }); }
  catch { return NextResponse.json({ error: "Document is unavailable for this account." }, { status: 403 }); }
}
