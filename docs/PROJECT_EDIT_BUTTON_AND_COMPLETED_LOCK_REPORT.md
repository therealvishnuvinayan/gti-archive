# Project Edit Button and Completed Lock Report

## Where Edit Project was added
- Added an `Edit Project` button to the project detail hero actions.
- The button links directly to `/projects/[projectId]/edit`.
- The button is only rendered when the mapped project record says the current user can edit.

## Projects Page Edit Action Behavior
- Project cards continue to show the edit icon only when the user has `project.update`.
- The edit icon is now also hidden when the project is locked by completed/archived timestamps or completed/archived status group.

## Completed Project Lock Behavior
- Completed and archived projects are treated as locked for editing.
- The lock uses existing project status group logic through `isProjectStatusCompleted`, plus `completedAt` and `archivedAt`.
- Stage completion alone does not lock project editing unless the full project is completed/archived.
- Completed project detail pages do not show `Edit Project`; they show `Completed project · editing locked`.

## Permission Rules
- Edit actions still require the existing `project.update` permission.
- Unauthorized/view-only users do not receive edit links from the list or detail mapper.
- The edit page still rejects users without access or update permission.

## Server-Side Protection
- Direct edit URLs for completed/archived projects show a locked state with `Completed projects cannot be edited.`
- `updateProjectAction` rejects edits when the existing project has completed/archived timestamps, archive record, or completed/archived status group.

## Files Changed
- `src/components/projects/project-detail-workspace.tsx`
- `src/components/projects/project-route-state.tsx`
- `src/app/(dashboard)/projects/[slug]/edit/page.tsx`
- `src/app/(dashboard)/projects/new/actions.ts`
- `src/lib/projects.ts`
- `scripts/project-edit-lock-checks.mjs`
- `docs/PROJECT_EDIT_BUTTON_AND_COMPLETED_LOCK_REPORT.md`

## Manual QA Checklist
1. Open an active project detail page.
2. Confirm `Edit Project` is visible for an allowed user.
3. Click it and confirm it opens the correct edit page.
4. Go to Projects page and confirm the edit icon appears for editable active projects.
5. Mark or verify a project as completed.
6. Confirm the edit icon is hidden on the Projects page.
7. Open the completed project detail page.
8. Confirm `Edit Project` is hidden and editing locked text appears.
9. Try the direct completed project edit URL.
10. Confirm editing is blocked with `Completed projects cannot be edited.`
11. Login as an unauthorized collaborator and confirm edit is hidden.
