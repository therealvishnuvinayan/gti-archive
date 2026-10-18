# Phase 1.5A legacy authorization entry-point inventory

## Phase 1.5D governance update

- `/projects/new` and `projects/governance-actions.ts` use the trusted session and
  `project-governance/service.ts`; old creation services/actions remain blocked.
- `/projects/approvals` contains Director decisions, each manager's own requests,
  explicit legacy Artwork preset designation and SPM template proposals. Proposals
  cannot publish templates or confer a creation grant.
- `closeStageSevenProject` and its existing server action now use the shared
  Director finalization service. The Stage 7 UI links to final-completion review.
- Structured and flexible overview pages expose completion requests to the actual
  SPM/JPM owner and direct finalization to the Director. Finishing milestones still
  cannot finalize a flexible project.
- The Archive completion seam, old completion-document mutations, deletion,
  ownership transfer, unapproved creation and template publishing remain closed.
- See [PROJECT-GOVERNANCE.md](./PROJECT-GOVERNANCE.md) for migration dependencies,
  protected paths, verification and the exact Phase 1.5D manifest. The tables below
  remain historical inventories.

Historical Phase 1.5A snapshot: 2026-10-18. The project READ portions of this
inventory are superseded by [PROJECT-READ.md](./PROJECT-READ.md), and the native
project mutation portions by [PROJECT-WRITE.md](./PROJECT-WRITE.md).
Account-management, explicit external-link and non-project domain boundaries
remain separately governed. The historical tables are an inventory, not a claim of current V2 enforcement.
Line numbers are historical review aids.

## Phase 1.5C mutation inventory update

| Surface | Current boundary |
| --- | --- |
| `project-creation`, `projects`, project actions | Editing and pinning enter `runProjectMutation`; participant validation uses active V2 roles. Both creation functions, ownership transfer, project deletion and collaborator management are closed. |
| `project-inquiry`, research/import/files, private folders, folder pins/colors, drafts | Central project/resource policy and transaction; native association and ownership checks remain. Draft saves require a known available native stage; deletion only removes the actor's own draft. |
| `project-concepts`, `project-history`, `comparison`, `file-favorites` | Explicit operation allowlist, actual task executor/resource checks, native version/history protections. Approved-file resets are closed. Reopening skipped stages/tasks without files requires a Director reason and persisted native evidence. |
| `stage-five`, `stage-six`, `stage-seven` | Authenticated mutations enter V2; recipient decisions retain actual identity/version checks. Stage 7 final closure is Director-only after native sign-off. New outgoing external email dispatch is closed pending durable post-commit delivery. |
| `flexible-projects`, `flexible-project-attachments` | Director or SPM/JPM owner manages structure; actual milestone responsibility permits limited execution. Legacy collaborator rows do not grant write management. Completed milestone changes and deletion of milestones with files/notes deny. Last-task completion cannot finalize the project. |
| `project-completion`, tracker actions/services | Old completion-document mutations and tracker editing are closed. Project reads retain Phase 1.5B gates. |
| `request-reminders` | User-configured project reminders require the active project transaction. Existing scheduled dispatch/overdue processors remain system operations behind their existing credential gates. |
| `stage-five-external`, external Stage 6 decisions and signed handover links | Existing explicit token/recipient/version/expiry flows remain isolated; no business-role or global-admin bypass is added. These are not authenticated V2 user grants. |
| `ensure*Tx`, tag/checklist/handoff helpers, tracker activity writers | Trusted internal transaction helpers, not public server actions. Public initialization helpers require an already-authorized project transaction. Tracker action entry points deny before invoking its helpers. |
| Master data, global contact directory, account/settings/profile administration, Archives/Library | Outside this phase's project mutation migration. Existing legacy rules remain; no claim of application-wide V2 write coverage. No Archive/Library source edits in Phase 1.5C. The legacy `project.completeArchive` permission seam is closed to prevent project-finalization bypass. |

The exact native operation IDs, target kinds and modes are maintained in
`project-write-operations.ts`. Existing legacy role strings in display labels,
creation implementations behind closed wrappers, candidate/preview helpers and
unmigrated domains do not override a V2 project mutation denial. The historical
matching-line lists below have not been presented as current line numbers.

The direct inventory includes role gates, global-authority helpers, defaults,
protected-root checks, candidate eligibility and client/UI projections. UI and
display references are included so that later work does not leave misleading
controls. The second inventory identifies consumers of the legacy permission
engine, including paths that contain no explicit ADMIN/SUPER_ADMIN string.

## Authority derivation and role-dependent projections

