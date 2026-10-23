import "server-only";
import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";
import { AuthorizationDeniedError } from "../authorization/policy";
import { ApprovalError } from "../approvals/contracts";
import { DraftError } from "../stage-builder/contracts";
import { runtimeEnabled } from "./activation";
export { body } from "../stage-builder/http";
export async function runtimeResponse(operation: () => Promise<unknown>) {
  try { return NextResponse.json(await operation(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (e) {
    const status = e instanceof DraftError ? e.status : e instanceof AuthorizationDeniedError ? 403 : e instanceof ApprovalError ? (/DENIED|SESSION/.test(e.code) ? 403 : 409) : 500;
    const code = e instanceof DraftError || e instanceof ApprovalError ? e.code : status === 403 ? "ACCESS_DENIED" : "RUNTIME_OPERATION_FAILED";
    return NextResponse.json({ code, error: status === 500 ? "The operation did not complete. Refresh to check its recorded state before trying again." : status === 403 ? "This runtime resource or operation is not authorized." : code === "STALE_REVISION" ? "This stage changed. Reload and reconcile your edits before saving." : code.toLowerCase().replaceAll("_", " ") }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
export async function runtimePage<T>(read: () => Promise<T>) { if (!runtimeEnabled()) notFound(); try { return await read(); } catch (e) { if (e instanceof AuthorizationDeniedError) redirect("/no-access"); if (e instanceof DraftError) notFound(); throw e; } }
