import { body, response } from "@/lib/tasker/http";
import { uploadTicket } from "@/lib/tasker/service";
import { id, object } from "@/lib/tasker/contracts";
export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  return response(async () => { const v = object(await body(request), ["uploadId"]); return uploadTicket((await params).taskId, id(v.uploadId)); });
}