| File | Matching lines |
| --- | --- |
| `src/app/(dashboard)/collaboration/page.tsx` | 7, 32 |
| `src/app/(dashboard)/projects/[slug]/edit/page.tsx` | 72 |
| `src/app/(dashboard)/projects/[slug]/page.tsx` | 105 |
| `src/app/(dashboard)/projects/[slug]/stages/1/page.tsx` | 27, 57 |
| `src/app/(dashboard)/projects/[slug]/stages/2/page.tsx` | 27, 138 |
| `src/app/(dashboard)/projects/[slug]/stages/5/page.tsx` | 29, 64 |
| `src/app/(dashboard)/projects/[slug]/stages/6/page.tsx` | 21, 52 |
| `src/app/(dashboard)/projects/[slug]/workspace/shared/[folderId]/page.tsx` | 21 |
| `src/app/(dashboard)/projects/new/page.tsx` | 38 |
| `src/app/(dashboard)/projects/page.tsx` | 136 |
| `src/app/(dashboard)/settings/page.tsx` | 7, 67, 75 |
| `src/app/(dashboard)/settings/permissions/page.tsx` | 4, 10 |
| `src/app/(dashboard)/users/actions.ts` | 40, 42, 134, 204 |
| `src/app/(dashboard)/users/page.tsx` | 7, 12 |
| `src/app/api/users/[userId]/avatar/route.ts` | 8, 22 |
| `src/app/api/users/[userId]/avatar/upload-url/route.ts` | 18, 19, 40, 67 |
| `src/components/projects/concept-chat-route.tsx` | 38 |
| `src/components/projects/create-project-form.tsx` | 138, 143 |
| `src/components/projects/project-chat-workspace.tsx` | 10788 |
| `src/components/settings/settings-workspace.tsx` | 158, 160, 569, 806, 807 |
| `src/components/users/users-workspace.tsx` | 46, 63, 64, 107, 111, 112, 113, 146, 147, 148, 283, 387, 676, 956, 1018, 1172, 1173, 1184, 1237, 1414, 1415, 1429, 1440 |
| `src/lib/archives.ts` | 52, 1659 |
| `src/lib/calendar.ts` | 138, 139, 225, 243, 262, 275 |
| `src/lib/collaboration.ts` | 135, 198, 293, 369, 380, 421 |
| `src/lib/comparison.ts` | 51, 55 |
| `src/lib/dashboard.ts` | 35, 247, 435, 1332, 1345, 1385 |
| `src/lib/flexible-projects.ts` | 12, 283, 298, 309, 384 |
| `src/lib/help-center.ts` | 592, 948, 1026, 1027, 1038 |
| `src/lib/library.ts` | 385, 386, 396, 397, 630 |
| `src/lib/permissions/definitions.ts` | 855, 856, 857, 858, 861 |
| `src/lib/permissions/effective.ts` | 5, 23, 24 |
| `src/lib/permissions/fallback-route.ts` | 5, 31 |
| `src/lib/permissions/preview.ts` | 47 |
| `src/lib/permissions/profiles.ts` | 8, 9, 84, 308, 309, 315, 390 |
| `src/lib/permissions/resolver.ts` | 11, 19, 66, 109, 110, 113, 116, 138, 158, 198, 258, 276, 293, 344, 350, 356, 365, 374, 380, 386, 389, 401, 404, 407, 409, 412, 414, 417, 421, 435, 440, 445, 447, 457 |
| `src/lib/project-collaborator-visibility.ts` | 108, 109 |
| `src/lib/project-concept-access.ts` | 7, 31, 42 |
| `src/lib/project-creation.ts` | 10, 134, 143, 152, 161, 426, 435, 444 |
| `src/lib/project-history.ts` | 29, 418, 422, 5229, 5262, 5280, 6513, 6917 |
| `src/lib/project-owner-candidates.ts` | 28, 44 |
| `src/lib/project-research-access.ts` | 10, 77, 105 |
| `src/lib/project-research.ts` | 13, 165 |
| `src/lib/project-stage-skip-revocation.ts` | 173 |
| `src/lib/projects.ts` | 50, 815, 1099, 1797, 2028, 2453, 2611, 2751, 3024 |
| `src/lib/stage-five.ts` | 26, 168, 1539, 1648, 1732 |
| `src/lib/stage-seven.ts` | 22, 142 |
| `src/lib/stage-six.ts` | 25, 62, 273, 739, 886 |
| `src/lib/user-permissions.ts` | 9, 201, 361, 362, 380, 392 |
| `src/lib/user-project-workspace.ts` | 11, 87, 290 |
| `src/lib/user-projects.ts` | 238 |
| `src/lib/user-role-compatibility.ts` | 4, 30, 31, 34, 35, 38, 39, 42, 43, 46, 47, 50, 51, 56 |
| `src/lib/user-tasks.ts` | 16, 86, 99, 107 |
| `src/lib/workflow-stage-access.ts` | 29 |

