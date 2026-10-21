import { body, response } from "@/lib/tasker/http";
import { previewSister } from "@/lib/tasker/service";
export const runtime = "nodejs";
export async function POST(request: Request) { return response(async () => previewSister(await body(request))); }
