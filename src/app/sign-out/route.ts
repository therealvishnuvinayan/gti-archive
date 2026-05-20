import { NextResponse } from "next/server";

import { signOutCurrentSession } from "@/lib/auth";

export async function POST(request: Request) {
  await signOutCurrentSession();

  return NextResponse.redirect(new URL("/sign-in", request.url), {
    status: 303,
  });
}