## Legacy permission consumers

| File | Matching lines |
| --- | --- |
| `src/app/(dashboard)/calendar/page.tsx` | 29, 56 |
| `src/app/(dashboard)/clients/page.tsx` | 9 |
| `src/app/(dashboard)/collaboration/actions.ts` | 28, 57 |
| `src/app/(dashboard)/collaboration/page.tsx` | 12, 27, 28, 30, 33, 34, 35 |
| `src/app/(dashboard)/final-beneficiaries/page.tsx` | 9 |
| `src/app/(dashboard)/flux-ai/page.tsx` | 13 |
| `src/app/(dashboard)/help/page.tsx` | 12 |
| `src/app/(dashboard)/layout.tsx` | 16 |
| `src/app/(dashboard)/library/page.tsx` | 35, 36, 37 |
| `src/app/(dashboard)/notifications/page.tsx` | 11 |
| `src/app/(dashboard)/page.tsx` | 16, 21 |
| `src/app/(dashboard)/projects/[slug]/chat/page.tsx` | 201, 204, 206, 207, 209, 279 |
| `src/app/(dashboard)/projects/[slug]/compare/page.tsx` | 93, 127, 132, 194 |
| `src/app/(dashboard)/projects/[slug]/edit/page.tsx` | 28, 29, 79 |
| `src/app/(dashboard)/projects/[slug]/layout.tsx` | 13 |
| `src/app/(dashboard)/projects/[slug]/page.tsx` | 101 |
| `src/app/(dashboard)/projects/actions.ts` | 224, 285 |
| `src/app/(dashboard)/projects/flexible/[projectSlug]/milestones/[milestoneId]/page.tsx` | 16 |
| `src/app/(dashboard)/projects/flexible/[projectSlug]/page.tsx` | 19 |
| `src/app/(dashboard)/projects/new/page.tsx` | 17, 21, 45 |
| `src/app/(dashboard)/projects/new/v2-actions.ts` | 32, 98, 99 |
| `src/app/(dashboard)/projects/page.tsx` | 107, 114, 256 |
| `src/app/(dashboard)/settings/actions.ts` | 66, 149 |
| `src/app/(dashboard)/settings/page.tsx` | 59, 63, 64, 65, 67 |
| `src/app/(dashboard)/settings/permissions/page.tsx` | 11, 12, 13 |
| `src/app/(dashboard)/settings/project-master-data/actions.ts` | 42, 53 |
| `src/app/(dashboard)/settings/project-master-data/page.tsx` | 12, 29, 30 |
| `src/app/(dashboard)/tasks/page.tsx` | 12 |
| `src/app/(dashboard)/users/actions.ts` | 135, 497, 535, 579, 620 |
| `src/app/(dashboard)/users/page.tsx` | 12, 23, 25, 26 |
| `src/app/api/archive-category-icons/preview/route.ts` | 20 |
| `src/app/api/archive-category-icons/upload-url/route.ts` | 29 |
| `src/app/api/asset-tags/route.ts` | 20, 21, 23 |
| `src/app/api/flux-ai/search/route.ts` | 25 |
| `src/app/api/flux-ai/search-history/route.ts` | 25 |
| `src/app/api/notifications/[notificationId]/read/route.ts` | 20 |
| `src/app/api/notifications/[notificationId]/unread/route.ts` | 20 |
| `src/app/api/notifications/read-all/route.ts` | 17 |
| `src/app/api/notifications/recent/route.ts` | 21 |
| `src/app/api/notifications/route.ts` | 21 |
| `src/app/api/notifications/unread-count/route.ts` | 17 |
| `src/app/api/profile/avatar/upload-url/route.ts` | 29 |
| `src/app/api/projects/[projectId]/collaborators/available/route.ts` | 60 |
| `src/app/api/projects/dashboard-count/route.ts` | 21 |
| `src/app/api/realtime/ably/token/route.ts` | 97, 171, 180, 325, 326, 357 |
| `src/app/api/users/[userId]/avatar/route.ts` | 23 |
| `src/app/api/users/[userId]/avatar/upload-url/route.ts` | 41 |
| `src/app/requests/checklist/[requestId]/page.tsx` | 42 |
| `src/components/projects/concept-compare-route.tsx` | 107 |
| `src/lib/ai/access.ts` | 23, 81 |
| `src/lib/archive-categories.ts` | 93 |
| `src/lib/archives.ts` | 393, 394, 395, 400, 404, 408, 501, 531, 547, 562, 606, 1580, 1665, 2147, 4381, 4382, 4383, 4610, 4829, 4860, 4938, 5245, 5284 |
| `src/lib/calendar.ts` | 137, 218, 227, 235, 311 |
| `src/lib/comparison.ts` | 221, 224, 352, 424, 478, 526 |
| `src/lib/contact-directory.ts` | 44, 60, 97 |
| `src/lib/dashboard.ts` | 243, 549, 553, 816, 860, 982, 1087, 1117, 1225 |
| `src/lib/file-favorites.ts` | 104, 110 |
| `src/lib/flexible-project-attachments.ts` | 217, 231 |
| `src/lib/flexible-projects.ts` | 282, 297, 309, 310, 319, 320, 321, 331, 594, 625 |
| `src/lib/library-access.ts` | 12, 16 |
| `src/lib/library.ts` | 383, 395, 482, 483, 519, 520, 783, 795, 1387 |
| `src/lib/manual-library-asset-favorites.ts` | 45 |
| `src/lib/permissions/effective.ts` | 8 |
| `src/lib/permissions/fallback-route.ts` | 11, 15, 19, 23, 27, 31, 35, 39, 43, 47, 51, 59, 63 |
| `src/lib/permissions/profiles.ts` | 393 |
| `src/lib/permissions/require.ts` | 19, 24, 29, 35 |
| `src/lib/permissions/resolver.ts` | 151, 157, 159, 165, 169, 170, 173, 174, 177, 179, 180, 184, 185, 204, 208, 213, 223, 224, 228, 257, 258, 261, 262, 265, 266, 268, 269, 271, 272, 273, 274, 275, 276, 277, 278, 279, 280, 281, 285, 287, 325 |
| `src/lib/project-completion.ts` | 291, 302, 339, 1019, 1224 |
| `src/lib/project-history.ts` | 1145, 1156, 1169, 1246, 1344, 1564, 1638, 2190, 2678, 2683, 3918, 4682, 5281, 5566, 5777, 5931, 6498, 6918 |
| `src/lib/project-inquiry.ts` | 377, 435, 436, 542, 543, 985 |
| `src/lib/project-research.ts` | 520 |
| `src/lib/project-tracker.ts` | 525, 526, 567, 745, 808, 913, 954 |
| `src/lib/projects.ts` | 547, 548, 804, 817, 901, 934, 940, 1115, 1118, 1121, 1122, 1207, 1212, 1217, 1335, 1610, 1989, 2282, 2776, 2781, 2829 |
| `src/lib/stage-five.ts` | 169, 182, 183 |
| `src/lib/stage-seven.ts` | 143, 297, 298, 1573 |
| `src/lib/stage-six.ts` | 274, 386, 387, 742, 777, 805, 887, 3347 |
| `src/lib/user-project-workspace.ts` | 88 |
| `src/lib/user-projects.ts` | 239 |
| `src/lib/user-tasks.ts` | 85, 93, 99, 108 |

