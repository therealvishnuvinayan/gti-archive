# FLUX V2 — Phase 5.1: source specification and Packaging candidate

Implemented and verified on **23 October 2026**. The five-process source map, versioned Packaging blueprint, authenticated draft importer, populated visual preview and isolated approval-to-runtime acceptance are implemented. **This is an internal evidence candidate, not an approved official GTI standard.** Eleven explicit requirement groups still block official rollout. No Neon draft, publication or project was created. Phase 5.2 has not begun.

**1. Source identity and extraction.** The user supplied `/Users/vishnuvinayan/Downloads/audio/GTI_FLUX_Project_Process_Templates_Source.docx` after the initial missing-source report. Its exact bytes are now retained at [the requested repository path](../../../docs/requirements/GTI_FLUX_Project_Process_Templates_Source.docx). The document title is “Flux – Project Process Templates & Content Specification”; its body says “Sep 29, 2026 · @Slavo”; OOXML core revision is 20 and producer is Claude Docs. SHA-256:

```text
4d86f90d173a406ad9f3a5ffbba7ce55776b5d209f4bc2a0e4653f299d61b944
```

All **523 nonempty paragraphs**, including tables and all 18 sections, were extracted and reviewed. The deterministic extractor preserves paragraph ordinals across empty paragraphs and table cells. The original contains no page-count metadata, explicit page breaks or rendered page markers. The supplied description says 19 pages; exact page numbers **cannot be verified from this binary**. Section/paragraph references are supplied instead, with page values explicitly null. A paginated original PDF is needed to reconcile exact pages; no pagination was invented.

**2. Mapping of all five processes.** The [human-readable specification/coverage map](../../../docs/requirements/GTI_FLUX_Source_to_V2_Map.md), [structured map](../../../docs/requirements/GTI_FLUX_Source_to_V2_Map.json) and [complete extraction](../../../docs/requirements/GTI_FLUX_Project_Process_Templates_Source.json) retain the source field lists, deliverables, checklists, approval intentions, acceptance/completion criteria, choices, document dependencies, Tasker opportunities and missing information.

| Source process | Section / paragraphs; pages unverified | Original structure |
| --- | --- | --- |
| Packaging / Artwork | §3, P0073–P0121 | 8 stages |
| POSM & Promotional Materials | §4, P0122–P0146 | 6 stages; printed/merchandise switch |
| Retail Display | §5, P0147–P0164 | 7 stages; components and outlets |
| Exhibition Stand | §6, P0165–P0183 | 8 stages; fixed event dates, linked projects |
| Digital | §7, P0184–P0202 | 7 stages plus maintenance |

The four non-Packaging types have mapping only. No executable definitions for them were added. Missing goals, mandatory-field flags, reviewer identities or definitions of done are marked as unspecified, not supplied as invented requirements.

**3. Source conflicts and approved V2 precedence.** Five V2 business roles remain authoritative; Technical Administration remains separate; source relationship names do not create Collaborator/vendor/CEO/Purchase business roles. Director oversight remains global without membership. JPM creation requires a Director decision and an eligible SPM Co-owner, despite the older Director-as-Co-owner option. SPM authoring and creation from an approved executable version retain current governance. Master-template authority does not make an imported draft official.

Initial and Final Concept are existing Universal Tasker types, not mandatory fixed stages. No source skip, Owner override, leave deputy, automatic task completion, automatic closing or archiving rule is introduced. Runtime independent-review restrictions remain stronger than source statements: in particular an Owner reviewing the Product Card must not have contributed that stage's evidence. The source Purchase → CEO → all Executors → Director chain cannot be represented by the current registry; the candidate's Director internal review is expressly narrower. Final-project document requirements require a separate explicit Director-approved per-project policy; they do not replace pre-production external-contract checks. See the map for paragraph-level conflicts, including Digital maintenance versus global closure and the source's inconsistent fixed Acceptance Protocol stage number.

