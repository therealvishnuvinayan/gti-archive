import { response } from "@/lib/tasker/http";
import { sisterDraft } from "@/lib/tasker/service";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  return response(async () => sisterDraft((await params).taskId));
}