## Findings and integration order

- `user-role-compatibility.ts` and `permissions/{definitions,effective,profiles,resolver}.ts` derive legacy global authority. SUPER_ADMIN keeps critical profile grants. `getAccessibleProjectsWhere` returns global scope for legacy administrators.
- `auth.ts` now checks V2 session status/version, then obtains the existing legacy permission snapshot for old callers. Dashboard layout uses `requireUser`, `getSidebarVisibility` and the old Tasker sidebar count. Authentication is integrated; domain visibility is not.
- User/permission pages, user actions and avatar APIs require legacy business administrator status. `user-permissions.ts` still edits legacy role/project-creation/archive settings and protects SUPER_ADMIN. They do not administer V2 assignments.
- Project creation/candidate queries, project list/detail/workspace, collaboration and calendar mix legacy roles with ownership/membership. Project participant candidate rules also filter ADMIN/USER directly.
- Traditional/flexible project queries, dashboard aggregation, history/comparison/research/concept access and stage five/six/seven services consume global-project helpers. Stage five/six/history also contain recipient bypasses for SUPER_ADMIN.
- Archive permissions are granted to every authenticated identity by the legacy resolver/effective profile. Archive categories, files, shares, downloads and Flux AI therefore still require a later complete resource-policy migration. Library permissions and direct owner/admin exceptions are also legacy.
- UI role labels and help text document legacy behavior and will require updates with their corresponding service migrations. They must not be mistaken for trusted V2 authority.
- Recommended 1.5B is the bounded project read-access slice in [RUNTIME.md](./RUNTIME.md). Schedule separate account administration, project mutation/workflow, Tasker and Archive/Library integrations afterward. No endpoint is switched merely by attaching a V2 actor.

Searches used: `rg` across `src` for all UserRole/ADMIN/SUPER_ADMIN/USER comparisons, role compatibility/global-project helpers, profile defaults and the permission helper calls listed above. Auth/session lookup, user management and dashboard routes were read separately. No listed business implementation was changed in 1.5A.
