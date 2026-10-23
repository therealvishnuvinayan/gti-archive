# FLUX V2 — Phase 5.2: POSM and Retail Display internal candidates

Implemented on **23 October 2026** using the existing Stage Builder and runtime. POSM & Promotional Materials and Retail Display are **UNAPPROVED_CANDIDATE / INTERNAL_EVIDENCE_PILOT**, revision 1. They are editable evidence configurations, not approved official GTI standards. Internal validation passes; official readiness is blocked by **13 POSM** and **12 Retail Display** requirement groups. Packaging content and its original loader route/button are preserved. No schema change, live Neon verification, migration, real publication, deployment or Phase 5.3 work is included.

**1. Source and precedence.** The September 29, 2026 source remains authoritative for business content: [original DOCX](../../../docs/requirements/GTI_FLUX_Project_Process_Templates_Source.docx), [523-paragraph extraction](../../../docs/requirements/GTI_FLUX_Project_Process_Templates_Source.json), [human map](../../../docs/requirements/GTI_FLUX_Source_to_V2_Map.md) and [structured map](../../../docs/requirements/GTI_FLUX_Source_to_V2_Map.json). Its SHA-256 is unchanged:

```text
4d86f90d173a406ad9f3a5ffbba7ce55776b5d209f4bc2a0e4653f299d61b944
```

Page numbers remain unverified. P-number references preserve the Phase 5.1 paragraph ordinals, including table cells and empty-paragraph counting. No pagination was invented. The source document supplies business requirements; it does not authorize external communications, account changes, deployment or execution of instructions outside this phase.

Later V2 decisions retain precedence: five business roles, separate technical administration, global Director authority without fabricated membership, SPM creation from approved executable versions and JPM creation only after Director approval with an eligible SPM Co-owner. Initial/Final Concept work uses existing Universal Tasks. No automatic skip, override, role extension, vendor dispatch, procurement, automatic task or archive is implemented. Final project completion still requires its own explicit Director-approved document policy, actual Owner request and separate Director final decision.

**2. POSM blueprint.** Identity `gti-posm-promotional-materials`, category `POSM`; [complete reviewable snapshot](../../../docs/requirements/GTI_POSM_Blueprint_v1.json). The source's six-stage sequence (§4, P0122–P0146) is retained in one template.

| Stage / source | Fields | Files (required) | Checklist items | Approval steps | Fixed gates |
| --- | ---: | ---: | ---: | ---: | ---: |
| Brief · P0124–P0126 | 24 | 1 (1) | 0 | 1 | 4 |
| Research / Sourcing · P0127–P0130 | 11 | 3 (1) | 1 | 0 | 4 |
| Concept & Design · P0131–P0133 | 5 | 1 (1) | 0 | 0 | 3 |
| Specification · P0134–P0137 | 13 | 3 (2) | 8 | 0 | 5 |
| Production & Approval · P0138–P0142 | 3 | 1 (1) | 1 | 1 | 5 |
| Delivery & Execution · P0143–P0146 | 6 | 2 (2) | 2 | 0 | 5 |
| **Total** | **62** | **11 (8)** | **12** | **2** | **26** |

There are 28 capability blocks. Fields include 28 proposed required inputs and one read-only scope notice. Brief fields capture Material Type, items/formats/sizes, languages, quantities, outlet count, the five source channels, market, the three source purposes, unit/total budget, explicitly entered currency, required date and a recorded Printed POSM photo minimum. General Creative Brief content retains header, business problem, objectives, audience, deliverables, mandatory elements, timeline, presentation expectations, Direct/Pitch context and contacts (§17, P0436–P0448).

The **Material Type** SELECT has exactly **Printed POSM / Merchandise**. Every branch-specific field is optional, with explicit applicability guidance; changing the selector does not change validation or stage applicability. Printed summaries cover restrictions, benchmarks, sizes, bleed, substrate, finishes, quantities, texts, outlet distribution, handover and execution. Merchandise summaries cover catalogues/offers, MOQ, lead time, unit cost/currency, samples, Director/CERBER references, order conditions, logo/colours/revisions, the five source branding methods, Pantone, print area, packaging, apparel sizes, golden samples, mass production, batch QC, intake and issue.

