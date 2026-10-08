This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Environment Variables

For AI translation and voice transcription in the project stage chat composer:

```bash
OPENAI_API_KEY=
```

For project asset uploads to AWS S3:

```bash
AWS_REGION=
AWS_S3_BUCKET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
ASSET_UPLOAD_MAX_BYTES=104857600
AWS_S3_TRANSFER_ACCELERATION=false
```

For email delivery, external request links, and protected scheduled jobs:

```bash
RESEND_API_KEY=
RESEND_FROM_EMAIL=
APP_URL=https://your-production-host.example
CRON_SECRET=
SLAVOMIR_APPROVAL_EMAIL=
```

The initial Marketing Director approval created after Stage 5 displays **Slavomir
Kluziak**. Set `SLAVOMIR_APPROVAL_EMAIL` separately in each deployment:

- **dev/testing:** your test inbox.
- **main/production:** Slavomir's real inbox.
- **local development:** add the test inbox to `.env.local`.

This is a server-side variable; do not prefix it with `NEXT_PUBLIC_`. Restart or
redeploy after changing it. The app uses the current value for each explicit
**Send Approval Request**, **Resend Approval Request**, or **Retry**, including existing approvals.
A missing or invalid value blocks this approval; there is no fallback address.
Other approvers and handover recipients keep their selected addresses. Requests
still require a click for every step in the chain.

Rejected Stage 6 approval steps offer **Resend Approval Request**. The sender can
select updated production files and shared information before sending. Each
resubmission keeps the previous rejection, comments, recipient, and shared
snapshot in history. Earlier approvals stay intact, old external links are
invalidated, and later approvers still wait for an explicit send. A failed email
delivery uses **Retry** on the new request. Closed projects and completed or
handed-over workflows cannot be resubmitted.

Recurring Stage 5 and Stage 7 request reminders require a scheduler to call
`GET /api/internal/request-reminders` with `Authorization: Bearer $CRON_SECRET`.
Run it every 15–60 minutes. See [Request reminder operations](docs/REQUEST_REMINDER_OPERATIONS.md).

To test faster uploads for global users:

1. Enable Transfer Acceleration on the S3 bucket in AWS Console.
2. Set `AWS_S3_TRANSFER_ACCELERATION=true`.
3. Restart the app.
4. Upload the same file again from stage chat.
5. Compare the browser console timings for:
   - `upload:s3-host`
   - `upload:s3-put`
   - `upload:total`

If acceleration is working, the upload host should change from the regional S3 hostname to the S3 accelerate hostname.

## Undoing a Stage 3 or Stage 4 skip

The project owner or an administrator can open a skipped stage and choose
**Undo Skip**. An executor must be added through **Edit Project** first if the
project has none. Reopened tasks still require an executor assignment.

Reopening locks the later stages again. It is blocked when later tasks, direct
Stage 5 uploads, checklist changes, information requests, saved drafts, or
production work exist, and after Stage 5 is completed. Only untouched checklist
entries automatically created by skipping Stage 4 can be reset; the original
Stage 3 files and approvals remain intact. The server checks these conditions
again when confirming and records the action in the project activity log.

## Revoking task completion without a file

For Stage 3 and Stage 4 tasks marked **Completed · No file**, the project owner
or an administrator can choose **Revoke Completion** in the task header. This
reopens the task for discussion and submissions. Executor acceptance and existing
files are preserved. If the task has no valid executor, the confirmation requires
choosing a current project executor, who must then accept the brief.

If the workflow stage is already completed, reopening also relocks later stages.
The same downstream safety checks as **Undo Skip** apply. Untouched generated
Stage 5 checklists may be rebuilt; original files and sibling task approvals stay
intact. Blocked actions display the reason. The task discussion records who
revoked completion, and the server rechecks permissions and dependencies when
confirming. Task-only reopening leaves the current workflow stage open.

## Universal Tasker — Phase 1

Tasker supports structured projects and flexible projects through a shared task
engine and project adapters. The Tasks page includes Received, Sent, Co-owned,
View only, and All views. Project and milestone pages provide a Tasker section
and a floating Create task button. One Tasker service supplies the page, API,
and sidebar count for every role. Stage 3/4 concept tasks appear in that same
list and open their existing concept screens, retaining their approval workflow.
The old role-specific Tasks workspace and compatibility adapter are removed.

Field Input, File Request, and General tasks support one recipient, an optional
task co-owner, deadlines, submissions, correction requests, cancellation,
reassignment, participants, conversation, and retained history. The creator and
task co-owner review submissions. Project owners can see and delete any task in
their project; other participants see only their associated tasks.

Accepted field input updates current data, including completed stages, without
changing issued approval or handover snapshots. Handover and sample request input
fills the editable request form; sending and approving remain native workflow
actions. Conflicting values require review, and stale form saves are rejected.
File requests publish accepted copies into existing Brief/Tech subfolders or
flexible milestone files; submission objects remain separate and immutable.
Tasker tasks do not block stage completion.

Before running the updated application, apply the additive migration:

```bash
pnpm exec prisma migrate deploy
pnpm exec prisma generate
```

Configure `APP_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `CRON_SECRET`
(see `.env.example`). Existing S3 settings and upload CORS rules are reused.
In-app notifications and email outbox records commit with task actions. Email
delivery runs after the response; the authenticated
`GET /api/cron/tasker-deliveries` retries failures every five minutes through
`vercel.json`. Other hosts must schedule that endpoint with
`Authorization: Bearer <CRON_SECRET>`. These retries are delivery recovery;
recurring deadline reminders are deferred.

`pnpm tasker:integration-check` runs migrations and tests in a disposable local
PostgreSQL cluster with mocked storage and email. It requires `initdb`, `pg_ctl`,
and a permitted loopback listener. It never uses the application's database.
`pnpm tasks:ui-check` covers task page access, task views, recipient controls, and
conflict review rendering. A production build is checked with `pnpm run build`.

New project templates can register an adapter in `src/lib/tasker/adapters.ts`;
Tasker implements the two existing project systems.

## Universal Tasker — Phase 2

Open **Sister Tasks & files** from a task row, task details, or the Stage 3/4
task header. Create a linked revision without changing the original task's
status, submissions, files, or review history. Revisions of revisions stay
under the first parent and appear together in the task list. Sister Tasks can
be created after a stage or project is completed.

Every child has its own owner, recipient, review, and optional co-owner. Access
is checked separately for each family member: receiving a Sister Task does not
grant access to its parent or siblings. The same rule applies to file downloads,
selection history, and notifications. Deleting one task hides that task while
preserving the remaining revisions.

Project owners and project co-owners can select the final file from the versions
they can access. The default requires an accepted Tasker submission or an approved
native concept revision. All submitted versions remain available to download.
Selection changes are recorded, and concurrent choices require refreshing rather
than silently replacing a newer choice. Download the chosen file to use in the
existing project workflow; the selection does not replace native concept approval,
production files, or issued approval and handover snapshots.

After production approval or handover exists, creating a revision or changing
the selected file requests the project owner's decision about another cycle.
The owner records a reason and whether a cycle is required. This decision does
not start or reopen a workflow automatically. Dependency tasks, owner-approved
pausing, and explicit project reopening remain for the next phase.

Apply `20261008180000_tasker_sister_tasks` before starting the updated app. The
additive migration preserves existing task data. `pnpm tasker:integration-check`
now also covers family permissions, numbering and selection races, native concept
originals, completed flexible projects, late revisions, and outbox access checks.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
