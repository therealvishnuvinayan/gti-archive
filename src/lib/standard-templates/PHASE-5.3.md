# FLUX V2 — Phase 5.3: Exhibition Stand and Digital internal candidates

Implemented on **23 October 2026**. All five categories now have authenticated draft loaders in **Projects → Workflow drafts**. Exhibition Stand and Digital are revision-1 **UNAPPROVED_CANDIDATE / INTERNAL_EVIDENCE_PILOT** configurations using the existing Stage Builder, publication and runtime. Internal validation passes; official readiness remains blocked by **15 Exhibition** and **14 Digital** requirement groups. No official GTI standard is designated or published.

The three existing definitions and pinned hashes are preserved. There is no new schema, execution engine, maintenance status, external integration or live activation. The recorded Neon baseline is not a fresh verification. Phase 5.4 and Phase 6 are not started.

**1. Source and approved governance.** The [September 29, 2026 DOCX](../../../docs/requirements/GTI_FLUX_Project_Process_Templates_Source.docx), [complete extraction](../../../docs/requirements/GTI_FLUX_Project_Process_Templates_Source.json), [human map](../../../docs/requirements/GTI_FLUX_Source_to_V2_Map.md) and [structured map](../../../docs/requirements/GTI_FLUX_Source_to_V2_Map.json) remain the business-content authority. The original binary and 523 nonempty source paragraphs retain SHA-256:

```text
4d86f90d173a406ad9f3a5ffbba7ce55776b5d209f4bc2a0e4653f299d61b944
```

Paragraph ordinals remain reproducible, including table cells and empty-paragraph counting. Source page numbers are unverified; no pagination was invented. All P0165–P0183 Exhibition paragraphs and P0184–P0202 Digital paragraphs resolve in the new traces, including maintenance as a requirement rather than an execution stage. The source is business evidence, not authorization for external actions or changes outside this package.

Later approved V2 rules retain precedence: five business roles, technical administration without automatic business access, global Director authority without fictitious membership, SPM creation from an approved executable version and JPM creation only after a Director decision with an eligible SPM Co-owner. All six Tasker types and Sisters remain unchanged. Initial/Final Concept tasks are used manually, not recreated as a mandatory legacy stage engine. Existing independent review, exact-version identity, fixed gates, explicit document policy and Owner-request/Director-final-decision separation remain authoritative.

**2. Exhibition Stand inventory.** Identity `gti-exhibition-stand`, category `EXHIBITION_STAND`; [complete snapshot, traces and validation](../../../docs/requirements/GTI_Exhibition_Stand_Blueprint_v1.json). All eight source stages are retained.

| Stage / source | Fields | Files (required) | Checklist items | Approval steps | Explicit gates |
| --- | ---: | ---: | ---: | ---: | ---: |
| Brief · P0167–P0168 | 25 | 1 (1) | 0 | 0 | 3 |
| Planning & Organiser Manual · P0169–P0170 | 12 | 2 (1) | 0 | 0 | 3 |
| Contractor Selection · P0171–P0172 | 6 | 2 (2) | 0 | 1 | 5 |
| Concept & Design · P0173–P0174 | 4 | 2 (2) | 0 | 0 | 4 |
| Graphics, Content & Linked Projects · P0175–P0176 | 7 | 2 (2) | 8 | 0 | 5 |
| Build-up · P0177–P0178 | 5 | 2 (2) | 2 | 0 | 5 |
| Event · P0179–P0180 | 5 | 1 (1) | 0 | 0 | 3 |
| Dismantling & Wrap-up Report · P0181–P0183 | 7 | 3 (2) | 1 | 0 | 5 |
| **Total** | **71** | **15 (13)** | **11** | **1** | **33** |

The definition has **28 capability blocks**, 58 proposed required fields and three read-only scope/planning/relationship notices. The Brief captures event name, start/end dates, hall/stand number, source-specified area in square metres, open sides, budget with entered currency, leads/meetings/launch objectives, products, meeting-room, hospitality and staff requirements. General Creative Brief content and manually prepared evidence retain source §17 requirements; no budget, safety or operating threshold is inferred.

Planning captures actual DATE fields for stand-design submission, electricity, rigging, badges, catering and freight, with no default/calculated date. These organiser dates are optional scalar capture pending applicability/requiredness confirmation; a shared deadline/conditions summary and organiser manual are required pilot evidence. There is no cross-date, fixed-milestone or backward-planning enforcement. Last year's eligible report is an optional manual upload, not automatic retrieval or a grant of cross-project access.