All six pilot stages remain fixed. The printed source option to skip research is unavailable. A required combined research review record captures applicable evidence and exceptions; optional printed photo and merchandise quote files do not become mandatory for the other material. A merchandise pilot can pass without three quotes because this requirement is explicitly **not enforced**. The source's minimum-three-offer rule and brief-derived per-outlet photo count remain official blockers; fixed file counts never substitute for either.

Independent REVIEWER acceptance binds exact sealed file versions. The source does not identify the brief approver: the fixed **Owner internal brief review** is a labeled candidate choice. The **Director production-evidence review** is an internal decision only, not approval or dispatch of an external production order. Concept uploads may show reviewed designs but do not prove task completion, all-format coverage or the merchandise 1–2 revision rounds. Human delivery/protocol attestations do not establish warehouse reconciliation, physical quality or bilateral signatures.

**3. Retail Display blueprint.** Identity `gti-retail-display`, category `RETAIL_DISPLAY`; [complete reviewable snapshot](../../../docs/requirements/GTI_Retail_Display_Blueprint_v1.json). All seven source stages (§5, P0147–P0164) are configurable evidence stages.

| Stage / source | Fields | Files (required) | Checklist items | Approval steps | Fixed gates |
| --- | ---: | ---: | ---: | ---: | ---: |
| Brief · P0149–P0150 | 26 | 1 (1) | 0 | 0 | 3 |
| Site Survey · P0151–P0153 | 7 | 2 (1) | 0 | 1 | 4 |
| Concept · P0154–P0155 | 2 | 2 (2) | 0 | 0 | 4 |
| Technical Design · P0156–P0157 | 6 | 1 (1) | 1 | 0 | 4 |
| Specification & Graphics per Component · P0158–P0159 | 8 | 3 (2) | 8 | 0 | 5 |
| Prototype & Production · P0160–P0161 | 5 | 2 (2) | 1 | 1 | 6 |
| Logistics & Installation · P0162–P0164 | 9 | 2 (2) | 2 | 0 | 5 |
| **Total** | **63** | **13 (11)** | **12** | **2** | **31** |

There are 27 capability blocks, 55 proposed required inputs and three read-only scope/component/outlet notices. Numeric width, height and depth have **no assumed unit, default or compliance threshold**; the agreed unit is a separate entered value. Shelves, facings, outlet count and budget use actual NUMBER fields; installation deadline uses DATE. Brief content also includes SKUs, lighting, locking/shutters, supplied market rules, currency and the General Creative Brief.

Survey fields retain outlet identifiers, measurements, photographs/drawings, retailer requirements and electrical access, with a recorded choice of all outlets or a proposed representative sample. The source only names Owner approval for the sample case. A fixed independent **Owner survey-evidence review for both choices** is explicitly a stricter candidate choice; it does not calculate coverage or authorize a genuine conditional sample decision.

Concept captures 3D and planogram evidence, with instructions to use existing concept tasks. Technical design records materials, construction, weight/unit, safety considerations, assembly and drawings; human inspection is not engineering certification. The component notice names structure, header, side panels, shelf talkers, shutters and lighting. Summary fields and an attached specification/checklist register retain graphic references, dimensions, materials, finishes, quantities and large-format standards. They do not create separate production-unit records or validate each component.

Prototype and assembly-test reports, production information and an independent **Director internal production-evidence review** preserve the physical prototype and production-order intentions without claiming physical validation or external dispatch. Installation captures a schedule, outlet/status register using planned/installed/accepted/issue, photographs, protocols, warranty, service contacts and open issues. Users must manually create actual **General Tasks** for issue assignments. Text references are not verified task links; no all-outlets-accepted OR issues-assigned gate exists. Passing the pilot's general gates does not certify that source condition.

