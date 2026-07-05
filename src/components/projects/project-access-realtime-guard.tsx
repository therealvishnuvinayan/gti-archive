"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { useProjectAccessRealtime } from "@/hooks/use-project-access-realtime";
import { showErrorToast } from "@/lib/toast";

type ProjectAccessRealtimeGuardProps = {
  projectId: string;
  currentUserId: string;
};

export function ProjectAccessRealtimeGuard({
  projectId,
  currentUserId,
}: ProjectAccessRealtimeGuardProps) {
  const router = useRouter();
  const handleAccessRevoked = useCallback(() => {
    showErrorToast(
      "Project access changed.",
      "Your access to this project was removed.",
    );
    router.replace("/projects");
    router.refresh();
  }, [router]);

  useProjectAccessRealtime({
    projectId,
    currentUserId,
    onAccessRevoked: handleAccessRevoked,
  });

  return null;
}
