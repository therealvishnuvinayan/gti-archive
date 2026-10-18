import { NextResponse } from "next/server";
import { AuthorizationDeniedError } from "./authorization/policy";

export function libraryErrorResponse(error: unknown) {
  if (error instanceof AuthorizationDeniedError) return NextResponse.json({ error: "Library access denied." }, { status: 403 });
  return NextResponse.json({ error: error instanceof Error ? error.message : "Library operation failed." }, { status: 400 });
}
