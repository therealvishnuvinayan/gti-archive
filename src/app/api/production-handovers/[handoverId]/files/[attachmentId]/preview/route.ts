import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getAuthenticatedProductionHandoverFileUrl } from "@/lib/stage-six";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ handoverId: string; attachmentId: string }>;
  },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { handoverId, attachmentId } = await params;
  try {
    const url = await getAuthenticatedProductionHandoverFileUrl(
      user,
      handoverId,
      attachmentId,
      "preview",
    );
    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json(
      { error: "Handover file not found." },
      {
        status: 404,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
