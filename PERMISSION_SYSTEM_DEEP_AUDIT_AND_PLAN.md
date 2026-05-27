# Permission System Deep Audit And Plan

## Executive Summary

The current GTI Archive / PMS app already has several access concepts, but they are fragmented:

- Global roles exist in the database: `SUPER_ADMIN`, `ADMIN`, `COLLABORATOR`.
- Project-context roles exist implicitly in business logic: project owner, project executor, project collaborator.
- Collaborator participant types exist and are already used for identification and grouping.
- Module access fields exist on `User`: `projectAccess`, `calendarAccess`, `libraryAccess`, `archiveAccess`.
- Sensitive workflows such as archive completion, completion checklist documents, and file preview/download have some meaningful server-side checks.

The system is not yet a permission system. It is a mix of:

- role checks
- ownership checks
- executor checks
- collaborator-membership checks
- UI booleans
- some specialized server-side helper checks

The biggest architectural issue is that access meaning is not centralized. The same business rule is implemented differently in different places. Some critical flows are well protected server-side, but other areas are under-protected or globally exposed.

### Biggest risks found

1. Global project data exposure:
   - Project counts, recent projects, project list results, and filter options are not consistently scoped to the current user.
   - This risks exposing project names, counts, categories, and tags to authenticated users who should not see them.

2. Module access fields exist but are mostly not enforced:
   - `projectAccess`, `calendarAccess`, `libraryAccess`, `archiveAccess` are stored on `User`, and shown in Collaboration, but not used as a real enforcement layer in most loaders, actions, or sidebar visibility.

3. Collaboration management is under-protected:
   - The main save collaborator action currently requires only an authenticated user, not admin/super-admin permission.

4. Calendar is under-protected:
   - Calendar events and collaborator assignment actions are available to any authenticated dashboard user.
   - `calendarAccess` is not used as a real guard.

5. Permission logic is scattered:
   - Budget visibility, review actions, archive completion, collaborator management, file deletion, and notification access all use different patterns.
   - This makes the system brittle and hard to evolve into client-managed permissions.

### Recommendation

Do **not** build this around API-route names.

Use a **permission-key model**:

- stable semantic permission keys such as `project.viewBudget`, `stage.submitWork`, `file.download`, `archive.view`
- enforced in loaders, serializers, server actions, API routes, and UI visibility helpers
- independent of route names or component structure

Recommended architecture:

- Permission definitions in code
- role/type/access-preset assignments in DB
- explicit project-level collaborator overrides later if needed
- centralized server-side resolution and field filtering

Recommended rollout:

- Phase 1: introduce permission definitions, permission helpers, and protect the highest-risk server loaders/actions first
- Phase 2: add field-level serializers for sensitive data
- Phase 3: build `Settings -> Permissions`
- Phase 4: refactor UI visibility to consume permission helpers
- Phase 5: extend invite modal to use permission presets and optional overrides

---

## 1. Current Architecture Findings

### App structure

The app is a Next.js App Router dashboard app with:

- authenticated dashboard layout: `src/app/(dashboard)/layout.tsx`
- page routes under `src/app/(dashboard)`
- a mix of server components, server actions, and API routes
- Prisma as the main persistence layer
- attachment metadata stored in DB with S3-backed file objects

### Core route groups inspected

- Dashboard: `src/app/(dashboard)/page.tsx`
- Projects:
  - `src/app/(dashboard)/projects/page.tsx`
  - `src/app/(dashboard)/projects/new/page.tsx`
  - `src/app/(dashboard)/projects/[slug]/page.tsx`
  - `src/app/(dashboard)/projects/[slug]/edit/page.tsx`
  - `src/app/(dashboard)/projects/[slug]/chat/page.tsx`
  - `src/app/(dashboard)/projects/[slug]/compare/page.tsx`
- Library: `src/app/(dashboard)/library/page.tsx`
- Archives:
  - `src/app/(dashboard)/archives/page.tsx`
  - `src/app/(dashboard)/archives/[slug]/page.tsx`
- Collaboration: `src/app/(dashboard)/collaboration/page.tsx`
- Calendar: `src/app/(dashboard)/calendar/page.tsx`
- Notifications: `src/app/(dashboard)/notifications/page.tsx`
- Settings:
  - `src/app/(dashboard)/settings/page.tsx`
  - `src/app/(dashboard)/settings/project-master-data/page.tsx`

### Main server-side modules inspected

- Auth/session: `src/lib/auth.ts`
- Projects: `src/lib/projects.ts`
- Stage history / chat / submissions / attachments: `src/lib/project-history.ts`
- Collaborator visibility pause rules: `src/lib/project-collaborator-visibility.ts`
- Archives: `src/lib/archives.ts`
- Completion workflow: `src/lib/project-completion.ts`
- Library: `src/lib/library.ts`
- Collaboration: `src/lib/collaboration.ts`
- Calendar: `src/lib/calendar.ts`
- Notifications: `src/lib/notification-center/*`

### Current deployment assumptions

The codebase is aligned to a serverless-friendly Next.js architecture:

- authenticated App Router pages
- server actions
- authenticated API routes
- no visible custom long-lived server process

That does not change the permission recommendation, but it strongly supports a centralized server-side permission helper layer rather than middleware-only or socket-driven enforcement.

---

## 2. Current Role And Access Findings

### 2.1 Global roles

Defined in `prisma/schema.prisma`:

- `SUPER_ADMIN`
- `ADMIN`
- `COLLABORATOR`

Stored on `User.role`.

### 2.2 Module access fields

Also defined on `User`:

- `projectAccess`
- `calendarAccess`
- `libraryAccess`
- `archiveAccess`

Enum values:

- `FULL`
- `LIMITED`
- `NONE`

These fields are surfaced in Collaboration UI and persisted by collaborator management, but are not yet a reliable enforcement layer across the app.

### 2.3 Collaborator type

Global collaborator type on `User.collaboratorType`:

- `INTERNAL`
- `EXTERNAL`

