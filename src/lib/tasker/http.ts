import "server-only";
import { getApplicationUrl } from "../secure-external-token";
import { NextResponse } from "next/server";
import { AuthorizationDeniedError } from "../authorization/policy";
import { TaskerError, ensure } from "./contracts";
export async function body(request: Request) {
  ensure(request.headers.get("origin") === new URL(getApplicationUrl()).origin, "INVALID_ORIGIN", 403);
  ensure(request.headers.get("content-type")?.split(";")[0] === "application/json", "JSON_REQUIRED", 415);
  const reader = request.body?.getReader(); ensure(reader, "BODY_REQUIRED");
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength;
    ensure(size <= 65536, "BODY_TOO_LARGE", 413); chunks.push(next.value); } }
  finally { await reader.cancel(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown; } catch { throw new TaskerError("INVALID_JSON"); }
}
const messages: Record<string, string> = {
  TASKER_DISABLED: "General Tasks are not available yet.", TASK_TYPE_UNAVAILABLE: "This task type is not available yet.",
  STALE_TASK_VERSION: "This task changed. Review the refreshed task and try again.", COMMAND_REUSED: "This request has already been used with different details. Refresh and try again.",
  DISTINCT_EXECUTOR_REQUIRED: "Choose an executor other than the Task Owner.", SPECTATORS_MUST_BE_VIEW_ONLY: "The owner and executor cannot also be spectators.",
  ACTIVE_BUSINESS_PARTICIPANTS_REQUIRED: "Choose active business users for this task.", REVIEW_PENDING: "Wait for the owner to review the completion request before changing the work.",
  TASK_TERMINAL: "This task is already completed or closed.", TASK_DELETED: "This task has been deleted.",
  NO_COMPLETION_REQUEST: "There is no completion request awaiting review.", SELF_REVIEW_DENIED: "A different authorized reviewer must review this request.",
  INVALID_SUBMISSION_FILES: "One or more attachments are no longer available for this response.", INVALID_REPLACEMENT: "Choose an existing attachment from this task.",
  UPLOAD_UNAVAILABLE: "This upload expired or is no longer available. Attach the file again.", FILE_CHANGED: "The stored file changed. Attach and review a new version.",
  INVALID_FILE_SIZE: "Choose a file between 1 byte and 100 MB.", INVALID_MIME_TYPE: "The file type is invalid.",
  INVALID_DEADLINE: "Enter a valid deadline including its time.", INVALID_PRIORITY: "Choose a task priority.",
  INVALID_TEXT: "Complete the required text fields and keep within their length limits.", BODY_TOO_LARGE: "This request is too large. Shorten the task text and try again.",
};
export async function response(operation: () => Promise<unknown>) {
  try { return NextResponse.json(await operation(), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) {
    const status = error instanceof TaskerError ? error.status : error instanceof AuthorizationDeniedError ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Task unavailable or access denied." : error instanceof TaskerError ? (messages[error.code] ?? "Check the task details and try again.") : "Task operation failed. Refresh and retry." },
      { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