Contractor fields/files retain requirements, proposed builders, Director-selected invitation references, RFP, offers, comparison, selection and contract evidence. One configured **Director internal contractor-evidence review** is supported. It does not qualify CERBER vendors, count three distinct offers, dispatch an RFP or authorize a real contract/expenditure. File counts are candidate limits, never a proxy for distinct offers.

Concept/Design retains 3D renders, revisions, final design, drawings and organiser submission/approval evidence. Initial/Final Concept tasks supply the creative workflow; uploaded organiser records remain human evidence, not verified external decisions. Graphics retain large-format files, AV, product-display plans and human File Standard checks. Merchandise, apparel, POSM and catering references explicitly remain plain text: no project foreign keys, access grants, separate-budget entities or aggregate ledger are created.

Build-up retains site/supervision evidence, snags, manual General Task references, corrective actions and Stand Acceptance Protocol. Human review does not certify physical safety, enforce snag resolution or establish bilateral acceptance. Event captures numeric lead/meeting totals plus observations, issues, photos and outcomes; there is no CRM or live event integration. Wrap-up captures dismantling, reusable storage, cost-versus-budget and outcome reports, lessons, future-use notes and optional rating evidence. Independent report-file review is a labeled candidate choice because the source does not identify the report approver. A generic checklist does not satisfy the source's separate Owner/Co-owner/Director ratings for each vendor.

**3. Digital inventory.** Identity `gti-digital`, category `DIGITAL`; [complete snapshot, traces and validation](../../../docs/requirements/GTI_Digital_Blueprint_v1.json). There are exactly seven execution stages.

| Stage / source | Fields | Files (required) | Checklist items | Approval steps | Explicit gates |
| --- | ---: | ---: | ---: | ---: | ---: |
| Brief · P0186–P0187 | 24 | 1 (1) | 0 | 0 | 3 |
| Discovery · P0188–P0189 | 6 | 2 (2) | 0 | 1 | 5 |
| UX Concept · P0190–P0191 | 2 | 1 (1) | 0 | 0 | 3 |
| UI Design · P0192–P0193 | 4 | 1 (1) | 0 | 0 | 3 |
| Specification & Content · P0194–P0195 | 10 | 3 (2) | 3 | 0 | 5 |
| Build & Testing · P0196–P0197 | 6 | 2 (2) | 2 | 1 | 6 |
| Launch & Handover · P0198–P0200; maintenance guidance P0201–P0202 | 12 | 2 (2) | 2 | 0 | 6 |
| **Total** | **64** | **12 (11)** | **7** | **2** | **31** |

The definition has **26 capability blocks**, 53 proposed required fields and four read-only scope/secret/account/maintenance notices. Brief captures purpose/objectives, users, a controlled Web/iOS/Android primary-platform choice, additional source-platform scope, languages, integration requirements, budget/currency, age verification, privacy, cookies and launch date, plus the General Creative Brief. Supplied compliance requirements are information, not certification.

Discovery retains requirements, stories, sitemap, technical notes and vendor/RFP references with a **Director internal discovery/vendor-evidence review**. This does not execute external vendor selection or approved dispatch. UX retains wireframes, flows, rationale and Initial Concept references. UI retains screens, visual style/design system, selected-inspiration references and Final Concept outputs. Actual eligible exact inspiration selection belongs to Tasker; the summary does not establish that relationship. Neither phase invents a mandatory concept count, user-test threshold or source-specific approver; independent exact file review is explicitly a candidate route.

Specification captures content/text inventory, SEO, privacy/terms/cookie evidence, non-secret accounts/domains, export formats, resolutions and naming, with human digital File Standard review. Build/Testing captures rounds, test-version evidence, UAT, bugs, corrective/retest evidence and outcomes. A fixed **Owner internal testing-evidence review** is labeled a candidate choice because P0197 names approval but not its reviewer. Repeatable UAT/test-case entities, bug/task bindings, issue-resolution gates and automatic corrective tasks are not implemented.

Launch/Handover captures readiness, reported go-live date/outcome, IT owner, non-secret handover references, documentation/training, a manually recorded support period and Acceptance Protocol. No deployment or external service is triggered. Internal review does not verify actual deployment, secure access transfer, legal compliance or bilateral go-live acceptance.

