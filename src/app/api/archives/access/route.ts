import { Prisma } from "@prisma/client";
import { getApplicationUrl } from "@/lib/secure-external-token";
import { ArchiveSharingError } from "@/lib/archive-sharing/contracts";
import { decideArchiveAccess } from "@/lib/archive-sharing/service";
import { archiveSharingEnabled } from "@/lib/archive-sharing/activation";
import { readArchiveAccess } from "@/lib/archive-sharing/service";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getArchiveFileAccess, setArchiveFileAccess } from "@/lib/archive-access";
import { AuthorizationDeniedError } from "@/lib/authorization/policy";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const fileId = new URL(request.url).searchParams.get("fileId") ?? "";
    const query = new URL(request.url).searchParams;
    return NextResponse.json(archiveSharingEnabled() ? await readArchiveAccess(user, fileId, query.get("search") ?? "", query.get("before")) : await getArchiveFileAccess(user, fileId), { headers: { "Cache-Control": "private, no-store" } });
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

const headers = { "Cache-Control": "private, no-store" };
function errorResponse(error: unknown) {
  if (error instanceof AuthorizationDeniedError) return NextResponse.json({ error: "Archive access denied." }, { status: 403, headers });
  if (error instanceof ArchiveSharingError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034", "P2003"].includes(error.code)) {
    return NextResponse.json({ error: "Access changed. Refresh the file details and try again." }, { status: 409, headers });
  }
  return NextResponse.json({ error: "Unable to complete the Archive operation. Refresh and try again." }, { status: 500, headers });
}

export async function POST(request: Request) {
  // A same-origin JSON request is required in addition to current-session policy.
  if (request.headers.get("origin") !== new URL(getApplicationUrl()).origin || request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return NextResponse.json({ error: "Invalid request origin or content type." }, { status: 403, headers });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers });
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new ArchiveSharingError("Archive command is required.");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.byteLength;
        if (size > 16_384) throw new ArchiveSharingError("Archive command is too large.", 413);
        chunks.push(next.value);
      }
    } finally { await reader.cancel(); }
    const text = Buffer.concat(chunks).toString("utf8");
    let input: unknown;
    try { input = JSON.parse(text); } catch { throw new ArchiveSharingError("Invalid Archive command."); }
    return NextResponse.json(await decideArchiveAccess(user, input), { headers });
  } catch (error) { return errorResponse(error); }
}
