import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { getApplicationUrl } from "@/lib/secure-external-token";
import { AuthorizationDeniedError } from "@/lib/authorization/policy";
import { ArchiveRuntimeError } from "@/lib/archive-runtime/contracts";
import { publishRuntimeArchive, readRuntimeArchivePublication } from "@/lib/archive-runtime/service";

const headers = { "Cache-Control": "private, no-store" };
function errorResponse(error: unknown) {
  if (error instanceof AuthorizationDeniedError) return NextResponse.json({ error: "Archive access denied." }, { status: 403, headers });
  if (error instanceof ArchiveRuntimeError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034", "P2003"].includes(error.code)) {
    return NextResponse.json({ error: "The publication changed. Review a fresh manifest before trying again." }, { status: 409, headers });
  }
  return NextResponse.json({ error: "Unable to complete the Archive operation. Refresh and try again." }, { status: 500, headers });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers });
  const query = new URL(request.url).searchParams;
  try {
    return NextResponse.json(await readRuntimeArchivePublication(user, query.get("projectId") ?? ""), { headers });
  } catch (error) { return errorResponse(error); }
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
    if (!reader) throw new ArchiveRuntimeError("Archive command is required.");
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.byteLength;
        if (size > 32_768) throw new ArchiveRuntimeError("Archive command is too large.", 413);
        chunks.push(next.value);
      }
    } finally { await reader.cancel(); }
    const text = Buffer.concat(chunks).toString("utf8");
    let input: unknown;
    try { input = JSON.parse(text); } catch { throw new ArchiveRuntimeError("Invalid Archive command."); }
    return NextResponse.json(await publishRuntimeArchive(user, input), { headers });
  } catch (error) { return errorResponse(error); }
}