This is currently used mostly for labels/grouping, not as a real permission preset.

### 2.4 Project-context roles

These are not formal enums yet, but are heavily used in business logic:

- Project Owner: `Project.createdById`
- Project Executor: `Project.executorUserId`
- Project Collaborator: `ProjectCollaborator.userId`

### 2.5 Participant / collaborator types on project membership

Already defined in schema and helper metadata:

- `GTI_INTERNAL_CLIENT`
- `GTI_SISTER_COMPANY_INTERNAL_CLIENT`
- `EXTERNAL_FREELANCER`
- `EXTERNAL_AGENCY`
- `EXTERNAL_VENDOR`
- `CLIENT_OF_GTI`

Key files:

- `prisma/schema.prisma`
- `src/lib/project-collaborator-participant-types.ts`

These are product-ready candidates for permission presets later.

---

## 3. Current Ownership / Executor / Collaborator Model

### 3.1 Project owner

Stored on `Project.createdById`.

Currently used for:

- budget visibility
- submission review authority
- project completion / archive authority
- collaborator management in project stage chat
- some file deletion authority

### 3.2 Project executor

Stored on `Project.executorUserId`.

Currently used for:

- brief acceptance
- stage work submission
- some completion checklist visibility
- invoice upload in completion workflow

### 3.3 Project collaborators

Stored in `ProjectCollaborator`.

Current membership model includes:

- `projectId`
- `userId`
- `participantType`
- `chatVisibilityPaused`
- visibility pause history through `ProjectCollaboratorVisibilityPause`

### 3.4 Internal / external grouping

Derived from global user collaborator type and/or project participant type:

- project collaborator UI shows internal vs external grouping
- mention dropdown and project collaborator panel also reflect this

### 3.5 What is dynamic now vs hardcoded now

Dynamic now:

- project collaborator membership
- participant type labels
- visibility pause windows
- completion workflow document access logic
- library and attachment access based on project membership

Hardcoded now:

- owner-only budget visibility
- owner-only submission review
- executor-only stage submission
- owner-only archive completion
- admin/super-admin-only project master data management
- role-based project create/edit/delete gating
- some delete actions tied directly to `SUPER_ADMIN` or owner checks

### 3.6 What could break if permissions are changed without architecture

- budget visibility could drift between serializers and forms
- UI could show actions the server later denies
- project collaborator management could remain over-permissive
- archive/document/file actions could become inconsistent across Library, Archives, chat, and completion panels
- participant-specific visibility rules could conflict with global role grants if not resolved centrally

---

## 4. Existing Permission And Access Checks

This section lists the most important current checks and whether they are server-side or UI-side.

### 4.1 Auth/session

| Location | Function / file | Current check | Enforcement | Notes |
|---|---|---|---|---|
| `src/lib/auth.ts` | `getCurrentUser`, `requireUser` | session cookie `gti_session` | Server | Solid authentication entry point |
| `src/app/(dashboard)/layout.tsx` | dashboard layout | `requireUser()` | Server | Protects all dashboard routes |

### 4.2 Project access

| Location | Current check | Enforcement | Notes |
|---|---|---|---|
| `src/lib/project-history.ts` | `assertProjectAccess` allows admin, super admin, owner, executor, collaborator | Server | Core project-scope access helper |
| `src/lib/projects.ts` | `canAccessProjectRecord` style membership checks in project loaders | Server | Project detail is scoped |
| `src/lib/comparison.ts` | compare page uses project access | Server | Good pattern |

### 4.3 Collaborator visibility pauses

| Location | Current check | Enforcement | Notes |
|---|---|---|---|
| `src/lib/project-collaborator-visibility.ts` | owner/admin/super-admin bypass; collaborator history filtered by pause windows | Server | Good field-level protection foundation |
| `src/lib/project-history.ts` | attachments/comments/revisions filtered by visibility rules | Server | One of the stronger existing protections |

### 4.4 Budget visibility

| Location | Current check | Enforcement | Notes |
|---|---|---|---|
| `src/lib/projects.ts` | `canViewProjectBudget(project, currentUser)` -> owner only | Server | Budget removed in detail/edit serializers |
| `src/app/(dashboard)/projects/new/actions.ts` | edit action sets `canViewBudget` by owner | Server | Admin can still edit project, but not budget |

### 4.5 Completion workflow

| Location | Current check | Enforcement | Notes |
|---|---|---|---|
| `src/lib/project-completion.ts` | `canViewCompletionWorkflow` -> owner or executor | Server | Good step-specific access |
| `src/lib/project-completion.ts` | `canManageCompletionWorkflow` -> owner only | Server | Good |
| `src/lib/project-completion.ts` | invoice upload -> owner or executor | Server | Good |
| `src/lib/project-completion.ts` | completion documents -> owner/executor/admin/super-admin | Server | Good |

### 4.6 Library and files

| Location | Current check | Enforcement | Notes |
|---|---|---|---|
| `src/lib/library.ts` | project membership + visibility filtering | Server | Good project scoping |
| `src/lib/library.ts` | delete allowed only for project owner or super admin | Server | Good specific rule |
| `src/app/api/project-assets/[attachmentId]/download/route.ts` | current user required, attachment access helper | Server | Good |
| `src/app/api/project-assets/[attachmentId]/preview/route.ts` | current user required, attachment access helper | Server | Good |
| `src/app/api/project-assets/[attachmentId]/route.ts` | current user required, delete helper | Server | Good |
| `src/app/api/project-assets/[attachmentId]/favorite/route.ts` | current user required, access check | Server | Good |

### 4.7 Notifications

| Location | Current check | Enforcement | Notes |
|---|---|---|---|
| `src/lib/notification-center/service.ts` | user-scoped notification queries and updates | Server | Strong per-user ownership pattern |
| `src/app/api/notifications/*` | uses `getCurrentUser()` and user-specific service methods | Server | Safe ownership model |

### 4.8 Settings and master data

