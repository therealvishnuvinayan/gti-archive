CREATE TABLE "ProjectProjectTag" (
  "projectId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProjectProjectTag_pkey" PRIMARY KEY ("projectId", "tagId")
);

CREATE INDEX "ProjectProjectTag_tagId_idx" ON "ProjectProjectTag"("tagId");

ALTER TABLE "ProjectProjectTag"
ADD CONSTRAINT "ProjectProjectTag_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProjectProjectTag"
ADD CONSTRAINT "ProjectProjectTag_tagId_fkey"
FOREIGN KEY ("tagId") REFERENCES "ProjectTag"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ProjectTag" ("id", "name", "isActive", "createdAt", "updatedAt")
SELECT
  'legacy_tag_' || md5(lower(trim(project_tags."tag"))),
  trim(project_tags."tag"),
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (lower(trim("tag")))
    "tag"
  FROM "Project"
  WHERE "tag" IS NOT NULL
    AND trim("tag") <> ''
  ORDER BY lower(trim("tag")), trim("tag")
) AS project_tags
WHERE NOT EXISTS (
  SELECT 1
  FROM "ProjectTag"
  WHERE lower("ProjectTag"."name") = lower(trim(project_tags."tag"))
);

INSERT INTO "ProjectProjectTag" ("projectId", "tagId", "createdAt")
SELECT
  project."id",
  tag."id",
  CURRENT_TIMESTAMP
FROM "Project" AS project
JOIN "ProjectTag" AS tag
  ON lower(tag."name") = lower(trim(project."tag"))
WHERE project."tag" IS NOT NULL
  AND trim(project."tag") <> ''
ON CONFLICT ("projectId", "tagId") DO NOTHING;
