# Phase 1.4D — private development provisioning

This CLI is operator tooling, not a route or public setup endpoint. It does not
activate V2 runtime authorization, send email, access S3, migrate databases, or
modify existing identities/passwords. It uses the existing password implementation,
signed bootstrap factories, and trusted-session role-assignment service.

## Approval boundary

Implementation, disposable tests and remote **read-only** preflight are authorized.
Remote writes require the product owner's separate confirmation identifying
`flux-v2-dev`, branch `develop`, and the exact nine accounts below. Do not run an
`apply` command until that approval is given. Each apply also requires a real local
TTY and a typed confirmation binding the environment and account-manifest digest.
There is no `--yes`, password argument, password file, token argument, or CI mode.
Codex cannot collect the operator's passwords through chat or tool arguments.

| Name | Email | V2 business role | Technical privilege |
| --- | --- | --- | --- |
| Slavomir Kluziak | director@example.test | DIRECTOR | None |
| Senior PM One | spm1@example.test | SENIOR_PROJECT_MANAGER | None |
| Senior PM Two | spm2@example.test | SENIOR_PROJECT_MANAGER | None |
| Junior PM One | jpm1@example.test | JUNIOR_PROJECT_MANAGER | None |
| Designer One | designer1@example.test | DESIGNER | None |
| Designer Two | designer2@example.test | DESIGNER | None |
| Digital Lead One | digitallead1@example.test | DIGITAL_LEAD | None |
| Developer One | developer1@example.test | None | TECHNICAL_ADMIN |
| Developer Two | developer2@example.test | None | TECHNICAL_ADMIN |

All nine identities use legacy `USER`, with `projectCreationAccessGranted=false`.
All nine email addresses are fictional development identities under `example.test`.
The existing password login normalizes the email, looks up the user and verifies
the stored password hash; it requires neither email delivery nor email verification.
V2 Director/technical assignments do not grant legacy ADMIN/SUPER_ADMIN access.
Login can establish an ordinary application session, but V2 business or technical
UI powers remain inactive until the separately approved runtime integration.

## Target and preflight

Only the checked-in allowlist for `flux-v2-dev/develop`, database `neondb`, public
schema, PostgreSQL 18 is accepted. Pooled fingerprint: `9d6f1df51a9db284`; direct:
`5b001dbfcdb263fa`. These identify the previously verified Neon branch endpoint;
the CLI does not infer Neon branch names from PostgreSQL or contact its management
API. Unknown hosts, URL host overrides, non-public schemas, production/CI execution
and mismatching shell/Prisma/Next environment bindings are rejected before connecting.

```sh
pnpm users:v2 --help
pnpm users:v2 plan --environment flux-v2-dev/develop
pnpm users:v2 verify --environment flux-v2-dev/develop
```

Both modes enforce read-only connections. Each checks 103 migration records and
checksums, Prisma drift, Director protections, all application-table counts,
the exact manifest identities and existing assignment/audit consistency. All
unrelated business tables must remain empty. Status reference data is retained.
`plan` accepts a valid incomplete state and reports missing identities/assignments;
`verify` exits unsuccessfully until all nine intended assignments are complete.
Neither command loads password hashes or prints session tokens. Missing signing
configuration is reported in the plan, not replaced with a generated key.

## Identity creation — only after approval

```sh
pnpm users:v2 apply --environment flux-v2-dev/develop --step identities
```

The operator supplies their non-secret name/reference and the exact confirmation
shown by the CLI. Enter a unique password and confirmation at each masked prompt.
Use password-manager-generated passwords of 16–256 characters. The CLI enforces
the application's uppercase/number policy plus rejection of controls, obvious
identity/product/common-password patterns and highly repetitive credentials.
Passwords must differ from those of all other provisioned accounts.

The existing `src/lib/auth-password.ts` scrypt hash/verification functions are
used unchanged. Cleartext is never placed in arguments, logs, environment,
temporary files, receipts or snapshots. In-memory references are released after
use; JavaScript strings do not offer a guaranteed memory-zeroization facility.
The CLI does not send invitations or reset emails to any account.
Only missing identities are inserted, all in one transaction after
password entry and a locked state recheck. Existing identities/passwords are
never rewritten. Name/email/legacy-role conflicts stop the command.

The User model has no identity-creation audit table. The command emits a safe
operator-labelled identity receipt; retain it in an operator-controlled audit
location if required. It is an operator attestation, not a signed authorization
record. V2 role changes have authoritative, trigger-generated database audit rows.
No audit schema or migration is added in this phase.

## Independent signing authority

The signer must remain outside the database execution process. No signing utility
or private key is shipped, generated or loaded by this CLI. Configure a trusted
operator-owned file at `~/.config/flux-v2-development/trust.json`, outside the
repository, with its containing directory mode 0700 and file mode 0600. It has
exactly two keys: `publicKeyPem` (an Ed25519 SPKI PUBLIC KEY PEM) and `audience`
(the exact environment/database/manifest audience printed by `plan`).