| Location | Current check | Enforcement | Notes |
|---|---|---|---|
| `src/app/(dashboard)/settings/page.tsx` | any authenticated user can access own settings | Server | Correct |
| `src/app/(dashboard)/settings/project-master-data/page.tsx` | admin/super-admin only | Server | Good |
| `src/app/(dashboard)/settings/project-master-data/actions.ts` | admin for create/update/toggle, super-admin for delete | Server | Good |

### 4.9 Collaboration

| Location | Current check | Enforcement | Notes |
|---|---|---|---|
| `src/app/(dashboard)/collaboration/page.tsx` | any authenticated user can open page | Server | Risky |
| `src/app/(dashboard)/collaboration/actions.ts` | `saveCollaboratorAction` only requires authenticated user | Server | High-risk gap |
| `src/app/(dashboard)/collaboration/actions.ts` | `deleteCollaboratorAction` super-admin only | Server | Safe for delete only |

### 4.10 Calendar

| Location | Current check | Enforcement | Notes |
|---|---|---|---|
| `src/app/(dashboard)/calendar/page.tsx` | no explicit role/module guard beyond dashboard auth | Server | Risky |
| `src/app/(dashboard)/calendar/actions.ts` | `saveCalendarEventAction` only requires authenticated user | Server | High-risk gap |
| `src/app/(dashboard)/calendar/actions.ts` | `saveCalendarCollaboratorsAction` only requires authenticated user | Server | High-risk gap |

### 4.11 Project create / update / delete

| Location | Current check | Enforcement | Notes |
|---|---|---|---|
| `src/app/(dashboard)/projects/new/actions.ts` | create denied only for `COLLABORATOR` | Server | Coarse |
| `src/app/(dashboard)/projects/new/actions.ts` | update denied only for `COLLABORATOR` | Server | Coarse |
| `src/app/(dashboard)/projects/new/actions.ts` | delete denied only for `COLLABORATOR` | Server | High-risk gap; broad delete ability for others |
| `src/app/(dashboard)/projects/[slug]/edit/page.tsx` | edit page blocks only collaborators | Server/UI | Coarse |

### 4.12 UI-only visibility patterns

Examples:

- `src/components/projects/project-chat-workspace.tsx`
- `src/components/projects/project-detail-workspace.tsx`
- `src/components/layout/sidebar.tsx`

Current pattern:

- many buttons are shown/hidden using booleans like `isProjectOwner`, `isProjectExecutor`, `canManageCollaborators`
- these are not normalized into reusable permission keys
- sidebar shows most modules to all users

---

## 5. Current Permission Gaps

### 5.1 Global project exposure in dashboard and project list

High-risk findings:

- `src/lib/projects.ts:getDashboardProjectCounts()`
- `src/lib/projects.ts:getRecentProjects()`
- `src/lib/projects.ts:getProjectsList()`
- `src/lib/projects.ts:getProjectListFilterOptions()`

These do not consistently take the current user and do not consistently filter by accessible projects.

Impact:

- global project counts are visible
- recent project list can expose project titles
- project list and its filters can expose names/categories/tags

### 5.2 Collaboration admin gap

`src/app/(dashboard)/collaboration/actions.ts`

- `saveCollaboratorAction` has no admin/super-admin gate
- any authenticated user who can invoke the server action can create/update collaborators

### 5.3 Calendar admin/access gap

`src/app/(dashboard)/calendar/actions.ts`

- event creation/update path has no role/module gate
- calendar collaborator assignment path has no role/module gate
- `calendarAccess` is stored but not enforced

### 5.4 Sidebar/module visibility gap

`src/components/layout/sidebar.tsx`

- Dashboard, Projects, Calendar, Collaboration, Notifications, Library, Archives, Settings, Help all render for every authenticated user
- module access fields are ignored

### 5.5 No shared permission vocabulary

The codebase currently has no first-class permission definitions such as:

- `project.update`
- `stage.submitWork`
- `file.download`
- `archive.view`

This makes server-side enforcement inconsistent and makes future admin-managed permissions difficult.

### 5.6 Sensitive field filtering is inconsistent

Good:

- budget is filtered in project detail/edit serializers
- paused collaborator history is filtered server-side

Weak:

- project list / dashboard metadata
- collaboration directory visibility
- calendar collaborator access
- archive visibility based only on project membership, not archive permissions

---

## 6. Sensitive Data Exposure Audit

### Sensitive fields and modules

| Sensitive area | Where it appears | Current server-side filtering | Risk level | Recommendation |
|---|---|---|---|---|
| Project budget | project detail, edit, stage overview | owner-only in serializers | Medium | Move to `project.viewBudget` / `project.updateBudget` |
| Project currency | project detail/edit | tied to budget visibility | Medium | Same as budget |
| Project names / categories / tags | dashboard, projects list, filters | not consistently scoped | High | Filter by accessible projects before serialization |
| Executor / collaborator identity | project detail, stage chat, collaborator panels, calendar | broad exposure | Medium/High | Add `project.viewParticipants` and `collaboration.viewDirectory` |
| Vendor information | participant types, future project vendor data | not formalized | Medium | Reserve `project.viewVendorInfo` |
| Chat messages | stage history | filtered by collaborator pause rules | Low/Medium | Keep server-side field filtering; expose via `chat.view` |
| Paused collaborator history | stage history | filtered server-side | Low | Preserve as hard security rule |
| Working files | project assets, library, chat attachments | filtered by project access and pause rules | Medium | Add `file.view`, `file.download`, `library.view` |
| Archived files | archives, completed project | filtered by project membership | Medium | Add `archive.view`, `archive.download` |
| Completion docs | approval proof, copyright docs, invoices | owner/executor/admin/super-admin only | Low/Medium | Formalize as `completion.*` and `archive.*` permissions |
| Notifications | dropdown/page/API | current-user only | Low | Formalize as `notification.view`, `notification.markRead` |
| Calendar events | calendar | no meaningful permission layer | High | Add `calendar.view`, `calendar.create`, `calendar.update` |

### Network payload risk

