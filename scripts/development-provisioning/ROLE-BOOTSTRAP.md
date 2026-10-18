# Phase 1.4F — approved development role initialization procedure

This procedure is prepared for `flux-v2-dev`, branch `develop`, database `neondb`
only. **Do not run any role `apply` command until the product owner explicitly
authorizes the complete role initialization.** No identity creation or password
change is part of this procedure. V2 runtime authorization remains inactive.

The verified nine identities all have legacy `USER` and no V2 authorization row.
The confirmed actual operator for both signed bootstraps is `developer1@example.test`.
The signing key holder must independently authenticate the operator and approve
each request; choosing an email or knowing the shared test password is not proof
of independent setup authority. The product owner's approval is also required.

## Target and intended result

- Pooled endpoint fingerprint: `9d6f1df51a9db284`.
- Direct endpoint fingerprint: `5b001dbfcdb263fa`.
- Audience: `flux-v2-dev:develop:neondb:5b001dbfcdb263fa:6c64549f4682ae1b`.
- PostgreSQL 18.6, public schema, 103 applied migrations and no drift at preparation.
- Manifest fingerprint: `6c64549f4682ae1b`.

| Identity | V2 business role | Technical privileges | Initial version |
| --- | --- | --- | --- |
| director@example.test | DIRECTOR | None | 1 |
| spm1@example.test | SENIOR_PROJECT_MANAGER | None | 1 |
| spm2@example.test | SENIOR_PROJECT_MANAGER | None | 1 |
| jpm1@example.test | JUNIOR_PROJECT_MANAGER | None | 1 |
| designer1@example.test | DESIGNER | None | 1 |
| designer2@example.test | DESIGNER | None | 1 |
| digitallead1@example.test | DIGITAL_LEAD | None | 1 |
| developer1@example.test | None | TECHNICAL_ADMIN | 1 |
| developer2@example.test | None | TECHNICAL_ADMIN | 1 |

Every identity retains legacy `USER` and `projectCreationAccessGranted=false`.
The expected initial result is nine authorization rows, one Director, two technical
administrators and nine immutable authorization audit rows. Bootstrap audit actors
are Developer One; subsequent business assignment actors are the Director and the
Developer Two privilege assignment actor is Developer One.

## Local signing preparation — no database writes

Run commands from the repository root. The offline issuer loads no `.env`, database
client or application module, and makes no network calls. It pins the exact audience
above, rejects production/CI/unknown environments, and signs only initial Director
or Technical Administrator approvals with `expectedVersion: null`.

Use a separate signer process. For separate human operators, keep the private key
under the signing authority's own OS account or machine and transfer only the public
trust file, unsigned requests and signed envelopes. Same-user local processes are
process separation, not an OS access-control boundary. The private key is an
unencrypted PKCS#8 file protected by an owner-only directory/file (0700/0600); protect
its custody accordingly. It is never printed or supplied to the database executor.

```sh
FLUX_SIGNER_DIR="$HOME/.config/flux-v2-development-signer"
FLUX_REQUEST_DIR="$HOME/.config/flux-v2-development/approvals"
FLUX_OPERATOR_ID="cmvdtt93s0007ob8ugx73e6tt"
FLUX_DIRECTOR_ID="cmvdtt7sv0000ob8uw15ncm0c"
mkdir -p "$HOME/.config"

node scripts/development-signing.mjs init --environment flux-v2-dev/develop --key-directory "$FLUX_SIGNER_DIR"
node scripts/development-signing.mjs install-trust --environment flux-v2-dev/develop --key-directory "$FLUX_SIGNER_DIR"
mkdir -m 700 "$FLUX_REQUEST_DIR"

pnpm users:v2 plan --environment flux-v2-dev/develop
```

`init` requires a new directory and never rotates/replaces an existing key.
`install-trust` copies only `trust.json` to the executor's fixed
`~/.config/flux-v2-development/trust.json`; it never overwrites existing trust.
If either location already exists, inspect it and stop on conflict rather than
deleting it. With a separate signing host, securely transfer the public-only
`trust.json` to the same fixed executor path with directory mode 0700 and file mode
0600; compare its public-key SHA-256 fingerprint to the issuer's initialization
output through a trusted channel.

Confirm the latest plan still has exactly nine expected `USER` identities, no V2
assignments, no unexpected users, matching fingerprints/migrations, no drift, and
`PUBLIC_VERIFICATION_KEY_CONFIGURED`. Compare the two IDs above to the plan's actual
Developer One and Director IDs. If anything differs, stop and review. These IDs are
not credentials; they must refer to the actual existing accounts, never guessed IDs.

## After explicit approval: 1. Bootstrap the Business Director

Do not prepare all envelopes in advance. Each expires within ten minutes, and both
the issuer and database service recheck expiry. Generate, independently approve,
sign and apply each request in sequence. Use new filenames if a request expires;
the tools do not overwrite files or silently renew approvals.

