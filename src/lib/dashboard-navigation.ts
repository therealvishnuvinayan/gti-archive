export type DashboardBackNavigation =
  | { owner: "none" }
  | { owner: "page" }
  | {
      owner: "topbar";
      href: string;
      label: string;
      ariaLabel: string;
    };

type SearchParamsReader = Pick<URLSearchParams, "get">;

function getProjectsReturnHref(value: string | null) {
  if (!value) return "/projects";

  try {
    const decodedValue = decodeURIComponent(value);
    if (decodedValue === "/projects" || decodedValue.startsWith("/projects?")) {
      return decodedValue;
    }
  } catch {
    // The un-decoded fallback below still enforces the same internal route boundary.
  }

  if (value === "/projects" || value.startsWith("/projects?")) return value;
  return "/projects";
}

function topbar(href: string, label: string, ariaLabel: string): DashboardBackNavigation {
  return { owner: "topbar", href, label, ariaLabel };
}

export function getDashboardBackNavigation(
  pathname: string,
  searchParams: SearchParamsReader,
): DashboardBackNavigation {
  const segments = pathname.split("/").filter(Boolean);

  if (pathname === "/projects/new") {
    return topbar("/projects", "Projects", "Back to Projects");
  }

  if (pathname === "/settings/project-master-data") {
    return topbar("/settings", "Settings", "Back to Settings");
  }

  if (segments[0] === "archives" && segments.length >= 2) {
    return topbar("/archives", "Archives", "Back to Archives");
  }

  if (segments[0] !== "projects") return { owner: "none" };
  if (segments.length === 1) return { owner: "none" };

  const projectId = segments[1];

  if (segments.length === 2) {
    return topbar(
      getProjectsReturnHref(searchParams.get("returnTo")),
      "Projects",
      "Back to Projects",
    );
  }

  const nestedRoute = segments[2];

  if (nestedRoute === "edit") {
    return topbar(
      `/projects/${projectId}`,
      "Project Overview",
      "Back to Project Overview",
    );
  }

  if (nestedRoute === "chat") {
    return topbar(
      `/projects/${projectId}`,
      "Project Overview",
      "Back to Project Overview",
    );
  }

  if (nestedRoute === "compare") {
    const stageId = searchParams.get("stage");
    return topbar(
      stageId
        ? `/projects/${projectId}/chat?stage=${encodeURIComponent(stageId)}`
        : `/projects/${projectId}`,
      stageId ? "Stage Chat" : "Project Overview",
      stageId ? "Back to Stage Chat" : "Back to Project Overview",
    );
  }

  if (nestedRoute !== "stages") {
    return topbar(
      `/projects/${projectId}`,
      "Project Overview",
      "Back to Project Overview",
    );
  }

  const stageNumber = segments[3];
  const nestedStageRoute = segments[4];

  if (stageNumber === "2" && nestedStageRoute === "folders" && segments[5]) {
    return { owner: "page" };
  }

  if (
    (stageNumber === "3" || stageNumber === "4") &&
    nestedStageRoute === "concepts" &&
    segments[5]
  ) {
    return topbar(
      `/projects/${projectId}/stages/${stageNumber}`,
      "Concept Folders",
      `Back to Stage ${stageNumber} Concept Folders`,
    );
  }

  return topbar(
    `/projects/${projectId}`,
    "Project Overview",
    "Back to Project Overview",
  );
}