**4. Coverage matrix and official blockers.** Both snapshots contain a classified `gaps` matrix with exact source paragraphs, missing behavior and pilot treatment. Their `trace` maps every workflow, stage, capability, field, file requirement, checklist item, approval step and gate to the source. The shared source map now links the two implementations; Exhibition Stand and Digital remain mapping only.

| Enforceable in both pilots | Scope |
| --- | --- |
| Typed information | Existing six scalar field types, required supported fields, declared options/bounds and dates; no repeatable or conditional rows. |
| Files | Exact sealed versions, declared type/count limits and independent configured review; no binary preflight or physical certification. |
| Checklists | Required human attestations with written evidence; no automated content or quantity validation. |
| Approvals | Existing fixed eligibility, evidence snapshots and reviewer independence; no external actors or new business roles. |
| Gates | Required fields, accepted required files, checklist attestations, configured approvals and explicit predecessor gates; no skip, conditional/task/physical-state gate. |
| Publication/runtime adapters | Authenticated drafts, genuine Director publication, immutable version/hash, pinned RuntimeProject/Stage, existing Tasker/Sisters, audit/outbox and completion policy. |

POSM's **13** official-blocking groups are candidate requiredness/routing/limits/designation; material applicability and skip; structured offer comparison; CERBER/vendor selection/orders; concept-task/round/format gates; repeating format/size/outlet records; outlet photo minimum; physical production quality; inventory/distribution; artwork/regulatory validation; document generation/signatures; planning/budget/automatic tasks; and source/V2 completion governance. See snapshot gap IDs and paragraphs for the exact boundaries.

Retail's **12** groups are candidate decisions/designation; survey coverage/sample decision; component production units; outlet installation/issue-task gate; concept-task gates; engineering safety; physical prototype validation; vendor/order dispatch; large-format preflight; document generation/signatures; scheduling/budget/service lifecycle; and source/V2 completion governance. Counts come from these distinct requirements, not from Packaging's eleven blockers.

`validateBlueprint(..., "INTERNAL_EVIDENCE_PILOT")` returns no issues. `validateBlueprint(..., "OFFICIAL_STANDARD")` returns every listed gap. Valid scalar configuration never implies an approved official standard. Proposed choices are visible in field help, block instructions, traces, scope notices and loading cards. Detailed templates 2–5 remain a source open point (P0518), so these choices need business review.

**5. Standard documents and conflicts.** Manually prepared Creative Brief – General, RFP, Final Artwork/File Standard, Acceptance Protocol and applicable Framework/Copyright evidence use existing uploads/shared versions. Source licensed-elements language and the File Standard belong in the brief; source legal review remains outstanding. Human checklists retain layered/editable files, embedded images, 300 dpi/A3 base requirements, PSD/shadow separation, editable typefaces, CMYK/Pantone/finishes, bleed/dielines and naming/PDF previews, plus merchandise or large-format/display variants. None is automatic preflight or jurisdictional approval.

The document table's fixed stage numbers for Acceptance Protocol / File Standard (P0429/P0432) cannot be applied literally to POSM's six-stage structure; evidence is placed by business purpose. Framework/Copyright uploads do not implement external signing or a pre-production legal guard. Final-project document categories are not inferred from templates and remain separately configured by the Director. No prefilled document generation, CERBER approval, signatures, vendor dispatch or external submission link was added.

The source's optional printed research and representative survey sample rules are not implemented as skips/overrides. Legacy mandatory Initial/Final Concept stages are not restored. Source completion/auto-archive, external stakeholder eligibility and automatic task expectations do not weaken the approved V2 model or reviewer independence.

**6. Determinism and compatibility.** Semantic IDs use `posm_` / `retail_` prefixes; unchanged meanings retain their IDs in future revisions, and changed meanings require new IDs and a compatibility map. Factories are pure and deterministic. Draft edits are immutable new revisions; edits are not automatically source-certified. Published versions and existing runtime pins are never overwritten.

