import "server-only";
import { NextResponse } from "next/server";
import { AuthorizationDeniedError } from "../authorization/policy";
import { getApplicationUrl } from "../secure-external-token";
import { DraftError, ensure, MAX_DEFINITION_BYTES } from "./contracts";

export async function body(request: Request) {
  ensure(request.headers.get("origin") === new URL(getApplicationUrl()).origin, "INVALID_ORIGIN", 403);
  ensure(request.headers.get("content-type")?.split(";")[0] === "application/json", "JSON_REQUIRED", 415);
  const reader = request.body?.getReader(); ensure(reader, "BODY_REQUIRED");
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; ensure(size <= MAX_DEFINITION_BYTES + 1024, "BODY_TOO_LARGE", 413); chunks.push(next.value); } }
  finally { await reader.cancel(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; } catch { throw new DraftError("INVALID_JSON"); }
}
export async function response(operation: () => Promise<unknown>) {
  try { return NextResponse.json(await operation(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) {
    const status = error instanceof DraftError ? error.status : error instanceof AuthorizationDeniedError ? 403 : 500;
    const code = error instanceof DraftError ? error.code : status === 403 ? "ACCESS_DENIED" : "DRAFT_OPERATION_FAILED";
    const message = code === "STALE_REVISION" ? "This draft changed. Your edits are still here. Open the current revision and reconcile before saving." :
      code === "COMMAND_REUSED" ? "This request was already used with different details. Reload before retrying." :
      status === 403 ? "Draft unavailable or access denied." : status === 404 ? "Workflow drafts or this revision are unavailable." :
      status === 500 ? "The draft could not be saved. Retry or reload." : `Check the configuration: ${code.toLowerCase().replaceAll("_", " ")}.`;
    return NextResponse.json({ error: message, code, issues: error instanceof DraftError ? error.issues : [] }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