**4. Capability coverage and missing enforcement.** The map uses all six requested classifications. INFORMATION, FILE_REQUIREMENT, CHECKLIST, configured APPROVAL and fixed gates enforce their existing scalar/evidence contracts. PublishedWorkflowVersion and RuntimeProject/Stage retain genuine approval, immutable hashes, snapshots and pinned versions. Existing Tasker field/file/concept adapters, Shared File Identity, Reusable Approval Engine, completion documents and transactional audit/events are reused.

The eleven official-blocker groups are: field-requiredness/routing confirmation; repeating SKU/market/file/unit/sample records; concept/task completion gates; the external stakeholder approval chain and restart selection; vendor/CERBER/pitch/contracts/dispatch/procurement/ratings; regulatory and binary artwork validation; verified Toolio entry; toolkit generation/note-removal/linked-project controls; document generation/signatures/external submissions; scheduling/automatic tasks/budget alerts/leave; and source closure/archive expectations. Each includes exact paragraph references, classification, missing capability and treatment in the internal pilot. `validateBlueprint(blueprint, "OFFICIAL_STANDARD")` returns all eleven blockers. The internal candidate's definition and import screen explicitly exclude those claims; no unsupported rule is treated as enforced because a text box or checklist exists.

**5. Blueprint and actual draft workflow.** `TemplateBlueprint` wraps existing `WorkflowDefinition` v1; there is no second execution or authoring engine. Identity is `gti-packaging-artwork`, revision **1**, category `ARTWORK_PACKAGING`, designation `UNAPPROVED_CANDIDATE`, scope `INTERNAL_EVIDENCE_PILOT`. It records source identity/hash, schema versions, stable semantic IDs, source traces, Tasker instructions, gaps and revision compatibility policy. The [reviewable JSON snapshot](../../../docs/requirements/GTI_Packaging_Blueprint_v1.json) includes the complete definition and separate internal/official validation results.

The definition is **32,835 bytes**, within the existing 128 KiB contract. Its canonical Stage Builder hash is:

```text
1f1e33373d711b1e8e0669f65c898fe8bd055e4f6dcd3c124823c57f717b58d7
```

On `/projects/workflow-drafts`, authorized Director/SPM users can review the candidate scope/gaps, acknowledge its internal scope and choose **Load Packaging draft**. The strict POST route accepts only a command ID, exact blueprint revision and scope acknowledgement. It rejects injected actors/definitions, changed revisions and absent acknowledgement. The server validates the complete blueprint, then calls existing authenticated `createDraft`; current sessions, business authorization, actual creator/revision actor, idempotency, immutable revisions and audit/outbox remain the existing service's responsibility. No direct Prisma import path or fake account assignment exists. The resulting copy is editable and uses the normal full visual Stage Builder and preview. Its source trace applies to the shipped candidate; later author edits are new draft revisions, not automatically certified source mappings. No load action submits, approves, publishes or creates a project.

**6. Packaging stage and capability coverage.** Requiredness, internal review routing and file limits are explicitly proposed candidate choices pending business confirmation. Dates and budget are stored values, not scheduling or accounting services. Free-text registers and N/A reasons are human evidence, not relational or conditional validation.

| V2 stage | Fields | File requirements | Checklist items | Approval steps | Explicit gates |
| --- | ---: | ---: | ---: | ---: | ---: |
| Project Inquiry / Brief | 27 | 1 | 2 | 0 | 4 |
| Research and regulatory planning | 9 | 2 | 0 | 1 | 5 |
| Final Artwork specification | 20 | 3 | 8 | 0 | 6 |
| Production approval and handover evidence | 2 | 1 | 1 | 1 | 5 |
| Implementation and supervision | 6 | 1 | 1 | 0 | 4 |
| Commercialisation preparation | 17 | 2 | 1 | 2 | 8 |
| **Total** | **81** | **10** | **13** | **4** | **32** |