**4. Digital credential and maintenance boundaries.** Every Digital field's help and every file requirement explicitly prohibit passwords, API keys, recovery codes and other secrets in ordinary fields, comments or files. Account/access labels request only non-secret identifiers, ownership/team names and record references; secret-bearing links/tokens are also excluded. Dedicated read-only notices and the loading card repeat this boundary. There is no credential-entry field or credential default. Tests verify the guidance, absence of credential fields and rejection of an undeclared `digital_password` field on an active stage.

This is **not automatic secret detection, scanning, redaction or a secure vault**. The existing generic builder still accepts ordinary text and uploaded bytes within its supported schema; authorized authors can edit draft copies. Do not place secrets in those inputs. The missing vault/verified-handover capability is an official blocker, not a text-field substitute. Acceptance uses non-secret synthetic data only.

P0185/P0201–P0202 require maintenance without a fixed end date, tasks and ongoing costs. V2 currently has ACTIVE/COMPLETED projects and immutable completed evidence. Both facts are visible in the blueprint description, a read-only final-stage notice, the source map and `maintenance-closure-policy` blocker. There is **no eighth stage, MAINTENANCE database status, ongoing cost ledger or automatic maintenance task generation**.

Completing Launch & Handover leaves the project **ACTIVE**. Normal existing task workflows may be used manually while it genuinely remains ACTIVE; service acceptance demonstrates a manually created post-launch General Task through submission, completion request and Owner approval without changing completed stage evidence. Final-project closure remains an explicit separate operation, requiring a Director-approved per-project document policy, actual Owner request and distinct Director decision. Tests deny task creation and stage edits after COMPLETED.

GTI must decide whether Digital projects remain ACTIVE for a defined or indefinite maintenance period, who records that decision, what triggers final closure and how ongoing costs will be governed. A text field recording an unresolved decision is not a new policy or authorization. This phase neither silently overrides indefinite maintenance with automatic closure nor bypasses current Director-controlled closure.

**5. Supported scope and official-readiness matrix.** Each snapshot includes a `trace` binding every workflow/stage/block/field/file/checklist item/approval step/gate, and a classified `gaps` matrix with source paragraphs, missing enforcement and internal treatment. Requiredness, bounded file counts, unspecified routing and fixed gates are labeled candidate choices in field help/block instructions and traces. Schema validation does not certify underlying business outcomes.

| Actually enforceable | Limit |
| --- | --- |
| Typed fields, requiredness, declared options, bounds and valid dates | No cross-date scheduling, repeating rows, accounting or credential vault. |
| Exact sealed versions and configured independent file acceptance | No physical/engineering certification, external signatures or binary preflight. |
| Required human checklist attestations with text evidence | No automatic test-case, snag, vendor-rating or compliance validation. |
| Existing fixed approval eligibility and evidence snapshots | No external organiser/vendor/contract authority or new business roles. |
| Explicit predecessor/required-field/file/checklist/approval gates | No task-to-stage, issue, external-state, skip or maintenance gate. |
| Existing draft/publication/runtime/Tasker/completion adapters | No official designation, deployment, automatic tasks or Archive publication. |

`INTERNAL_EVIDENCE_PILOT` returns zero validation issues for each candidate. `OFFICIAL_STANDARD` returns the actual groups below; internal validity does not imply readiness.

Exhibition's **15 blockers**: candidate requiredness/routing/limits/designation; event scheduling; historical-report reuse; structured contractor/three-offer comparison; CERBER/vendor communications/contracts; concept-task gates; external organiser approval; typed linked projects/separate budgets; snag/task binding; physical stand/bilateral acceptance; reusable inventory; separate three-party vendor ratings; actual costs/financial visibility/CRM records; document generation/signatures/artwork preflight; source/V2 completion and archive governance.

Digital's **14 blockers**: candidate requiredness/routing/limits/designation; vendor/CERBER/RFP workflow; undefined UX/UI approval criteria; concept-task gates; security/legal/compliance certification; credential vault/detection/access transfer; digital-asset preflight; repeatable UAT rounds/cases; bug/task blocking; verified deployment/go-live; support scheduling; maintenance-versus-closure business policy; indefinite maintenance accounting; documents/signatures/acceptance. These are their own requirement groups, not reused counts from another template.

General Creative Brief, RFP, Framework/Copyright where applicable, File Standard and Acceptance Protocol remain manually prepared exact-version evidence. Source document-table stage numbers P0429/P0432 are interpreted by purpose, not used to invent mismatched fixed-stage gates. Legal wording, document generation and signing remain open. Stage evidence does not replace the separately Director-approved final completion-document policy.

