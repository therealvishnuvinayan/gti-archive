import { createRuntimeProject, listRuntimeProjects } from "@/lib/stage-runtime/service";
import { body, runtimeResponse } from "@/lib/stage-runtime/http";
export const runtime = "nodejs";
export async function GET(request: Request) { const p = new URL(request.url).searchParams; return runtimeResponse(() => listRuntimeProjects(p.get("q") ?? "", Number(p.get("page") ?? 0))); }
export async function POST(request: Request) { return runtimeResponse(async () => createRuntimeProject(await body(request))); }