There are **27 capability blocks**. The 81 fields include two read-only notices. Source Packaging detail includes brands/SKUs/components/formats, markets and supplied regulatory requirements, health warnings, tax/track-and-trace, creative brief content, all sixteen Final Artwork headings plus dieline/colour/substrate/applicability, tar/nicotine values, human File Standard checks, production/handover registers, sample/provider/deadline/outcome/defects, Product Card data and commercialisation/toolkit choices. File acceptance uses independent REVIEWER review of exact sealed versions. Human checklists require written evidence. Configured reviews are Director brief, Director internal production evidence, Owner Product Card and Director toolkit. Every later stage has an explicit predecessor gate; there is no hidden fixed-stage engine.

Initial/Final creative development uses manually created Universal Tasks and reviewed output evidence, preserving selected inspiration and independent review. An uploaded creative register does not prove task completion, enforce concept counts or satisfy an unavailable task gate. Toolio entry, external production, signatures and binary artwork validation remain outside the supported execution claim.

**7. Visual Stage Builder and runtime acceptance.** Final isolated Chromium acceptance passed **470 assertions, 65 screenshots, zero page errors and zero blocked external requests**. Fourteen screenshots are Packaging-specific. It used Chromium **153.0.8010.12**, PostgreSQL **14.19**, synthetic real sign-ins, loopback fake S3 and Node/browser network guards. The full existing runtime/Tasker/completion browser flow remains in the run.

Packaging acceptance loaded the populated draft through its UI as SPM, edited/saved revision 2, viewed desktop/mobile previews, asserted role denials, submitted as SPM and recorded a separate genuine synthetic Director publication decision. It checked the exact approved hash, created the pinned SPM runtime, entered actual Brief fields through UI controls, exercised all six stages through authenticated HTTP/UI, uploaded/sealed/reviewed exact files, enforced independent approvals and gates, and completed each stage explicitly. Final stage completion left the project ACTIVE and final closure blocked by an unconfigured document policy. The Packaging service suite separately exercised required internal completion proof, the actual Owner request and separate Director final decision. Existing browser acceptance also exercised the full internal document-policy lifecycle.

Screenshots were visually inspected for populated stage sequence/Artwork editing, runtime specification and mobile preview:

- [Populated stage editor](../../../.tmp/phase51/browser-final/52a-packaging-stage-sequence-and-fields.png)
- [Artwork stage editor](../../../.tmp/phase51/browser-final/52b-packaging-artwork-editor.png)
- [Mobile populated preview](../../../.tmp/phase51/browser-final/54-packaging-mobile-preview.png)
- [Runtime Artwork specification](../../../.tmp/phase51/browser-final/56-packaging-stage-3.png)
- [Final document-policy boundary](../../../.tmp/phase51/browser-final/57-packaging-director-policy-boundary.png)

Earlier screenshots captured above the internally scrolling editor; the final run explicitly scrolled to the populated editor/preview. These are local ignored evidence, not live Neon screenshots. Browser source denials are intentional assertions, not unexpected failures. Browser evidence does not certify real vendor/Toolio/signature/maintenance behavior.

**8. Traceability and deterministic validation.** **164 bindings** cover the workflow, six stages, all capability blocks, fields, checklist items, approval steps and individual gate positions. Their exact paragraph IDs are checked against the extracted original. Tests verify five source counts (8/6/7/8/7+maintenance), source text equality, all coverage classes, deterministic generation/hash, complete trace coverage, duplicate-ID rejection, source binary hash and snapshot compatibility. A missing field trace is rejected. Existing Stage Builder structural/completeness validators remain authoritative; unsupported official readiness is separately reported, never conflated with valid internal configuration.

Reproduce source/spec checks with `pnpm standard-templates:spec-check`. After an explicitly reviewed source/content revision, the compiled spec checker accepts `--write` to export a new reviewed snapshot; published database records are never updated by that script. Preserve semantic IDs for unchanged meanings, use new IDs for changed meanings and document compatibility mappings when revising the blueprint.

