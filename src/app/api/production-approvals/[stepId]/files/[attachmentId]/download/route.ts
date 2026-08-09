import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProductionApprovalFileUrl } from "@/lib/stage-six";

export async function GET(_request: Request, { params }: { params: Promise<{ stepId: string; attachmentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { stepId, attachmentId } = await params;
  try {
    const url = await getProductionApprovalFileUrl({ kind: "authenticated", user, stepId }, attachmentId, "download");
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch { return NextResponse.json({ error: "Approval file not found." }, { status: 404, headers: { "Cache-Control": "private, no-store" } }); }
}
