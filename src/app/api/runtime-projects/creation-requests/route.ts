import { runtimeCreationRequests, requestRuntimeCreation, decideRuntimeCreation } from "@/lib/runtime-integration/creation";
import { body, runtimeResponse } from "@/lib/stage-runtime/http";
export const runtime = "nodejs";
export async function GET() { return runtimeResponse(runtimeCreationRequests); }
export async function POST(request: Request) { return runtimeResponse(async () => requestRuntimeCreation(await body(request))); }
export async function PATCH(request: Request) { return runtimeResponse(async () => decideRuntimeCreation(await body(request))); }