**9. Exact file inventory.** Created **16 files**:

- `docs/requirements/GTI_FLUX_Project_Process_Templates_Source.docx`
- `docs/requirements/GTI_FLUX_Project_Process_Templates_Source.json`
- `docs/requirements/GTI_FLUX_Source_to_V2_Map.json`
- `docs/requirements/GTI_FLUX_Source_to_V2_Map.md`
- `docs/requirements/GTI_Packaging_Blueprint_v1.json`
- `scripts/extract-gti-template-source.py`
- `scripts/standard-template-browser-acceptance.mjs`
- `scripts/standard-template-integration-check.ts`
- `scripts/standard-template-spec-check.ts`
- `scripts/tsconfig.standard-templates.json`
- `src/app/api/workflow-blueprints/packaging/draft/route.ts`
- `src/components/projects/packaging-blueprint.tsx`
- `src/lib/standard-templates/contracts.ts`
- `src/lib/standard-templates/packaging.ts`
- `src/lib/standard-templates/service.ts`
- `src/lib/standard-templates/PHASE-5.1.md`

Modified **5 files**:

- `package.json` — source/spec/integration/browser commands.
- `scripts/run-universal-tasker-isolated.mjs` — opt-in Packaging suite after the full 116-migration runtime progression.
- `scripts/stage-runtime-browser-check.mjs` — opt-in Packaging acceptance after unchanged existing assertions.
- `scripts/tsconfig.universal-tasker.json` — compile the Packaging service suite.
- `src/components/projects/stage-builder.tsx` — candidate import card on the authorized draft list.

The initially untracked `src/lib/runtime-integration/PHASE-4.4-ACTIVATION.md` is preserved and is not a Phase 5.1 addition. Ignored build/test outputs are not product files. No Prisma model, existing migration, authorization policy, native workflow, Archive/Library or actual environment file changed.

**10. Migration and baseline preservation.** **No migration proposed; migration SHA-256: not applicable.** All 116 SQL files remain byte-identical to starting hashes and HEAD. The existing runtime-integration migration retains `0a7981b4ff8b3646a6e9acfca744ef4cd2c555698317c9a9ab469b6adff54bef`. The repository has 149 Prisma models, consistent with the recorded 150 tables including the ledger. The Phase 4.1–4.4 implementation/activation reports and Phase 4.3 activation receipt were reviewed. The latest activation report records `flux-v2-dev / develop / neondb`, PostgreSQL 18.6, 116 successful migrations, 150 tables, zero failures/pending/drift. That is prior activation evidence; this phase made **no fresh Neon connection** and does not misrepresent it as a new live check.

A fresh Next environment-loader check confirmed all eleven local flags enabled. `.env`, `.env.local`, `.env.example`, prior migrations and the pre-existing activation report retain starting SHA-256 values. The complete populated disposable migration progression preserves old rows/ledger and reaches 116 migrations/150 tables with zero drift; no new candidate or schema change exists. Nothing was seeded, migrated, published or activated in Neon; no live user/permission/S3/vendor communication changed. Nothing was pushed or deployed.

**11. Verification results.**