**6. Stable identities, hashes and preservation.** Pure factories use semantic `exhibition_` / `digital_` IDs, current `TemplateBlueprint` and `WorkflowDefinition` v1, existing validation and unchanged authoring helpers. Definitions remain below 128 KiB. Future changed meanings need new IDs and a compatibility map; content/policy changes require a new blueprint revision. Draft copies are editable, but later edits are not automatically source-certified; published versions/runtime pins remain immutable.

| Candidate revision 1 | Definition bytes | Trace bindings | Canonical Stage Builder SHA-256 |
| --- | ---: | ---: | --- |
| Packaging, unchanged | 32,835 | 164 | `1f1e33373d711b1e8e0669f65c898fe8bd055e4f6dcd3c124823c57f717b58d7` |
| POSM, unchanged | 46,523 | 137 | `2f0f94603398158d6866e45111b6fa84499c1636a098565817bfd185294bc4fc` |
| Retail Display, unchanged | 43,875 | 143 | `dbfb9f4de1e68ccb5d706ba210a9a6481eac3bb6d912541ee56f151927dd8694` |
| Exhibition Stand | 47,050 | 153 | `88266d16c856d7c3c9c20f7fbd5339242395443b73e9bfda11fecfb9807dbec1` |
| Digital | 60,975 | 138 | `f11f5a5e839b682685a771076b41a88a1e4f126ea327276ab76c56848986643c` |

The existing three factory files and reviewable snapshots, shared contracts/authoring/import service, Packaging card, both loader route implementations, original source and prior reports retain starting bytes. The common additional-card component only adds Exhibition/Digital instances; existing POSM/Retail card content remains. All three original hashes are pinned in the specification suite, and their import/publication/runtime regressions still pass.

**7. Five-candidate authenticated UI.** Authorized Director/SPM users see **Load Packaging draft**, **Load POSM draft**, **Load Retail Display draft**, **Load Exhibition Stand draft** and **Load Digital draft** in Projects → Workflow drafts. Cards show internal scope, revision, source, stages and blockers; acknowledgement is required. Loading opens the existing populated editor, immutable save/history and preview workflow.

The server-only registry now explicitly allowlists all five identities. It still delegates through the unchanged importer to authenticated `createDraft`, retaining actual actor/session attribution, command identity, strict revision/scope validation, immutable revisions and atomic audit/outbox. Unknown IDs, actor/definition/designation injection, restricted business roles and technical-only accounts are denied by the service/API. Existing Packaging static and generic routes remain valid. Loading does not publish a workflow, create a runtime or make an official standard. Genuine later Director publication is a distinct action; tests use disposable synthetic records only.

**8. Synthetic publication/runtime acceptance.** The final standard-template service suite passes **3,803 assertions**: Packaging **721**, Printed POSM **635**, Merchandise **629**, Retail Display **557**, Exhibition **602**, Digital **655**, plus four harness assertions. It runs after the full populated Stage Builder/publication/runtime/Tasker/completion progression on disposable PostgreSQL 14.19 with fake storage and synthetic V2 sessions.

Each scenario validates source traces, deterministic configuration, internal/official separation, Director/SPM loading, unauthenticated/restricted-role denial, exact acknowledgement/revision, actor/definition/designation injection rejection, replay/cross-blueprint conflicts, one creation outbox entry, immutable revision editing/history and absence of load-time publication/runtime creation.

Actual synthetic SPM submission and a distinct Director decision publish the exact definition/hash. SPM creation pins the approved immutable version; later publication cannot retarget it. JPM direct creation is denied; a real request needs an eligible SPM Co-owner and Director approval. All eight Exhibition and seven Digital stages exercise typed fields, invalid number/date/select rejection, read-only protection, exact uploaded/opened versions, independent acceptance, written checklist evidence, supported approvals and explicit completion gates. No starter/maintenance tasks are created automatically.

Both new runtimes demonstrate a manually created General Task while ACTIVE after their stages, without mutating completed stage evidence. Digital additionally rejects a fabricated MAINTENANCE action and an undeclared credential field. Last-stage completion leaves projects ACTIVE. Missing policy/required proof and unauthorized policy/final-decision attempts are denied; explicit policy, reviewed documents, actual Owner request and separate Director final decision complete the projects. New Digital tasks and stage mutations then deny. Native project/archive/final-request counts and all synthetic accounts remain unchanged; no external requests occur.