| Candidate | Definition bytes | Trace bindings | Canonical Stage Builder SHA-256 |
| --- | ---: | ---: | --- |
| Packaging, preserved | 32,835 | 164 | `1f1e33373d711b1e8e0669f65c898fe8bd055e4f6dcd3c124823c57f717b58d7` |
| POSM revision 1 | 46,523 | 137 | `2f0f94603398158d6866e45111b6fa84499c1636a098565817bfd185294bc4fc` |
| Retail Display revision 1 | 43,875 | 143 | `dbfb9f4de1e68ccb5d706ba210a9a6481eac3bb6d912541ee56f151927dd8694` |

All definitions fit the existing 128 KiB contract. Source/hash checks, stable unique IDs, trace resolution, deterministic regeneration, golden snapshots and separate validation purposes are covered by `pnpm standard-templates:spec-check`. Packaging's factory, snapshot, client card and static route remain byte-identical. Its importer is only a compatibility wrapper around the shared service; the same payload, definition, actual authenticated actor, command hash and audit path remain in use. Registry/static Packaging loading with the same command returns the same revision in acceptance.

**7. Authenticated draft loading and UI.** In **Projects → Workflow drafts**, Director/SPM users can choose **Load Packaging draft**, **Load POSM draft** or **Load Retail Display draft** after acknowledging the internal scope. Each card exposes source version, stages, limitations and official blockers. Loading opens a populated editable visual Stage Builder with the existing save/history/preview/publication controls.

The server-only registry recognizes exactly `gti-packaging-artwork`, `gti-posm-promotional-materials` and `gti-retail-display`. The shared service accepts only `commandId`, exact numeric `blueprintRevision` and `scopeAcknowledged: true`; it validates server-selected configuration and delegates to existing authenticated `createDraft`. Unknown identities, actor/definition/designation injection and changed revisions are rejected. Actor attribution, idempotent replay, cross-blueprint command conflicts, immutable revisions and transactional audit/outbox use existing infrastructure. No second approval system or direct Prisma importer was created.

The original `/api/workflow-blueprints/packaging/draft` remains. New candidates use `/api/workflow-blueprints/{blueprintId}/draft`; the allowlisted long Packaging identity also resolves through this shared route. Unauthorized business roles and technical-only accounts have no authoring access. Loading does not submit, publish, create a runtime or confer official status.

**8. Isolated publication-to-runtime acceptance.** Final service acceptance passes **2,542 assertions**: Packaging **720**, Printed POSM **634**, Merchandise **628**, Retail Display **556**, plus four harness assertions. Each scenario checks Director/SPM loading, unauthorized and unauthenticated denials, exact revision/acknowledgement, injection rejection, no publication/project side effect on load, immutable edit/history, idempotency and one draft outbox entry.

Real synthetic SPM submission and a distinct Director decision publish the exact immutable definition/hash. SPM creation pins that version; future publication does not retarget it. JPM direct creation is denied; a request needs an eligible SPM Co-owner and an actual Director decision. Director oversight adds no fictitious participant. All configured runtime stages exercise typed fields, invalid numeric/select rejection, read-only protection, exact uploads/reads, independent file acceptance, required checklist evidence, supported approval snapshots and explicit completion gates.

Both POSM materials complete the six fixed pilot stages while leaving irrelevant fields and optional branch files empty. This demonstrates that the pilot does not pretend to enforce conditional sourcing or three offers. Completion leaves each project ACTIVE until an explicitly Director-approved policy, required document proof, actual Owner request and distinct final Director decision occur. Legacy project/archive/final-request counts and all synthetic accounts remain unchanged; external requests are zero. Existing Tasker, all six Sister types and native/flexible compatibility run in the same regression progression.

**9. Verification results and browser evidence.** Isolated Chromium **153.0.8010.12** acceptance passed **975 assertions, 96 screenshots, zero page errors and zero external requests**. Fifteen screenshots are POSM-specific, sixteen Retail-specific and fourteen preserve Packaging acceptance; the other 51 cover existing runtime/Tasker/completion behavior. The production copy uses disposable PostgreSQL **14.19**, genuine synthetic V2 sign-ins and loopback fake S3 with Node/browser network guards. No real Neon/S3 data is used.

