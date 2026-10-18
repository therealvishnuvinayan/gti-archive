import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getArchiveFileAccess, setArchiveFileAccess } from "@/lib/archive-access";
import { AuthorizationDeniedError } from "@/lib/authorization/policy";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const fileId = new URL(request.url).searchParams.get("fileId") ?? "";
    return NextResponse.json(await getArchiveFileAccess(user, fileId));
  } catch { return NextResponse.json({ error: "Archive access management denied." }, { status: 403 }); }
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const input: unknown = await request.json();
    if (!input || typeof input !== "object" || !("fileId" in input) || !("userId" in input) || !("granted" in input) ||
      typeof input.fileId !== "string" || typeof input.userId !== "string" || typeof input.granted !== "boolean") {
      return NextResponse.json({ error: "Invalid access request." }, { status: 400 });
    }
    return NextResponse.json(await setArchiveFileAccess(user, input.fileId, input.userId, input.granted));
  } catch (error) {
    return NextResponse.json({ error: "Archive access update denied." }, { status: error instanceof AuthorizationDeniedError ? 403 : 400 });
  }
}