Current main risk is not only UI visibility, but server payload scope:

- if a list loader or serializer returns data a user should not see, hiding buttons later is not enough
- permission design must therefore include field-level serialization helpers and not just UI button guards

---

## 7. Page / Action / Button Inventory

This inventory focuses on major user-facing actions that should become permission-controlled.

## 7.1 Dashboard

File: `src/app/(dashboard)/page.tsx`

Current actions:

- `+ New Project`
- `+ Upload Assets` placeholder
- view dashboard counts
- view recent projects

Current behavior:

- page is visible to any authenticated dashboard user
- counts and recent projects are global, not scoped

Suggested permissions:

- `dashboard.view`
- `project.create`
- `project.list`

### Recommended control outcome

- counts/recent projects should only include accessible projects
- `+ New Project` should depend on `project.create`

## 7.2 Projects list

Files:

- `src/app/(dashboard)/projects/page.tsx`
- `src/components/projects/projects-browser.tsx`
- `src/lib/projects.ts`

Current actions:

- view projects
- filter/search projects
- open project

Current behavior:

- page authenticated
- data source likely not fully access-scoped

Suggested permissions:

- `project.list`
- `project.view`

## 7.3 Create project

Files:

- `src/app/(dashboard)/projects/new/page.tsx`
- `src/app/(dashboard)/projects/new/actions.ts`
- `src/components/projects/create-project-workspace.tsx`

Current behavior:

- collaborators cannot create projects
- admins and super admins can

Current server-side rule:

- role-only, no permission abstraction

Suggested permission:

- `project.create`

## 7.4 Edit project

Files:

- `src/app/(dashboard)/projects/[slug]/edit/page.tsx`
- `src/app/(dashboard)/projects/new/actions.ts`

Current actions:

- edit metadata
- change executor
- change collaborators
- change stage definitions
- change budget if owner

Current behavior:

- collaborators blocked
- non-collaborator users can reach edit path broadly
- budget edit is owner-only

Suggested permissions:

- `project.update`
- `project.updateBudget`
- `project.manageCollaborators`
- `stage.manageDefinitions`

## 7.5 Delete project

File:

- `src/app/(dashboard)/projects/new/actions.ts`

Current behavior:

- only collaborators blocked
- all other roles can delete a project by id

Suggested permission:

- `project.delete`

Hard rule recommendation:

- default delete should remain restricted to `SUPER_ADMIN` and possibly owner depending on product decision

## 7.6 Project detail / stage overview

Files:

- `src/app/(dashboard)/projects/[slug]/page.tsx`
- `src/components/projects/project-detail-workspace.tsx`

Current actions:

- open stage
- view budget
- view attachments
- view completion summary/checklist if completed

Suggested permissions:

- `project.view`
- `stage.view`
- `project.viewBudget`
- `file.view`
- `completion.viewChecklist`

## 7.7 Stage chat

Files:

- `src/app/(dashboard)/projects/[slug]/chat/page.tsx`
- `src/components/projects/project-chat-workspace.tsx`
- `src/app/(dashboard)/projects/actions.ts`

Current actions:

- accept brief
- add comment
- mention user
- upload attachment
- upload submission
- request revision
- mark submission complete
- mark stage complete
- compare submissions
- add/remove collaborator
- pause collaborator visibility
- complete/archive project

Suggested permissions:

- `stage.acceptBrief`
- `chat.view`
- `chat.createComment`
- `chat.mentionUser`
- `chat.uploadAttachment`
- `file.favorite`
- `stage.submitWork`
- `stage.reviewSubmission`
- `stage.requestRevision`
- `stage.markSubmissionComplete`
- `stage.markStageComplete`
- `project.manageCollaborators`
- `collaborator.pauseVisibility`
- `project.completeArchive`

### Hard business rules to preserve

- stage submission should remain executor-only by default
- stage review should remain owner-only by default
- final archive should remain owner-only by default

## 7.8 Compare submissions

Files:

- `src/app/(dashboard)/projects/[slug]/compare/page.tsx`
- `src/components/projects/project-compare-workspace.tsx`
- `src/lib/comparison.ts`

Current action:

- compare revision/submission attachments

Suggested permissions:

- `compare.view`
- or fold into `stage.reviewSubmission`

## 7.9 Library

Files:

- `src/app/(dashboard)/library/page.tsx`
- `src/components/library/library-workspace.tsx`
- `src/lib/library.ts`
- `src/app/api/library/route.ts`
- `src/app/api/library/attachments/[attachmentId]/route.ts`

Current actions:

- search/filter files
- quick menu filters
- preview
- download
- favorite
- delete

Current behavior:

- project membership filtered
- delete only owner/super-admin
- `libraryAccess` not enforced

Suggested permissions:

- `library.view`
- `file.view`
- `file.download`
- `file.favorite`
- `library.deleteFile`

## 7.10 Archives

Files:

- `src/app/(dashboard)/archives/page.tsx`
- `src/app/(dashboard)/archives/[slug]/page.tsx`
- `src/lib/archives.ts`

Current actions:

- browse archive categories
- preview archived files
- download archived files

Current behavior:

- project membership based
- `archiveAccess` not enforced

Suggested permissions:

- `archive.view`
- `archive.download`

## 7.11 Collaboration

Files:

- `src/app/(dashboard)/collaboration/page.tsx`
- `src/components/collaboration/collaboration-workspace.tsx`
- `src/app/(dashboard)/collaboration/actions.ts`

Current actions:

- view collaborator directory
- create collaborator
- edit collaborator
- delete collaborator
- set module access

Current behavior:

- page visible to all authenticated users
- save action under-protected
- delete super-admin only

Suggested permissions:

- `collaboration.viewDirectory`
- `collaboration.createUser`
- `collaboration.updateUser`
- `collaboration.deleteGlobal`
- `collaboration.manageModuleAccess`

## 7.12 Calendar

Files:

- `src/app/(dashboard)/calendar/page.tsx`
- `src/components/calendar/calendar-workspace.tsx`
- `src/app/(dashboard)/calendar/actions.ts`
- `src/lib/calendar.ts`

Current actions:

- view calendar
- create event
- edit event
- assign calendar collaborators

Suggested permissions:

- `calendar.view`
- `calendar.create`
- `calendar.update`
- `calendar.assignParticipants`

## 7.13 Notifications

Files:

- `src/app/(dashboard)/notifications/page.tsx`
- `src/components/notifications/*`
- `src/app/api/notifications/*`

Current actions:

- view notifications
- mark one read/unread
- mark all read

Suggested permissions:

- `notification.view`
- `notification.markRead`

## 7.14 Settings

Files:

- `src/app/(dashboard)/settings/page.tsx`
- `src/app/(dashboard)/settings/actions.ts`

Current actions:

- update own profile
- change own password
- navigate to master data if admin/super-admin

Suggested permissions:

- `settings.viewOwnProfile`
- `settings.updateOwnProfile`
- `settings.changeOwnPassword`

## 7.15 Project master data

Files:

- `src/app/(dashboard)/settings/project-master-data/page.tsx`
- `src/app/(dashboard)/settings/project-master-data/actions.ts`

Current actions:

- manage categories
- manage tags
- manage currencies
- delete master data

Suggested permissions:

- `settings.manageMasterData`
- `settings.deleteMasterData`

## 7.16 Completion checklist

Files:

- `src/components/projects/project-completion-checklist.tsx`
- `src/lib/project-completion.ts`

Current actions:

- set approval required / not required
- prepare approval request
- upload approval proof
- set copyright required / not required
- prepare copyright request
- upload copyright document
- upload invoice

Suggested permissions:

- `completion.viewChecklist`
- `completion.setApprovalRequired`
- `completion.prepareApproval`
- `completion.uploadApprovalProof`
- `completion.setCopyrightRequired`
- `completion.prepareCopyrightTransfer`
- `completion.uploadCopyrightDocument`
- `completion.uploadInvoice`

---

## 8. API And Server Action Inventory

This is the key mutation / data-return surface that should eventually be permission-protected through permission keys.

## 8.1 High-risk server actions

| File | Action | Current guard | Risk | Suggested permission |
|---|---|---|---|---|
| `src/app/(dashboard)/collaboration/actions.ts` | `saveCollaboratorAction` | authenticated only | High | `collaboration.createUser`, `collaboration.updateUser`, `collaboration.manageModuleAccess` |
| `src/app/(dashboard)/calendar/actions.ts` | `saveCalendarEventAction` | authenticated only | High | `calendar.create` / `calendar.update` |
| `src/app/(dashboard)/calendar/actions.ts` | `saveCalendarCollaboratorsAction` | authenticated only | High | `calendar.assignParticipants` |
| `src/app/(dashboard)/projects/new/actions.ts` | `deleteProjectAction` | blocks only collaborators | High | `project.delete` |
| `src/lib/projects.ts` | `getProjectsList`, `getRecentProjects`, `getDashboardProjectCounts`, `getProjectListFilterOptions` | no user scoping | High | `project.list`, `project.view` |

## 8.2 Important protected routes/actions that should be normalized

| File | Action | Current guard | Suggested permission |
|---|---|---|---|
| `src/app/(dashboard)/projects/new/actions.ts` | `createProjectAction` | role-based | `project.create` |
| `src/app/(dashboard)/projects/new/actions.ts` | `updateProjectAction` | role-based + owner-only budget logic | `project.update`, `project.updateBudget`, `project.manageCollaborators` |
| `src/app/(dashboard)/projects/actions.ts` | brief acceptance | project context logic | `stage.acceptBrief` |
| `src/app/(dashboard)/projects/actions.ts` | create comment | project context logic | `chat.createComment` |
| `src/app/(dashboard)/projects/actions.ts` | create revision | executor-oriented | `stage.submitWork` |
| `src/app/(dashboard)/projects/actions.ts` | request submission revision | owner-oriented | `stage.requestRevision` |
| `src/app/(dashboard)/projects/actions.ts` | mark submission complete | owner-oriented | `stage.markSubmissionComplete` |
| `src/app/(dashboard)/projects/actions.ts` | mark stage complete | owner-oriented | `stage.markStageComplete` |
| `src/app/(dashboard)/projects/actions.ts` | complete archive | owner-oriented | `project.completeArchive` |
| `src/app/(dashboard)/projects/actions.ts` | save/remove project collaborators | admin/owner booleans | `project.manageCollaborators` |

## 8.3 API routes already relatively safe

| Route file | Current guard | Notes |
|---|---|---|
| `src/app/api/notifications/*` | current user only, user-owned service methods | good model to reuse |
| `src/app/api/project-assets/[attachmentId]/preview/route.ts` | requires user + attachment access helper | good |
| `src/app/api/project-assets/[attachmentId]/download/route.ts` | same | good |
| `src/app/api/project-assets/[attachmentId]/favorite/route.ts` | same | good |
| `src/app/api/archives/files/[archivedFileId]/*` | requires user + archive access helper | good base |
| `src/app/api/project-completion-documents/*` | user-scoped via completion workflow helper | good base |

### Recommended pattern for every future action / route

1. Require authenticated user.
2. Load the required context.
3. Resolve permissions for that user + context.
4. Enforce permission key.
5. Perform action.
6. Serialize only permitted fields.

---

## 9. Recommended Permission Architecture

### 9.1 Core concepts

The permission system should combine five layers:

1. Global role
2. Collaborator type preset
3. Project context role
4. Project access preset / explicit collaborator permissions
5. Hard business rules

### 9.2 Recommended model

#### A. Global role

- `SUPER_ADMIN`
- `ADMIN`
- `COLLABORATOR`

Purpose:

- broad system-level defaults
- Settings / master data / user management
- emergency administrative override

#### B. Participant type