Each candidate is loaded through the UI as SPM, edited/saved to revision 2 and previewed on desktop/mobile, with revision 1 retained. Director loading/replay and direct restricted-role API denials are also verified. An actual synthetic Director decision publishes the exact SPM submission; the approved version creates a pinned SPM runtime. First-stage form entry and every explicit stage completion use UI controls; other fields, uploads, checklists and independent reviews use authenticated HTTP with persisted database assertions. Both new candidates reach the unconfigured-document-policy boundary and remain ACTIVE. Full policy/document/Owner-request/Director-final completion is exercised for each candidate in service acceptance and by the existing end-to-end browser flow.

Visually inspected populated evidence:

- [POSM editor: Material Type, real options and six stages](../../../.tmp/phase52/browser/52c-posm-typed-brief-field.png)
- [Retail editor: numeric dimensions and seven stages](../../../.tmp/phase52/browser/52c-retail-typed-brief-field.png)
- [POSM mobile preview](../../../.tmp/phase52/browser/54-posm-mobile-preview.png)
- [Retail component runtime and explicit limitation](../../../.tmp/phase52/browser/56-retail-stage-5.png)
- [Retail final document-policy boundary](../../../.tmp/phase52/browser/57-retail-director-policy-boundary.png)

| Verification | Result |
| --- | --- |
| Original source extraction/hash and all five source mappings | PASS; 523 nonempty paragraphs, unchanged original bytes |
| Both new schemas, deterministic snapshots, complete traces, branch/unit limitations | PASS; internal valid, official blocked 13 / 12 |
| Packaging compatibility and new candidate service flows | PASS; **2,542 assertions**, including both POSM materials |
| Existing Stage Builder drafts and publication | PASS; publication **402 assertions** plus draft immutability/race/rollback/authorization suite |
| Existing runtime fields/files/approvals/gates | PASS; **503 assertions** |
| Runtime creation / General / deliverables / concepts-Sisters / completion | PASS; **49 / 463 / 376 / 483 / 340 assertions** |
| Populated migration progression and earlier-schema feature-off compatibility | PASS; original rows/checksums preserved, 116 migrations / 150 tables, zero drift |
| Broad authorization, events, approvals, file identity, documents, project read/write/governance, Archives/Library, admin/workspace/search | PASS; **113 named PASS checkpoints** |
| Authorization foundation/persistence, approvals/events/Tasker units | PASS |
| Legacy task/concept completion and Stage 5/6/7/concept UI-service regressions | PASS; native synthetic service suites plus existing UI source assertions |
| Full TypeScript without incremental cache; integration/spec compilation | PASS |
| Targeted ESLint, all affected TS/TSX/MJS, `--max-warnings 0` | PASS |
| Isolated production build | PASS; final app sources match the tested copy; actual environment files excluded |
| Chromium acceptance | PASS; **975 assertions / 96 screenshots / 0 page errors / 0 external requests** |
| Protected-file hashes, staging preservation and `git diff --check` | PASS |

Counts are individual suite receipts, not additive unique scenarios. Browser POSM uses Printed POSM; Merchandise's full six-stage and final-completion path is covered by the service suite. Native UI regression scripts include source assertions and real isolated service execution, not a new interactive browser tour of every legacy screen. Official unsupported behavior is deliberately excluded, not silently passed or skipped as implemented. There is no formal production QA, real S3/IAM validation, PostgreSQL 18 live mutation test, external vendor/legal/physical certification or restore drill.

Initial sandbox attempts could not create PostgreSQL shared memory or bind the Next CSS build helper's local port. Authorized isolated reruns passed. A scope sentence was clarified before the final service/build/browser runs so it accurately distinguishes stage completion from project closure. No runtime permission, review rule or constraint was weakened. The build retains its pre-existing non-failing workspace-root inference warning; there are no unresolved test/build failures.