| Check | Result |
| --- | --- |
| Full source extraction/hash and five-process traceability | PASS; 523 source paragraphs |
| Packaging schema, stable IDs, deterministic definition and golden snapshot | PASS; 164 bindings, 32,835-byte definition |
| Packaging service acceptance on disposable PostgreSQL | PASS; **706 assertions** |
| Existing workflow publication | PASS; **402 assertions** |
| Existing runtime forms/files/approval gates | PASS; **503 assertions** |
| Governed creation / runtime General / field-file deliverables / concepts and Sisters / completion | PASS; **49 / 463 / 376 / 483 / 340 assertions** |
| Populated migrations and actual earlier-schema flag-off compatibility | PASS; all prior data/checksums preserved, 116/150, zero drift |
| All six native Tasker types and Sisters; Stage Builder regressions | PASS in full progression |
| Broad authorization, files/provenance, approvals, events, completion documents, Archive/Library, workspace/search | PASS; **113 named checkpoints** |
| Authorization foundation/persistence, approval/event/Tasker units | PASS |
| Legacy task and concept suites | PASS; genuine synthetic sessions and fake external services |
| Native Stage 5 / 6 / 7 and legacy concept UI/service regressions | PASS; existing source assertions plus actual isolated services |
| Full application TypeScript, no incremental cache; integration/spec compilation | PASS |
| Targeted ESLint, all affected TS/TSX/MJS, `--max-warnings 0` | PASS |
| Isolated production build | PASS; dummy loopback database URLs, no real environment files |
| Final isolated Chromium | PASS; **470 assertions / 65 screenshots / 0 page errors / 0 external requests** |
| Protected-file hashes and `git diff --check` | PASS |

Counts are separate receipts, not additive unique scenarios. Packaging service checks cover both Director/SPM authors, cross-SPM and restricted-role denials, actor injection, changed blueprint revisions, idempotency, immutable edits, SPM submission/Director decision, exact approved hash/version, future publication pinning, Director/SPM/JPM governed creation, all six stages, file self-review denial, typed/read-only fields, checklist evidence, approval gates and Director-controlled final completion. Existing suites cover publication races/rejection/supersession, Sister/task regressions, file integrity, event rollback and authorization attacks.

Development failures were corrected before final verification: a duplicate semantic field/stage ID, a creation-request test using the wrong return shape, and a Node-only source-check harness needing the existing server-only hash marker shim. Sandbox shared-memory/build-helper restrictions required OS access for disposable PostgreSQL and the isolated Next build; the approved isolated reruns passed. No production authorization, approval or database constraint was weakened. The build retains the existing non-failing workspace-root inference warning from the isolated copy.

Evidence: `.tmp/phase51/integration.log`, `authorization.log`, `regressions.json` and per-suite logs, `spec-check.log`, `spec-check.json`, `typecheck-final.log`, `eslint-final.log`, `build-result.json`, `build.log`, `browser-final/result.json`, its 65 PNGs and server log, `baseline.json`, and `verification.json`. Reproduce service acceptance with `pnpm standard-templates:check`; use `pnpm standard-templates:browser-check` with `FLUX_BROWSER_BUILD` pointing at an isolated production build and `FLUX_BROWSER_ARTIFACTS` at an evidence directory.

**12. Unresolved requirements and business decisions.** The source's seven open points remain open: detailed templates 2–5 fields/checklists/guidance, typical durations, starter tasks, legal review, CERBER reverification/master-data ownership, maximum file-size policy and toolkit master layout. Also unresolved are original page numbers, exact mandatory/optional field matrix, repeatable entities/applicability, required external stakeholder identities and reviewer independence, authoritative regulatory input ownership, concept-to-stage gating, external dispatch/signature models, Toolkit note enforcement, Toolio evidence policy, Digital maintenance/closure and official catalog designation. None is silently satisfied by the internal candidate or by generic runtime records. External submission links, CERBER, vendor dispatch/procurement, automatic tasks, leave delegation and automatic Archive publication remain unsupported. Tests do not certify real S3/IAM/recovery, PostgreSQL 18 business mutation or external legal/regulatory compliance.

**13. Phase 5.2 recommendation and stop.** Review the source map and candidate with the business owner, resolve field-requiredness/reviewer decisions and prioritize the missing capabilities before approving any official standard rollout. Obtain paginated source evidence if exact original page references are required. Define a separately reviewed official designation/revision process and implement only the explicitly approved next capabilities/templates. This report does not initiate Phase 5.2, authorize a migration or publish a real GTI standard. **Stop at Phase 5.1.**