- `GTI_INTERNAL_CLIENT`
- `GTI_SISTER_COMPANY_INTERNAL_CLIENT`
- `EXTERNAL_FREELANCER`
- `EXTERNAL_AGENCY`
- `EXTERNAL_VENDOR`
- `CLIENT_OF_GTI`

Purpose:

- default project behavior profile
- identity + labeling
- optional invite preset defaults

#### C. Project context role

- `PROJECT_OWNER`
- `PROJECT_EXECUTOR`
- `PROJECT_COLLABORATOR`
- optional future:
  - `APPROVAL_CONTACT`
  - `COPYRIGHT_CONTACT`

Purpose:

- business workflow responsibilities
- high-signal workflow permissions

#### D. Access preset

Current app uses `FULL`, `LIMITED`, `NONE`.

Recommended evolution:

- `FULL`
- `LIMITED`
- `VIEW_ONLY`
- `NONE`

`LIMITED` is currently too vague. It should either:

- become a preset that maps to explicit permission keys, or
- be replaced in UI by clearer presets

Best approach:

- keep presets for UX simplicity
- map presets to permission keys under the hood

#### E. Permission key catalog

This becomes the main enforcement layer.

Routes and UI should never be the source of truth.

---

## 10. Final Permission Resolution Strategy

### Recommended formula

Final permission result for a user in a context should be derived from:

1. Global role base permissions
2. Collaborator type default permissions
3. Module access preset permissions
4. Project context role permissions
5. Project collaborator explicit overrides
6. Hard business rule overrides

### Example

`project.viewBudget`

Should be resolved using:

- global role grant
- participant type defaults
- project context
- explicit collaborator override
- then hard business restrictions if required

### Hard rules that should remain hardcoded

These should not be casually editable from Settings because they represent business invariants or security boundaries:

- completed project access still must respect project membership
- paused collaborator history must stay hidden unless product explicitly authorizes privileged viewing
- self-profile update should remain self-scoped
- notification ownership should remain user-scoped
- file delete should remain tightly restricted
- project archive completion should remain owner-only unless business explicitly changes that rule
- submission creation should remain executor-driven by default
- submission review should remain owner-driven by default

### Configurable rules

These should be configurable through permission assignments and presets:

- module visibility
- collaborator directory visibility
- participant info visibility
- comment ability
- file download access
- archive visibility
- calendar access
- library access
- archive completion document visibility for approved roles

---

## 11. Permission Key Catalog Proposal

This is the recommended semantic key catalog.

## 11.1 Dashboard

- `dashboard.view`
- `dashboard.viewProjectCounts`
- `dashboard.viewRecentProjects`

## 11.2 Projects

- `project.list`
- `project.view`
- `project.create`
- `project.update`
- `project.delete`
- `project.viewBudget`
- `project.updateBudget`
- `project.viewVendorInfo`
- `project.viewParticipants`
- `project.manageCollaborators`
- `project.completeArchive`

## 11.3 Stages

- `stage.view`
- `stage.acceptBrief`
- `stage.submitWork`
- `stage.reviewSubmission`
- `stage.requestRevision`
- `stage.markSubmissionComplete`
- `stage.markStageComplete`
- `stage.manageDefinitions`
- `stage.updateTimeline`
- `stage.updateBudget`

## 11.4 Chat

- `chat.view`
- `chat.createComment`
- `chat.uploadAttachment`
- `chat.mentionUser`
- `chat.viewPausedHistory`

## 11.5 Files

- `file.view`
- `file.download`
- `file.delete`
- `file.favorite`
- `file.uploadAttachment`
- `file.uploadSubmission`

## 11.6 Library

- `library.view`
- `library.filter`
- `library.deleteFile`

## 11.7 Archives

- `archive.view`
- `archive.download`
- `archive.delete`

## 11.8 Completion workflow

- `completion.viewChecklist`
- `completion.setApprovalRequired`
- `completion.prepareApproval`
- `completion.uploadApprovalProof`
- `completion.setCopyrightRequired`
- `completion.prepareCopyrightTransfer`
- `completion.uploadCopyrightDocument`
- `completion.uploadInvoice`

## 11.9 Collaboration

- `collaboration.viewDirectory`
- `collaboration.createUser`
- `collaboration.updateUser`
- `collaboration.deleteGlobal`
- `collaboration.manageModuleAccess`
- `collaborator.inviteToProject`
- `collaborator.removeFromProject`
- `collaborator.pauseVisibility`
- `collaborator.changeType`
- `collaborator.changeAccess`

## 11.10 Notifications

- `notification.view`
- `notification.markRead`
- `notification.manageSettings`

## 11.11 Calendar

- `calendar.view`
- `calendar.create`
- `calendar.update`
- `calendar.delete`
- `calendar.assignParticipants`

## 11.12 Settings

- `settings.viewOwnProfile`
- `settings.updateOwnProfile`
- `settings.changeOwnPassword`
- `settings.viewMasterData`
- `settings.manageMasterData`
- `settings.deleteMasterData`
- `settings.managePermissions`

## 11.13 Compare

- `compare.view`

---

## 12. Default Permission Matrix

This section proposes defaults, not final product rules.

## 12.1 Global role defaults

| Permission group | SUPER_ADMIN | ADMIN | COLLABORATOR |
|---|---|---|---|
| Dashboard | full | full | scoped |
| Projects create/update | full | yes | no by default |
| Projects delete | full | optional, preferably limited | no |
| Master data | full | manage except delete | no |
| Permission management | yes | optional later | no |
| Collaboration directory | full | full | limited or no |
| Calendar management | full | yes | view or limited |
| Library | full | full | scoped |
| Archives | full | full | scoped |

## 12.2 Project context defaults

| Permission | Project Owner | Project Executor | Project Collaborator |
|---|---|---|---|
| `project.view` | yes | yes | yes if added |
| `project.viewBudget` | yes | no by default | no by default |
| `project.manageCollaborators` | yes | no | no |
| `stage.acceptBrief` | no | yes | no |
| `stage.submitWork` | no | yes | no |
| `stage.reviewSubmission` | yes | no | no |
| `stage.requestRevision` | yes | no | no |
| `stage.markSubmissionComplete` | yes | no | no |
| `stage.markStageComplete` | yes | no | no |
| `project.completeArchive` | yes | no | no |
| `completion.viewChecklist` | yes | yes | no |
| `completion.uploadInvoice` | yes | yes | no |

