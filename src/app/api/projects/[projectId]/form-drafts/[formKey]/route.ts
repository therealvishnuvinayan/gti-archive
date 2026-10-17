import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  deleteProjectFormDraft,
  getProjectFormDraft,
  saveProjectFormDraft,
  type ProjectFormDraftPayload,
} from "@/lib/project-form-drafts";
import { decodeRouteParam } from "@/lib/route-params";

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
  const status = /permission|access|unavailable|not found/i.test(message) ? 403 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET(_request: Request, context: RouteContext) {
  const route = await getRouteContext(context);
  if (!route) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const draft = await getProjectFormDraft(route.user, route.projectId, route.formKey);
    return NextResponse.json(
      { draft },
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
