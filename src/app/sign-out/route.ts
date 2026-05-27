import { NextResponse } from "next/server";

import { getExpiredSessionCookie, signOutCurrentSession } from "@/lib/auth";

export async function POST(request: Request) {
  await signOutCurrentSession();

  const response = NextResponse.redirect(new URL("/sign-in", request.url), {
    status: 303,
  });
  const expiredSessionCookie = getExpiredSessionCookie();

  response.cookies.set(
    expiredSessionCookie.name,
    expiredSessionCookie.value,
    expiredSessionCookie.options,
  );
  response.headers.set("Cache-Control", "no-store, max-age=0");

  return response;
}