**9. Test, build and browser evidence.** Final isolated Chromium **153.0.8010.12** acceptance passed **1,527 assertions, 132 screenshots, zero page errors and zero external requests**. Each new candidate contributes 18 screenshots; Packaging/POSM/Retail retain 14/15/16, and 51 cover the existing runtime/Tasker/completion flow. The harness uses the isolated production copy, disposable PostgreSQL **14.19**, genuine synthetic V2 sign-ins and loopback fake S3, with Node/browser external-network guards.

All five loader buttons are verified. Each candidate is loaded as SPM through the UI, edited/saved to immutable revision 2 and previewed on desktop/mobile, retaining revision 1. Director import/replay and restricted-role API/draft access denials are tested. A genuine synthetic Director publication decision follows the SPM submission, and SPM runtime creation pins the exact approved version. First-stage field entry and every explicit stage completion use UI controls; additional field/file/checklist/review steps use authenticated HTTP with persisted assertions. Both new runtimes complete all eight/seven stages and remain ACTIVE at the unconfigured-document-policy boundary. Full document policy/proof/Owner request/Director final closure is covered for each by the service suite and by the existing browser completion flow.

Visually inspected evidence shows actual typed content, not empty stages:

- [Exhibition editor: eight stages and numeric square-metre field](../../../.tmp/phase53/browser-final/52c-exhibition-typed-brief-field.png)
- [Digital editor: seven stages and Web/iOS/Android selector](../../../.tmp/phase53/browser-final/52c-digital-typed-brief-field.png)
- [Exhibition mobile populated preview](../../../.tmp/phase53/browser-final/54a-exhibition-mobile-typed-field.png)
- [Digital mobile preview and non-secret input guidance](../../../.tmp/phase53/browser-final/54a-digital-mobile-typed-field.png)
- [Digital runtime maintenance/closure boundary](../../../.tmp/phase53/browser-final/56a-digital-maintenance-boundary.png)
- [Digital final document-policy boundary](../../../.tmp/phase53/browser-final/57-digital-director-policy-boundary.png)

| Check | Result |
| --- | --- |
| Exact source extraction/hash, all-five mapping and complete new paragraph traces | PASS; 523 nonempty source paragraphs |
| All-five schemas, deterministic IDs/snapshots and three pinned original hashes | PASS; Exhibition/Digital internal valid, official blocked 15/14 |
| Standard-template real-service acceptance | PASS; **3,803 assertions**, all five candidates and both POSM choices |
| Existing Stage Builder draft immutability/authorization/race/rollback and publication | PASS; publication **402 assertions** |
| Existing runtime fields/files/independent approvals/gates | PASS; **503 assertions** |
| Runtime creation / General / deliverables / concepts-Sisters / completion | PASS; **49 / 463 / 376 / 483 / 340 assertions** |
| Populated migration progression and actual earlier-schema feature-off compatibility | PASS; 116 migrations / 150 tables, zero drift, preserved rows/checksums |
| Broad authorization, files/provenance, events, approvals, documents, project read/write/governance, Archive/Library, admin/workspace/search | PASS; **113 named PASS checkpoints** |
| Authorization foundation/persistence and approval/event/Tasker units | PASS |
| Native/legacy task and concept completion; Stage 5/6/7/concept UI-service regressions | PASS; synthetic real-service suites plus existing UI source checks |
| Full TypeScript without incremental cache; integration/spec compilation | PASS |
| Targeted ESLint, affected TS/TSX/MJS with `--max-warnings 0` | PASS; browser-wait correction linted separately |
| Isolated production build | PASS; **648 application source files** match the build copy |
| Final Chromium acceptance | PASS; **1,527 assertions / 132 screenshots / 0 page errors / 0 external requests** |
| Protected hashes, staging preservation and `git diff --check` | PASS; **136 protected files** unchanged |

The first browser run stopped at the new loader-count assertion because it counted before the streamed draft page finished rendering. An explicit locator render wait fixed the harness; the complete rerun passed. No application/authentication/gate changes were needed. The build retains its existing non-failing workspace-root inference warning. Disposable PostgreSQL and Next's local helper ports used authorized OS access; no real environment was involved.

Counts are separate suite receipts, not additive unique scenarios. Browser POSM exercises Printed POSM; Merchandise is covered through all stages and final closure in service acceptance. Manual Digital post-launch task creation/closure denial is covered by real services; the browser separately displays maintenance guidance and proves the ACTIVE policy boundary. Native UI regression scripts include source assertions and synthetic service behavior, not a new interactive tour of every legacy screen. Unsupported external/physical/commercial/compliance/maintenance outcomes are explicitly excluded, not silently treated as passed. No formal production QA, real S3/IAM, PostgreSQL 18 live mutation, credential-vault certification, real vendor/deployment action or destructive restore drill was performed.

