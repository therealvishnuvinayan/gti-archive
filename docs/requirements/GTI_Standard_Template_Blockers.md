# GTI standard-template consolidated blockers — Phase 5.4

Review date: **23 October 2026**. This is a development review and proposed roadmap, not official approval or authority to implement integrations.

**65 original per-template gap entries → 46 OPEN resolution items (30 shared, 16 template-specific), plus 5 SUPERSEDED_BY_V2 precedence records = 51 register records.** OPEN items include 45 capability/policy/support resolutions and one separately identified production-release boundary (B46). There are **0 IMPLEMENTED issue records and 0 VERIFIED_DEFERRED records**; already implemented foundations are assessed in the [development review](../../src/lib/standard-templates/PHASE-5.4.md).

This is not a claim that 65 atomic defects reduced to 46: broad old entries are split, shared dependencies are reused, and the production boundary is additional. Shared means more than one affected template, including common source sections; it does not mean identical domain rules. The unchanged official validator still returns **11 + 13 + 12 + 15 + 14 = 65 entries**. V2 supersession reconciles only the stated conflicting rule; residual ratings, archive, signatures and maintenance work stays OPEN.

**Status meanings:** OPEN = unresolved requirement/decision/adapter; IMPLEMENTED = verified complete enforcement for the stated requirement; SUPERSEDED_BY_V2 = documented later approved V2 governance replaces the conflicting old rule; VERIFIED_DEFERRED = a genuine approved scoped deferral with evidence. No prior approval supporting a deferral was found. Source/factory prose saying “deferred” or “internal pilot” is not such approval.

**Keys:** PKG Packaging, POSM POSM & Promotional Materials, RTL Retail Display, EXH Exhibition Stand, DIG Digital. Priorities are proposed dependency order, not severity scores or time estimates: P0 business/scope decisions, P1 reliable official workflow foundations, P2 dependent/domain/operational work. P2 does not mean optional for an official release that includes it. Types identify the primary resolution owner; each record explains mixed technical/integration dependencies.

**Trace policy:** linked gap IDs resolve to exact immutable snapshot locations; linked P-numbers resolve to the complete original extraction. The reconciliation table preserves every original paragraph list, including broad/mixed entries. Source pages are unverified. Common source obligations can affect a template even if its original gap list did not repeat them. Source is business content, not execution authorization.

## Resolution index

