import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getActiveAssetTagOptions } from "@/lib/asset-tags";
import { createDevTimer, timeDevAsync } from "@/lib/dev-timing";
import { canUseArchives, hasPermission } from "@/lib/permissions/resolver";

export async function GET() {
  const timer = createDevTimer("[library:asset-tags]");
  const user = await getCurrentUser();
  timer.mark("auth/session");

  if (!user) {
    timer.end("asset-tags request unauthorized");
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const canUseAssetTags =
    (hasPermission(user, "library.view") &&
      hasPermission(user, "library.uploadAsset")) ||
    (canUseArchives(user) && hasPermission(user, "archive.uploadFile")) ||
    hasPermission(user, "settings.manageMasterData");

  if (!canUseAssetTags) {
    timer.end("asset-tags request forbidden");
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const tags = await timeDevAsync("[library:asset-tags]", "asset-tags route query", () =>
    getActiveAssetTagOptions(),
  );
  timer.end("asset-tags request", {
    tagCount: tags.length,
  });

  return NextResponse.json({ tags });
}