```sh
pnpm users:v2 plan --environment flux-v2-dev/develop --step bootstrap-director \
  --operator-email developer1@example.test --reason 'Approved initial development Business Director setup' \
  --request-file "$FLUX_REQUEST_DIR/director-request-1.json"

node scripts/development-signing.mjs sign --environment flux-v2-dev/develop \
  --key-directory "$FLUX_SIGNER_DIR" --request-file "$FLUX_REQUEST_DIR/director-request-1.json" \
  --approval-file "$FLUX_REQUEST_DIR/director-approval-1.json" \
  --operation BOOTSTRAP_DIRECTOR --operator-id "$FLUX_OPERATOR_ID" --target-id "$FLUX_DIRECTOR_ID"

pnpm users:v2 apply --environment flux-v2-dev/develop --step bootstrap-director \
  --operator-email developer1@example.test --approval-file "$FLUX_REQUEST_DIR/director-approval-1.json"
```

The signer displays the complete non-secret request. Review the pinned audience,
operation, actual actor/target IDs, null expected version, reason, expiry and unique
change ID. After independently authenticating the operator, type the exact `SIGN`
confirmation shown. The signer signs the original UTF-8 bytes, not reserialized JSON.
It writes a protected envelope containing only `payload` and `signature`.

The executor separately asks for the actual non-secret operator name/reference and:

```text
APPLY flux-v2-dev develop nine accounts 6c64549f4682ae1b
```

This confirmation applies only to the chosen step. Wait for `SIGNED_BOOTSTRAP_COMMITTED`
and `VERIFIED_AFTER_OPERATION`. Expect one Director, zero technical administrators
and one audit row. The Director has no technical privileges.

## 2. Independently bootstrap Developer One

```sh
pnpm users:v2 plan --environment flux-v2-dev/develop --step bootstrap-technical \
  --operator-email developer1@example.test --reason 'Independently approved initial development Technical Administrator setup' \
  --request-file "$FLUX_REQUEST_DIR/technical-request-1.json"

node scripts/development-signing.mjs sign --environment flux-v2-dev/develop \
  --key-directory "$FLUX_SIGNER_DIR" --request-file "$FLUX_REQUEST_DIR/technical-request-1.json" \
  --approval-file "$FLUX_REQUEST_DIR/technical-approval-1.json" \
  --operation INITIAL_TECHNICAL_ADMIN --operator-id "$FLUX_OPERATOR_ID" --target-id "$FLUX_OPERATOR_ID"

pnpm users:v2 apply --environment flux-v2-dev/develop --step bootstrap-technical \
  --operator-email developer1@example.test --approval-file "$FLUX_REQUEST_DIR/technical-approval-1.json"
```

This needs a separate independently authorized signature, even though the actual
operator and target are both Developer One. The Director role alone cannot authorize
it. Expect one Director, one technical administrator and two audit rows. Developer
One has no business role. This initial setup path cannot recover revoked grants.

## 3. Assign the remaining six business users

Sign in normally to the running local FLUX application as `director@example.test`.
From the browser's developer tools, obtain that login's existing `gti_session` cookie
and supply it only at the CLI's masked session prompt. Never paste it into chat,
arguments, files or logs. The HTTP-only cookie is inspected in browser storage,
not through page JavaScript. Do not create or insert a replacement session.

```sh
pnpm users:v2 apply --environment flux-v2-dev/develop --step business-roles \
  --reason 'Approved initial development business role assignments'
```

The existing service authenticates the live, unexpired Director session inside
each locked transaction. Expect seven assigned business users and eight audit rows
in total, including the independent technical bootstrap.

## 4. Assign Developer Two's technical privilege and verify

Sign in normally as `developer1@example.test` and supply its genuine `gti_session`
cookie only at the masked prompt for this command:

```sh
pnpm users:v2 apply --environment flux-v2-dev/develop --step technical-roles \
  --reason 'Approved development Technical Administrator assignment for Developer Two'
pnpm users:v2 verify --environment flux-v2-dev/develop
```

The final `verify` must succeed with the exact intended matrix, all nine legacy
`USER` roles preserved, nine authorization rows, nine audit rows, one Director and
two technical administrators. Before completion it intentionally exits with
`PROVISIONING_INCOMPLETE_NO_CHANGES_MADE`; this is not permission to skip steps.

## Failure handling and boundary

After any failure, timeout, interruption or uncertain commit, stop and run only
the read-only `plan`. Report its authoritative state; do not silently retry,
re-sign, transfer roles, replace keys, reset records or remove audit history.
Bootstrap steps are individually atomic; the four-step sequence is not one global
transaction. Business assignments commit individually, and the CLI reports completed
targets on partial failure. Recover only after reviewing what actually committed.

No step changes passwords, legacy roles, Prisma migrations, V2 runtime enforcement,
project workflows, Tasker, Archives, Library or S3. Stop after the final verification;
this procedure does not authorize Phase 1.5.