Receipts: `.tmp/phase52/integration-final.log`, `authorization.log`, `regressions.json` and per-suite logs, `spec-check.log`, `spec-check.jsonl`, `typecheck-final.log`, `eslint.log`, `build-result.json`, `build.log`, `browser/result.json`, 96 PNGs and server log, `baseline.json`, `verification.json`. Reproduce with `pnpm standard-templates:spec-check`, `pnpm standard-templates:check` and `pnpm standard-templates:browser-check` using `FLUX_BROWSER_BUILD` for an isolated production copy and `FLUX_BROWSER_ARTIFACTS` for the evidence directory. The standard-template scripts now check all three candidates.

**10. Exact file inventory.** Created **9 files**:

- `docs/requirements/GTI_POSM_Blueprint_v1.json`
- `docs/requirements/GTI_Retail_Display_Blueprint_v1.json`
- `src/app/api/workflow-blueprints/[blueprintId]/draft/route.ts`
- `src/components/projects/standard-blueprint-cards.tsx`
- `src/lib/standard-templates/authoring.ts`
- `src/lib/standard-templates/posm.ts`
- `src/lib/standard-templates/retail-display.ts`
- `src/lib/standard-templates/registry.ts`
- `src/lib/standard-templates/PHASE-5.2.md`

Modified **8 files**:

- `docs/requirements/GTI_FLUX_Source_to_V2_Map.json` — implementation links and scope boundaries for these two categories.
- `docs/requirements/GTI_FLUX_Source_to_V2_Map.md` — candidate availability and coverage links; other categories retained.
- `src/lib/standard-templates/service.ts` — shared allowlisted loading; original Packaging compatibility entry point.
- `src/components/projects/stage-builder.tsx` — add POSM and Retail cards alongside the unchanged Packaging card.
- `scripts/standard-template-spec-check.ts` — both snapshots, traces, branch/measurement limitations and pinned Packaging hash.
- `scripts/standard-template-integration-check.ts` — shared real-service acceptance for Packaging, both POSM materials and Retail.
- `scripts/standard-template-browser-acceptance.mjs` — reusable populated candidate UI/publication/runtime acceptance.
- `scripts/stage-runtime-browser-check.mjs` — run both new candidates after existing regressions and Packaging.

Ignored `.tmp/phase52` evidence/build copies are not product files. Existing Git staging and pre-existing work were preserved; nothing was staged, committed, pushed or deployed. No contract/schema/authentication/native policy/environment file changed.

**11. Migration and environment.** No migration is required or proposed; migration SHA/catalog delta: **not applicable / zero**. All **116 applied SQL files** and all actual environment files retain starting hashes. The repository still has 149 Prisma models; disposable populated acceptance reaches **116 successful migrations / 150 public tables**, zero drift, preserving earlier rows/checksums and actual earlier-schema flag-off behavior. All eleven existing local V2 flags remain enabled. The source and Packaging protected files also retain their starting hashes (**125 protected files total**).

The recorded Neon development baseline remains `flux-v2-dev / develop / neondb`, PostgreSQL 18.6, 116 successful migrations / 150 tables, zero pending/failed/drift. **No fresh live Neon check was performed in this phase.** No Neon drafts/projects/publications, real S3 access, account/password changes, external communications, procurement or archive automation occurred.

**12. Remaining business decisions and Phase 5.3 recommendation.** Review the exact mandatory/optional matrix, stricter fixed research/survey behavior, internal reviewer routes, file limits, brief minimum-photo meaning, measurement units, source variant standards and production/acceptance evidence expectations before any official designation. The source open points on detailed templates 2–5, durations, starter tasks, legal wording, CERBER master data/reverification, maximum file size and toolkit layout remain unresolved. Original page numbers remain unverified without delaying these candidates.

For a separately authorized Phase 5.3, use this architecture for Exhibition Stand and Digital **internal candidates**, with their own source traces and blockers; review the missing conditional, repeating-record and outlet/task adapters as separate scoped capability proposals before official rollout. Do not introduce a generic rule scripting engine or assume these blockers are solved. **Phase 5.2 stops here after reporting; Phase 5.3, live publication, migrations and deployment are not started.**
