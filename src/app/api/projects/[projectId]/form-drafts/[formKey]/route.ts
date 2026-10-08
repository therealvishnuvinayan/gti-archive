import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  deleteProjectFormDraft,
  getProjectFormDraft,
  getTaskerFormChanges,
  saveProjectFormDraft,
  type ProjectFormDraftPayload,
} from "@/lib/project-form-drafts";
import { decodeRouteParam } from "@/lib/route-params";
import { TaskerError } from "@/lib/tasker/errors";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: Promise<{ projectId: string; formKey: string }>;
};

async function getRouteContext(context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return null;

  const params = await context.params;
  return {
    user,
    projectId: decodeRouteParam(params.projectId),
    formKey: decodeRouteParam(params.formKey),
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to save this draft.";
  const status = error instanceof TaskerError ? error.status : /permission|access|unavailable|not found/i.test(message) ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request, context: RouteContext) {
  const route = await getRouteContext(context);
  if (!route) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const draft = await getProjectFormDraft(route.user, route.projectId, route.formKey);
    const since = Number(new URL(request.url).searchParams.get("taskerRevision") ?? 0);
    const tasker = await getTaskerFormChanges(route.user, route.projectId, route.formKey, Number.isSafeInteger(since) ? since : 0);
    return NextResponse.json(
      { draft, tasker },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const route = await getRouteContext(context);
  if (!route) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    payload?: ProjectFormDraftPayload;
    clientId?: string;
    clientRevision?: number;
    taskerRevision?: number;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid autosave request." }, { status: 400 });
  }

  try {
    const saved = await saveProjectFormDraft(route.user, {
      projectId: route.projectId,
      formKey: route.formKey,
      payload: body.payload ?? {},
      clientId: body.clientId ?? "",
      clientRevision: body.clientRevision ?? -1,
      taskerRevision: body.taskerRevision,
    });
    return NextResponse.json({ saved });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const route = await getRouteContext(context);
  if (!route) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    await deleteProjectFormDraft(route.user, route.projectId, route.formKey);
    return NextResponse.json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