## 12.3 Participant type presets

Recommended starting assumptions:

| Participant type | Default orientation |
|---|---|
| GTI Internal Client | broader read access; internal participant visibility |
| GTI Sister Company Internal Client | internal but narrower than GTI internal by default |
| External Freelancer | task/work oriented; limited participant/budget visibility |
| External Agency | similar to freelancer but may need broader file/comment access |
| External Vendor | likely narrow, vendor-specific visibility |
| Client of GTI | view/review/download oriented; often limited write permissions |

Important:

Participant type should be treated as a **default preset**, not the final authority. It should inform the initial permission set when inviting collaborators.

---

## 13. Suggested Collaborator Type / Access Preset Matrix

### Access presets

Recommended presets:

- `FULL`
- `LIMITED`
- `VIEW_ONLY`
- `NONE`

### Proposed meaning

#### FULL

- view project
- comment
- upload permitted files
- download files
- view archives if project allows
- view participants if product allows

#### LIMITED

- view project
- comment optionally
- upload only if role requires
- download only if enabled
- cannot manage collaborators
- cannot view budget
- cannot view all participant data by default

#### VIEW_ONLY

- view project/stage data
- preview/download only where allowed
- no comments
- no uploads

#### NONE

- hidden from module or project

Recommendation:

Do not expose the word `LIMITED` without showing what it means. The UI should translate a preset into actual allowed capabilities.

---

## 14. Permission Management Page Proposal

### Route

Recommended:

- `/settings/permissions`

### Who can access

- `SUPER_ADMIN` by default
- optional later: `ADMIN` with `settings.managePermissions`

### Page structure

#### Top controls

- Permission profile type selector:
  - Global Role
  - Collaborator Type
  - Project Access Preset
- Role/type/preset selector
- Search permissions
- Save changes
- Reset to default
- Optional preview panel

#### Left navigation groups

- Projects
- Stages
- Chat
- Files
- Library
- Archives
- Completion
- Collaboration
- Notifications
- Calendar
- Settings

#### Right panel

For each permission:

- label
- description
- toggle
- optional “hard rule” badge if not configurable

### Optional preview panel

Useful later:

- “This profile can…”
- read-only summary of key capabilities

---

## 15. Invite Modal Changes Proposal

Current invite / collaborator flows should evolve as follows.

### Required fields

- Collaborator type
- Access preset

### Optional advanced section

- Permission checklist derived from selected preset
- editable before invite

### Recommended flow

1. Choose collaborator identity
2. Choose collaborator type
3. Choose access preset
4. See generated permission summary
5. Optional advanced customize section

### Recommendation on timing

Do **not** implement full invite-time permission customization immediately.

Reason:

- the central permission engine and permission definitions need to exist first
- otherwise the invite modal becomes a UI that writes to an undefined model

Recommended timing:

- implement later, after Phase 1 server protection and Settings -> Permissions foundation

---

## 16. Database Schema Proposal

### Recommended approach

Recommend a **hybrid** model:

- Permission definitions in code
- assignments / presets / overrides in DB

This is safer than DB-only definitions from day one because:

- code remains the authoritative permission vocabulary
- migrations stay predictable
- dead/mistyped permission keys are easier to catch in code review
- the Settings UI can still manage assignments without requiring redeploy for every profile change

### Proposed models

#### PermissionDefinition

- `id`
- `key` unique
- `label`
- `description`
- `group`
- `isSystem`
- `createdAt`
- `updatedAt`

#### RolePermission

- `id`
- `role`
- `permissionKey`
- `enabled`

#### CollaboratorTypePermission

- `id`
- `participantType`
- `permissionKey`
- `enabled`

#### AccessPresetPermission

- `id`
- `accessPreset`
- `permissionKey`
- `enabled`

#### ProjectCollaboratorPermissionOverride

- `id`
- `projectCollaboratorId`
- `permissionKey`
- `enabled`

### Optional future models

- `UserPermissionOverride`
- `ProjectPermissionOverride`

### Recommended rollout model

Phase 1:

- code-defined permission catalog
- DB tables only for role/type/preset assignments if needed

Phase 2+:

- per-project collaborator overrides

---

## 17. Server-Side Helper Design

Recommended location:

- `src/lib/permissions/`

Suggested files:

- `definitions.ts`
- `defaults.ts`
- `resolver.ts`
- `require.ts`
- `serializers.ts`
- `project-context.ts`

### Suggested helper API

- `getPermissionDefinitions()`
- `getCurrentUserPermissionContext(userId, context)`
- `resolvePermissionsForUser(user, context)`
- `hasPermission(user, permissionKey, context)`
- `requirePermission(user, permissionKey, context)`
- `requireProjectPermission(user, projectId, permissionKey)`
- `serializeProjectForUser(project, user, context)`
- `filterFilesForUser(files, user, context)`
- `canUserAccessAttachment(user, attachment)`
- `canUserSeeBudget(user, project)`
- `canUserManageCollaborator(user, project, collaborator)`

### Request-level performance recommendation

- resolve permissions once per request where possible
- include:
  - global role
  - participant type
  - project collaborator membership
  - explicit overrides
- cache the resolved permission set inside the request scope, not cross-user static cache

### Invalidation strategy

When permissions change:

- invalidate relevant cache tags
- avoid long-lived static caches for user-specific permission resolution

---

## 18. API / Server Action Enforcement Pattern

### Mutations

Every mutation should follow this structure:

1. `requireUser()`
2. load the relevant context
3. resolve permission keys
4. `requirePermission(...)`
5. perform mutation
6. return safe response

Example:

`project.completeArchive`

