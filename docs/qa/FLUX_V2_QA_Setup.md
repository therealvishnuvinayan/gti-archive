# FLUX V2 — Local QA setup

For the developer assisting the tester · 24 October 2026

The first tester will use this developer computer, as confirmed by the user. The QA application is **http://127.0.0.1:3117**. The existing Neon-backed application at port **3000** is not the QA target.

## Start

From this repository, with the existing dependencies installed:

```sh
node scripts/run-human-qa.mjs
```

Leave the terminal running. This creates an isolated all-flags production build using the existing `dashboard-v2-build.mjs`, a fresh private PostgreSQL cluster in UTC, local fake S3 and synthetic records. The tester's browser and Task Calendar display Dubai time. It prints “QA ready” only after real logins and fixture actions succeed. It does not load repository environment files or accept a database URL. The 19 flags are set only in its isolated child process; existing development settings are untouched.

Requirements already available on this computer: Node/pnpm, repository `node_modules`, PostgreSQL tools (`initdb`, `pg_ctl`, `createdb`), and the Chromium/Playwright installation used by the existing browser harness. The existing default Playwright package is `/Users/vishnuvinayan/Projects/dinepanel/qa-harness/package.json`. On a separately prepared computer, `FLUX_PLAYWRIGHT_PACKAGE` may identify an installed package containing `playwright-core`; no dependency download is performed by this launcher. Ports **3117** and **3118** must be free. PostgreSQL uses only a private Unix socket, with no TCP listener.

If Codex's sandbox cannot create PostgreSQL shared memory or bind loopback ports, the same command needs local execution permission. This does not require permission to access Neon or external services. An occupied port causes setup to stop; do not kill an unrelated process.

The terminal and `.tmp/phase81/interactive/current.json` give the session's paths to:

- `accounts.txt`: private, newly generated test credentials for Director, SPM, Other SPM, JPM, Designer, Ungranted Designer, Digital Lead and Technical Only.
- `fixture-links.html`: simple links into the **actual application**, not substitute test screens.
- `QA-proof.pdf`: a valid, synthetic PDF for uploads and previews.

These are created in the private temporary session directory. Open the links page and give the tester the account card separately. Do not copy credentials into tracked files, issues, screenshots or chat. Give them [the human guide](./FLUX_V2_Human_QA_Guide.md) and [issue form](./FLUX_V2_QA_Issues.md).

## Reset or stop

1. Save human results and screenshots outside the disposable session directory.
2. Press **Ctrl+C** in its launcher terminal. If Codex started the session, the developer can instead run `kill -INT PID`, replacing `PID` with the QA launcher `pid` in `.tmp/phase81/interactive/current.json`. It stops its Next.js server and private database and removes its data, fake objects, credentials and sessions.
3. Run the same start command again for a clean fixture. Reopen the new links/account card; old passwords and record links no longer apply. Sign out of stale browser sessions.

No reset command targets Neon. Do **not** use the repository's `development-data:reset`, migration, user-management or storage commands for this QA session. Reset is whole-session, not per-test. Avoid closing the terminal forcibly; after a machine interruption, consult the recorded launcher PID and private path before cleaning up any remaining QA process. Never stop port 3000 as part of QA reset.

For a faster restart, the verified build can be reused:

```sh
node scripts/run-human-qa.mjs --build=/private/tmp/flux-dashboard-build-REPLACE_WITH_RECORDED_PATH
```

Use the path in `.tmp/phase81/build/build-path`, or the exact path in the Phase 8.1 report. The launcher checks copied source/configuration files against the repository and rejects a stale build. Rebuild with the simple start command after application changes.

## Automated smoke, separate from human results

With the interactive QA session stopped:

```sh
node scripts/run-human-qa.mjs --smoke
```

The smoke option creates a fresh fixture, runs targeted browser checks, records `.tmp/phase81/smoke/result.json`, screenshots and a private server log, then removes the session. It does not mark any human test PASS. `--build=…` can also be supplied to reuse a matching build. Human results in the guide start **NOT RUN**.

The seed uses genuine authenticated application routes for tasks, workflow publication, runtime creation, stage uploads/review, final completion, Archive folders and grants. Base synthetic accounts, Native/Flexible records, pinned Archive source and recorded-history examples are fixture inserts in the private database. No notification producer or external delivery worker is started. The fake S3 service supports the exact-byte upload/copy/download paths used here; it is not real-provider acceptance.

## Access boundary

This setup is only for this computer and trusted local users. It is not LAN-accessible, publicly hosted or a production deployment. Real S3, realtime provider delivery, email/push, external signatures and vendor services are outside this session. The five GTI templates retain their internal-candidate status.

Remote access is not needed for the agreed first session. If later required, a separately approvable proposal is: one private QA host with authenticated access, a disposable database and test-only object store, synthetic accounts, no outbound delivery, explicit access expiry and a deletion/reset owner. Approve hosting, access controls and cost before provisioning. No tunnel, firewall change or deployment is authorized by this handover.
