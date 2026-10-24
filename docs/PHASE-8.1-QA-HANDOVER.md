# FLUX V2 — Phase 8.1 QA handover

24 October 2026 · Asia/Dubai

**QA preparation complete. Independent human QA: NOT RUN. Production rollout and official GTI standard-template rollout: NOT APPROVED.** Phase 8.2 has not started.

## Access and handover

The user confirmed that the first tester can use this developer computer. The disposable QA app uses **http://127.0.0.1:3117**, with fake S3 at loopback port 3118 and a private socket-only PostgreSQL database. No LAN/public listener, tunnel, firewall change or deployment was created.

Start with [the human QA guide](./qa/FLUX_V2_Human_QA_Guide.md), its [six-page printable PDF](../.tmp/phase81/FLUX_V2_Human_QA_Guide.pdf), [the issue template](./qa/FLUX_V2_QA_Issues.md) and [start/reset instructions](./qa/FLUX_V2_QA_Setup.md). The guide has **32 scenarios**, each with role, clicks, action, expected result and outcome checkboxes; all remain **NOT RUN**. It contains no credentials or migration/hash instructions. The PDF was rendered locally and its six-page length checked.

The fresh QA session is running at handover; both QA listeners were verified as loopback-only and the original port-3000 process is unchanged. The [private session receipt](../.tmp/phase81/interactive/current.json) identifies the running launcher and separate account card, clickable fixture index and sample PDF. Never commit or publish the account card. If that receipt is absent, start the fixture before testing:

```sh
node scripts/run-human-qa.mjs
```

A fresh isolated build was also verified at `/private/tmp/flux-dashboard-build-8BRiyq`. For a faster restart while source still matches:

```sh
node scripts/run-human-qa.mjs --build=/private/tmp/flux-dashboard-build-8BRiyq
```

Stop the QA launcher with Ctrl+C (or SIGINT to its recorded PID), then restart to reset. Actual stop/reset validation removed the initial private database, temporary account card, sessions and fake storage and freed both QA ports. The next session creates fresh credentials and record IDs. Port 3000 remains untouched.

## What the access review established

The original Next.js process remains bound to **127.0.0.1:3000**, reachable only on this computer. A bounded, read-only Neon inventory confirmed PostgreSQL **18.6**, **117 successful migration records**, **159 tables**, **nine accounts** and **three sessions**. Native projects, FlexibleProjects, RuntimeProjects, Universal Tasks, workflow drafts, manual Archive files, manual calendar events and recorded notifications each had **zero rows**.

Existing role accounts/configuration therefore did not constitute populated QA scenarios. Existing S3 and realtime configuration is present, but live storage/provider availability was deliberately not tested. Logging into port 3000 or exercising writes there would use the development database; the new test accounts and all synthetic writes are confined to the disposable environment.

## Fixture and readiness

This is a small interactive adaptation of the existing isolated PostgreSQL/browser/fake-S3 approach, using the existing isolated builder and unchanged application. It loads no live environment files and accepts no database URL. It checks private database identity, no TCP listener, migration count, UTC timezone and matching build source. The app receives only an allowlisted local environment, dummy S3 credentials and disabled realtime delivery. Its HTTP/fetch guard rejects external hosts; browser automation separately rejects external requests. No worker or delivery scheduler runs.

| Manual scope | Available fixture / state |
| --- | --- |
| Roles and denials (R1–R5) | Eight fictional accounts: all five business roles, technical-only, another SPM and ungranted Designer; private-project denial target |
| Files and Tasker (F1–F2, T1–T7) | Valid PDF; all six task types; real pinned inspection/inspiration versions; pending Owner review; independently completed Sister source and open Sister; Digital Lead assignment |
| Project families | Native project with seven initial workflow stages; Flexible project with a milestone; authorized and restricted RuntimeProjects |
| Stage Builder/runtime (W1–W5) | Editable draft, pending publication, published QA custom workflow, governed JPM request, stage approval pending, final-completion practice project, genuinely completed project eligible for Archives |
| Templates (B1–B5) | All five existing internal-candidate loaders and previews; definitions/designation unchanged |
| Archives (A1–A4) | QA Artwork category, QA Proofs folder, pinned synthetic PDF, genuine Designer grant, verification/revocation controls and eligible completed runtime output |
| Navigation (N1–N4) | Populated Dashboard/Search/Calendar; due and overdue tasks; pending attention; personal/shared manual events; explicitly synthetic recorded-message history |

All **32 local guide scenarios are ready to attempt**, not human-passed. The custom practice workflow deliberately has optional requirements; it is not a substitute for unresolved GTI gate policy. Whole-session reset restores a scenario consumed by earlier work. Base records are fixture inserts; task/publication/runtime/approval/folder/grant lifecycle actions use genuine authenticated application routes and service authorization.

