import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { setLibraryAttachmentFavorite } from "@/lib/library";
import { libraryErrorResponse } from "@/lib/library-http";

type Context = { params: Promise<{ attachmentId: string }> };
async function favorite(context: Context, value: boolean) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const { attachmentId } = await context.params;
    return NextResponse.json(await setLibraryAttachmentFavorite(user, attachmentId, value));
  } catch (error) { return libraryErrorResponse(error); }
}
export async function POST(_request: Request, context: Context) { return favorite(context, true); }
export async function DELETE(_request: Request, context: Context) { return favorite(context, false); }