1. require user
2. load project and final stage
3. check `project.completeArchive`
4. enforce hard owner rule if retained
5. archive project
6. return sanitized completion summary

### Queries / loaders

Every loader should:

1. require user
2. load only potentially accessible data
3. filter fields based on permissions
4. return safe serialized records

This is especially important for:

- dashboard
- projects list
- library
- archives
- collaborator lists
- calendar

---

## 19. Field-Level Serialization Plan

This is a critical requirement.

UI hiding is not enough.

### Project serializer

Should remove or transform:

- budget / currency unless `project.viewBudget`
- vendor info unless `project.viewVendorInfo`
- participant contact details unless `project.viewParticipants`
- collaborator controls unless `project.manageCollaborators`
- completion workflow block unless `completion.viewChecklist`

### File serializer

Should control:

- preview path only if `file.view`
- download path only if `file.download`
- delete action only if `file.delete`
- favorite action only if `file.favorite`

### Archive serializer

Should control:

- archive records only if `archive.view`
- download URLs only if `archive.download`

### Chat serializer

Should control:

- chat history visibility by pause windows
- attachment previews/downloads by file permissions
- mention participant list by participant visibility permissions

### Notification serializer

Should remain user-owned only.

No change in the core ownership model is needed.

---

## 20. Recommended Implementation Phases

## Phase 0

Current phase:

- audit only

## Phase 1

Build the minimum viable permission foundation:

- permission catalog in code
- central permission resolver helpers
- context-aware project permission checks
- protect highest-risk server-side surfaces first

Priority targets:

- dashboard/project list scoping
- collaboration save action
- calendar actions
- project delete
- budget field serialization
- archive/library visibility normalization

## Phase 2

Add field-level serializers:

- project serializer
- project list serializer
- library file serializer
- archive serializer
- participant serializer

## Phase 3

Build `Settings -> Permissions`:

- role profiles
- collaborator type profiles
- access preset profiles

## Phase 4

Refactor UI button visibility:

- sidebar visibility
- dashboard buttons
- project buttons
- library/archive action icons
- collaboration and calendar actions

## Phase 5

Extend invite collaborator flow:

- collaborator type required
- access preset required
- advanced permission checklist optional

## Phase 6

Optional project-specific overrides:

- per project collaborator overrides
- advanced exception handling

---

## 21. Risks And Tradeoffs

### Over-engineering risk

If the first implementation tries to support every override level immediately, the system will become hard to reason about.

Recommendation:

- start with code-defined permission catalog
- add DB-driven role/type/preset assignments
- add project-level overrides only later

### Performance risk

If every component or action resolves permissions independently with fresh DB queries, performance and consistency will degrade.

Recommendation:

- request-scoped permission resolution
- small reusable context loaders

### Misconfiguration risk

A future admin-managed permissions page could accidentally remove critical permissions and break workflows.

Recommendation:

- preserve hard business rules
- add reset-to-default
- label non-configurable rules clearly

### Migration risk

Applying permission checks too broadly too early can break current flows.

Recommendation:

- protect highest-risk server paths first
- add serializer filtering
- then update UI visibility

---

## 22. Recommended First Implementation Prompt

Recommended next implementation scope:

1. Create the permission catalog in code.
2. Add a central permission resolver helper.
3. Apply it to the highest-risk server-side areas only:
   - dashboard/project list loaders
   - collaboration save action
   - calendar actions
   - project delete action
   - project budget serialization
4. Add a small `canAccessModule` helper to hide sidebar items based on real module permissions.

Do **not** start with the full Settings permissions page first.

The server-side enforcement layer must exist first.

---

## 23. Exact Files Likely To Change Later

### New likely permission modules

- `src/lib/permissions/definitions.ts`
- `src/lib/permissions/defaults.ts`
- `src/lib/permissions/resolver.ts`
- `src/lib/permissions/require.ts`
- `src/lib/permissions/serializers.ts`

### Existing high-priority files likely to change

- `prisma/schema.prisma`
- `src/lib/auth.ts`
- `src/lib/projects.ts`
- `src/lib/project-history.ts`
- `src/lib/project-collaborator-visibility.ts`
- `src/lib/library.ts`
- `src/lib/archives.ts`
- `src/lib/project-completion.ts`
- `src/lib/collaboration.ts`
- `src/lib/calendar.ts`
- `src/app/(dashboard)/page.tsx`
- `src/app/(dashboard)/projects/page.tsx`
- `src/app/(dashboard)/projects/new/actions.ts`
- `src/app/(dashboard)/projects/actions.ts`
- `src/app/(dashboard)/collaboration/actions.ts`
- `src/app/(dashboard)/calendar/actions.ts`
- `src/app/(dashboard)/settings/project-master-data/actions.ts`
- `src/app/api/project-assets/[attachmentId]/preview/route.ts`
- `src/app/api/project-assets/[attachmentId]/download/route.ts`
- `src/app/api/project-assets/[attachmentId]/route.ts`
- `src/app/api/library/route.ts`
- `src/app/api/library/attachments/[attachmentId]/route.ts`
- `src/app/api/archives/files/[archivedFileId]/preview/route.ts`
- `src/app/api/archives/files/[archivedFileId]/download/route.ts`
- `src/components/layout/sidebar.tsx`
- `src/components/projects/project-chat-workspace.tsx`
- `src/components/projects/project-detail-workspace.tsx`
- `src/components/library/library-workspace.tsx`
- `src/components/collaboration/collaboration-workspace.tsx`
- `src/components/calendar/calendar-workspace.tsx`

---

## 24. Final Recommendation

### Recommended model

Use a **permission-key architecture**, not API-URL permissions.

### Recommended implementation order

1. Central permission catalog and resolver
2. High-risk server-side enforcement
3. Field-level serializers
4. Sidebar and UI visibility
5. Settings -> Permissions
6. Invite modal customization

### Recommended timing for invite modal permission checklist

Later.

Do not implement it before the permission engine exists. Otherwise the UI will create the appearance of permission management without a trustworthy enforcement layer behind it.

