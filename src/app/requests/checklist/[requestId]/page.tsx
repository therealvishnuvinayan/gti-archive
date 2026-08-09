import { notFound } from "next/navigation";

import { DashboardAppFrame } from "@/components/layout/dashboard-app-frame";
import { StageFiveRequestWorkspace } from "@/components/projects/stage-five-request-workspace";
import {
  getUserDisplayName,
  getUserInitials,
  requireUser,
} from "@/lib/auth";
import { getSidebarVisibility } from "@/lib/permissions/resolver";
import { getStageFiveChecklistRequestData } from "@/lib/stage-five";

export default async function StageFiveChecklistRequestPage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const returnTo = `/requests/checklist/${encodeURIComponent(requestId)}`;
  const user = await requireUser(returnTo);
  const data = await getStageFiveChecklistRequestData(user, requestId);
  if (!data) notFound();

  const displayName = getUserDisplayName(user);
  return (
    <DashboardAppFrame
      user={{
        id: user.id,
        name: displayName,
        email: user.email,
        initials: getUserInitials(displayName),
        avatarSrc: user.avatarUrl
          ? `/api/profile/avatar?v=${encodeURIComponent(user.avatarUrl)}`
          : null,
      }}
      sidebarVisibility={getSidebarVisibility(user)}
    >
      <StageFiveRequestWorkspace data={data} />
    </DashboardAppFrame>
  );
}
