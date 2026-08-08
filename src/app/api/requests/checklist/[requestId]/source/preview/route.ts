import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getStageFiveChecklistRequestSourceFileUrl } from "@/lib/stage-five";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { requestId } = await params;
  try {
    const previewUrl = await getStageFiveChecklistRequestSourceFileUrl(
      user,
      requestId,
      "preview",
    );
    return NextResponse.redirect(previewUrl, { status: 302 });
  } catch {
    return NextResponse.json({ error: "Requested file not found." }, { status: 404 });
  }
}