| ID | Resolution | Type | Affects | Priority |
| --- | --- | --- | --- | --- |
| [GTI-B01](#gti-b01) | Approved field, evidence and reviewer matrix | BUSINESS_POLICY | PKG POSM RTL EXH DIG | P0 |
| [GTI-B02](#gti-b02) | Official master-template designation | BUSINESS_POLICY | PKG POSM RTL EXH DIG | P0 |
| [GTI-B03](#gti-b03) | Typed conditional applicability | INTERNAL_PLATFORM | PKG POSM RTL | P1 |
| [GTI-B04](#gti-b04) | Permitted stage skips, if policy is approved | BUSINESS_POLICY | PKG POSM | P0 |
| [GTI-B05](#gti-b05) | Reusable repeatable-record contracts | INTERNAL_PLATFORM | PKG POSM RTL EXH DIG | P1 |
| [GTI-B06](#gti-b06) | Packaging SKU, market, final-file, unit and sample records | INTERNAL_PLATFORM | PKG | P1 |
| [GTI-B07](#gti-b07) | POSM formats, sizes, outlet allocation and photo minima | INTERNAL_PLATFORM | POSM | P1 |
| [GTI-B08](#gti-b08) | Retail component production units | INTERNAL_PLATFORM | RTL | P1 |
| [GTI-B09](#gti-b09) | Retail survey coverage and representative sample | INTERNAL_PLATFORM | RTL | P1 |
| [GTI-B10](#gti-b10) | Retail installation and issue assignment gate | INTERNAL_PLATFORM | RTL | P1 |
| [GTI-B11](#gti-b11) | Exhibition snag records and corrective tasks | INTERNAL_PLATFORM | EXH | P1 |
| [GTI-B12](#gti-b12) | Digital build rounds, UAT cases and coverage | INTERNAL_PLATFORM | DIG | P1 |
| [GTI-B13](#gti-b13) | Digital defect-to-task and retest gate | INTERNAL_PLATFORM | DIG | P1 |
| [GTI-B14](#gti-b14) | Task-to-stage gates and applied deliverables | INTERNAL_PLATFORM | PKG POSM RTL EXH DIG | P1 |
| [GTI-B15](#gti-b15) | Creative counts, rounds and acceptance criteria | BUSINESS_POLICY | PKG POSM RTL EXH DIG | P0 |
| [GTI-B16](#gti-b16) | CERBER vendor identity and eligibility | EXTERNAL_INTEGRATION | PKG POSM RTL EXH DIG | P1 |
| [GTI-B17](#gti-b17) | Structured RFP offers and contractor comparisons | INTERNAL_PLATFORM | PKG POSM RTL EXH DIG | P1 |
| [GTI-B18](#gti-b18) | Creative pitch terms and release sequence | INTERNAL_PLATFORM | PKG POSM RTL EXH DIG | P1 |
| [GTI-B19](#gti-b19) | Director-approved exact external dispatch | EXTERNAL_INTEGRATION | PKG POSM RTL EXH DIG | P1 |
| [GTI-B20](#gti-b20) | External runtime submissions and actor provenance | EXTERNAL_INTEGRATION | PKG POSM RTL EXH DIG | P1 |
| [GTI-B21](#gti-b21) | Exhibition organiser approval | EXTERNAL_INTEGRATION | EXH | P1 |
| [GTI-B22](#gti-b22) | Production stakeholder chain and restart policy | INTERNAL_PLATFORM | PKG POSM RTL | P1 |
| [GTI-B23](#gti-b23) | Structured documents and versioned lifecycle | INTERNAL_PLATFORM | PKG POSM RTL EXH DIG | P1 |
| [GTI-B24](#gti-b24) | Legal ownership, signatures and pre-production contract guard | BUSINESS_POLICY | PKG POSM RTL EXH DIG | P0 |
| [GTI-B25](#gti-b25) | Bilateral Acceptance Protocol | INTERNAL_PLATFORM | PKG POSM RTL EXH DIG | P1 |
| [GTI-B26](#gti-b26) | Physical production, prototype and stand acceptance | INTERNAL_PLATFORM | PKG POSM RTL EXH | P1 |
| [GTI-B27](#gti-b27) | Regulatory and Digital compliance authority | BUSINESS_POLICY | PKG POSM RTL DIG | P0 |
| [GTI-B28](#gti-b28) | Per-version artwork and Digital asset preflight | INTERNAL_PLATFORM | PKG POSM RTL EXH DIG | P1 |
| [GTI-B29](#gti-b29) | Scheduling, milestones and dependency warnings | INTERNAL_PLATFORM | PKG POSM RTL EXH DIG | P1 |
| [GTI-B30](#gti-b30) | Starter/request tasks, reminders and calendar delivery | INTERNAL_PLATFORM | PKG POSM RTL EXH DIG | P2 |
| [GTI-B31](#gti-b31) | Budgets, commitments, costs and financial visibility | INTERNAL_PLATFORM | PKG POSM RTL EXH DIG | P1 |
| [GTI-B32](#gti-b32) | Three-party vendor ratings and closeout gate | INTERNAL_PLATFORM | PKG POSM RTL EXH DIG | P1 |
| [GTI-B33](#gti-b33) | Typed related-project links and governed creation | INTERNAL_PLATFORM | PKG EXH | P1 |
| [GTI-B34](#gti-b34) | Genuine runtime Archive integration | INTERNAL_PLATFORM | PKG POSM RTL EXH DIG | P2 |
| [GTI-B35](#gti-b35) | Exhibition annual report reuse | INTERNAL_PLATFORM | EXH | P2 |
| [GTI-B36](#gti-b36) | Stock, distribution and reusable-element custody | EXTERNAL_INTEGRATION | POSM EXH | P2 |
| [GTI-B37](#gti-b37) | Secure Digital access and IT handover | EXTERNAL_INTEGRATION | DIG | P1 |
| [GTI-B38](#gti-b38) | Digital maintenance-versus-completion policy | BUSINESS_POLICY | DIG | P0 |
| [GTI-B39](#gti-b39) | Digital go-live and verified service state | EXTERNAL_INTEGRATION | DIG | P1 |
| [GTI-B40](#gti-b40) | Retail warranty and Digital support obligations | INTERNAL_PLATFORM | RTL DIG | P2 |
| [GTI-B41](#gti-b41) | Verified Toolio entry | EXTERNAL_INTEGRATION | PKG | P1 |
| [GTI-B42](#gti-b42) | Marketing Toolkit layout and Director-only note change | INTERNAL_PLATFORM | PKG | P1 |
| [GTI-B43](#gti-b43) | File size, formats, previews and upload UX | PRODUCTION_READINESS | PKG POSM RTL EXH DIG | P1 |
| [GTI-B44](#gti-b44) | Leave availability, reminders and account restrictions | BUSINESS_POLICY | PKG POSM RTL EXH DIG | P2 |
| [GTI-B45](#gti-b45) | Exhibition event detail and CRM scope | BUSINESS_POLICY | EXH | P2 |
| [GTI-B46](#gti-b46) | Production operations and release evidence | PRODUCTION_READINESS | PKG POSM RTL EXH DIG | P2 |

## Resolution records

<a id="gti-b01"></a>

### GTI-B01 — Approved field, evidence and reviewer matrix

**OPEN · BUSINESS_POLICY · P0 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D01](./GTI_Standard_Template_Decisions.md#gti-d01), [GTI-D02](./GTI_Standard_Template_Decisions.md#gti-d02), [GTI-D03](./GTI_Standard_Template_Decisions.md#gti-d03). Prerequisites: none; review first. Extends: [A1](#adapter-a1), [A2](#adapter-a2), [A3](#adapter-a3).

**Existing gaps:** [PKG/requiredness](./GTI_Packaging_Blueprint_v1.json#L2761); [POSM/candidate-decisions](./GTI_POSM_Blueprint_v1.json#L2311); [RTL/candidate-decisions](./GTI_Retail_Display_Blueprint_v1.json#L2309); [EXH/candidate-decisions](./GTI_Exhibition_Stand_Blueprint_v1.json#L2483); [EXH/completion-governance](./GTI_Exhibition_Stand_Blueprint_v1.json#L2662); [DIG/candidate-decisions](./GTI_Digital_Blueprint_v1.json#L2248); [DIG/ux-ui-approval-definitions](./GTI_Digital_Blueprint_v1.json#L2278).

**Source:** [P0040](./GTI_FLUX_Project_Process_Templates_Source.json#L198), [P0059](./GTI_FLUX_Project_Process_Templates_Source.json#L293), [P0063](./GTI_FLUX_Project_Process_Templates_Source.json#L313), [P0077](./GTI_FLUX_Project_Process_Templates_Source.json#L383), [P0098](./GTI_FLUX_Project_Process_Templates_Source.json#L488), [P0126](./GTI_FLUX_Project_Process_Templates_Source.json#L628), [P0153](./GTI_FLUX_Project_Process_Templates_Source.json#L763), [P0183](./GTI_FLUX_Project_Process_Templates_Source.json#L913), [P0197](./GTI_FLUX_Project_Process_Templates_Source.json#L983), [P0518](./GTI_FLUX_Project_Process_Templates_Source.json#L2588), [P0523](./GTI_FLUX_Project_Process_Templates_Source.json#L2613).

**Expected:** GTI must define mandatory inputs, permitted omissions, evidence and decision authority for each source purpose. **Current:** Candidate scalar requiredness, bounds, file counts and fixed reviews are explicit proposals. **Missing enforcement/decision:** No approved business matrix establishes that those choices are sufficient.

**Approach:** Review the five exact snapshots; record each field/file, unit/bound, reviewer and gate decision before any future revision. **Acceptance:** Director-endorsed matrix distinguishes required, optional and conditional evidence; every silent source choice has an owner and disposition; independence remains intact.

<a id="gti-b02"></a>

### GTI-B02 — Official master-template designation

**OPEN · BUSINESS_POLICY · P0 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D10](./GTI_Standard_Template_Decisions.md#gti-d10). Prerequisites: [GTI-B01](#gti-b01). Extends: [A1](#adapter-a1), [A4](#adapter-a4), [A5](#adapter-a5).

**Existing gaps:** [PKG/requiredness](./GTI_Packaging_Blueprint_v1.json#L2761); [POSM/candidate-decisions](./GTI_POSM_Blueprint_v1.json#L2311); [RTL/candidate-decisions](./GTI_Retail_Display_Blueprint_v1.json#L2309); [EXH/candidate-decisions](./GTI_Exhibition_Stand_Blueprint_v1.json#L2483); [DIG/candidate-decisions](./GTI_Digital_Blueprint_v1.json#L2248).

**Source:** [P0033](./GTI_FLUX_Project_Process_Templates_Source.json#L163), [P0040](./GTI_FLUX_Project_Process_Templates_Source.json#L198).

**Expected:** Official identity must identify the exact source, candidate revision and executable version approved as the GTI standard. **Current:** Director publication approves an immutable executable workflow; all candidates remain internal and unapproved. **Missing enforcement/decision:** No separate official designation, requirement disposition or immutable designation history exists.

**Approach:** Use the minimal separate Director designation proposal in the review; extend typed publication governance only in a later package. **Acceptance:** An ordinary publication or edited draft cannot acquire official status; exact hashes, scoped dispositions and future-only selection are independently approved and auditable.

<a id="gti-b03"></a>

### GTI-B03 — Typed conditional applicability

**OPEN · INTERNAL_PLATFORM · P1 · shared.** Affects PKG POSM RTL. Decisions: [GTI-D01](./GTI_Standard_Template_Decisions.md#gti-d01), [GTI-D04](./GTI_Standard_Template_Decisions.md#gti-d04), [GTI-D06](./GTI_Standard_Template_Decisions.md#gti-d06). Prerequisites: [GTI-B01](#gti-b01). Extends: [A1](#adapter-a1), [A2](#adapter-a2).

**Existing gaps:** [PKG/repeating-records](./GTI_Packaging_Blueprint_v1.json#L2774); [POSM/material-applicability-skip](./GTI_POSM_Blueprint_v1.json#L2325).

**Source:** [P0074](./GTI_FLUX_Project_Process_Templates_Source.json#L368), [P0098](./GTI_FLUX_Project_Process_Templates_Source.json#L488), [P0123](./GTI_FLUX_Project_Process_Templates_Source.json#L613), [P0128](./GTI_FLUX_Project_Process_Templates_Source.json#L638), [P0129](./GTI_FLUX_Project_Process_Templates_Source.json#L643), [P0130](./GTI_FLUX_Project_Process_Templates_Source.json#L648), [P0153](./GTI_FLUX_Project_Process_Templates_Source.json#L763), [P0450](./GTI_FLUX_Project_Process_Templates_Source.json#L2248), [P0466](./GTI_FLUX_Project_Process_Templates_Source.json#L2328).

**Expected:** POSM Material Type changes required sourcing and fields; Packaging applicability and Direct/Pitch clauses differ; Retail survey basis changes evidence. **Current:** Selectors and omission summaries store context; POSM branch inputs remain optional and all stages fixed. **Missing enforcement/decision:** No condition-dependent mandatory fields/files/checklists or cross-field applicability evaluation.

**Approach:** Extend FieldDefinition/Capability and Gate with a bounded typed condition over declared IDs/options; validate on server and preview. No user scripts. **Acceptance:** Merchandise cannot bypass sourcing; printed projects need no merchandise evidence; changing the selector invalidates affected approvals; unknown conditions fail closed. Skips remain separate B04.

<a id="gti-b04"></a>

### GTI-B04 — Permitted stage skips, if policy is approved

**OPEN · BUSINESS_POLICY · P0 · shared.** Affects PKG POSM. Decisions: [GTI-D04](./GTI_Standard_Template_Decisions.md#gti-d04). Prerequisites: [GTI-B01](#gti-b01). Extends: [A1](#adapter-a1), [A2](#adapter-a2), [A3](#adapter-a3).

**Existing gaps:** [PKG/concept-gates](./GTI_Packaging_Blueprint_v1.json#L2788); [POSM/material-applicability-skip](./GTI_POSM_Blueprint_v1.json#L2325).

**Source:** [P0037](./GTI_FLUX_Project_Process_Templates_Source.json#L183), [P0038](./GTI_FLUX_Project_Process_Templates_Source.json#L188), [P0060](./GTI_FLUX_Project_Process_Templates_Source.json#L298), [P0089](./GTI_FLUX_Project_Process_Templates_Source.json#L443), [P0093](./GTI_FLUX_Project_Process_Templates_Source.json#L463), [P0128](./GTI_FLUX_Project_Process_Templates_Source.json#L638), [P0327](./GTI_FLUX_Project_Process_Templates_Source.json#L1633).

**Expected:** The old source permits specific Director-approved skips and broader Owner overrides; current V2 permits neither. **Current:** Fixed gates cannot be bypassed. Concept purposes use Tasker instead of restored legacy stages. **Missing enforcement/decision:** No approved new V2 policy authorizes a skip adapter.

**Approach:** Keep V04 precedence; ask whether to retain strict completion or authorize named, typed applicability decisions. Do not restore Owner override rights. **Acceptance:** Any future exception is limited to approved template/stage/version, exact Director evidence and audit; it cannot silently skip source purposes, task review or final completion. Without approval, no implementation.

<a id="gti-b05"></a>

### GTI-B05 — Reusable repeatable-record contracts

**OPEN · INTERNAL_PLATFORM · P1 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D01](./GTI_Standard_Template_Decisions.md#gti-d01), [GTI-D03](./GTI_Standard_Template_Decisions.md#gti-d03). Prerequisites: [GTI-B01](#gti-b01). Extends: [A1](#adapter-a1), [A2](#adapter-a2), [A5](#adapter-a5), [A6](#adapter-a6).

**Existing gaps:** [PKG/repeating-records](./GTI_Packaging_Blueprint_v1.json#L2774); [POSM/structured-offers](./GTI_POSM_Blueprint_v1.json#L2337); [POSM/format-size-outlet-records](./GTI_POSM_Blueprint_v1.json#L2374); [RTL/survey-coverage-sample](./GTI_Retail_Display_Blueprint_v1.json#L2323); [RTL/component-production-units](./GTI_Retail_Display_Blueprint_v1.json#L2333); [EXH/event-scheduling](./GTI_Exhibition_Stand_Blueprint_v1.json#L2496); [EXH/structured-contractor-offers](./GTI_Exhibition_Stand_Blueprint_v1.json#L2517); [EXH/snag-task-binding](./GTI_Exhibition_Stand_Blueprint_v1.json#L2573); [DIG/repeatable-uat-rounds](./GTI_Digital_Blueprint_v1.json#L2332); [DIG/bug-task-blocking](./GTI_Digital_Blueprint_v1.json#L2342).

**Source:** [P0077](./GTI_FLUX_Project_Process_Templates_Source.json#L383), [P0096](./GTI_FLUX_Project_Process_Templates_Source.json#L478), [P0108](./GTI_FLUX_Project_Process_Templates_Source.json#L538), [P0112](./GTI_FLUX_Project_Process_Templates_Source.json#L558), [P0125](./GTI_FLUX_Project_Process_Templates_Source.json#L623), [P0136](./GTI_FLUX_Project_Process_Templates_Source.json#L678), [P0148](./GTI_FLUX_Project_Process_Templates_Source.json#L738), [P0159](./GTI_FLUX_Project_Process_Templates_Source.json#L793), [P0170](./GTI_FLUX_Project_Process_Templates_Source.json#L848), [P0172](./GTI_FLUX_Project_Process_Templates_Source.json#L858), [P0178](./GTI_FLUX_Project_Process_Templates_Source.json#L888), [P0197](./GTI_FLUX_Project_Process_Templates_Source.json#L983).

**Expected:** Business collections need stable row identities, exact evidence, revisions and completeness relationships. **Current:** Scalar fields and attached registers capture summaries; no row-level RuntimeProject entities exist. **Missing enforcement/decision:** No reusable record identity/version/provenance boundary for units, offers, milestones, issues or tests.

**Approach:** Add small typed runtime record adapters sharing identity, revision, authorization and exact-version references; domain validators remain distinct B06–B13/B17/B29. **Acceptance:** Rows cannot cross projects or mutate completed history; stale updates fail; row removal invalidates dependent proof. Generic row presence never certifies domain acceptance.

<a id="gti-b06"></a>

### GTI-B06 — Packaging SKU, market, final-file, unit and sample records

**OPEN · INTERNAL_PLATFORM · P1 · template-specific.** Affects PKG. Decisions: [GTI-D01](./GTI_Standard_Template_Decisions.md#gti-d01), [GTI-D05](./GTI_Standard_Template_Decisions.md#gti-d05). Prerequisites: [GTI-B03](#gti-b03), [GTI-B05](#gti-b05). Extends: [A1](#adapter-a1), [A2](#adapter-a2), [A6](#adapter-a6).

**Existing gaps:** [PKG/repeating-records](./GTI_Packaging_Blueprint_v1.json#L2774); [PKG/regulatory-validation](./GTI_Packaging_Blueprint_v1.json#L2846).

**Source:** [P0077](./GTI_FLUX_Project_Process_Templates_Source.json#L383), [P0082](./GTI_FLUX_Project_Process_Templates_Source.json#L408), [P0096](./GTI_FLUX_Project_Process_Templates_Source.json#L478), [P0098](./GTI_FLUX_Project_Process_Templates_Source.json#L488), [P0108](./GTI_FLUX_Project_Process_Templates_Source.json#L538), [P0109](./GTI_FLUX_Project_Process_Templates_Source.json#L543), [P0112](./GTI_FLUX_Project_Process_Templates_Source.json#L558), [P0114](./GTI_FLUX_Project_Process_Templates_Source.json#L568), [P0117](./GTI_FLUX_Project_Process_Templates_Source.json#L583), [P0453](./GTI_FLUX_Project_Process_Templates_Source.json#L2263), [P0466](./GTI_FLUX_Project_Process_Templates_Source.json#L2328).

**Expected:** Every final file/market and production unit needs complete applicable specifications, handover and accepted sample rounds. **Current:** 81 fields and reviewed registers retain source content at summary level. **Missing enforcement/decision:** No SKU/format library consistency, per-file N/A reasons, unit handover completeness or per-unit sample lifecycle.

**Approach:** Implement linked typed SKU/market/file/unit/sample adapters, explicit units and validated library references; couple sample evidence to B26. **Acceptance:** A missing SKU, conflicting format, unexplained N/A, unhanded unit or unaccepted required sample blocks its configured purpose; records bind exact file versions.

<a id="gti-b07"></a>

### GTI-B07 — POSM formats, sizes, outlet allocation and photo minima

**OPEN · INTERNAL_PLATFORM · P1 · template-specific.** Affects POSM. Decisions: [GTI-D01](./GTI_Standard_Template_Decisions.md#gti-d01), [GTI-D06](./GTI_Standard_Template_Decisions.md#gti-d06). Prerequisites: [GTI-B03](#gti-b03), [GTI-B05](#gti-b05). Extends: [A1](#adapter-a1), [A2](#adapter-a2), [A6](#adapter-a6).

**Existing gaps:** [POSM/concept-task-gates](./GTI_POSM_Blueprint_v1.json#L2362); [POSM/format-size-outlet-records](./GTI_POSM_Blueprint_v1.json#L2374); [POSM/outlet-photo-count](./GTI_POSM_Blueprint_v1.json#L2385).

**Source:** [P0125](./GTI_FLUX_Project_Process_Templates_Source.json#L623), [P0132](./GTI_FLUX_Project_Process_Templates_Source.json#L658), [P0135](./GTI_FLUX_Project_Process_Templates_Source.json#L673), [P0136](./GTI_FLUX_Project_Process_Templates_Source.json#L678), [P0144](./GTI_FLUX_Project_Process_Templates_Source.json#L718), [P0145](./GTI_FLUX_Project_Process_Templates_Source.json#L723).

**Expected:** Quantities must reconcile by format/apparel size/outlet; execution photos meet the brief-defined minimum. **Current:** Optional branch summaries and files retain quantities and photo evidence. **Missing enforcement/decision:** No row completeness, all-format adaptation check, distribution totals or brief-derived photo count.

**Approach:** Add format/size/allocation rows and outlet-bound exact photo references; keep warehouse movement in B36. **Acceptance:** Wrong material branch, duplicate outlet attribution, quantity mismatch and missing required photos fail. GTI defines whether the minimum is per outlet or overall before coding.

<a id="gti-b08"></a>

### GTI-B08 — Retail component production units

**OPEN · INTERNAL_PLATFORM · P1 · template-specific.** Affects RTL. Decisions: [GTI-D01](./GTI_Standard_Template_Decisions.md#gti-d01), [GTI-D07](./GTI_Standard_Template_Decisions.md#gti-d07). Prerequisites: [GTI-B05](#gti-b05). Extends: [A1](#adapter-a1), [A2](#adapter-a2), [A6](#adapter-a6).

**Existing gaps:** [RTL/component-production-units](./GTI_Retail_Display_Blueprint_v1.json#L2333).

**Source:** [P0148](./GTI_FLUX_Project_Process_Templates_Source.json#L738), [P0159](./GTI_FLUX_Project_Process_Templates_Source.json#L793).

**Expected:** Structure, header, panels, shelf talkers, shutters and lighting have individual specifications and production evidence. **Current:** A component notice, scalar summary and reviewed register describe the units. **Missing enforcement/decision:** No relational component identity, per-component dimensions/files/checklists, quantities or lifecycle.

**Approach:** Extend the repeatable unit adapter with Retail component kind, agreed units and component evidence requirements. **Acceptance:** Each applicable component has complete versioned specifications and evidence; an omitted component or quantity mismatch fails without an approved disposition.

<a id="gti-b09"></a>

### GTI-B09 — Retail survey coverage and representative sample

**OPEN · INTERNAL_PLATFORM · P1 · template-specific.** Affects RTL. Decisions: [GTI-D07](./GTI_Standard_Template_Decisions.md#gti-d07). Prerequisites: [GTI-B03](#gti-b03), [GTI-B05](#gti-b05). Extends: [A1](#adapter-a1), [A2](#adapter-a2), [A3](#adapter-a3).

**Existing gaps:** [RTL/survey-coverage-sample](./GTI_Retail_Display_Blueprint_v1.json#L2323).

**Source:** [P0152](./GTI_FLUX_Project_Process_Templates_Source.json#L758), [P0153](./GTI_FLUX_Project_Process_Templates_Source.json#L763).

**Expected:** Survey every outlet, or obtain Owner approval of a representative sample. **Current:** Coverage basis is recorded; fixed independent Owner review applies to both choices. **Missing enforcement/decision:** No coverage calculation or decision binding an exact sampled/excluded outlet set.

**Approach:** Add an outlet coverage adapter and typed sample-approval subject; keep sample adequacy as the designated human decision. **Acceptance:** All-outlet mode rejects missing outlets; sample mode requires the eligible Owner decision over the exact set/rationale; changed sites invalidate it.

<a id="gti-b10"></a>

### GTI-B10 — Retail installation and issue assignment gate

**OPEN · INTERNAL_PLATFORM · P1 · template-specific.** Affects RTL. Decisions: [GTI-D03](./GTI_Standard_Template_Decisions.md#gti-d03), [GTI-D07](./GTI_Standard_Template_Decisions.md#gti-d07). Prerequisites: [GTI-B05](#gti-b05), [GTI-B14](#gti-b14). Extends: [A2](#adapter-a2), [A6](#adapter-a6), [A7](#adapter-a7).

**Existing gaps:** [RTL/outlet-installation-issue-gate](./GTI_Retail_Display_Blueprint_v1.json#L2343); [RTL/completion-governance](./GTI_Retail_Display_Blueprint_v1.json#L2445).

**Source:** [P0148](./GTI_FLUX_Project_Process_Templates_Source.json#L738), [P0163](./GTI_FLUX_Project_Process_Templates_Source.json#L813), [P0164](./GTI_FLUX_Project_Process_Templates_Source.json#L818), [P0327](./GTI_FLUX_Project_Process_Templates_Source.json#L1633).

**Expected:** Track planned/installed/accepted/issue per outlet; apply the source all-accepted OR issues-assigned rule after GTI clarifies its scope. **Current:** Registers, protocols and manually created General Tasks provide human evidence. **Missing enforcement/decision:** No authoritative outlet states, issue-to-task bindings or evaluated outlet completion rule.

**Approach:** Use typed installation/issue records and task-binding predicates, distinct from snag-resolution and Digital severity policies. **Acceptance:** Every outlet is accounted for; unresolved issues reference real eligible assigned tasks when the approved rule permits it. A text reference, unrelated task or task acceptance alone cannot approve an installation.

<a id="gti-b11"></a>

### GTI-B11 — Exhibition snag records and corrective tasks

**OPEN · INTERNAL_PLATFORM · P1 · template-specific.** Affects EXH. Decisions: [GTI-D03](./GTI_Standard_Template_Decisions.md#gti-d03), [GTI-D08](./GTI_Standard_Template_Decisions.md#gti-d08). Prerequisites: [GTI-B05](#gti-b05), [GTI-B14](#gti-b14). Extends: [A2](#adapter-a2), [A6](#adapter-a6), [A7](#adapter-a7).

**Existing gaps:** [EXH/snag-task-binding](./GTI_Exhibition_Stand_Blueprint_v1.json#L2573).

**Source:** [P0178](./GTI_FLUX_Project_Process_Templates_Source.json#L888), [P0327](./GTI_FLUX_Project_Process_Templates_Source.json#L1633), [P0520](./GTI_FLUX_Project_Process_Templates_Source.json#L2598).

**Expected:** On-site snags must have accountable corrective tasks and evidence under an agreed stand-acceptance rule. **Current:** Snag summaries and manual General Task references are captured. **Missing enforcement/decision:** No typed snag/task relationship, corrective-task automation or stage-blocking resolution predicate.

**Approach:** Add a stand-snag adapter with exact location/evidence, task binding and explicit human acceptance; automation is B30. **Acceptance:** Unresolved blocking snags prevent the agreed gate; task deletion/reassignment cannot hide them; acceptance records remain separate from task completion.

<a id="gti-b12"></a>

### GTI-B12 — Digital build rounds, UAT cases and coverage

**OPEN · INTERNAL_PLATFORM · P1 · template-specific.** Affects DIG. Decisions: [GTI-D03](./GTI_Standard_Template_Decisions.md#gti-d03), [GTI-D09](./GTI_Standard_Template_Decisions.md#gti-d09). Prerequisites: [GTI-B05](#gti-b05). Extends: [A1](#adapter-a1), [A2](#adapter-a2), [A6](#adapter-a6).

**Existing gaps:** [DIG/repeatable-uat-rounds](./GTI_Digital_Blueprint_v1.json#L2332).

**Source:** [P0185](./GTI_FLUX_Project_Process_Templates_Source.json#L923), [P0197](./GTI_FLUX_Project_Process_Templates_Source.json#L983).

**Expected:** Repeat build/test rounds, track test versions and assess UAT acceptance. **Current:** Files, round summaries and fixed Owner evidence review exist. **Missing enforcement/decision:** No case/result entities, version-bound round lifecycle, coverage calculation or approved test thresholds.

**Approach:** Add typed build/round/case/result records with explicit human acceptance criteria and immutable supersession. **Acceptance:** Results identify exact build and case versions; failed/missing required cases block acceptance under the approved policy; a new build cannot inherit stale success.

<a id="gti-b13"></a>

### GTI-B13 — Digital defect-to-task and retest gate

**OPEN · INTERNAL_PLATFORM · P1 · template-specific.** Affects DIG. Decisions: [GTI-D03](./GTI_Standard_Template_Decisions.md#gti-d03), [GTI-D09](./GTI_Standard_Template_Decisions.md#gti-d09). Prerequisites: [GTI-B12](#gti-b12), [GTI-B14](#gti-b14). Extends: [A2](#adapter-a2), [A6](#adapter-a6), [A7](#adapter-a7).

**Existing gaps:** [DIG/bug-task-blocking](./GTI_Digital_Blueprint_v1.json#L2342).

**Source:** [P0197](./GTI_FLUX_Project_Process_Templates_Source.json#L983), [P0327](./GTI_FLUX_Project_Process_Templates_Source.json#L1633), [P0520](./GTI_FLUX_Project_Process_Templates_Source.json#L2598).

**Expected:** Bug lists use tasks and required corrections/retests precede software acceptance. **Current:** Manual General Tasks and bug-reference summaries are possible. **Missing enforcement/decision:** No verified defect/task relation, severity rule, automatic correction task or unresolved-defect gate.

**Approach:** Add a typed defect adapter referencing UAT/build evidence and actual task applications; retain explicit retest acceptance. **Acceptance:** Required unresolved defects or missing retests block testing completion; closed tasks without accepted retest evidence do not pass; GTI defines exceptions/severity.

<a id="gti-b14"></a>

### GTI-B14 — Task-to-stage gates and applied deliverables

**OPEN · INTERNAL_PLATFORM · P1 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D03](./GTI_Standard_Template_Decisions.md#gti-d03), [GTI-D05](./GTI_Standard_Template_Decisions.md#gti-d05), [GTI-D09](./GTI_Standard_Template_Decisions.md#gti-d09). Prerequisites: [GTI-B01](#gti-b01). Extends: [A1](#adapter-a1), [A2](#adapter-a2), [A7](#adapter-a7).

**Existing gaps:** [PKG/concept-gates](./GTI_Packaging_Blueprint_v1.json#L2788); [PKG/scheduling](./GTI_Packaging_Blueprint_v1.json#L2906); [POSM/concept-task-gates](./GTI_POSM_Blueprint_v1.json#L2362); [RTL/outlet-installation-issue-gate](./GTI_Retail_Display_Blueprint_v1.json#L2343); [RTL/concept-task-gates](./GTI_Retail_Display_Blueprint_v1.json#L2355); [EXH/concept-task-gates](./GTI_Exhibition_Stand_Blueprint_v1.json#L2543); [EXH/snag-task-binding](./GTI_Exhibition_Stand_Blueprint_v1.json#L2573); [DIG/concept-task-gates](./GTI_Digital_Blueprint_v1.json#L2291); [DIG/bug-task-blocking](./GTI_Digital_Blueprint_v1.json#L2342).

**Source:** [P0060](./GTI_FLUX_Project_Process_Templates_Source.json#L298), [P0085](./GTI_FLUX_Project_Process_Templates_Source.json#L423), [P0090](./GTI_FLUX_Project_Process_Templates_Source.json#L448), [P0097](./GTI_FLUX_Project_Process_Templates_Source.json#L483), [P0132](./GTI_FLUX_Project_Process_Templates_Source.json#L658), [P0155](./GTI_FLUX_Project_Process_Templates_Source.json#L773), [P0174](./GTI_FLUX_Project_Process_Templates_Source.json#L868), [P0191](./GTI_FLUX_Project_Process_Templates_Source.json#L953), [P0193](./GTI_FLUX_Project_Process_Templates_Source.json#L963), [P0197](./GTI_FLUX_Project_Process_Templates_Source.json#L983), [P0310](./GTI_FLUX_Project_Process_Templates_Source.json#L1548), [P0316](./GTI_FLUX_Project_Process_Templates_Source.json#L1578), [P0327](./GTI_FLUX_Project_Process_Templates_Source.json#L1633).

**Expected:** Required creative tasks and field/file requests must satisfy their specified stage purpose. **Current:** All six Tasker types and Sisters exist; accepted Data Input/File Upload uses reauthorized APPLIED targets; Final Concept uses eligible exact inspiration. **Missing enforcement/decision:** Gate has no typed task completion/application predicate, required-task binding or selected-output coverage.

**Approach:** Extend Gate/evaluateGates with explicit runtime task bindings; distinguish accepted concept output, APPLIED deliverable and mere CLOSED status. Reuse target hashes and application provenance. **Acceptance:** Wrong project/stage, stale inspiration, failed application or merely closed task cannot satisfy a gate. Accepted task/file does not approve a stage; stage completion and final Director completion remain explicit.

<a id="gti-b15"></a>

### GTI-B15 — Creative counts, rounds and acceptance criteria

**OPEN · BUSINESS_POLICY · P0 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D02](./GTI_Standard_Template_Decisions.md#gti-d02), [GTI-D05](./GTI_Standard_Template_Decisions.md#gti-d05), [GTI-D06](./GTI_Standard_Template_Decisions.md#gti-d06), [GTI-D07](./GTI_Standard_Template_Decisions.md#gti-d07), [GTI-D08](./GTI_Standard_Template_Decisions.md#gti-d08), [GTI-D09](./GTI_Standard_Template_Decisions.md#gti-d09). Prerequisites: [GTI-B01](#gti-b01). Extends: [A1](#adapter-a1), [A3](#adapter-a3), [A7](#adapter-a7).

**Existing gaps:** [PKG/concept-gates](./GTI_Packaging_Blueprint_v1.json#L2788); [POSM/candidate-decisions](./GTI_POSM_Blueprint_v1.json#L2311); [POSM/concept-task-gates](./GTI_POSM_Blueprint_v1.json#L2362); [RTL/candidate-decisions](./GTI_Retail_Display_Blueprint_v1.json#L2309); [RTL/concept-task-gates](./GTI_Retail_Display_Blueprint_v1.json#L2355); [EXH/candidate-decisions](./GTI_Exhibition_Stand_Blueprint_v1.json#L2483); [EXH/concept-task-gates](./GTI_Exhibition_Stand_Blueprint_v1.json#L2543); [DIG/candidate-decisions](./GTI_Digital_Blueprint_v1.json#L2248); [DIG/ux-ui-approval-definitions](./GTI_Digital_Blueprint_v1.json#L2278); [DIG/concept-task-gates](./GTI_Digital_Blueprint_v1.json#L2291).

**Source:** [P0087](./GTI_FLUX_Project_Process_Templates_Source.json#L433), [P0088](./GTI_FLUX_Project_Process_Templates_Source.json#L438), [P0089](./GTI_FLUX_Project_Process_Templates_Source.json#L443), [P0093](./GTI_FLUX_Project_Process_Templates_Source.json#L463), [P0132](./GTI_FLUX_Project_Process_Templates_Source.json#L658), [P0133](./GTI_FLUX_Project_Process_Templates_Source.json#L663), [P0155](./GTI_FLUX_Project_Process_Templates_Source.json#L773), [P0174](./GTI_FLUX_Project_Process_Templates_Source.json#L868), [P0191](./GTI_FLUX_Project_Process_Templates_Source.json#L953), [P0193](./GTI_FLUX_Project_Process_Templates_Source.json#L963), [P0362](./GTI_FLUX_Project_Process_Templates_Source.json#L1808), [P0444](./GTI_FLUX_Project_Process_Templates_Source.json#L2218), [P0448](./GTI_FLUX_Project_Process_Templates_Source.json#L2238), [P0460](./GTI_FLUX_Project_Process_Templates_Source.json#L2298), [P0477](./GTI_FLUX_Project_Process_Templates_Source.json#L2383), [P0518](./GTI_FLUX_Project_Process_Templates_Source.json#L2588).

**Expected:** Creative output must meet agreed concepts/views/adaptations, contract rounds and named review criteria. **Current:** Concept history and independent output review exist, with human stage evidence. **Missing enforcement/decision:** No approved cross-template count/round matrix; Packaging example 4–6 is not a universal mandate; Digital UX/UI approvers are unspecified.

**Approach:** Decide distinct per-template criteria, then add typed creative-round/coverage checks over existing Tasker evidence, not a new concept engine. **Acceptance:** Accepted criteria distinguish proposed counts, contractual minima and optional iterations; exact inspiration and all required formats are verified without treating every revision as a completed creative round.

<a id="gti-b16"></a>

### GTI-B16 — CERBER vendor identity and eligibility

**OPEN · EXTERNAL_INTEGRATION · P1 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D12](./GTI_Standard_Template_Decisions.md#gti-d12). Prerequisites: [GTI-B01](#gti-b01). Extends: [A3](#adapter-a3), [A5](#adapter-a5), [A8](#adapter-a8).

**Existing gaps:** [PKG/vendor-dispatch](./GTI_Packaging_Blueprint_v1.json#L2819); [POSM/vendor-orders](./GTI_POSM_Blueprint_v1.json#L2348); [RTL/vendor-production-dispatch](./GTI_Retail_Display_Blueprint_v1.json#L2387); [EXH/vendor-communications-contracts](./GTI_Exhibition_Stand_Blueprint_v1.json#L2527); [DIG/vendor-rfp-workflow](./GTI_Digital_Blueprint_v1.json#L2262).

**Source:** [P0030](./GTI_FLUX_Project_Process_Templates_Source.json#L148), [P0035](./GTI_FLUX_Project_Process_Templates_Source.json#L173), [P0129](./GTI_FLUX_Project_Process_Templates_Source.json#L643), [P0172](./GTI_FLUX_Project_Process_Templates_Source.json#L858), [P0189](./GTI_FLUX_Project_Process_Templates_Source.json#L943), [P0359](./GTI_FLUX_Project_Process_Templates_Source.json#L1793), [P0371](./GTI_FLUX_Project_Process_Templates_Source.json#L1853), [P0375](./GTI_FLUX_Project_Process_Templates_Source.json#L1873), [P0376](./GTI_FLUX_Project_Process_Templates_Source.json#L1878), [P0377](./GTI_FLUX_Project_Process_Templates_Source.json#L1883), [P0384](./GTI_FLUX_Project_Process_Templates_Source.json#L1918), [P0522](./GTI_FLUX_Project_Process_Templates_Source.json#L2608).

**Expected:** Only Director-selected, CERBER-approved vendors may receive governed documents. **Current:** Text references and internal review cannot verify vendor identity/status. **Missing enforcement/decision:** No master-data ownership, status freshness, suspension or vendor-to-project eligibility adapter.

**Approach:** Agree source of truth and re-verification; add typed vendor references with versioned eligibility checks at selection and release. **Acceptance:** Unknown/stale/suspended vendor status blocks dispatch; junior suggestions cannot change the Director-approved list; no fake internal business accounts are created.

<a id="gti-b17"></a>

### GTI-B17 — Structured RFP offers and contractor comparisons

**OPEN · INTERNAL_PLATFORM · P1 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D08](./GTI_Standard_Template_Decisions.md#gti-d08), [GTI-D12](./GTI_Standard_Template_Decisions.md#gti-d12). Prerequisites: [GTI-B05](#gti-b05), [GTI-B16](#gti-b16). Extends: [A2](#adapter-a2), [A3](#adapter-a3), [A6](#adapter-a6), [A8](#adapter-a8).

**Existing gaps:** [PKG/vendor-dispatch](./GTI_Packaging_Blueprint_v1.json#L2819); [POSM/structured-offers](./GTI_POSM_Blueprint_v1.json#L2337); [EXH/structured-contractor-offers](./GTI_Exhibition_Stand_Blueprint_v1.json#L2517); [DIG/vendor-rfp-workflow](./GTI_Digital_Blueprint_v1.json#L2262).

**Source:** [P0129](./GTI_FLUX_Project_Process_Templates_Source.json#L643), [P0130](./GTI_FLUX_Project_Process_Templates_Source.json#L648), [P0172](./GTI_FLUX_Project_Process_Templates_Source.json#L858), [P0189](./GTI_FLUX_Project_Process_Templates_Source.json#L943), [P0394](./GTI_FLUX_Project_Process_Templates_Source.json#L1968), [P0418](./GTI_FLUX_Project_Process_Templates_Source.json#L2088), [P0467](./GTI_FLUX_Project_Process_Templates_Source.json#L2333), [P0468](./GTI_FLUX_Project_Process_Templates_Source.json#L2338), [P0469](./GTI_FLUX_Project_Process_Templates_Source.json#L2343), [P0470](./GTI_FLUX_Project_Process_Templates_Source.json#L2348), [P0471](./GTI_FLUX_Project_Process_Templates_Source.json#L2353), [P0472](./GTI_FLUX_Project_Process_Templates_Source.json#L2358), [P0473](./GTI_FLUX_Project_Process_Templates_Source.json#L2363), [P0474](./GTI_FLUX_Project_Process_Templates_Source.json#L2368).

**Expected:** Structured RFP responses support distinct vendors, quantities, MOQ, lead time, samples, terms and comparisons; POSM merchandise/Stand require at least three offers. **Current:** Optional or required evidence bundles and scalar summaries are reviewed. **Missing enforcement/decision:** File count cannot establish distinct offers or comparable terms; no approved participant/selection records.

**Approach:** Use typed RFP/offer rows bound to exact vendor, specification and currency; extend Director selection approval. Do not impose three offers on templates whose source is silent. **Acceptance:** Duplicate vendor files cannot satisfy three offers; incomplete required terms fail; comparisons preserve units/currency and Director decisions over exact offers.

<a id="gti-b18"></a>

### GTI-B18 — Creative pitch terms and release sequence

**OPEN · INTERNAL_PLATFORM · P1 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D05](./GTI_Standard_Template_Decisions.md#gti-d05), [GTI-D11](./GTI_Standard_Template_Decisions.md#gti-d11), [GTI-D12](./GTI_Standard_Template_Decisions.md#gti-d12). Prerequisites: [GTI-B16](#gti-b16), [GTI-B17](#gti-b17), [GTI-B19](#gti-b19), [GTI-B24](#gti-b24). Extends: [A1](#adapter-a1), [A3](#adapter-a3), [A8](#adapter-a8).

**Existing gaps:** [PKG/vendor-dispatch](./GTI_Packaging_Blueprint_v1.json#L2819).

**Source:** [P0074](./GTI_FLUX_Project_Process_Templates_Source.json#L368), [P0083](./GTI_FLUX_Project_Process_Templates_Source.json#L413), [P0084](./GTI_FLUX_Project_Process_Templates_Source.json#L418), [P0358](./GTI_FLUX_Project_Process_Templates_Source.json#L1788), [P0359](./GTI_FLUX_Project_Process_Templates_Source.json#L1793), [P0360](./GTI_FLUX_Project_Process_Templates_Source.json#L1798), [P0361](./GTI_FLUX_Project_Process_Templates_Source.json#L1803), [P0362](./GTI_FLUX_Project_Process_Templates_Source.json#L1808), [P0363](./GTI_FLUX_Project_Process_Templates_Source.json#L1813), [P0364](./GTI_FLUX_Project_Process_Templates_Source.json#L1818), [P0365](./GTI_FLUX_Project_Process_Templates_Source.json#L1823), [P0366](./GTI_FLUX_Project_Process_Templates_Source.json#L1828), [P0367](./GTI_FLUX_Project_Process_Templates_Source.json#L1833), [P0368](./GTI_FLUX_Project_Process_Templates_Source.json#L1838), [P0369](./GTI_FLUX_Project_Process_Templates_Source.json#L1843), [P0475](./GTI_FLUX_Project_Process_Templates_Source.json#L2373), [P0476](./GTI_FLUX_Project_Process_Templates_Source.json#L2378), [P0477](./GTI_FLUX_Project_Process_Templates_Source.json#L2383), [P0478](./GTI_FLUX_Project_Process_Templates_Source.json#L2388), [P0479](./GTI_FLUX_Project_Process_Templates_Source.json#L2393), [P0480](./GTI_FLUX_Project_Process_Templates_Source.json#L2398), [P0481](./GTI_FLUX_Project_Process_Templates_Source.json#L2403), [P0482](./GTI_FLUX_Project_Process_Templates_Source.json#L2408), [P0483](./GTI_FLUX_Project_Process_Templates_Source.json#L2413), [P0484](./GTI_FLUX_Project_Process_Templates_Source.json#L2418), [P0485](./GTI_FLUX_Project_Process_Templates_Source.json#L2423), [P0486](./GTI_FLUX_Project_Process_Templates_Source.json#L2428), [P0487](./GTI_FLUX_Project_Process_Templates_Source.json#L2433), [P0488](./GTI_FLUX_Project_Process_Templates_Source.json#L2438), [P0489](./GTI_FLUX_Project_Process_Templates_Source.json#L2443), [P0490](./GTI_FLUX_Project_Process_Templates_Source.json#L2448), [P0491](./GTI_FLUX_Project_Process_Templates_Source.json#L2453).

**Expected:** Packaging Pitch and optional other-template pitches require accepted terms, structured proposals, controlled assets, recorded winner and signed exclusive-phase agreement. **Current:** Direct/Pitch is context only; no competition or vendor release is executed. **Missing enforcement/decision:** No terms-version acceptance, fee/round limits, Director-controlled defaults, proposal gate or five-day agreement gate.

**Approach:** Add a bounded pitch adapter composing offers, document approval, vendor provenance and schedule; preserve every source default for legal/business review. **Acceptance:** Validate source defaults (2 rounds, 5% copyright, 0.5% rejection, USD; 21 days, 30/45 minutes, 4–5 stakeholders, 5 days) only after confirmation; one pitch revision remains distinct. Assets/exclusive work cannot release early; default changes require Director approval.

<a id="gti-b19"></a>

### GTI-B19 — Director-approved exact external dispatch

**OPEN · EXTERNAL_INTEGRATION · P1 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D11](./GTI_Standard_Template_Decisions.md#gti-d11), [GTI-D12](./GTI_Standard_Template_Decisions.md#gti-d12), [GTI-D14](./GTI_Standard_Template_Decisions.md#gti-d14). Prerequisites: [GTI-B16](#gti-b16), [GTI-B23](#gti-b23). Extends: [A3](#adapter-a3), [A6](#adapter-a6), [A8](#adapter-a8).

**Existing gaps:** [PKG/vendor-dispatch](./GTI_Packaging_Blueprint_v1.json#L2819); [POSM/vendor-orders](./GTI_POSM_Blueprint_v1.json#L2348); [RTL/vendor-production-dispatch](./GTI_Retail_Display_Blueprint_v1.json#L2387); [EXH/vendor-communications-contracts](./GTI_Exhibition_Stand_Blueprint_v1.json#L2527); [DIG/vendor-rfp-workflow](./GTI_Digital_Blueprint_v1.json#L2262).

**Source:** [P0036](./GTI_FLUX_Project_Process_Templates_Source.json#L178), [P0083](./GTI_FLUX_Project_Process_Templates_Source.json#L413), [P0108](./GTI_FLUX_Project_Process_Templates_Source.json#L538), [P0141](./GTI_FLUX_Project_Process_Templates_Source.json#L703), [P0161](./GTI_FLUX_Project_Process_Templates_Source.json#L803), [P0172](./GTI_FLUX_Project_Process_Templates_Source.json#L858), [P0189](./GTI_FLUX_Project_Process_Templates_Source.json#L943), [P0343](./GTI_FLUX_Project_Process_Templates_Source.json#L1713), [P0344](./GTI_FLUX_Project_Process_Templates_Source.json#L1718), [P0345](./GTI_FLUX_Project_Process_Templates_Source.json#L1723), [P0346](./GTI_FLUX_Project_Process_Templates_Source.json#L1728), [P0348](./GTI_FLUX_Project_Process_Templates_Source.json#L1738), [P0350](./GTI_FLUX_Project_Process_Templates_Source.json#L1748), [P0351](./GTI_FLUX_Project_Process_Templates_Source.json#L1753), [P0352](./GTI_FLUX_Project_Process_Templates_Source.json#L1758), [P0353](./GTI_FLUX_Project_Process_Templates_Source.json#L1763), [P0354](./GTI_FLUX_Project_Process_Templates_Source.json#L1768), [P0355](./GTI_FLUX_Project_Process_Templates_Source.json#L1773).

**Expected:** Director approves exact documents, recipients and attachments before opening relationships, contracts, orders or money commitments leave FLUX. **Current:** Internal evidence approvals and atomic audit/outbox exist; no vendor send adapter. **Missing enforcement/decision:** No recipient-bound release subject, draft watermark/export control, expiring delivery or delivery provenance.

**Approach:** Add a typed external-release Approval Engine subject and idempotent delivery adapter; ordinary feedback follows separately approved policy. **Acceptance:** Any document/recipient/attachment change invalidates approval; no PM send bypass; send retries cannot duplicate release; delivery uses only approved eligible recipients and records actual actors.

<a id="gti-b20"></a>

### GTI-B20 — External runtime submissions and actor provenance

**OPEN · EXTERNAL_INTEGRATION · P1 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D14](./GTI_Standard_Template_Decisions.md#gti-d14), [GTI-D11](./GTI_Standard_Template_Decisions.md#gti-d11). Prerequisites: [GTI-B16](#gti-b16), [GTI-B19](#gti-b19). Extends: [A3](#adapter-a3), [A5](#adapter-a5), [A6](#adapter-a6), [A8](#adapter-a8).

**Existing gaps:** [PKG/vendor-dispatch](./GTI_Packaging_Blueprint_v1.json#L2819); [PKG/documents](./GTI_Packaging_Blueprint_v1.json#L2888); [POSM/documents-signatures](./GTI_POSM_Blueprint_v1.json#L2436); [RTL/documents-signatures](./GTI_Retail_Display_Blueprint_v1.json#L2415); [EXH/vendor-communications-contracts](./GTI_Exhibition_Stand_Blueprint_v1.json#L2527); [DIG/vendor-rfp-workflow](./GTI_Digital_Blueprint_v1.json#L2262); [DIG/documents-signatures](./GTI_Digital_Blueprint_v1.json#L2402).

**Source:** [P0030](./GTI_FLUX_Project_Process_Templates_Source.json#L148), [P0353](./GTI_FLUX_Project_Process_Templates_Source.json#L1763), [P0354](./GTI_FLUX_Project_Process_Templates_Source.json#L1768), [P0360](./GTI_FLUX_Project_Process_Templates_Source.json#L1798), [P0505](./GTI_FLUX_Project_Process_Templates_Source.json#L2523).

**Expected:** Required vendor submissions and bilateral confirmations must identify the real external actor and exact version. **Current:** Runtime external submission links are intentionally unavailable; internal exact-version submissions work. **Missing enforcement/decision:** No scoped token, recipient identity, expiry/revocation, external authorization or provenance model for RuntimeProject.

**Approach:** If initial rollout needs it, extend native runtime/file/approval adapters with a genuine external principal and purpose-scoped token; otherwise seek an explicit scoped rollout disposition. **Acceptance:** Replay, revoked/expired/wrong-project tokens deny; the external contributor is not impersonated by a GTI account; no fabricated legacy Project bridges; exact file and event provenance survives review.

<a id="gti-b21"></a>

### GTI-B21 — Exhibition organiser approval

**OPEN · EXTERNAL_INTEGRATION · P1 · template-specific.** Affects EXH. Decisions: [GTI-D08](./GTI_Standard_Template_Decisions.md#gti-d08), [GTI-D14](./GTI_Standard_Template_Decisions.md#gti-d14). Prerequisites: [GTI-B19](#gti-b19), [GTI-B20](#gti-b20). Extends: [A3](#adapter-a3), [A6](#adapter-a6), [A8](#adapter-a8).

**Existing gaps:** [EXH/external-organiser-approval](./GTI_Exhibition_Stand_Blueprint_v1.json#L2553).

**Source:** [P0174](./GTI_FLUX_Project_Process_Templates_Source.json#L868).

**Expected:** Stand design is submitted to and approved by the actual organiser. **Current:** Uploaded submission/approval records receive internal independent file review. **Missing enforcement/decision:** No organiser identity, decision verification or exact-design-version binding.

**Approach:** Use a distinct organiser-approval subject with authenticated submission or a GTI-approved verified evidence procedure; do not reuse contractor approval as organiser authority. **Acceptance:** Only the authorised organiser evidence can satisfy the requirement for the exact submitted drawing set; revisions require renewed acceptance; internal file review cannot impersonate organiser approval.

<a id="gti-b22"></a>

### GTI-B22 — Production stakeholder chain and restart policy

**OPEN · INTERNAL_PLATFORM · P1 · shared.** Affects PKG POSM RTL. Decisions: [GTI-D02](./GTI_Standard_Template_Decisions.md#gti-d02), [GTI-D05](./GTI_Standard_Template_Decisions.md#gti-d05). Prerequisites: [GTI-B01](#gti-b01), [GTI-B20](#gti-b20). Extends: [A1](#adapter-a1), [A3](#adapter-a3).

**Existing gaps:** [PKG/external-approval-chain](./GTI_Packaging_Blueprint_v1.json#L2806); [RTL/vendor-production-dispatch](./GTI_Retail_Display_Blueprint_v1.json#L2387).

**Source:** [P0063](./GTI_FLUX_Project_Process_Templates_Source.json#L313), [P0101](./GTI_FLUX_Project_Process_Templates_Source.json#L503), [P0102](./GTI_FLUX_Project_Process_Templates_Source.json#L508), [P0103](./GTI_FLUX_Project_Process_Templates_Source.json#L513), [P0104](./GTI_FLUX_Project_Process_Templates_Source.json#L518), [P0105](./GTI_FLUX_Project_Process_Templates_Source.json#L523), [P0106](./GTI_FLUX_Project_Process_Templates_Source.json#L528), [P0139](./GTI_FLUX_Project_Process_Templates_Source.json#L693), [P0161](./GTI_FLUX_Project_Process_Templates_Source.json#L803).

**Expected:** Packaging source release order is stakeholders including Purchase, CEO, all Executors, then Director, with selected restart after correction. **Current:** Fixed supported internal approvers and immutable decisions exist; candidate Director review is explicitly narrower. **Missing enforcement/decision:** No Purchase/CEO/arbitrary stakeholder eligibility, all-Executor quorum or selected-step restart adapter.

**Approach:** GTI first reconciles identities with V2 roles; extend typed subject-specific eligibility and restart snapshots without adding generic roles or weakening independent review. **Acceptance:** Required exact-version steps cannot be removed/reordered; every eligible Executor is accounted for; changed evidence invalidates decisions per approved restart policy; final Director authority is retained.

<a id="gti-b23"></a>

### GTI-B23 — Structured documents and versioned lifecycle

**OPEN · INTERNAL_PLATFORM · P1 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D11](./GTI_Standard_Template_Decisions.md#gti-d11). Prerequisites: [GTI-B01](#gti-b01), [GTI-B05](#gti-b05). Extends: [A1](#adapter-a1), [A3](#adapter-a3), [A6](#adapter-a6).

**Existing gaps:** [PKG/regulatory-validation](./GTI_Packaging_Blueprint_v1.json#L2846); [PKG/documents](./GTI_Packaging_Blueprint_v1.json#L2888); [POSM/documents-signatures](./GTI_POSM_Blueprint_v1.json#L2436); [RTL/documents-signatures](./GTI_Retail_Display_Blueprint_v1.json#L2415); [EXH/documents-artwork](./GTI_Exhibition_Stand_Blueprint_v1.json#L2637); [DIG/documents-signatures](./GTI_Digital_Blueprint_v1.json#L2402).

**Source:** [P0066](./GTI_FLUX_Project_Process_Templates_Source.json#L328), [P0078](./GTI_FLUX_Project_Process_Templates_Source.json#L388), [P0126](./GTI_FLUX_Project_Process_Templates_Source.json#L628), [P0408](./GTI_FLUX_Project_Process_Templates_Source.json#L2038), [P0412](./GTI_FLUX_Project_Process_Templates_Source.json#L2058), [P0418](./GTI_FLUX_Project_Process_Templates_Source.json#L2088), [P0424](./GTI_FLUX_Project_Process_Templates_Source.json#L2118), [P0426](./GTI_FLUX_Project_Process_Templates_Source.json#L2128), [P0429](./GTI_FLUX_Project_Process_Templates_Source.json#L2143), [P0432](./GTI_FLUX_Project_Process_Templates_Source.json#L2158), [P0466](./GTI_FLUX_Project_Process_Templates_Source.json#L2328), [P0494](./GTI_FLUX_Project_Process_Templates_Source.json#L2468), [P0499](./GTI_FLUX_Project_Process_Templates_Source.json#L2493), [P0500](./GTI_FLUX_Project_Process_Templates_Source.json#L2498), [P0501](./GTI_FLUX_Project_Process_Templates_Source.json#L2503), [P0502](./GTI_FLUX_Project_Process_Templates_Source.json#L2508).

**Expected:** Standard briefs/RFPs/protocols/contracts are prefilled from authoritative project records and follow Draft/For approval/Approved/Signed purposes. **Current:** Users upload manually prepared documents; file versions and internal approval are real. **Missing enforcement/decision:** No structured generation, document state adapter, purpose-based placement or source-data consistency enforcement.

**Approach:** Add typed document templates mapping declared record IDs into immutable generated versions; map by business purpose, not the source table’s inconsistent stage numbers. **Acceptance:** A field change creates a new document version and invalidates affected approval; Packaging SKU/format/Direct-Pitch checks pass before submission; Generated/Approved/Signed remain distinct claims.

<a id="gti-b24"></a>

### GTI-B24 — Legal ownership, signatures and pre-production contract guard

**OPEN · BUSINESS_POLICY · P0 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D11](./GTI_Standard_Template_Decisions.md#gti-d11), [GTI-D05](./GTI_Standard_Template_Decisions.md#gti-d05). Prerequisites: [GTI-B23](#gti-b23). Extends: [A2](#adapter-a2), [A3](#adapter-a3), [A6](#adapter-a6), [A8](#adapter-a8).

**Existing gaps:** [PKG/vendor-dispatch](./GTI_Packaging_Blueprint_v1.json#L2819); [PKG/documents](./GTI_Packaging_Blueprint_v1.json#L2888); [POSM/vendor-orders](./GTI_POSM_Blueprint_v1.json#L2348); [POSM/documents-signatures](./GTI_POSM_Blueprint_v1.json#L2436); [RTL/vendor-production-dispatch](./GTI_Retail_Display_Blueprint_v1.json#L2387); [RTL/documents-signatures](./GTI_Retail_Display_Blueprint_v1.json#L2415); [EXH/vendor-communications-contracts](./GTI_Exhibition_Stand_Blueprint_v1.json#L2527); [EXH/documents-artwork](./GTI_Exhibition_Stand_Blueprint_v1.json#L2637); [DIG/vendor-rfp-workflow](./GTI_Digital_Blueprint_v1.json#L2262); [DIG/documents-signatures](./GTI_Digital_Blueprint_v1.json#L2402).

**Source:** [P0107](./GTI_FLUX_Project_Process_Templates_Source.json#L533), [P0172](./GTI_FLUX_Project_Process_Templates_Source.json#L858), [P0408](./GTI_FLUX_Project_Process_Templates_Source.json#L2038), [P0424](./GTI_FLUX_Project_Process_Templates_Source.json#L2118), [P0425](./GTI_FLUX_Project_Process_Templates_Source.json#L2123), [P0426](./GTI_FLUX_Project_Process_Templates_Source.json#L2128), [P0462](./GTI_FLUX_Project_Process_Templates_Source.json#L2308), [P0490](./GTI_FLUX_Project_Process_Templates_Source.json#L2448), [P0492](./GTI_FLUX_Project_Process_Templates_Source.json#L2458), [P0493](./GTI_FLUX_Project_Process_Templates_Source.json#L2463), [P0494](./GTI_FLUX_Project_Process_Templates_Source.json#L2468), [P0495](./GTI_FLUX_Project_Process_Templates_Source.json#L2473), [P0496](./GTI_FLUX_Project_Process_Templates_Source.json#L2478), [P0497](./GTI_FLUX_Project_Process_Templates_Source.json#L2483), [P0498](./GTI_FLUX_Project_Process_Templates_Source.json#L2488), [P0521](./GTI_FLUX_Project_Process_Templates_Source.json#L2603).

**Expected:** Counsel owns approved legal wording; external creative acceptance requires the applicable signed agreement before production/exclusivity. **Current:** Contract files are human evidence. Final-project document policy is separately Director-approved. **Missing enforcement/decision:** No legal approval, signatory authority, verified signature or pre-artwork contractual gate; final completion proof cannot substitute.

**Approach:** Agree counsel-reviewed terms and signing evidence/provider, then bind a typed agreement to exact works/vendor/version and the relevant stage purpose. **Acceptance:** Unsigned/wrong-scope/obsolete agreements block release; any exception needs separately approved policy and exact Director authority. No automatic waiver or legal certification is inferred from an uploaded PDF.

<a id="gti-b25"></a>

### GTI-B25 — Bilateral Acceptance Protocol

**OPEN · INTERNAL_PLATFORM · P1 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D07](./GTI_Standard_Template_Decisions.md#gti-d07), [GTI-D08](./GTI_Standard_Template_Decisions.md#gti-d08), [GTI-D09](./GTI_Standard_Template_Decisions.md#gti-d09), [GTI-D11](./GTI_Standard_Template_Decisions.md#gti-d11), [GTI-D14](./GTI_Standard_Template_Decisions.md#gti-d14). Prerequisites: [GTI-B20](#gti-b20), [GTI-B23](#gti-b23), [GTI-B24](#gti-b24). Extends: [A2](#adapter-a2), [A3](#adapter-a3), [A6](#adapter-a6).

**Existing gaps:** [PKG/documents](./GTI_Packaging_Blueprint_v1.json#L2888); [POSM/documents-signatures](./GTI_POSM_Blueprint_v1.json#L2436); [POSM/completion-governance](./GTI_POSM_Blueprint_v1.json#L2467); [RTL/documents-signatures](./GTI_Retail_Display_Blueprint_v1.json#L2415); [EXH/physical-stand-acceptance](./GTI_Exhibition_Stand_Blueprint_v1.json#L2584); [DIG/deployment-go-live](./GTI_Digital_Blueprint_v1.json#L2353); [DIG/documents-signatures](./GTI_Digital_Blueprint_v1.json#L2402).

**Source:** [P0113](./GTI_FLUX_Project_Process_Templates_Source.json#L563), [P0146](./GTI_FLUX_Project_Process_Templates_Source.json#L728), [P0163](./GTI_FLUX_Project_Process_Templates_Source.json#L813), [P0178](./GTI_FLUX_Project_Process_Templates_Source.json#L888), [P0200](./GTI_FLUX_Project_Process_Templates_Source.json#L998), [P0499](./GTI_FLUX_Project_Process_Templates_Source.json#L2493), [P0500](./GTI_FLUX_Project_Process_Templates_Source.json#L2498), [P0501](./GTI_FLUX_Project_Process_Templates_Source.json#L2503), [P0502](./GTI_FLUX_Project_Process_Templates_Source.json#L2508), [P0503](./GTI_FLUX_Project_Process_Templates_Source.json#L2513), [P0504](./GTI_FLUX_Project_Process_Templates_Source.json#L2518), [P0505](./GTI_FLUX_Project_Process_Templates_Source.json#L2523), [P0506](./GTI_FLUX_Project_Process_Templates_Source.json#L2528).

**Expected:** Both parties confirm received quantities, specification checks, defects and accepted/remarks/rejected outcomes for the source’s five variants. **Current:** Exact protocol uploads and independent internal file review exist. **Missing enforcement/decision:** No two-party confirmation, signatory/version binding or fix-deadline lifecycle.

**Approach:** Use one protocol identity/version contract with separate sample, batch, outlet, stand and go-live evidence adapters; reuse genuine external provenance. **Acceptance:** Both authorized parties confirm the same protocol; changed quantities/evidence require renewed confirmation; remarks retain fixes and deadlines. Signature verifies attribution, not physical or software quality.

<a id="gti-b26"></a>

### GTI-B26 — Physical production, prototype and stand acceptance

**OPEN · INTERNAL_PLATFORM · P1 · shared.** Affects PKG POSM RTL EXH. Decisions: [GTI-D05](./GTI_Standard_Template_Decisions.md#gti-d05), [GTI-D06](./GTI_Standard_Template_Decisions.md#gti-d06), [GTI-D07](./GTI_Standard_Template_Decisions.md#gti-d07), [GTI-D08](./GTI_Standard_Template_Decisions.md#gti-d08). Prerequisites: [GTI-B05](#gti-b05), [GTI-B25](#gti-b25). Extends: [A2](#adapter-a2), [A3](#adapter-a3), [A6](#adapter-a6).

**Existing gaps:** [POSM/physical-production-quality](./GTI_POSM_Blueprint_v1.json#L2394); [RTL/engineering-safety](./GTI_Retail_Display_Blueprint_v1.json#L2367); [RTL/physical-prototype](./GTI_Retail_Display_Blueprint_v1.json#L2377); [EXH/physical-stand-acceptance](./GTI_Exhibition_Stand_Blueprint_v1.json#L2584).

**Source:** [P0109](./GTI_FLUX_Project_Process_Templates_Source.json#L543), [P0112](./GTI_FLUX_Project_Process_Templates_Source.json#L558), [P0114](./GTI_FLUX_Project_Process_Templates_Source.json#L568), [P0139](./GTI_FLUX_Project_Process_Templates_Source.json#L693), [P0140](./GTI_FLUX_Project_Process_Templates_Source.json#L698), [P0142](./GTI_FLUX_Project_Process_Templates_Source.json#L708), [P0145](./GTI_FLUX_Project_Process_Templates_Source.json#L723), [P0157](./GTI_FLUX_Project_Process_Templates_Source.json#L783), [P0161](./GTI_FLUX_Project_Process_Templates_Source.json#L803), [P0178](./GTI_FLUX_Project_Process_Templates_Source.json#L888), [P0502](./GTI_FLUX_Project_Process_Templates_Source.json#L2508), [P0506](./GTI_FLUX_Project_Process_Templates_Source.json#L2528).

**Expected:** Accept every Packaging sample, POSM proof/golden sample/batch, Retail physical prototype/assembly and stand inspection under its own criteria. **Current:** Reviewed photographs, reports and checklists record human observations. **Missing enforcement/decision:** No per-unit physical lifecycle or qualified inspection/engineering result binding; uploads do not prove physical safety or quality.

**Approach:** Create domain-specific acceptance adapters with named competent human authority and exact unit/specification/test evidence. Do not promise software-only physical certification. **Acceptance:** Missing/failed unit samples, prototype assembly or required stand inspection block the corresponding approved gate; a stage attestation cannot substitute for qualified inspection.

<a id="gti-b27"></a>

### GTI-B27 — Regulatory and Digital compliance authority

**OPEN · BUSINESS_POLICY · P0 · shared.** Affects PKG POSM RTL DIG. Decisions: [GTI-D11](./GTI_Standard_Template_Decisions.md#gti-d11), [GTI-D17](./GTI_Standard_Template_Decisions.md#gti-d17). Prerequisites: [GTI-B01](#gti-b01). Extends: [A1](#adapter-a1), [A3](#adapter-a3), [A6](#adapter-a6).

**Existing gaps:** [PKG/regulatory-validation](./GTI_Packaging_Blueprint_v1.json#L2846); [POSM/artwork-regulatory-validation](./GTI_POSM_Blueprint_v1.json#L2416); [RTL/engineering-safety](./GTI_Retail_Display_Blueprint_v1.json#L2367); [DIG/security-compliance-certification](./GTI_Digital_Blueprint_v1.json#L2302).

**Source:** [P0082](./GTI_FLUX_Project_Process_Templates_Source.json#L408), [P0128](./GTI_FLUX_Project_Process_Templates_Source.json#L638), [P0150](./GTI_FLUX_Project_Process_Templates_Source.json#L748), [P0157](./GTI_FLUX_Project_Process_Templates_Source.json#L783), [P0187](./GTI_FLUX_Project_Process_Templates_Source.json#L933), [P0195](./GTI_FLUX_Project_Process_Templates_Source.json#L973), [P0442](./GTI_FLUX_Project_Process_Templates_Source.json#L2208), [P0459](./GTI_FLUX_Project_Process_Templates_Source.json#L2293), [P0462](./GTI_FLUX_Project_Process_Templates_Source.json#L2308), [P0491](./GTI_FLUX_Project_Process_Templates_Source.json#L2453).

**Expected:** Use supplied market restrictions and authorized review for artwork/display and Digital age, privacy, cookies, legal pages and security. **Current:** Fields and reports capture requirements; human review is not certification. **Missing enforcement/decision:** No authoritative jurisdiction/version rules, verified compliance outcome or security certification. Source does not mandate a universal automated legal engine.

**Approach:** Agree accountable reviewers and evidence first; introduce narrow approved rule/result adapters only where requirements are explicit; keep legal and security judgment with qualified owners. **Acceptance:** Each applicable market/build has dated authoritative criteria and accepted evidence; missing or obsolete review cannot pass as certified. No regulatory threshold is invented by FLUX.

<a id="gti-b28"></a>

### GTI-B28 — Per-version artwork and Digital asset preflight

**OPEN · INTERNAL_PLATFORM · P1 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D17](./GTI_Standard_Template_Decisions.md#gti-d17). Prerequisites: [GTI-B05](#gti-b05), [GTI-B43](#gti-b43). Extends: [A2](#adapter-a2), [A3](#adapter-a3), [A6](#adapter-a6).

**Existing gaps:** [PKG/regulatory-validation](./GTI_Packaging_Blueprint_v1.json#L2846); [POSM/artwork-regulatory-validation](./GTI_POSM_Blueprint_v1.json#L2416); [RTL/large-format-preflight](./GTI_Retail_Display_Blueprint_v1.json#L2398); [EXH/documents-artwork](./GTI_Exhibition_Stand_Blueprint_v1.json#L2637); [DIG/digital-asset-preflight](./GTI_Digital_Blueprint_v1.json#L2322).

**Source:** [P0096](./GTI_FLUX_Project_Process_Templates_Source.json#L478), [P0137](./GTI_FLUX_Project_Process_Templates_Source.json#L683), [P0159](./GTI_FLUX_Project_Process_Templates_Source.json#L793), [P0176](./GTI_FLUX_Project_Process_Templates_Source.json#L878), [P0195](./GTI_FLUX_Project_Process_Templates_Source.json#L973), [P0509](./GTI_FLUX_Project_Process_Templates_Source.json#L2543), [P0510](./GTI_FLUX_Project_Process_Templates_Source.json#L2548), [P0511](./GTI_FLUX_Project_Process_Templates_Source.json#L2553), [P0512](./GTI_FLUX_Project_Process_Templates_Source.json#L2558), [P0513](./GTI_FLUX_Project_Process_Templates_Source.json#L2563), [P0514](./GTI_FLUX_Project_Process_Templates_Source.json#L2568), [P0515](./GTI_FLUX_Project_Process_Templates_Source.json#L2573), [P0516](./GTI_FLUX_Project_Process_Templates_Source.json#L2578).

**Expected:** Exact files meet base and variant standards: layered/editable artwork, embedded assets, typography, colour, bleed, naming and Digital export rules. **Current:** Type/count controls, sealed versions and human File Standard checks exist. **Missing enforcement/decision:** No binary inspection, material-dependent resolution/scale, all-component inventory or content-completeness validation.

**Approach:** Attach deterministic preflight results to exact SharedFileVersion and versioned rule profile, with separate Packaging/print/merchandise/display/stand/Digital validators. **Acceptance:** Changed bytes invalidate the result; unsupported formats report UNKNOWN and cannot pass automatically; fixtures cover layered/embedded/font/resolution/naming and applicable variant failures; human/legal approval stays separate.

<a id="gti-b29"></a>

### GTI-B29 — Scheduling, milestones and dependency warnings

**OPEN · INTERNAL_PLATFORM · P1 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D15](./GTI_Standard_Template_Decisions.md#gti-d15). Prerequisites: [GTI-B01](#gti-b01), [GTI-B05](#gti-b05). Extends: [A1](#adapter-a1), [A2](#adapter-a2), [A5](#adapter-a5).

**Existing gaps:** [PKG/scheduling](./GTI_Packaging_Blueprint_v1.json#L2906); [POSM/planning-budget-tasks](./GTI_POSM_Blueprint_v1.json#L2455); [RTL/scheduling-budget-service](./GTI_Retail_Display_Blueprint_v1.json#L2432); [EXH/event-scheduling](./GTI_Exhibition_Stand_Blueprint_v1.json#L2496); [DIG/support-scheduling](./GTI_Digital_Blueprint_v1.json#L2363).

**Source:** [P0062](./GTI_FLUX_Project_Process_Templates_Source.json#L308), [P0125](./GTI_FLUX_Project_Process_Templates_Source.json#L623), [P0150](./GTI_FLUX_Project_Process_Templates_Source.json#L748), [P0163](./GTI_FLUX_Project_Process_Templates_Source.json#L813), [P0166](./GTI_FLUX_Project_Process_Templates_Source.json#L828), [P0170](./GTI_FLUX_Project_Process_Templates_Source.json#L848), [P0199](./GTI_FLUX_Project_Process_Templates_Source.json#L993), [P0312](./GTI_FLUX_Project_Process_Templates_Source.json#L1558), [P0332](./GTI_FLUX_Project_Process_Templates_Source.json#L1658), [P0406](./GTI_FLUX_Project_Process_Templates_Source.json#L2028), [P0443](./GTI_FLUX_Project_Process_Templates_Source.json#L2213), [P0519](./GTI_FLUX_Project_Process_Templates_Source.json#L2593).

**Expected:** Derive plans from agreed durations, end dates and vendor lead times; Exhibition retains fixed organiser milestones. **Current:** Scalar DATE fields and uploaded schedules store manually entered dates. **Missing enforcement/decision:** No backward calculation, cross-date constraints, dependencies, installation/support schedules or conflict warnings.

**Approach:** Add a typed schedule adapter beside stage configuration with fixed/manual/calculated provenance and versioned duration/calendar policy. **Acceptance:** Fixed organiser dates cannot silently move; impossible dependency/lead-time plans warn; revised event dates require explicit recalculation review. No unsourced standard duration is assumed.

<a id="gti-b30"></a>

### GTI-B30 — Starter/request tasks, reminders and calendar delivery

**OPEN · INTERNAL_PLATFORM · P2 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D15](./GTI_Standard_Template_Decisions.md#gti-d15), [GTI-D03](./GTI_Standard_Template_Decisions.md#gti-d03). Prerequisites: [GTI-B14](#gti-b14), [GTI-B29](#gti-b29). Extends: [A7](#adapter-a7), [A8](#adapter-a8).

**Existing gaps:** [PKG/scheduling](./GTI_Packaging_Blueprint_v1.json#L2906); [POSM/planning-budget-tasks](./GTI_POSM_Blueprint_v1.json#L2455); [RTL/scheduling-budget-service](./GTI_Retail_Display_Blueprint_v1.json#L2432); [EXH/snag-task-binding](./GTI_Exhibition_Stand_Blueprint_v1.json#L2573); [DIG/bug-task-blocking](./GTI_Digital_Blueprint_v1.json#L2342); [DIG/support-scheduling](./GTI_Digital_Blueprint_v1.json#L2363).

**Source:** [P0064](./GTI_FLUX_Project_Process_Templates_Source.json#L318), [P0065](./GTI_FLUX_Project_Process_Templates_Source.json#L323), [P0097](./GTI_FLUX_Project_Process_Templates_Source.json#L483), [P0178](./GTI_FLUX_Project_Process_Templates_Source.json#L888), [P0197](./GTI_FLUX_Project_Process_Templates_Source.json#L983), [P0310](./GTI_FLUX_Project_Process_Templates_Source.json#L1548), [P0312](./GTI_FLUX_Project_Process_Templates_Source.json#L1558), [P0316](./GTI_FLUX_Project_Process_Templates_Source.json#L1578), [P0324](./GTI_FLUX_Project_Process_Templates_Source.json#L1618), [P0331](./GTI_FLUX_Project_Process_Templates_Source.json#L1653), [P0332](./GTI_FLUX_Project_Process_Templates_Source.json#L1658), [P0519](./GTI_FLUX_Project_Process_Templates_Source.json#L2593), [P0520](./GTI_FLUX_Project_Process_Templates_Source.json#L2598).

**Expected:** Approved stage starters, field requests and corrective actions create actual eligible tasks; deadlines drive notifications/calendar. **Current:** Manual creation/application and durable audit/outbox exist; no operational worker is implied. **Missing enforcement/decision:** No template starters, future-stage Planned lifecycle, automatic correction/sample/approval tasks or delivered reminders/escalations.

**Approach:** Add narrowly typed idempotent task factories and event consumers, after approving triggering conditions, assignees and notification channels. **Acceptance:** Replay cannot create duplicate tasks/messages; role changes reauthorize assignment; retries are observable; no task auto-approves evidence or closes a stage. Existing Tasker lifecycle rules remain authoritative.

<a id="gti-b31"></a>

### GTI-B31 — Budgets, commitments, costs and financial visibility

**OPEN · INTERNAL_PLATFORM · P1 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D16](./GTI_Standard_Template_Decisions.md#gti-d16), [GTI-D12](./GTI_Standard_Template_Decisions.md#gti-d12). Prerequisites: [GTI-B05](#gti-b05), [GTI-B16](#gti-b16), [GTI-B19](#gti-b19). Extends: [A3](#adapter-a3), [A5](#adapter-a5), [A6](#adapter-a6), [A8](#adapter-a8).

**Existing gaps:** [PKG/scheduling](./GTI_Packaging_Blueprint_v1.json#L2906); [POSM/vendor-orders](./GTI_POSM_Blueprint_v1.json#L2348); [POSM/planning-budget-tasks](./GTI_POSM_Blueprint_v1.json#L2455); [RTL/scheduling-budget-service](./GTI_Retail_Display_Blueprint_v1.json#L2432); [EXH/vendor-communications-contracts](./GTI_Exhibition_Stand_Blueprint_v1.json#L2527); [EXH/linked-project-budgets](./GTI_Exhibition_Stand_Blueprint_v1.json#L2562); [EXH/cost-and-event-records](./GTI_Exhibition_Stand_Blueprint_v1.json#L2619); [DIG/maintenance-cost-ledger](./GTI_Digital_Blueprint_v1.json#L2386).

**Source:** [P0125](./GTI_FLUX_Project_Process_Templates_Source.json#L623), [P0150](./GTI_FLUX_Project_Process_Templates_Source.json#L748), [P0166](./GTI_FLUX_Project_Process_Templates_Source.json#L828), [P0168](./GTI_FLUX_Project_Process_Templates_Source.json#L838), [P0182](./GTI_FLUX_Project_Process_Templates_Source.json#L908), [P0187](./GTI_FLUX_Project_Process_Templates_Source.json#L933), [P0202](./GTI_FLUX_Project_Process_Templates_Source.json#L1008), [P0392](./GTI_FLUX_Project_Process_Templates_Source.json#L1958), [P0393](./GTI_FLUX_Project_Process_Templates_Source.json#L1963), [P0394](./GTI_FLUX_Project_Process_Templates_Source.json#L1968), [P0395](./GTI_FLUX_Project_Process_Templates_Source.json#L1973), [P0396](./GTI_FLUX_Project_Process_Templates_Source.json#L1978), [P0397](./GTI_FLUX_Project_Process_Templates_Source.json#L1983), [P0398](./GTI_FLUX_Project_Process_Templates_Source.json#L1988), [P0399](./GTI_FLUX_Project_Process_Templates_Source.json#L1993).

**Expected:** Track planned budget, vendor offers, Director-approved commitments/invoices and actual costs, with separate linked-project budgets and restricted visibility. **Current:** Numbers and cost reports are evidence under current V2 access, not a financial ledger. **Missing enforcement/decision:** No reconciled accounting, currency policy, budget alerts, invoice approval adapter or source-specific cost-field authorization.

**Approach:** Add typed money/commitment/invoice records and explicit authorization over API, files, exports, tasks and search; treat totals/alerts separately from payment execution. **Acceptance:** Only Owner/Co-owner and global Director can access amounts per approved policy; other participants cannot recover them through exports. Totals reconcile, currencies are explicit, Director decisions bind exact commitments; Digital recurring costs remain versioned.

<a id="gti-b32"></a>

### GTI-B32 — Three-party vendor ratings and closeout gate

**OPEN · INTERNAL_PLATFORM · P1 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D16](./GTI_Standard_Template_Decisions.md#gti-d16), [GTI-D03](./GTI_Standard_Template_Decisions.md#gti-d03). Prerequisites: [GTI-B16](#gti-b16). Extends: [A3](#adapter-a3), [A5](#adapter-a5), [A9](#adapter-a9).

**Existing gaps:** [PKG/vendor-dispatch](./GTI_Packaging_Blueprint_v1.json#L2819); [PKG/completion](./GTI_Packaging_Blueprint_v1.json#L2927); [EXH/vendor-ratings](./GTI_Exhibition_Stand_Blueprint_v1.json#L2606); [EXH/completion-governance](./GTI_Exhibition_Stand_Blueprint_v1.json#L2662).

**Source:** [P0056](./GTI_FLUX_Project_Process_Templates_Source.json#L278), [P0182](./GTI_FLUX_Project_Process_Templates_Source.json#L908), [P0387](./GTI_FLUX_Project_Process_Templates_Source.json#L1933), [P0388](./GTI_FLUX_Project_Process_Templates_Source.json#L1938), [P0389](./GTI_FLUX_Project_Process_Templates_Source.json#L1943), [P0390](./GTI_FLUX_Project_Process_Templates_Source.json#L1948).

**Expected:** Owner, Co-owner and Director separately rate every involved vendor on quality, timeliness, price and communication before source closeout. **Current:** Optional summaries exist; current final completion has no rating predicate. **Missing enforcement/decision:** No vendor completeness, three real rating authorities, distinct decisions or final-gate adapter.

**Approach:** Add typed vendor-rating subjects and a closure prerequisite only after GTI resolves missing Co-owner/no-vendor cases; preserve actual Owner request and Director final decision. **Acceptance:** Missing vendor/criterion/required rater blocks the agreed policy; a single checklist cannot stand in for three actors; no fictitious Co-owner is added.

<a id="gti-b33"></a>

### GTI-B33 — Typed related-project links and governed creation

**OPEN · INTERNAL_PLATFORM · P1 · shared.** Affects PKG EXH. Decisions: [GTI-D18](./GTI_Standard_Template_Decisions.md#gti-d18). Prerequisites: [GTI-B01](#gti-b01). Extends: [A5](#adapter-a5), [A6](#adapter-a6).

**Existing gaps:** [PKG/toolkit-controls](./GTI_Packaging_Blueprint_v1.json#L2876); [EXH/linked-project-budgets](./GTI_Exhibition_Stand_Blueprint_v1.json#L2562).

**Source:** [P0120](./GTI_FLUX_Project_Process_Templates_Source.json#L598), [P0166](./GTI_FLUX_Project_Process_Templates_Source.json#L828), [P0176](./GTI_FLUX_Project_Process_Templates_Source.json#L878), [P0399](./GTI_FLUX_Project_Process_Templates_Source.json#L1993).

**Expected:** Toolkit concepts may start POSM projects; stand work links separate merchandise/apparel/POSM/catering projects and budgets. **Current:** Plain references describe related work without foreign keys or inherited access. **Missing enforcement/decision:** No typed relation, governed linked creation or reliable cross-project provenance.

**Approach:** Add explicit RuntimeProject relation types and create through existing SPM/JPM governance; budgets stay B31, with aggregation only if GTI requests it. **Acceptance:** Links validate type and both identities, reauthorize reads, grant no membership, and retain independent version pins/budgets. A text URL never creates a project or bypasses JPM approval.

<a id="gti-b34"></a>

### GTI-B34 — Genuine runtime Archive integration

**OPEN · INTERNAL_PLATFORM · P2 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D18](./GTI_Standard_Template_Decisions.md#gti-d18). Prerequisites: [GTI-B01](#gti-b01). Extends: [A5](#adapter-a5), [A6](#adapter-a6), [A9](#adapter-a9), [A10](#adapter-a10).

**Existing gaps:** [PKG/completion](./GTI_Packaging_Blueprint_v1.json#L2927); [POSM/completion-governance](./GTI_POSM_Blueprint_v1.json#L2467); [RTL/completion-governance](./GTI_Retail_Display_Blueprint_v1.json#L2445); [EXH/completion-governance](./GTI_Exhibition_Stand_Blueprint_v1.json#L2662).

**Source:** [P0056](./GTI_FLUX_Project_Process_Templates_Source.json#L278), [P0280](./GTI_FLUX_Project_Process_Templates_Source.json#L1398), [P0340](./GTI_FLUX_Project_Process_Templates_Source.json#L1698), [P0398](./GTI_FLUX_Project_Process_Templates_Source.json#L1988).

**Expected:** Approved completed-project evidence, task history and cost summary should be retrievable through genuine Archive authorization. **Current:** Completed runtime history is immutable; legacy/native Archives work but runtime auto-publication is absent. **Missing enforcement/decision:** No authorized RuntimeProject-to-Archive publication adapter or complete searchable runtime archive representation.

**Approach:** Propose an explicit authorized publication after final completion, with immutable references and native Archive access checks. Source automatic closure remains superseded. **Acceptance:** Publication cannot occur before completion, duplicate on retry, fabricate legacy Projects or broaden file/task access; retained exact versions and restricted financial views remain verifiable.

<a id="gti-b35"></a>

### GTI-B35 — Exhibition annual report reuse

**OPEN · INTERNAL_PLATFORM · P2 · template-specific.** Affects EXH. Decisions: [GTI-D08](./GTI_Standard_Template_Decisions.md#gti-d08), [GTI-D18](./GTI_Standard_Template_Decisions.md#gti-d18). Prerequisites: [GTI-B33](#gti-b33), [GTI-B34](#gti-b34). Extends: [A5](#adapter-a5), [A6](#adapter-a6), [A10](#adapter-a10).

**Existing gaps:** [EXH/historical-report-reuse](./GTI_Exhibition_Stand_Blueprint_v1.json#L2507); [EXH/completion-governance](./GTI_Exhibition_Stand_Blueprint_v1.json#L2662).

**Source:** [P0170](./GTI_FLUX_Project_Process_Templates_Source.json#L848), [P0183](./GTI_FLUX_Project_Process_Templates_Source.json#L913).

**Expected:** The approved wrap-up report becomes authorized input to the next event’s Research area. **Current:** A previous report can be manually uploaded, without verified prior-project identity. **Missing enforcement/decision:** No event-edition relation, authorized exact-report retrieval or automatic placement/provenance.

**Approach:** Add a typed prior-edition report reference using existing file access and the approved report identity; copying must retain source provenance. **Acceptance:** Wrong/unapproved edition reports or inaccessible files cannot be imported; future projects retain the exact report version even after newer reports; no inherited broad project access.

<a id="gti-b36"></a>

### GTI-B36 — Stock, distribution and reusable-element custody

**OPEN · EXTERNAL_INTEGRATION · P2 · shared.** Affects POSM EXH. Decisions: [GTI-D18](./GTI_Standard_Template_Decisions.md#gti-d18). Prerequisites: [GTI-B05](#gti-b05). Extends: [A5](#adapter-a5), [A6](#adapter-a6), [A8](#adapter-a8).

**Existing gaps:** [POSM/inventory-distribution](./GTI_POSM_Blueprint_v1.json#L2406); [EXH/reusable-stock](./GTI_Exhibition_Stand_Blueprint_v1.json#L2597).

**Source:** [P0144](./GTI_FLUX_Project_Process_Templates_Source.json#L718), [P0145](./GTI_FLUX_Project_Process_Templates_Source.json#L723), [P0182](./GTI_FLUX_Project_Process_Templates_Source.json#L908).

**Expected:** Reconcile merchandise intake/issues and reusable stand-element storage against quantities and custody. **Current:** Delivery, storage and warehouse records are uploaded evidence. **Missing enforcement/decision:** No authoritative stock movements, custody, allocation or reconciliation.

**Approach:** Choose warehouse/inventory source of truth; use typed movement/reference adapters. Stand reuse and merchandise distribution retain different acceptance rules. **Acceptance:** Duplicate movement replay cannot change stock; received/issued/stored quantities reconcile with authoritative records and identify custodian; an attachment alone cannot assert available stock.

<a id="gti-b37"></a>

### GTI-B37 — Secure Digital access and IT handover

**OPEN · EXTERNAL_INTEGRATION · P1 · template-specific.** Affects DIG. Decisions: [GTI-D19](./GTI_Standard_Template_Decisions.md#gti-d19). Prerequisites: [GTI-B01](#gti-b01). Extends: [A5](#adapter-a5), [A6](#adapter-a6), [A8](#adapter-a8).

**Existing gaps:** [DIG/credential-vault-access-transfer](./GTI_Digital_Blueprint_v1.json#L2312); [DIG/deployment-go-live](./GTI_Digital_Blueprint_v1.json#L2353).

**Source:** [P0195](./GTI_FLUX_Project_Process_Templates_Source.json#L973), [P0199](./GTI_FLUX_Project_Process_Templates_Source.json#L993).

**Expected:** IT receives authorized access and ownership of accounts/domains without exposing credentials. **Current:** All Digital fields/files instruct non-secret metadata only; no credential fields/defaults or vault exist. **Missing enforcement/decision:** No verified ownership/transfer, secret handling provider or automatic secret scanning/redaction.

**Approach:** Choose an approved external secrets/access system; keep only non-secret provider record IDs, owner and transfer proof in FLUX. Decide prevention/response controls separately. **Acceptance:** IT independently confirms appropriate access and revocation/rotation where required; no token-bearing URLs, secrets or credentials enter ordinary fields/files/logs. Guidance alone is not claimed as a technical content filter.

<a id="gti-b38"></a>

### GTI-B38 — Digital maintenance-versus-completion policy

**OPEN · BUSINESS_POLICY · P0 · template-specific.** Affects DIG. Decisions: [GTI-D09](./GTI_Standard_Template_Decisions.md#gti-d09). Prerequisites: none; review first. Extends: [A5](#adapter-a5), [A7](#adapter-a7), [A9](#adapter-a9).

**Existing gaps:** [DIG/maintenance-closure-policy](./GTI_Digital_Blueprint_v1.json#L2374).

**Source:** [P0056](./GTI_FLUX_Project_Process_Templates_Source.json#L278), [P0185](./GTI_FLUX_Project_Process_Templates_Source.json#L923), [P0201](./GTI_FLUX_Project_Process_Templates_Source.json#L1003), [P0202](./GTI_FLUX_Project_Process_Templates_Source.json#L1008).

**Expected:** Source Digital stays open indefinitely with change/fix tasks and ongoing costs; V2 has ACTIVE and immutable COMPLETED. **Current:** Seven stages, explicit maintenance guidance, manual tasks while ACTIVE, and separate final completion governance. **Missing enforcement/decision:** No approved duration/closure trigger, maintenance state or recurring-cost lifecycle.

**Approach:** GTI decides indefinite ACTIVE operation, a defined service period, or separately governed future work. Keep current state model until that decision; cost implementation is B31. **Acceptance:** Launch cannot auto-close; support end does not silently end indefinite maintenance; completed history is never reopened; actual Owner request and distinct Director final decision remain required.

<a id="gti-b39"></a>

### GTI-B39 — Digital go-live and verified service state

**OPEN · EXTERNAL_INTEGRATION · P1 · template-specific.** Affects DIG. Decisions: [GTI-D09](./GTI_Standard_Template_Decisions.md#gti-d09), [GTI-D19](./GTI_Standard_Template_Decisions.md#gti-d19). Prerequisites: [GTI-B12](#gti-b12), [GTI-B25](#gti-b25), [GTI-B37](#gti-b37). Extends: [A3](#adapter-a3), [A6](#adapter-a6), [A8](#adapter-a8).

**Existing gaps:** [DIG/deployment-go-live](./GTI_Digital_Blueprint_v1.json#L2353).

**Source:** [P0199](./GTI_FLUX_Project_Process_Templates_Source.json#L993), [P0200](./GTI_FLUX_Project_Process_Templates_Source.json#L998).

**Expected:** Go-live, IT handover and user acceptance must relate to the actual approved release. **Current:** Sanitized launch reports, dates, training records and protocol uploads exist. **Missing enforcement/decision:** No deployment verification, release/service-state identity or actual external go-live acceptance.

**Approach:** Start with an approved verifiable release/IT attestation adapter; direct deployment automation is an optional separate integration, not assumed necessary. **Acceptance:** Exact released build, responsible IT authority and accepted protocol are evidenced; internal stage completion cannot deploy code or label an unverified live service accepted.

<a id="gti-b40"></a>

### GTI-B40 — Retail warranty and Digital support obligations

**OPEN · INTERNAL_PLATFORM · P2 · shared.** Affects RTL DIG. Decisions: [GTI-D07](./GTI_Standard_Template_Decisions.md#gti-d07), [GTI-D09](./GTI_Standard_Template_Decisions.md#gti-d09), [GTI-D15](./GTI_Standard_Template_Decisions.md#gti-d15). Prerequisites: [GTI-B29](#gti-b29). Extends: [A5](#adapter-a5), [A7](#adapter-a7), [A8](#adapter-a8).

**Existing gaps:** [RTL/scheduling-budget-service](./GTI_Retail_Display_Blueprint_v1.json#L2432); [DIG/support-scheduling](./GTI_Digital_Blueprint_v1.json#L2363).

**Source:** [P0163](./GTI_FLUX_Project_Process_Templates_Source.json#L813), [P0199](./GTI_FLUX_Project_Process_Templates_Source.json#L993).

**Expected:** Record accountable warranty/service contacts and the agreed post-launch support period. **Current:** Text contacts, support plans and optional end dates are human records. **Missing enforcement/decision:** No enforceable coverage period, obligation lifecycle or service reminders.

**Approach:** Add small typed service-agreement/period records and authorized follow-up tasks; keep support duration separate from indefinite maintenance policy. **Acceptance:** Contacts, coverage, dates and responsibilities are explicit; expired/unfulfilled obligations remain visible under approved policy; a support end never auto-completes a project.

<a id="gti-b41"></a>

### GTI-B41 — Verified Toolio entry

**OPEN · EXTERNAL_INTEGRATION · P1 · template-specific.** Affects PKG. Decisions: [GTI-D13](./GTI_Standard_Template_Decisions.md#gti-d13). Prerequisites: [GTI-B14](#gti-b14). Extends: [A2](#adapter-a2), [A3](#adapter-a3), [A7](#adapter-a7).

**Existing gaps:** [PKG/toolio](./GTI_Packaging_Blueprint_v1.json#L2866).

**Source:** [P0117](./GTI_FLUX_Project_Process_Templates_Source.json#L583), [P0121](./GTI_FLUX_Project_Process_Templates_Source.json#L603).

**Expected:** The Owner-approved Product Card is manually entered into Toolio by the responsible Digital Lead and confirmed. **Current:** Product Card data/file and Owner approval exist; a General Task can record manual work. **Missing enforcement/decision:** No trusted entry identity/version or completion gate proves Toolio was updated.

**Approach:** Agree acceptable independent verification of manual entry first; add a typed entry-proof adapter and gate. API synchronization is optional, not a source requirement. **Acceptance:** Proof binds exact approved card, Toolio record and verifier/date; changed card requires new confirmation; task note or copied URL alone cannot assert external entry.

<a id="gti-b42"></a>

### GTI-B42 — Marketing Toolkit layout and Director-only note change

**OPEN · INTERNAL_PLATFORM · P1 · template-specific.** Affects PKG. Decisions: [GTI-D13](./GTI_Standard_Template_Decisions.md#gti-d13). Prerequisites: [GTI-B23](#gti-b23), [GTI-B28](#gti-b28), [GTI-B33](#gti-b33). Extends: [A1](#adapter-a1), [A3](#adapter-a3), [A6](#adapter-a6).

**Existing gaps:** [PKG/toolkit-controls](./GTI_Packaging_Blueprint_v1.json#L2876).

**Source:** [P0118](./GTI_FLUX_Project_Process_Templates_Source.json#L588), [P0119](./GTI_FLUX_Project_Process_Templates_Source.json#L593), [P0120](./GTI_FLUX_Project_Process_Templates_Source.json#L598), [P0524](./GTI_FLUX_Project_Process_Templates_Source.json#L2618).

**Expected:** Toolkit uses approved full/short layout, required views/pages and the internal/trade note removable only by the Director. **Current:** Scope fields, read-only guidance, uploaded toolkit and Director review exist. **Missing enforcement/decision:** No approved master layout, generated output/content checks or enforceable embedded-note removal decision.

**Approach:** Approve the layout and output formats; render/version typed toolkit content or verify uploaded output under an explicit policy; bind note exceptions to the exact version. **Acceptance:** Required pack views/concept pages are present; note removal without exact Director authority fails; new output invalidates old approval; linked POSM creation remains governed by B33.

<a id="gti-b43"></a>

### GTI-B43 — File size, formats, previews and upload UX

**OPEN · PRODUCTION_READINESS · P1 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D20](./GTI_Standard_Template_Decisions.md#gti-d20). Prerequisites: [GTI-B01](#gti-b01). Extends: [A1](#adapter-a1), [A6](#adapter-a6).

**Existing gaps:** [PKG/requiredness](./GTI_Packaging_Blueprint_v1.json#L2761); [POSM/candidate-decisions](./GTI_POSM_Blueprint_v1.json#L2311); [RTL/candidate-decisions](./GTI_Retail_Display_Blueprint_v1.json#L2309); [EXH/candidate-decisions](./GTI_Exhibition_Stand_Blueprint_v1.json#L2483); [DIG/candidate-decisions](./GTI_Digital_Blueprint_v1.json#L2248).

**Source:** [P0310](./GTI_FLUX_Project_Process_Templates_Source.json#L1548), [P0333](./GTI_FLUX_Project_Process_Templates_Source.json#L1663), [P0334](./GTI_FLUX_Project_Process_Templates_Source.json#L1668), [P0335](./GTI_FLUX_Project_Process_Templates_Source.json#L1673), [P0336](./GTI_FLUX_Project_Process_Templates_Source.json#L1678), [P0337](./GTI_FLUX_Project_Process_Templates_Source.json#L1683), [P0338](./GTI_FLUX_Project_Process_Templates_Source.json#L1688), [P0339](./GTI_FLUX_Project_Process_Templates_Source.json#L1693), [P0340](./GTI_FLUX_Project_Process_Templates_Source.json#L1698), [P0341](./GTI_FLUX_Project_Process_Templates_Source.json#L1703), [P0523](./GTI_FLUX_Project_Process_Templates_Source.json#L2613).

**Expected:** Support the agreed large artwork/video formats and safe review/download behavior; source unlimited-file expectations require policy reconciliation. **Current:** Bounded file contracts, declared extensions/MIME, sealed versions and authorized reads exist; candidates use max 20 files per requirement. **Missing enforcement/decision:** No approved size envelope or proof of all source formats/previews, unlimited attachments, same-name versioning, folder/clipboard/camera and annotation/comparison behavior.

**Approach:** Approve bounded storage/format support; extend existing upload/file adapters and preview UX incrementally. Separate format declarations from real rendering/large-file validation. **Acceptance:** Each promised format/size is verified through upload, integrity, authorized download and any advertised preview; unsupported formats are explicit; no silent same-name overwrite or unlimited-storage claim.

<a id="gti-b44"></a>

### GTI-B44 — Leave availability, reminders and account restrictions

**OPEN · BUSINESS_POLICY · P2 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D15](./GTI_Standard_Template_Decisions.md#gti-d15). Prerequisites: [GTI-B29](#gti-b29). Extends: [A5](#adapter-a5), [A8](#adapter-a8).

**Existing gaps:** [PKG/scheduling](./GTI_Packaging_Blueprint_v1.json#L2906).

**Source:** [P0355](./GTI_FLUX_Project_Process_Templates_Source.json#L1773), [P0356](./GTI_FLUX_Project_Process_Templates_Source.json#L1778), [P0400](./GTI_FLUX_Project_Process_Templates_Source.json#L1998), [P0401](./GTI_FLUX_Project_Process_Templates_Source.json#L2003), [P0402](./GTI_FLUX_Project_Process_Templates_Source.json#L2008), [P0403](./GTI_FLUX_Project_Process_Templates_Source.json#L2013), [P0404](./GTI_FLUX_Project_Process_Templates_Source.json#L2018), [P0405](./GTI_FLUX_Project_Process_Templates_Source.json#L2023), [P0406](./GTI_FLUX_Project_Process_Templates_Source.json#L2028).

**Expected:** Source absence planning warns about unavailable participants and includes recurring reminders, forced response and temporary deputy rights. **Current:** No absence scheduling service or approved deputy/account-lockout model exists; V2 role authority remains unchanged. **Missing enforcement/decision:** Availability/reminder data is absent; forced lockout and delegated Director rights lack approved V2 policy.

**Approach:** Consider availability as a narrow scheduling adapter; treat forced account restrictions/deputy authority as separate explicit policy proposals under V04, never routine calendar behavior. **Acceptance:** No leave record grants Director rights or locks an account without approved authorization policy; any future availability warnings use real bounded dates and do not silently reassign approvals.

<a id="gti-b45"></a>

### GTI-B45 — Exhibition event detail and CRM scope

**OPEN · BUSINESS_POLICY · P2 · template-specific.** Affects EXH. Decisions: [GTI-D08](./GTI_Standard_Template_Decisions.md#gti-d08), [GTI-D18](./GTI_Standard_Template_Decisions.md#gti-d18). Prerequisites: [GTI-B05](#gti-b05). Extends: [A5](#adapter-a5), [A6](#adapter-a6).

**Existing gaps:** [EXH/cost-and-event-records](./GTI_Exhibition_Stand_Blueprint_v1.json#L2619).

**Source:** [P0168](./GTI_FLUX_Project_Process_Templates_Source.json#L838), [P0180](./GTI_FLUX_Project_Process_Templates_Source.json#L898), [P0182](./GTI_FLUX_Project_Process_Templates_Source.json#L908).

**Expected:** Retain leads, meetings, photos and event issues for comparison with objectives and next-year lessons. **Current:** Numeric lead/meeting counts, notes, issue summaries and photo documentation are implemented. **Missing enforcement/decision:** No individual lead/meeting records or CRM integration; source does not explicitly require a CRM product or per-person entities.

**Approach:** Ask whether aggregate evidence satisfies the official event-report requirement. Add typed event records only if GTI requires that detail; external CRM is optional. **Acceptance:** GTI explicitly accepts aggregate coverage or defines record-level completeness/ownership; this reported gap is reconciled openly, not silently treated as an obligatory CRM build or approved deferral.

<a id="gti-b46"></a>

### GTI-B46 — Production operations and release evidence

**OPEN · PRODUCTION_READINESS · P2 · shared.** Affects PKG POSM RTL EXH DIG. Decisions: [GTI-D10](./GTI_Standard_Template_Decisions.md#gti-d10), [GTI-D20](./GTI_Standard_Template_Decisions.md#gti-d20). Prerequisites: [GTI-B02](#gti-b02). Extends: [A5](#adapter-a5), [A6](#adapter-a6), [A8](#adapter-a8), [A9](#adapter-a9).

**Existing gaps:** Additional boundary from [Phase 4.4 activation](../../src/lib/runtime-integration/PHASE-4.4-ACTIVATION.md#scope-and-stop-point) and Phase 5.3 operational exclusions; not counted among the original 65.

**Source:** No added business paragraph; operational evidence boundary documented in the activation report.

**Expected:** Any later real rollout needs separately authorized operational and release verification for its agreed scope. **Current:** Phase 4.4 development activation and Phase 5 isolated synthetic acceptance are recorded; no formal production QA occurred. **Missing enforcement/decision:** Real storage/IAM/retention, recovery execution, operational delivery/monitoring and production-scale acceptance are not certified by these tests.

**Approach:** Use the existing release controls for a separately approved, scoped operational review once release scope and adapters are stable; do not reopen development tests without a change. **Acceptance:** Explicit release authority accepts real-environment evidence and limitations; no synthetic result is presented as production/vendor/legal certification. This is an additional release boundary, not one of the original 65 entries.

## V2 precedence records

These are reconciliations of approved current contracts and the Phase 4.4 activation, not new waivers. Evidence: [source conflict map](./GTI_FLUX_Source_to_V2_Map.md#source-conflicts-and-v2-precedence), [activation](../../src/lib/runtime-integration/PHASE-4.4-ACTIVATION.md) and the adapter contracts below. All retain the approved V2 behavior now.

<a id="gti-v01"></a>

### GTI-V01 — Business roles, creation and independent authority

**SUPERSEDED_BY_V2 · BUSINESS_POLICY · shared · P0 precedence retained.** Affects PKG POSM RTL EXH DIG. Extant contracts: [A3](#adapter-a3), [A4](#adapter-a4), [A5](#adapter-a5).

**Source:** [P0010](./GTI_FLUX_Project_Process_Templates_Source.json#L48), [P0011](./GTI_FLUX_Project_Process_Templates_Source.json#L53), [P0012](./GTI_FLUX_Project_Process_Templates_Source.json#L58), [P0013](./GTI_FLUX_Project_Process_Templates_Source.json#L63), [P0014](./GTI_FLUX_Project_Process_Templates_Source.json#L68), [P0015](./GTI_FLUX_Project_Process_Templates_Source.json#L73), [P0016](./GTI_FLUX_Project_Process_Templates_Source.json#L78), [P0017](./GTI_FLUX_Project_Process_Templates_Source.json#L83), [P0018](./GTI_FLUX_Project_Process_Templates_Source.json#L88), [P0019](./GTI_FLUX_Project_Process_Templates_Source.json#L93), [P0020](./GTI_FLUX_Project_Process_Templates_Source.json#L98), [P0021](./GTI_FLUX_Project_Process_Templates_Source.json#L103), [P0022](./GTI_FLUX_Project_Process_Templates_Source.json#L108), [P0023](./GTI_FLUX_Project_Process_Templates_Source.json#L113), [P0024](./GTI_FLUX_Project_Process_Templates_Source.json#L118), [P0025](./GTI_FLUX_Project_Process_Templates_Source.json#L123), [P0026](./GTI_FLUX_Project_Process_Templates_Source.json#L128), [P0027](./GTI_FLUX_Project_Process_Templates_Source.json#L133), [P0028](./GTI_FLUX_Project_Process_Templates_Source.json#L138), [P0029](./GTI_FLUX_Project_Process_Templates_Source.json#L143), [P0030](./GTI_FLUX_Project_Process_Templates_Source.json#L148), [P0032](./GTI_FLUX_Project_Process_Templates_Source.json#L158), [P0033](./GTI_FLUX_Project_Process_Templates_Source.json#L163), [P0034](./GTI_FLUX_Project_Process_Templates_Source.json#L168), [P0307](./GTI_FLUX_Project_Process_Templates_Source.json#L1533). **Existing gaps:** [PKG/external-approval-chain](./GTI_Packaging_Blueprint_v1.json#L2806).

**Expected source versus current V2:** Five V2 business roles and separate technical administration prevail; relationship labels create no Collaborator/vendor/CEO/Purchase role. Director oversight is global without fabricated membership. JPM creation requires actual Director approval and an eligible SPM Co-owner; SPM uses approved executable versions. SPM draft authoring is not official master-template designation. Product Card Owner review retains V2 contributor/requester independence.

**Missing/approach:** no restoration of the superseded authority is proposed; open residual capabilities are separately registered. **Acceptance:** current authorization, independent reviews, explicit transitions and immutable pins remain unchanged. **Decision prerequisite:** none to preserve current V2; any proposed policy change needs actual Director approval before implementation.

<a id="gti-v02"></a>

### GTI-V02 — Concept purposes use Universal Tasker

**SUPERSEDED_BY_V2 · BUSINESS_POLICY · shared · P0 precedence retained.** Affects PKG POSM RTL EXH DIG. Extant contracts: [A1](#adapter-a1), [A7](#adapter-a7).

**Source:** [P0085](./GTI_FLUX_Project_Process_Templates_Source.json#L423), [P0089](./GTI_FLUX_Project_Process_Templates_Source.json#L443), [P0090](./GTI_FLUX_Project_Process_Templates_Source.json#L448), [P0093](./GTI_FLUX_Project_Process_Templates_Source.json#L463), [P0315](./GTI_FLUX_Project_Process_Templates_Source.json#L1573). **Existing gaps:** [PKG/concept-gates](./GTI_Packaging_Blueprint_v1.json#L2788); [RTL/concept-task-gates](./GTI_Retail_Display_Blueprint_v1.json#L2355).

**Expected source versus current V2:** Initial and Final Concept are real Tasker types, not mandatory legacy stages. Packaging retains eight source purposes through six runtime stages plus concepts. Exact inspiration/review works, but required concept counts, rounds and stage bindings stay OPEN in B14/B15; no skip is inferred.

**Missing/approach:** no restoration of the superseded authority is proposed; open residual capabilities are separately registered. **Acceptance:** current authorization, independent reviews, explicit transitions and immutable pins remain unchanged. **Decision prerequisite:** none to preserve current V2; any proposed policy change needs actual Director approval before implementation.

<a id="gti-v03"></a>

### GTI-V03 — Explicit completion replaces automatic close/archive

**SUPERSEDED_BY_V2 · BUSINESS_POLICY · shared · P0 precedence retained.** Affects PKG POSM RTL EXH DIG. Extant contracts: [A5](#adapter-a5), [A9](#adapter-a9), [A10](#adapter-a10).

**Source:** [P0056](./GTI_FLUX_Project_Process_Templates_Source.json#L278), [P0121](./GTI_FLUX_Project_Process_Templates_Source.json#L603), [P0183](./GTI_FLUX_Project_Process_Templates_Source.json#L913), [P0185](./GTI_FLUX_Project_Process_Templates_Source.json#L923), [P0201](./GTI_FLUX_Project_Process_Templates_Source.json#L1003), [P0202](./GTI_FLUX_Project_Process_Templates_Source.json#L1008), [P0340](./GTI_FLUX_Project_Process_Templates_Source.json#L1698), [P0390](./GTI_FLUX_Project_Process_Templates_Source.json#L1948), [P0398](./GTI_FLUX_Project_Process_Templates_Source.json#L1988). **Existing gaps:** [PKG/completion](./GTI_Packaging_Blueprint_v1.json#L2927); [POSM/completion-governance](./GTI_POSM_Blueprint_v1.json#L2467); [RTL/completion-governance](./GTI_Retail_Display_Blueprint_v1.json#L2445); [EXH/completion-governance](./GTI_Exhibition_Stand_Blueprint_v1.json#L2662); [DIG/maintenance-closure-policy](./GTI_Digital_Blueprint_v1.json#L2374).

**Expected source versus current V2:** Last-stage completion leaves ACTIVE. Final closure requires explicit Director document policy, required reviewed proof, actual Owner request and a separate Director final decision. COMPLETED history is immutable. Only the automatic transition is superseded: ratings (B32), Archive publication (B34), report reuse (B35) and Digital maintenance (B38) remain OPEN.

**Missing/approach:** no restoration of the superseded authority is proposed; open residual capabilities are separately registered. **Acceptance:** current authorization, independent reviews, explicit transitions and immutable pins remain unchanged. **Decision prerequisite:** none to preserve current V2; any proposed policy change needs actual Director approval before implementation.

<a id="gti-v04"></a>

### GTI-V04 — No gate override, automatic skip or delegated Director rights

**SUPERSEDED_BY_V2 · BUSINESS_POLICY · shared · P0 precedence retained.** Affects PKG POSM RTL EXH DIG. Extant contracts: [A1](#adapter-a1), [A2](#adapter-a2), [A3](#adapter-a3).

**Source:** [P0011](./GTI_FLUX_Project_Process_Templates_Source.json#L53), [P0037](./GTI_FLUX_Project_Process_Templates_Source.json#L183), [P0038](./GTI_FLUX_Project_Process_Templates_Source.json#L188), [P0060](./GTI_FLUX_Project_Process_Templates_Source.json#L298), [P0089](./GTI_FLUX_Project_Process_Templates_Source.json#L443), [P0093](./GTI_FLUX_Project_Process_Templates_Source.json#L463), [P0128](./GTI_FLUX_Project_Process_Templates_Source.json#L638), [P0327](./GTI_FLUX_Project_Process_Templates_Source.json#L1633), [P0356](./GTI_FLUX_Project_Process_Templates_Source.json#L1778), [P0405](./GTI_FLUX_Project_Process_Templates_Source.json#L2023). **Existing gaps:** [PKG/concept-gates](./GTI_Packaging_Blueprint_v1.json#L2788); [PKG/scheduling](./GTI_Packaging_Blueprint_v1.json#L2906); [PKG/completion](./GTI_Packaging_Blueprint_v1.json#L2927); [POSM/material-applicability-skip](./GTI_POSM_Blueprint_v1.json#L2325).

**Expected source versus current V2:** Current V2 has no Owner/Co-owner gate override, stage skip or leave deputy grant. The older source cannot authorize one. A future Director-approved policy change must be separately specified (B04/B44); this precedence is not a permanent business waiver of missing source purposes.

**Missing/approach:** no restoration of the superseded authority is proposed; open residual capabilities are separately registered. **Acceptance:** current authorization, independent reviews, explicit transitions and immutable pins remain unchanged. **Decision prerequisite:** none to preserve current V2; any proposed policy change needs actual Director approval before implementation.

<a id="gti-v05"></a>

### GTI-V05 — Task lifecycle, visibility and application authority

**SUPERSEDED_BY_V2 · BUSINESS_POLICY · shared · P0 precedence retained.** Affects PKG POSM RTL EXH DIG. Extant contracts: [A5](#adapter-a5), [A7](#adapter-a7).

**Source:** [P0279](./GTI_FLUX_Project_Process_Templates_Source.json#L1393), [P0280](./GTI_FLUX_Project_Process_Templates_Source.json#L1398), [P0300](./GTI_FLUX_Project_Process_Templates_Source.json#L1498), [P0310](./GTI_FLUX_Project_Process_Templates_Source.json#L1548), [P0312](./GTI_FLUX_Project_Process_Templates_Source.json#L1558), [P0316](./GTI_FLUX_Project_Process_Templates_Source.json#L1578), [P0317](./GTI_FLUX_Project_Process_Templates_Source.json#L1583), [P0318](./GTI_FLUX_Project_Process_Templates_Source.json#L1588), [P0322](./GTI_FLUX_Project_Process_Templates_Source.json#L1608), [P0323](./GTI_FLUX_Project_Process_Templates_Source.json#L1613), [P0324](./GTI_FLUX_Project_Process_Templates_Source.json#L1618), [P0327](./GTI_FLUX_Project_Process_Templates_Source.json#L1633), [P0328](./GTI_FLUX_Project_Process_Templates_Source.json#L1638), [P0330](./GTI_FLUX_Project_Process_Templates_Source.json#L1648). **Existing gaps:** [PKG/scheduling](./GTI_Packaging_Blueprint_v1.json#L2906).

**Expected source versus current V2:** The six V2 Tasker types, explicit independent acceptance and current resource authorization prevail. Task completion is not automatic field/file application, stage approval or project closure; existing deliverable adapters explicitly apply accepted outputs. Project management alone does not confer all task visibility; no source forwarding or automatic close/move policy is imported. Future planned/automatic tasks stay B30.

**Missing/approach:** no restoration of the superseded authority is proposed; open residual capabilities are separately registered. **Acceptance:** current authorization, independent reviews, explicit transitions and immutable pins remain unchanged. **Decision prerequisite:** none to preserve current V2; any proposed policy change needs actual Director approval before implementation.

## Exact reconciliation of all 65 original entries

Each row is one original gap, with its original paragraph list unchanged and every resolution target explicit. Multiple target IDs split mixed requirements; multiple rows pointing to one ID identify shared work. Original classification and full missing/pilot text remain in the linked snapshot. No row is deleted because one clause is superseded.

| Original template/gap | Original paragraphs | Consolidated resolutions |
| --- | --- | --- |
| [PKG/requiredness](./GTI_Packaging_Blueprint_v1.json#L2761) | P0077, P0079, P0096, P0098, P0518 | [GTI-B01](#gti-b01), [GTI-B02](#gti-b02), [GTI-B43](#gti-b43) |
| [PKG/repeating-records](./GTI_Packaging_Blueprint_v1.json#L2774) | P0077, P0082, P0096, P0108, P0112, P0117 | [GTI-B03](#gti-b03), [GTI-B05](#gti-b05), [GTI-B06](#gti-b06) |
| [PKG/concept-gates](./GTI_Packaging_Blueprint_v1.json#L2788) | P0085, P0086, P0087, P0088, P0089, P0090, P0091, P0092, P0093, P0327 | [GTI-B04](#gti-b04), [GTI-B14](#gti-b14), [GTI-B15](#gti-b15), [GTI-V02](#gti-v02), [GTI-V04](#gti-v04) |
| [PKG/external-approval-chain](./GTI_Packaging_Blueprint_v1.json#L2806) | P0102, P0103, P0104, P0105, P0106 | [GTI-B22](#gti-b22), [GTI-V01](#gti-v01) |
| [PKG/vendor-dispatch](./GTI_Packaging_Blueprint_v1.json#L2819) | P0083, P0084, P0107, P0108, P0343, P0344, P0345, P0346, P0350, P0351, P0352, P0353, P0354, P0355, P0359, P0362, P0367, P0371, P0390 | [GTI-B16](#gti-b16), [GTI-B17](#gti-b17), [GTI-B18](#gti-b18), [GTI-B19](#gti-b19), [GTI-B20](#gti-b20), [GTI-B24](#gti-b24), [GTI-B32](#gti-b32) |
| [PKG/regulatory-validation](./GTI_Packaging_Blueprint_v1.json#L2846) | P0082, P0096, P0459, P0466, P0509, P0510, P0511, P0512, P0513, P0514, P0515, P0516 | [GTI-B06](#gti-b06), [GTI-B23](#gti-b23), [GTI-B27](#gti-b27), [GTI-B28](#gti-b28) |
| [PKG/toolio](./GTI_Packaging_Blueprint_v1.json#L2866) | P0117, P0121 | [GTI-B41](#gti-b41) |
| [PKG/toolkit-controls](./GTI_Packaging_Blueprint_v1.json#L2876) | P0118, P0119, P0120, P0524 | [GTI-B33](#gti-b33), [GTI-B42](#gti-b42) |
| [PKG/documents](./GTI_Packaging_Blueprint_v1.json#L2888) | P0066, P0107, P0408, P0424, P0425, P0426, P0466, P0498, P0505, P0521 | [GTI-B20](#gti-b20), [GTI-B23](#gti-b23), [GTI-B24](#gti-b24), [GTI-B25](#gti-b25) |
| [PKG/scheduling](./GTI_Packaging_Blueprint_v1.json#L2906) | P0062, P0064, P0065, P0312, P0331, P0332, P0397, P0403, P0404, P0405, P0406, P0519, P0520 | [GTI-B14](#gti-b14), [GTI-B29](#gti-b29), [GTI-B30](#gti-b30), [GTI-B31](#gti-b31), [GTI-B44](#gti-b44), [GTI-V04](#gti-v04), [GTI-V05](#gti-v05) |
| [PKG/completion](./GTI_Packaging_Blueprint_v1.json#L2927) | P0056, P0121, P0340, P0390, P0398 | [GTI-B32](#gti-b32), [GTI-B34](#gti-b34), [GTI-V03](#gti-v03), [GTI-V04](#gti-v04) |
| [POSM/candidate-decisions](./GTI_POSM_Blueprint_v1.json#L2311) | P0125, P0126, P0133, P0137, P0518, P0523 | [GTI-B01](#gti-b01), [GTI-B02](#gti-b02), [GTI-B15](#gti-b15), [GTI-B43](#gti-b43) |
| [POSM/material-applicability-skip](./GTI_POSM_Blueprint_v1.json#L2325) | P0123, P0128, P0129, P0130 | [GTI-B03](#gti-b03), [GTI-B04](#gti-b04), [GTI-V04](#gti-v04) |
| [POSM/structured-offers](./GTI_POSM_Blueprint_v1.json#L2337) | P0129, P0130, P0418 | [GTI-B05](#gti-b05), [GTI-B17](#gti-b17) |
| [POSM/vendor-orders](./GTI_POSM_Blueprint_v1.json#L2348) | P0129, P0130, P0139, P0141, P0142, P0522 | [GTI-B16](#gti-b16), [GTI-B19](#gti-b19), [GTI-B24](#gti-b24), [GTI-B31](#gti-b31) |
| [POSM/concept-task-gates](./GTI_POSM_Blueprint_v1.json#L2362) | P0131, P0132, P0133, P0327 | [GTI-B07](#gti-b07), [GTI-B14](#gti-b14), [GTI-B15](#gti-b15) |
| [POSM/format-size-outlet-records](./GTI_POSM_Blueprint_v1.json#L2374) | P0125, P0135, P0136 | [GTI-B05](#gti-b05), [GTI-B07](#gti-b07) |
| [POSM/outlet-photo-count](./GTI_POSM_Blueprint_v1.json#L2385) | P0144 | [GTI-B07](#gti-b07) |
| [POSM/physical-production-quality](./GTI_POSM_Blueprint_v1.json#L2394) | P0139, P0140, P0142, P0145 | [GTI-B26](#gti-b26) |
| [POSM/inventory-distribution](./GTI_POSM_Blueprint_v1.json#L2406) | P0144, P0145 | [GTI-B36](#gti-b36) |
| [POSM/artwork-regulatory-validation](./GTI_POSM_Blueprint_v1.json#L2416) | P0128, P0135, P0137, P0442, P0509, P0510, P0511, P0512, P0513, P0514, P0515, P0516 | [GTI-B27](#gti-b27), [GTI-B28](#gti-b28) |
| [POSM/documents-signatures](./GTI_POSM_Blueprint_v1.json#L2436) | P0126, P0146, P0408, P0424, P0426, P0429, P0432, P0446, P0447, P0505, P0521 | [GTI-B20](#gti-b20), [GTI-B23](#gti-b23), [GTI-B24](#gti-b24), [GTI-B25](#gti-b25) |
| [POSM/planning-budget-tasks](./GTI_POSM_Blueprint_v1.json#L2455) | P0125, P0443, P0519, P0520 | [GTI-B29](#gti-b29), [GTI-B30](#gti-b30), [GTI-B31](#gti-b31) |
| [POSM/completion-governance](./GTI_POSM_Blueprint_v1.json#L2467) | P0056, P0146, P0340, P0398 | [GTI-B25](#gti-b25), [GTI-B34](#gti-b34), [GTI-V03](#gti-v03) |
| [RTL/candidate-decisions](./GTI_Retail_Display_Blueprint_v1.json#L2309) | P0150, P0155, P0157, P0159, P0518, P0523 | [GTI-B01](#gti-b01), [GTI-B02](#gti-b02), [GTI-B15](#gti-b15), [GTI-B43](#gti-b43) |
| [RTL/survey-coverage-sample](./GTI_Retail_Display_Blueprint_v1.json#L2323) | P0152, P0153 | [GTI-B05](#gti-b05), [GTI-B09](#gti-b09) |
| [RTL/component-production-units](./GTI_Retail_Display_Blueprint_v1.json#L2333) | P0148, P0159 | [GTI-B05](#gti-b05), [GTI-B08](#gti-b08) |
| [RTL/outlet-installation-issue-gate](./GTI_Retail_Display_Blueprint_v1.json#L2343) | P0148, P0163, P0164, P0327 | [GTI-B10](#gti-b10), [GTI-B14](#gti-b14) |
| [RTL/concept-task-gates](./GTI_Retail_Display_Blueprint_v1.json#L2355) | P0154, P0155, P0327, P0444 | [GTI-B14](#gti-b14), [GTI-B15](#gti-b15), [GTI-V02](#gti-v02) |
| [RTL/engineering-safety](./GTI_Retail_Display_Blueprint_v1.json#L2367) | P0150, P0157 | [GTI-B26](#gti-b26), [GTI-B27](#gti-b27) |
| [RTL/physical-prototype](./GTI_Retail_Display_Blueprint_v1.json#L2377) | P0160, P0161 | [GTI-B26](#gti-b26) |
| [RTL/vendor-production-dispatch](./GTI_Retail_Display_Blueprint_v1.json#L2387) | P0161, P0418, P0522 | [GTI-B16](#gti-b16), [GTI-B19](#gti-b19), [GTI-B22](#gti-b22), [GTI-B24](#gti-b24) |
| [RTL/large-format-preflight](./GTI_Retail_Display_Blueprint_v1.json#L2398) | P0159, P0509, P0510, P0511, P0512, P0513, P0514, P0515, P0516 | [GTI-B28](#gti-b28) |
| [RTL/documents-signatures](./GTI_Retail_Display_Blueprint_v1.json#L2415) | P0163, P0408, P0412, P0424, P0426, P0429, P0432, P0505, P0521 | [GTI-B20](#gti-b20), [GTI-B23](#gti-b23), [GTI-B24](#gti-b24), [GTI-B25](#gti-b25) |
| [RTL/scheduling-budget-service](./GTI_Retail_Display_Blueprint_v1.json#L2432) | P0150, P0163, P0443, P0519, P0520 | [GTI-B29](#gti-b29), [GTI-B30](#gti-b30), [GTI-B31](#gti-b31), [GTI-B40](#gti-b40) |
| [RTL/completion-governance](./GTI_Retail_Display_Blueprint_v1.json#L2445) | P0056, P0164, P0340, P0398 | [GTI-B10](#gti-b10), [GTI-B34](#gti-b34), [GTI-V03](#gti-v03) |
| [EXH/candidate-decisions](./GTI_Exhibition_Stand_Blueprint_v1.json#L2483) | P0168, P0180, P0183, P0518, P0523 | [GTI-B01](#gti-b01), [GTI-B02](#gti-b02), [GTI-B15](#gti-b15), [GTI-B43](#gti-b43) |
| [EXH/event-scheduling](./GTI_Exhibition_Stand_Blueprint_v1.json#L2496) | P0166, P0170, P0519 | [GTI-B05](#gti-b05), [GTI-B29](#gti-b29) |
| [EXH/historical-report-reuse](./GTI_Exhibition_Stand_Blueprint_v1.json#L2507) | P0170, P0183 | [GTI-B35](#gti-b35) |
| [EXH/structured-contractor-offers](./GTI_Exhibition_Stand_Blueprint_v1.json#L2517) | P0172, P0394 | [GTI-B05](#gti-b05), [GTI-B17](#gti-b17) |
| [EXH/vendor-communications-contracts](./GTI_Exhibition_Stand_Blueprint_v1.json#L2527) | P0172, P0343, P0344, P0345, P0346, P0384, P0395, P0522 | [GTI-B16](#gti-b16), [GTI-B19](#gti-b19), [GTI-B20](#gti-b20), [GTI-B24](#gti-b24), [GTI-B31](#gti-b31) |
| [EXH/concept-task-gates](./GTI_Exhibition_Stand_Blueprint_v1.json#L2543) | P0174, P0327 | [GTI-B14](#gti-b14), [GTI-B15](#gti-b15) |
| [EXH/external-organiser-approval](./GTI_Exhibition_Stand_Blueprint_v1.json#L2553) | P0174 | [GTI-B21](#gti-b21) |
| [EXH/linked-project-budgets](./GTI_Exhibition_Stand_Blueprint_v1.json#L2562) | P0166, P0176, P0399 | [GTI-B31](#gti-b31), [GTI-B33](#gti-b33) |
| [EXH/snag-task-binding](./GTI_Exhibition_Stand_Blueprint_v1.json#L2573) | P0178, P0327, P0520 | [GTI-B05](#gti-b05), [GTI-B11](#gti-b11), [GTI-B14](#gti-b14), [GTI-B30](#gti-b30) |
| [EXH/physical-stand-acceptance](./GTI_Exhibition_Stand_Blueprint_v1.json#L2584) | P0178, P0500, P0502, P0505, P0506 | [GTI-B25](#gti-b25), [GTI-B26](#gti-b26) |
| [EXH/reusable-stock](./GTI_Exhibition_Stand_Blueprint_v1.json#L2597) | P0182 | [GTI-B36](#gti-b36) |
| [EXH/vendor-ratings](./GTI_Exhibition_Stand_Blueprint_v1.json#L2606) | P0182, P0387, P0388, P0389, P0390 | [GTI-B32](#gti-b32) |
| [EXH/cost-and-event-records](./GTI_Exhibition_Stand_Blueprint_v1.json#L2619) | P0180, P0182, P0392, P0393, P0394, P0395, P0396, P0397, P0398, P0399 | [GTI-B31](#gti-b31), [GTI-B45](#gti-b45) |
| [EXH/documents-artwork](./GTI_Exhibition_Stand_Blueprint_v1.json#L2637) | P0176, P0408, P0412, P0418, P0424, P0426, P0429, P0432, P0509, P0510, P0511, P0512, P0513, P0514, P0515, P0516, P0521 | [GTI-B23](#gti-b23), [GTI-B24](#gti-b24), [GTI-B28](#gti-b28) |
| [EXH/completion-governance](./GTI_Exhibition_Stand_Blueprint_v1.json#L2662) | P0056, P0183, P0340, P0390, P0398 | [GTI-B01](#gti-b01), [GTI-B32](#gti-b32), [GTI-B34](#gti-b34), [GTI-B35](#gti-b35), [GTI-V03](#gti-v03) |
| [DIG/candidate-decisions](./GTI_Digital_Blueprint_v1.json#L2248) | P0187, P0189, P0197, P0200, P0518, P0523 | [GTI-B01](#gti-b01), [GTI-B02](#gti-b02), [GTI-B15](#gti-b15), [GTI-B43](#gti-b43) |
| [DIG/vendor-rfp-workflow](./GTI_Digital_Blueprint_v1.json#L2262) | P0189, P0343, P0344, P0345, P0346, P0384, P0418, P0522 | [GTI-B16](#gti-b16), [GTI-B17](#gti-b17), [GTI-B19](#gti-b19), [GTI-B20](#gti-b20), [GTI-B24](#gti-b24) |
| [DIG/ux-ui-approval-definitions](./GTI_Digital_Blueprint_v1.json#L2278) | P0191, P0193, P0444, P0448, P0518 | [GTI-B01](#gti-b01), [GTI-B15](#gti-b15) |
| [DIG/concept-task-gates](./GTI_Digital_Blueprint_v1.json#L2291) | P0191, P0193, P0327 | [GTI-B14](#gti-b14), [GTI-B15](#gti-b15) |
| [DIG/security-compliance-certification](./GTI_Digital_Blueprint_v1.json#L2302) | P0187, P0195 | [GTI-B27](#gti-b27) |
| [DIG/credential-vault-access-transfer](./GTI_Digital_Blueprint_v1.json#L2312) | P0195, P0199 | [GTI-B37](#gti-b37) |
| [DIG/digital-asset-preflight](./GTI_Digital_Blueprint_v1.json#L2322) | P0195, P0516 | [GTI-B28](#gti-b28) |
| [DIG/repeatable-uat-rounds](./GTI_Digital_Blueprint_v1.json#L2332) | P0185, P0197 | [GTI-B05](#gti-b05), [GTI-B12](#gti-b12) |
| [DIG/bug-task-blocking](./GTI_Digital_Blueprint_v1.json#L2342) | P0197, P0327, P0520 | [GTI-B05](#gti-b05), [GTI-B13](#gti-b13), [GTI-B14](#gti-b14), [GTI-B30](#gti-b30) |
| [DIG/deployment-go-live](./GTI_Digital_Blueprint_v1.json#L2353) | P0199, P0200 | [GTI-B25](#gti-b25), [GTI-B37](#gti-b37), [GTI-B39](#gti-b39) |
| [DIG/support-scheduling](./GTI_Digital_Blueprint_v1.json#L2363) | P0199, P0519, P0520 | [GTI-B29](#gti-b29), [GTI-B30](#gti-b30), [GTI-B40](#gti-b40) |
| [DIG/maintenance-closure-policy](./GTI_Digital_Blueprint_v1.json#L2374) | P0185, P0201, P0202, P0056 | [GTI-B38](#gti-b38), [GTI-V03](#gti-v03) |
| [DIG/maintenance-cost-ledger](./GTI_Digital_Blueprint_v1.json#L2386) | P0202, P0392, P0393, P0394, P0395, P0396, P0397, P0398 | [GTI-B31](#gti-b31) |
| [DIG/documents-signatures](./GTI_Digital_Blueprint_v1.json#L2402) | P0200, P0408, P0412, P0418, P0424, P0426, P0429, P0432, P0505, P0506, P0521 | [GTI-B20](#gti-b20), [GTI-B23](#gti-b23), [GTI-B24](#gti-b24), [GTI-B25](#gti-b25) |

## Existing contracts to extend

Adapters below are real implementation seams, not newly added services. Proposed new types need matching parser, authorization, UI/preview, server evaluation, persistence invariants, audit and backward-compatible version handling. Preserve all existing v1 definitions and runtime pins; new published versions affect future projects only.

<a id="adapter-a1"></a>

### A1 — Stage Builder schema, parser and validation

[contracts.ts](../../src/lib/stage-builder/contracts.ts). FieldDefinition, Capability, Gate, WorkflowDefinition, parseDefinition and validateDefinition; extend with bounded discriminated types and a reviewed future schema revision. Do not inject expressions or silently reinterpret v1 pins.

<a id="adapter-a2"></a>

### A2 — Runtime evidence, commands and gates

[contracts.ts](../../src/lib/stage-runtime/contracts.ts). Values, Checks, validateField, evaluateGates and parseCommand; apply through runtimeStageCommandTx in stage-runtime/service.ts and StageData in stage-runtime/data.ts. Preserve transaction locks, evidence revisions, file rechecks and immutable completed stages.

<a id="adapter-a3"></a>

### A3 — Typed Approval Engine and runtime eligibility

[engine.ts](../../src/lib/approvals/engine.ts). decideTypedApproval with its NativeDecisionAdapter subject allowlist, openRuntimeApproval in approvals/runtime-stage.ts and stage-runtime/data.ts; Stage Builder approverTypes is restricted to Director/SPM/Owner/Co-owner. New domain subjects need explicit eligibility, evidence hashes and stale-decision rejection, not invented accounts.

<a id="adapter-a4"></a>

### A4 — Draft/publication governance and candidate provenance

[publication.ts](../../src/lib/stage-builder/publication.ts). createDraft/reviseDraft in stage-builder/service.ts, submitWorkflowDraft/decideWorkflowPublication, immutable PublishedWorkflowVersion, configurationHash and publication policies. standard-templates/contracts.ts remains the candidate wrapper; its OFFICIAL_STANDARD validation purpose is not an implemented official designation.

<a id="adapter-a5"></a>

### A5 — RuntimeProject identity, creation and authorization

[instantiate.ts](../../src/lib/runtime-integration/instantiate.ts). instantiateRuntimeProject pins publishedVersionId/versionNumber/definitionHash; creation.ts enforces SPM/JPM governance and authorization/stage-runtime-policies.ts controls real managers/global Director. Extend typed runtime relations, never counterfeit legacy Project rows.

<a id="adapter-a6"></a>

### A6 — Shared File identity, runtime files and provenance

[contracts.ts](../../src/lib/files/contracts.ts). SharedFileVersion/SharedFileReference/SharedFileProvenance; captureFileIntegrity, stage-runtime/files.ts and files/access.ts retain exact sealed observations and reauthorized access. File metadata is not content preflight, legal signing or physical proof.

<a id="adapter-a7"></a>

### A7 — Universal Tasker targets, concepts and Sisters

[applications.ts](../../src/lib/tasker/applications.ts). prepareApplication/applyApplication/completeApplication, UniversalTaskApplication.state=APPLIED, runtime-targets.ts authorizedRuntimeTarget, runtime-context.ts, concepts.ts exact inspiration and families.ts/sister-contracts.ts. Tasker service acceptance must remain separate from stage/project approval.

<a id="adapter-a8"></a>

### A8 — Authorized transactional events and external adapters

[producer.ts](../../src/lib/events/producer.ts). Shared event/outbox producer and dispatcher with subject-specific Approval Engine adapters. Durable outbox is not actual delivery. Any worker, token, vendor, vault or provider adapter needs typed contracts, idempotency, revocation and real provenance.

<a id="adapter-a9"></a>

### A9 — Explicit completion policy and final decision

[contracts.ts](../../src/lib/runtime-completion/contracts.ts). documentCategories/documentRequirements and completionCommand; runtime-completion/service.ts runtimeCompletionCommand checks policy, exact proof, actual Owner request and Director decision. New prerequisites cannot conflate business acceptance with this final governance.

<a id="adapter-a10"></a>

### A10 — Existing Archive authorization boundary

[archive-policies.ts](../../src/lib/authorization/archive-policies.ts). Native archive rules/transactions and files/access.ts; RuntimeProject needs a genuine typed publication/retrieval adapter. Existing Archive/Library authorization remains authoritative; no automatic publication is inferred.

## Shared implementation groups and proposed Phase 6–8 order

| Work group | Exact scope and templates | Existing contracts | Proposed order |
| --- | --- | --- | --- |
| Conditional workflows | B03/B04: POSM material, Packaging applicability/Direct-Pitch, Retail sampling. No scripts or implicit skips. | A1/A2/A3 | After D01/D03/D04/D06; Phase 6 |
| Repeatable records | B05 foundation; B06 Packaging units, B07 POSM sizes/outlets, B08/B09/B10 Retail, B11 Exhibition snags, B12/B13 Digital UAT; B17 offers and B29 milestones. Domain acceptance remains separate. | A1/A2/A5/A6 | Typed common identity first, then one domain at a time; Phase 6 |
| Task-to-stage | B14 common exact task/application binding; B15 criteria; B10/B11/B13 distinct issue rules. | A1/A2/A7 | First bounded Phase 6 package after decisions |
| Vendors and external work | B16 status; B17 offers; B18 pitch; B19 exact dispatch; B20 external identity; B21 organiser; B22 stakeholder chain. All five use vendor foundations; organiser unique to EXH. | A3/A5/A6/A8 | Vendor authority and document identity before any delivery; Phase 7 |
| Documents and artwork | B23 generation; B24 legal/signature guard; B25 bilateral protocols; B26 physical acceptance; B27 qualified compliance; B28 per-version preflight. All five document/file profiles; physical adapter excludes DIG. | A1/A2/A3/A6 | Counsel/profile decisions first; source records before generated documents; Phase 7–8 |
| Schedule and finance | B29 dates; B30 operational tasks/reminders; B31 ledger/access; B32 ratings. All five, with fixed EXH milestones and ongoing DIG costs kept distinct. | A1/A2/A3/A5/A7/A8/A9 | Schedule records before automation; financial access before amounts and dispatch; Phase 7–8 |
| Related work and closeout | B33 links; B34 Archive; B35 annual reports; B36 stock; B40 warranty/support. | A5/A6/A7/A9/A10 | Identity/access first, then each domain adapter; Phase 8 |
| Unique digital/commercialization | B37 secure access, B38 maintenance decision, B39 release evidence (DIG); B41 Toolio and B42 Toolkit (PKG); B45 event detail (EXH). | A2/A3/A5/A6/A7/A8/A9 | Policy now; implement only approved scope after shared prerequisites |
| File/operational release | B43 support envelope and B46 real operational evidence. | A1/A5/A6/A8/A9 | Decide envelope early; real validation only with separately authorized rollout |

**Before implementation:** resolve P0 scope/authority decisions; use real named GTI decisions to narrow requirements, not an agent-created waiver. Some external/financial work may be excluded from an agreed initial official scope only through explicit approved dispositions. The current register has none.

**Recommended first Phase 6 package — required Tasker-to-stage binding (B14).** After D01/D03 and applicable creative criteria are approved, implement a small Gate union extension and server adapter binding exact runtime task IDs and accepted output/application evidence. Start with one approved concept/file/data scenario; preserve the original five v1 snapshots and publish only future reviewed revisions. Acceptance must cover cross-project/wrong-stage references, stale evidence, role revocation, failed versus APPLIED deliverables, closed versus accepted tasks, exact inspiration, immutable history, explicit stage completion and unchanged final completion. No arbitrary scripts, automatic tasks, vendor dispatch or official designation belongs in this first slice. A later taskgate-only package does not resolve all source blockers.

**Phase 6 proposal:** finish bounded conditional and repeatable-record foundations after the first slice. **Phase 7 proposal:** typed document/legal/vendor/offer/approval adapters and financial visibility, followed by authorized communications only when external identity and eligibility are ready. **Phase 8 proposal:** domain-specific physical/UAT/installation/support/closeout acceptance, Archive/report reuse, approved Toolio/Toolkit/Digital integrations, then designation and separately authorized operational release review. These are proposed dependency buckets, not a change to an approved roadmap or work started now. Resolve cycles at policy/contract design time; implement prerequisite adapters before consuming gates. No time estimates are asserted.