Changing the Director email changes the manifest digest, typed confirmation and
signing audience. Use the current plan's audience for the public-key trust
configuration and independent approvals; envelopes for the previous manifest
are not valid for this manifest.

The independent authority must authenticate the actual operator and approve the
target, scope, expected version, reason, database audience and expiry. Selecting
an email in the CLI is not proof of operator authority. The signed payload's actor
must be that actual operator's existing approved identity; no tenth operator
account is created. Decide which of the nine identities the operator legitimately
controls before requesting a signature.

After all identities exist, prepare a request, choosing the real operator's
approved account email and a meaningful non-secret reason:

```sh
pnpm users:v2 plan --environment flux-v2-dev/develop --step bootstrap-director \
  --operator-email '<approved-operator-email>' --reason '<approved reason>'
```

The output contains an **unsigned** payload string. The independent authority signs
its exact UTF-8 bytes with Ed25519, returning an envelope with exactly `payload`
(that string) and `signature` (base64url signature). Do not sign a reserialized JSON
object. The payload expires within ten minutes; prepare a new approved envelope
when expired. Store the envelope in an operator-owned mode-0600 file in a private
mode-0700 directory outside the repository. Do not supply a private key file.

```sh
pnpm users:v2 apply --environment flux-v2-dev/develop --step bootstrap-director \
  --operator-email '<approved-operator-email>' --approval-file /absolute/private/director-envelope.json
```

Repeat `plan`/`apply` with `--step bootstrap-technical` and a separate independently
authorized envelope. The target is always Developer One. Director and technical
bootstrap invoke only their existing factories; signature, scope, audience,
expiry, mandatory reason, actor/subject existence, expected version, replay,
uniqueness and transactional audit checks remain authoritative there. Director
bootstrap never grants technical privileges; technical bootstrap never grants a
business role. Replaying a completed bootstrap is rejected; use plan to inspect
its existing result. Missing trust/approval stops before any role assignment.

## Ordinary assignments through genuine application sessions

Once the Director is initialized, sign in normally as `director@example.test`
in the local application connected to this development DB. Run:

```sh
pnpm users:v2 apply --environment flux-v2-dev/develop --step business-roles --reason '<approved reason>'
```

At the masked prompt, supply the existing session's `gti_session` cookie value
locally. Never paste it into chat, an argument, a file or logs. The CLI does not mint
a session from an actor ID. Its trusted callback supplies that bearer token to the
existing service, which resolves the current unexpired session and V2 authority
inside every locked transaction. The CLI additionally pins the intended operator
to the Director for these six assignments.

After Developer One's independent technical bootstrap, sign in normally as that
account and use its genuine existing session for:

```sh
pnpm users:v2 apply --environment flux-v2-dev/develop --step technical-roles --reason '<approved reason>'
pnpm users:v2 verify --environment flux-v2-dev/develop
```

This assigns only Developer Two's technical privilege through the ordinary service.
No public setup/recovery endpoint or alternative authorization writer is added.
Initial assignments move from absence to authorization version 1. Repeating a
matching assignment is a service no-op; legitimate later changes increment versions.

## Failures and resume

Identity creation is atomic. An ambiguous connection/commit failure must be
reconciled with `plan`; do not assume rollback or rerun with replacement passwords.
Existing matching identities are retained and only missing ones prompt on resume.
Bootstrap operations are independently atomic, never undone automatically.
Business assignments are individually atomic. A failure reports completed targets
and the interrupted target, whose authoritative outcome may be uncertain. Run
`plan`, obtain a fresh authenticated session/approval as necessary, and resume the
same step. Completed matching assignments create no extra versions or audit rows.
Conflicting identities/roles, unexpected records or audit gaps require review;
the CLI never deletes, recreates, remaps or silently repairs them.

## Isolated validation

```sh
pnpm users:v2:check
node node_modules/typescript/bin/tsc --project scripts/tsconfig.development-provisioning.json --noEmit
node node_modules/eslint/bin/eslint.js scripts/development-users.mjs scripts/development-provisioning scripts/development-provisioning-integration-check.ts scripts/run-authorization-isolated-integration.mjs
```

The checks require installed PostgreSQL tools and Python 3 (standard-library PTY
tests only; the provisioning CLI itself uses Node). The existing isolated runner creates a private disposable PostgreSQL cluster with
TCP disabled and a whitelisted environment. It runs the governance/concurrency and
signed-service suites, then the provisioning suite in a third fresh database.
Real pseudoterminal checks cover masking, confirmation, editing, cancellation and
multiline-paste rejection. Only synthetic temporary passwords/signing keys are used. The cluster and compiled
test artifacts are removed after shutdown; no application DB or external service
is used. Local operator execution compiles into a private temporary directory and
uses Next's actual server-only package under its server export condition.
