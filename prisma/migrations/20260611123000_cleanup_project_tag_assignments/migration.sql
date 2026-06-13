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

ALTER TABLE "ProjectProjectTag" RENAME TO "ProjectTagAssignment";
ALTER INDEX "ProjectProjectTag_pkey" RENAME TO "ProjectTagAssignment_pkey";
ALTER INDEX "ProjectProjectTag_tagId_idx" RENAME TO "ProjectTagAssignment_tagId_idx";
ALTER TABLE "ProjectTagAssignment" RENAME CONSTRAINT "ProjectProjectTag_projectId_fkey" TO "ProjectTagAssignment_projectId_fkey";
ALTER TABLE "ProjectTagAssignment" RENAME CONSTRAINT "ProjectProjectTag_tagId_fkey" TO "ProjectTagAssignment_tagId_fkey";

ALTER TABLE "Project" DROP COLUMN "tag";