Remote access is unnecessary for the agreed session and unavailable from a separate computer. The setup guide includes a small private-host proposal for separate approval only. Real-provider S3/realtime delivery, external signatures, vendor/CERBER, Toolio, automatic concept gates, Digital maintenance and official-template business acceptance remain **outside this fixture / blocked on their separate prerequisites**. No simulated provider result is represented as live-provider acceptance.

## Automatic validation — separate from human results

Final targeted command:

```sh
node scripts/run-human-qa.mjs --smoke --build=/private/tmp/flux-dashboard-build-8BRiyq
pnpm typecheck
pnpm exec eslint scripts/run-human-qa.mjs scripts/human-qa-fixture.mjs scripts/human-qa-network-guard.cjs --max-warnings=0
```

The smoke uses disposable PostgreSQL **14.19** and Chromium **153.0.8010.12**. It is functional preparation on the proven local harness, not PostgreSQL 18/provider/production parity certification. The documented plain start command also completed a fresh isolated production build and fixture preparation.

- **PASS:** eight genuine password logins; role navigation; technical-only and private-project denials; Native/Flexible pages.
- **PASS:** six task types and real file identities; browser task creation, PDF upload, submission, request, rejection, resubmission and Owner acceptance; executor self-approval denial; spectator controls; independent Sister state.
- **PASS:** Stage Builder create/typed field/save/reload/preview; real publication and governed creation routes; all five internal template loaders/previews.
- **PASS:** runtime stage file review and independent stage approval; genuine Owner request and separate Director final completion; eligible Archive output.
- **PASS:** exact granted Archive bytes, ungranted denial and persisted Director verification, including a UTC-default timestamp check.
- **PASS:** Search, month/week/agenda Task Calendar, Manual Events, Attention and actual recorded-message read/unread controls.
- **PASS:** TypeScript, targeted zero-warning ESLint, non-loopback HTTP/fetch guard checks and guide structure/link checks. No full Phase 1–7 suite rerun.

The final receipt records **11 successful scenario groups**, **zero browser page errors**, **zero unexpected server-error responses** and **zero external browser requests**. Evidence: [smoke receipt](../.tmp/phase81/smoke/result.json), [smoke output](../.tmp/phase81/smoke-run.log), and screenshots in `.tmp/phase81/smoke/`. Expected permission denials are deliberate negative tests. Automated screenshot inspection is not independent human QA.

Initial fixture/configuration and browser-selector mistakes were corrected during preparation. Screenshot inspection also caught a disposable-database timezone offset; the launcher now pins UTC and tests timestamp freshness. These were setup corrections, not Phase 8.2 application fixes. No application defect is claimed fixed and no human defect is yet reported.

## Preservation and remaining decisions

The final read-only Neon snapshot matches the starting fingerprints of **all 159 tables**, account/password/authorization data, all three sessions, the migration ledger and schema catalog. No Neon seed/reset/repair/migration occurred. All **894 captured application/schema/environment/report files** remain byte-identical, including all five template definitions and all **19 enabled development flags**. Git staging is unchanged. No live S3 request, existing-account/password change, email/push/external delivery or deployment occurred. [Preservation receipt](../.tmp/phase81/preservation.json).

The **46 OPEN template-resolution items** and **20 OPEN GTI decisions** remain in their existing [blocker register](./requirements/GTI_Standard_Template_Blockers.md) and [decision register](./requirements/GTI_Standard_Template_Decisions.md). They were neither copied into the QA defect list nor declared fixed. Official-template designation remains NOT APPROVED.

## Exact repository changes and next phase

Created only:

1. `scripts/run-human-qa.mjs` — isolated startup, build verification, fake storage and cleanup.
2. `scripts/human-qa-fixture.mjs` — synthetic fixture and focused real-route/browser smoke.
3. `scripts/human-qa-network-guard.cjs` — disposable application's loopback HTTP boundary.
4. `docs/qa/FLUX_V2_Human_QA_Guide.md`.
5. `docs/qa/FLUX_V2_QA_Issues.md`.
6. `docs/qa/FLUX_V2_QA_Setup.md`.
7. `docs/PHASE-8.1-QA-HANDOVER.md` — this report.

Private/generated artifacts live under ignored `.tmp/phase81/`, the isolated `/private/tmp/flux-dashboard-build-8BRiyq` build and the currently recorded disposable QA root. The existing builder may regenerate the schema-matched ignored Prisma client. No application source, dependency manifest, schema/migration, template, business backlog or pre-existing activation report was changed. Nothing was staged, committed or deployed.

For **Phase 8.2**, first collect the tester's observations, triage actual defects separately from business requirements, fix authorized defects, and obtain independent retests before closing them. Do not infer production or official-template approval from this handover. **Stop after Phase 8.1.**
