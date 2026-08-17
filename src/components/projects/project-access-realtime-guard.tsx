"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { useProjectAccessRealtime } from "@/hooks/use-project-access-realtime";
import { showErrorToast } from "@/lib/toast";

type ProjectAccessRealtimeGuardProps = {
  projectId: string;
  currentUserId: string;
  fallbackRefreshIntervalMs?: number;
};

export function ProjectAccessRealtimeGuard({
  projectId,
  currentUserId,
  fallbackRefreshIntervalMs,
}: ProjectAccessRealtimeGuardProps) {
  const router = useRouter();
  const lastRefreshAtRef = useRef(0);
  const refreshProject = useCallback(() => {
    lastRefreshAtRef.current = Date.now();
    router.refresh();
  }, [router]);
  const handleAccessRevoked = useCallback(() => {
    showErrorToast(
      "Project access changed.",
      "Your access to this project was removed.",
    );
    router.replace("/projects");
    router.refresh();
  }, [router]);
  const handleActivityUpdated = useCallback(() => {
    refreshProject();
  }, [refreshProject]);

  useProjectAccessRealtime({
    projectId,
    currentUserId,
    onAccessRevoked: handleAccessRevoked,
    onActivityUpdated: handleActivityUpdated,
  });

  useEffect(() => {
    if (!fallbackRefreshIntervalMs || fallbackRefreshIntervalMs < 1_000) {
      return;
    }

    const refreshVisibleProject = () => {
      if (
        document.visibilityState !== "visible" ||
        Date.now() - lastRefreshAtRef.current < 1_000
      ) {
        return;
      }

      refreshProject();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshVisibleProject();
      }
    };
    const intervalId = window.setInterval(
      refreshVisibleProject,
      fallbackRefreshIntervalMs,
    );

    window.addEventListener("focus", refreshVisibleProject);
    window.addEventListener("online", refreshVisibleProject);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVisibleProject);
      window.removeEventListener("online", refreshVisibleProject);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fallbackRefreshIntervalMs, refreshProject]);

  return null;
}
