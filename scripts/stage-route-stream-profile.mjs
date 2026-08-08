import { performance } from "node:perf_hooks";

import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();
const baseUrl = process.env.STAGE_PROFILE_BASE_URL ?? "http://localhost:3010";

const routes = [
  [1, "Stage 1 - Project Inquiry"],
  [2, "Stage 2 - Project Research and Planning"],
  [3, "Stage 3 - Initial Concept"],
  [4, "Stage 4 - Final Concept"],
  [5, "Stage 5 - File Checklist"],
];

async function profileRoute(label, path, sessionToken, marker) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { cookie: `gti_session=${sessionToken}` },
    redirect: "manual",
  });
  const headersAt = performance.now();
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let payload = "";
  let firstChunkMs = null;
  let shellMarkerMs = null;

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const elapsedMs = Math.round(performance.now() - startedAt);
      firstChunkMs ??= elapsedMs;
      payload += decoder.decode(value, { stream: true });
      if (shellMarkerMs === null && payload.includes(marker)) {
        shellMarkerMs = elapsedMs;
      }
    }
    payload += decoder.decode();
  }

  return {
    route: label,
    status: response.status,
    ttfbMs: Math.round(headersAt - startedAt),
    firstChunkMs,
    shellMarkerMs,
    completeMs: Math.round(performance.now() - startedAt),
    bytes: Buffer.byteLength(payload),
  };
}

async function main() {
  const session = await prisma.session.findFirst({
    where: {
      expiresAt: { gt: new Date() },
      user: { role: UserRole.SUPER_ADMIN },
    },
    orderBy: { expiresAt: "desc" },
    select: { token: true },
  });
  const project = await prisma.project.findFirst({
    where: { archivedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!session || !project) {
    throw new Error("An active SUPER_ADMIN session and project are required.");
  }

  await fetch(`${baseUrl}/projects/${project.id}`, {
    headers: { cookie: `gti_session=${session.token}` },
  }).then((response) => response.arrayBuffer());

  for (const [stageNumber, marker] of routes) {
    console.log(
      JSON.stringify(
        await profileRoute(
          `stage-${stageNumber}`,
          `/projects/${project.id}/stages/${stageNumber}`,
          session.token,
          marker,
        ),
      ),
    );
  }

  const [researchFolder, conceptFolder] = await Promise.all([
    prisma.projectResearchFolder.findFirst({
      where: { workspace: { projectId: project.id } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.projectConceptFolder.findFirst({
      where: {
        projectId: project.id,
        workflowStageKey: "CONCEPT_CREATION",
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  if (researchFolder) {
    console.log(
      JSON.stringify(
        await profileRoute(
          "stage-2-folder",
          `/projects/${project.id}/stages/2/folders/${researchFolder.id}`,
          session.token,
          researchFolder.name,
        ),
      ),
    );
  }

  if (conceptFolder) {
    console.log(
      JSON.stringify(
        await profileRoute(
          "stage-3-concept-chat",
          `/projects/${project.id}/stages/3/concepts/${conceptFolder.id}`,
          session.token,
          conceptFolder.name,
        ),
      ),
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