Receipts are under `.tmp/phase53`: `integration.log`, `authorization.log`, `regressions.json` and per-suite logs, `spec-check.log`, `spec-check.jsonl`, `typecheck-final.log`, `eslint.log`, `eslint-browser-final.log`, `build-result.json`, `build.log`, `browser-final/result.json`, 132 PNGs/server log, `baseline.json` and `verification.json`. The earlier `browser` receipt retains the corrected harness timing failure. Reproduce with `pnpm standard-templates:spec-check`, `pnpm standard-templates:check` and `pnpm standard-templates:browser-check`, with `FLUX_BROWSER_BUILD` pointing to an isolated production build and `FLUX_BROWSER_ARTIFACTS` to an evidence directory. These existing commands now check all five candidates.

**10. Exact file inventory.** Created **5 files**:

- `src/lib/standard-templates/exhibition-stand.ts`
- `src/lib/standard-templates/digital.ts`
- `docs/requirements/GTI_Exhibition_Stand_Blueprint_v1.json`
- `docs/requirements/GTI_Digital_Blueprint_v1.json`
- `src/lib/standard-templates/PHASE-5.3.md`

Modified **8 files**:

- `src/lib/standard-templates/registry.ts` — add only the two explicit factory identities.
- `src/components/projects/standard-blueprint-cards.tsx` — add two source/scope cards alongside existing candidates.
- `docs/requirements/GTI_FLUX_Source_to_V2_Map.json` — link both implementations and their limits.
- `docs/requirements/GTI_FLUX_Source_to_V2_Map.md` — record eight/seven-stage candidates and maintenance/credential boundaries.
- `scripts/standard-template-spec-check.ts` — all-five deterministic snapshots, pinned original hashes and new source/safety/lifecycle checks.
- `scripts/standard-template-integration-check.ts` — all-five service acceptance, new manual-task and immutable-closure tests.
- `scripts/standard-template-browser-acceptance.mjs` — new populated editors/previews, five-loader check and runtime paths.
- `scripts/stage-runtime-browser-check.mjs` — expected runtime total for all five candidate acceptance paths.

Ignored `.tmp/phase53` build/test artifacts are not product files. No staging, commits, pushes or deployment were performed. Existing unrelated work and staging were preserved.

**11. Migration, Neon and environment.** No Prisma migration is required/proposed; checksum/catalog delta: **not applicable / zero**. All 116 historical SQL files, Prisma schema, environment files, three prior definitions/snapshots and protected shared files retain starting hashes (**136 protected files**). Repository schema remains 149 Prisma models; disposable populated rehearsal reaches **116 successful migrations / 150 tables**, zero drift, preserving original rows/checksums and earlier-schema feature-off behavior. All eleven existing local V2 flags remain enabled.

Recorded live-development baseline remains `flux-v2-dev / develop / neondb`, PostgreSQL 18.6, 116 successful migrations / 150 public tables, zero pending/failed/drift. **No fresh Neon verification or connection occurred.** No real drafts/projects/publications, S3, accounts/passwords/permissions, emails, vendor dispatch, procurement, external document links, deployment or automatic Archive action were used or changed.

**12. Remaining business decisions and Phase 5.4 recommendation.** Review all five candidates as a single final standard-template review package. Confirm required/optional fields, reviewer routes, fixed evidence gates, file limits, source ambiguities and what constitutes acceptable human evidence; preserve each candidate's unsupported-capability matrix. Exhibition needs decisions on actual milestone enforcement, external contractor/organiser authority, typed related projects/separate budgets, snag blocking, reusable inventory, three-party ratings and annual report reuse. Digital needs explicit UX/UI acceptance criteria, secure access handling, UAT/bug completion rules, support expectations and especially defined/indefinite maintenance and Director closure triggers. Source legal review, durations, starter tasks, CERBER master-data/reverification, file size and toolkit layout remain open.

For **Phase 5.4**, recommend a separately authorized, evidence-based GTI review of the five pinned snapshots and a consolidated decision/blocker register, with proposed scope/acceptance criteria for any missing adapters. Do not equate current internal validity with official approval. Agree the official designation/revision process and resolve or expressly defer blockers before any real publication/activation. **Stop after Phase 5.3 reporting: no Phase 5.4/6, live activation, official publication, migration or deployment is initiated.**
