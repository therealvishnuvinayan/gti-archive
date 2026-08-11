import { UserRole } from "@prisma/client";

import { getProjectConceptFolders } from "@/lib/project-concepts";
import { getProjectInquiryPageData } from "@/lib/project-inquiry";
import { getProjectResearchPageData } from "@/lib/project-research";
import {
  getPrismaPerformanceMetrics,
  prisma,
  resetPrismaPerformanceMetrics,
} from "@/lib/prisma";
import { getProjectStageShellById } from "@/lib/projects";
import { getStageFiveWorkspaceData } from "@/lib/stage-five";

type ProfileResult = {
  route: string;
  durationMs: number;
  queryCount: number | null;
  databaseDurationMs: number | null;
};

async function profile(route: string, action: () => Promise<unknown>) {
  resetPrismaPerformanceMetrics();
  const startedAt = performance.now();
  await action();
  const metrics = getPrismaPerformanceMetrics();
  const result: ProfileResult = {
    route,
    durationMs: Math.round(performance.now() - startedAt),
    queryCount: metrics?.queryCount ?? null,
    databaseDurationMs: metrics?.databaseDurationMs ?? null,
  };
  console.log(JSON.stringify(result));
}

async function main() {
  if (process.env.STAGE_PERFORMANCE_PROFILE !== "1") {
    throw new Error("Set STAGE_PERFORMANCE_PROFILE=1 to run this profiler.");
  }

  const user = await prisma.user.findFirst({
    where: { role: UserRole.SUPER_ADMIN },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, collaboratorType: true },
  });
  const project = await prisma.project.findFirst({
    where: {
      workflowStages: {
        some: { stageKey: "CONCEPT_CREATION", status: "AVAILABLE" },
      },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!user || !project) {
    throw new Error("A SUPER_ADMIN and a Stage 3 project are required for profiling.");
  }

  await profile("legacy-stage-shell", () =>
    prisma.project.findUnique({
      where: { id: project.id },
      relationLoadStrategy: "query",
      include: {
        status: { include: { group: true } },
        tags: { include: { tag: true } },
        createdBy: true,
        owner: true,
        coOwners: { include: { user: true } },
        executors: { include: { user: true } },
        workflowStages: { orderBy: { createdAt: "asc" } },
        stages: {
          include: {
            startedBy: true,
            invoiceRequests: {
              include: { requestedBy: true, requestedFrom: true },
            },
          },
        },
        collaborators: {
          orderBy: { createdAt: "asc" },
          include: { user: true },
        },
      },
    }),
  );

  await profile("optimized-stage-shell", () =>
    getProjectStageShellById(project.id, user),
  );

  await profile("stage-1", async () => {
    const [shell] = await Promise.all([
      getProjectStageShellById(project.id, user),
      getProjectInquiryPageData(user, project.id),
    ]);
    if (!shell) throw new Error("Project shell unavailable.");
  });

  await profile("stage-2", () =>
    getProjectResearchPageData(user, project.id),
  );

  await profile("stage-3", async () => {
    const shell = await getProjectStageShellById(project.id, user);
    if (!shell) throw new Error("Project shell unavailable.");
    await getProjectConceptFolders(user, project.id, "CONCEPT_CREATION");
  });

  await profile("stage-4", async () => {
    const shell = await getProjectStageShellById(project.id, user);
    if (!shell) throw new Error("Project shell unavailable.");
    await getProjectConceptFolders(user, project.id, "PROJECT_DEVELOPMENT");
  });

  await profile("stage-5", async () => {
    const shell = await getProjectStageShellById(project.id, user);
    if (!shell) throw new Error("Project shell unavailable.");
    await getStageFiveWorkspaceData(user, project.id);
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
