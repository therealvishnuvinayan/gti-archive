# GTI standard-template decisions — Phase 5.4

Review date: **23 October 2026**. **20 OPEN decisions; none approved by this report.** These questions go to the named GTI authority; recommendations are proposals. Internal development sign-off does not decide them.

Start with D01–D10 and D12/D14: requiredness, authority, stage proof, conditional policy, template-specific acceptance, designation and rollout scope. Legal (D11), finance (D16) and secure handover (D19) are prerequisites to their affected official workflows. D15/D17/D18/D20 define later capability and operational boundaries.

The [blocker register](./GTI_Standard_Template_Blockers.md) contains the implementation/acceptance details. [Phase 5.4](../../src/lib/standard-templates/PHASE-5.4.md) contains the designation proposal. Paragraph references point to the immutable extraction; original page numbers remain unverified.

## Decision records

<a id="gti-d01"></a>

### GTI-D01 — Mandatory field/file matrix

**OPEN · P0 · Required GTI decision.** Affects PKG POSM RTL EXH DIG. Proposed decision owner: Director with template owners.

**Question:** Which exact fields, files, units, bounds and checklist evidence are required, optional or conditional for each stage?

**Recommended starting position:** Review the five pinned snapshots line by line; approve a versioned matrix and explicitly identify source-silent choices. Do not treat the pilot defaults as already approved.

**Source:** [P0040](./GTI_FLUX_Project_Process_Templates_Source.json#L198), [P0077](./GTI_FLUX_Project_Process_Templates_Source.json#L383), [P0098](./GTI_FLUX_Project_Process_Templates_Source.json#L488), [P0126](./GTI_FLUX_Project_Process_Templates_Source.json#L628), [P0150](./GTI_FLUX_Project_Process_Templates_Source.json#L748), [P0168](./GTI_FLUX_Project_Process_Templates_Source.json#L838), [P0187](./GTI_FLUX_Project_Process_Templates_Source.json#L933), [P0518](./GTI_FLUX_Project_Process_Templates_Source.json#L2588), [P0523](./GTI_FLUX_Project_Process_Templates_Source.json#L2613). **Resolves prerequisites for:** [GTI-B01](./GTI_Standard_Template_Blockers.md#gti-b01), [GTI-B03](./GTI_Standard_Template_Blockers.md#gti-b03), [GTI-B05](./GTI_Standard_Template_Blockers.md#gti-b05), [GTI-B06](./GTI_Standard_Template_Blockers.md#gti-b06), [GTI-B07](./GTI_Standard_Template_Blockers.md#gti-b07), [GTI-B08](./GTI_Standard_Template_Blockers.md#gti-b08).

<a id="gti-d02"></a>

### GTI-D02 — Review routes and independence

**OPEN · P0 · Required GTI decision.** Affects PKG POSM RTL EXH DIG. Proposed decision owner: Director with process owners.

**Question:** Who approves each business purpose, and who contributes its evidence without violating V2 independence?

**Recommended starting position:** Name supported role/relationship eligibility and independent contributors. Resolve Purchase/CEO/all-Executor identities separately; do not add roles or relax independence merely to mirror source labels.

**Source:** [P0063](./GTI_FLUX_Project_Process_Templates_Source.json#L313), [P0084](./GTI_FLUX_Project_Process_Templates_Source.json#L418), [P0102](./GTI_FLUX_Project_Process_Templates_Source.json#L508), [P0103](./GTI_FLUX_Project_Process_Templates_Source.json#L513), [P0104](./GTI_FLUX_Project_Process_Templates_Source.json#L518), [P0105](./GTI_FLUX_Project_Process_Templates_Source.json#L523), [P0117](./GTI_FLUX_Project_Process_Templates_Source.json#L583), [P0118](./GTI_FLUX_Project_Process_Templates_Source.json#L588), [P0126](./GTI_FLUX_Project_Process_Templates_Source.json#L628), [P0133](./GTI_FLUX_Project_Process_Templates_Source.json#L663), [P0153](./GTI_FLUX_Project_Process_Templates_Source.json#L763), [P0183](./GTI_FLUX_Project_Process_Templates_Source.json#L913), [P0197](./GTI_FLUX_Project_Process_Templates_Source.json#L983), [P0448](./GTI_FLUX_Project_Process_Templates_Source.json#L2238). **Resolves prerequisites for:** [GTI-B01](./GTI_Standard_Template_Blockers.md#gti-b01), [GTI-B15](./GTI_Standard_Template_Blockers.md#gti-b15), [GTI-B22](./GTI_Standard_Template_Blockers.md#gti-b22).

<a id="gti-d03"></a>

### GTI-D03 — Stage-blocking proof and task meaning

**OPEN · P0 · Required GTI decision.** Affects PKG POSM RTL EXH DIG. Proposed decision owner: Director with workflow and Tasker owners.

**Question:** Which tasks, applied fields/files, accepted concepts, issues and documents actually block a stage or final completion?

**Recommended starting position:** Approve explicit predicates: accepted exact concept; APPLIED field/file output; assigned versus resolved issue; reviewed retest. Keep task acceptance, stage completion and Director final completion separate.

**Source:** [P0060](./GTI_FLUX_Project_Process_Templates_Source.json#L298), [P0097](./GTI_FLUX_Project_Process_Templates_Source.json#L483), [P0109](./GTI_FLUX_Project_Process_Templates_Source.json#L543), [P0114](./GTI_FLUX_Project_Process_Templates_Source.json#L568), [P0164](./GTI_FLUX_Project_Process_Templates_Source.json#L818), [P0178](./GTI_FLUX_Project_Process_Templates_Source.json#L888), [P0197](./GTI_FLUX_Project_Process_Templates_Source.json#L983), [P0310](./GTI_FLUX_Project_Process_Templates_Source.json#L1548), [P0316](./GTI_FLUX_Project_Process_Templates_Source.json#L1578), [P0327](./GTI_FLUX_Project_Process_Templates_Source.json#L1633), [P0390](./GTI_FLUX_Project_Process_Templates_Source.json#L1948). **Resolves prerequisites for:** [GTI-B01](./GTI_Standard_Template_Blockers.md#gti-b01), [GTI-B05](./GTI_Standard_Template_Blockers.md#gti-b05), [GTI-B10](./GTI_Standard_Template_Blockers.md#gti-b10), [GTI-B11](./GTI_Standard_Template_Blockers.md#gti-b11), [GTI-B12](./GTI_Standard_Template_Blockers.md#gti-b12), [GTI-B13](./GTI_Standard_Template_Blockers.md#gti-b13), [GTI-B14](./GTI_Standard_Template_Blockers.md#gti-b14), [GTI-B30](./GTI_Standard_Template_Blockers.md#gti-b30), [GTI-B32](./GTI_Standard_Template_Blockers.md#gti-b32).

<a id="gti-d04"></a>

### GTI-D04 — Conditional applicability and skips

**OPEN · P0 · Required GTI decision.** Affects PKG POSM RTL. Proposed decision owner: Director.

**Question:** Should official workflows retain strict stages, or permit specifically named Director-approved skips/applicability decisions?

**Recommended starting position:** Start with typed applicability and no bypass. Any permitted skip needs a new explicit V2 policy, named scope and immutable Director decision; the source alone does not authorize Owner overrides.

**Source:** [P0037](./GTI_FLUX_Project_Process_Templates_Source.json#L183), [P0038](./GTI_FLUX_Project_Process_Templates_Source.json#L188), [P0089](./GTI_FLUX_Project_Process_Templates_Source.json#L443), [P0093](./GTI_FLUX_Project_Process_Templates_Source.json#L463), [P0098](./GTI_FLUX_Project_Process_Templates_Source.json#L488), [P0123](./GTI_FLUX_Project_Process_Templates_Source.json#L613), [P0128](./GTI_FLUX_Project_Process_Templates_Source.json#L638), [P0129](./GTI_FLUX_Project_Process_Templates_Source.json#L643), [P0153](./GTI_FLUX_Project_Process_Templates_Source.json#L763). **Resolves prerequisites for:** [GTI-B03](./GTI_Standard_Template_Blockers.md#gti-b03), [GTI-B04](./GTI_Standard_Template_Blockers.md#gti-b04).

<a id="gti-d05"></a>

### GTI-D05 — Packaging creative and production acceptance

**OPEN · P0 · Required GTI decision.** Affects PKG. Proposed decision owner: Director with Packaging/production leads.

**Question:** What concept count/views and contractual rounds are mandatory; how should the production chain, restarts, agreement guard and per-unit samples operate in V2?

**Recommended starting position:** Distinguish the example 4–6 concepts from an agreed count, contract minimum rounds from revisions, and internal evidence review from actual artwork release. Approve each production stakeholder and correction rule.

**Source:** [P0087](./GTI_FLUX_Project_Process_Templates_Source.json#L433), [P0088](./GTI_FLUX_Project_Process_Templates_Source.json#L438), [P0089](./GTI_FLUX_Project_Process_Templates_Source.json#L443), [P0092](./GTI_FLUX_Project_Process_Templates_Source.json#L458), [P0093](./GTI_FLUX_Project_Process_Templates_Source.json#L463), [P0102](./GTI_FLUX_Project_Process_Templates_Source.json#L508), [P0103](./GTI_FLUX_Project_Process_Templates_Source.json#L513), [P0104](./GTI_FLUX_Project_Process_Templates_Source.json#L518), [P0105](./GTI_FLUX_Project_Process_Templates_Source.json#L523), [P0106](./GTI_FLUX_Project_Process_Templates_Source.json#L528), [P0107](./GTI_FLUX_Project_Process_Templates_Source.json#L533), [P0109](./GTI_FLUX_Project_Process_Templates_Source.json#L543), [P0114](./GTI_FLUX_Project_Process_Templates_Source.json#L568), [P0362](./GTI_FLUX_Project_Process_Templates_Source.json#L1808), [P0466](./GTI_FLUX_Project_Process_Templates_Source.json#L2328), [P0498](./GTI_FLUX_Project_Process_Templates_Source.json#L2488). **Resolves prerequisites for:** [GTI-B06](./GTI_Standard_Template_Blockers.md#gti-b06), [GTI-B14](./GTI_Standard_Template_Blockers.md#gti-b14), [GTI-B15](./GTI_Standard_Template_Blockers.md#gti-b15), [GTI-B18](./GTI_Standard_Template_Blockers.md#gti-b18), [GTI-B22](./GTI_Standard_Template_Blockers.md#gti-b22), [GTI-B24](./GTI_Standard_Template_Blockers.md#gti-b24), [GTI-B26](./GTI_Standard_Template_Blockers.md#gti-b26).

<a id="gti-d06"></a>

### GTI-D06 — POSM material-specific behavior

**OPEN · P0 · Required GTI decision.** Affects POSM. Proposed decision owner: Director with POSM/procurement owners.

**Question:** Which Printed/Merchandise requirements are conditional, and does the brief photo minimum mean per outlet or overall?

**Recommended starting position:** Confirm mandatory merchandise sourcing and three distinct offers; define all-format/size coverage, 1–2 creative rounds and physical proof/golden-sample rules. Research skip requires D04; no default photo threshold is invented.

**Source:** [P0123](./GTI_FLUX_Project_Process_Templates_Source.json#L613), [P0125](./GTI_FLUX_Project_Process_Templates_Source.json#L623), [P0128](./GTI_FLUX_Project_Process_Templates_Source.json#L638), [P0129](./GTI_FLUX_Project_Process_Templates_Source.json#L643), [P0130](./GTI_FLUX_Project_Process_Templates_Source.json#L648), [P0132](./GTI_FLUX_Project_Process_Templates_Source.json#L658), [P0135](./GTI_FLUX_Project_Process_Templates_Source.json#L673), [P0136](./GTI_FLUX_Project_Process_Templates_Source.json#L678), [P0139](./GTI_FLUX_Project_Process_Templates_Source.json#L693), [P0140](./GTI_FLUX_Project_Process_Templates_Source.json#L698), [P0144](./GTI_FLUX_Project_Process_Templates_Source.json#L718), [P0145](./GTI_FLUX_Project_Process_Templates_Source.json#L723). **Resolves prerequisites for:** [GTI-B03](./GTI_Standard_Template_Blockers.md#gti-b03), [GTI-B07](./GTI_Standard_Template_Blockers.md#gti-b07), [GTI-B15](./GTI_Standard_Template_Blockers.md#gti-b15), [GTI-B26](./GTI_Standard_Template_Blockers.md#gti-b26).

<a id="gti-d07"></a>

### GTI-D07 — Retail survey, prototype and installation authority

**OPEN · P0 · Required GTI decision.** Affects RTL. Proposed decision owner: Director with Retail/engineering owners.

**Question:** What makes a sample representative, who accepts technical/prototype evidence, and exactly when may assigned open issues satisfy installation completion?

**Recommended starting position:** Bind Owner sample approval to the exact outlet set. Define competent engineering review and interpret the all-accepted OR issues-assigned rule explicitly; do not silently strengthen it to every issue resolved or weaken it to any task reference.

**Source:** [P0152](./GTI_FLUX_Project_Process_Templates_Source.json#L758), [P0153](./GTI_FLUX_Project_Process_Templates_Source.json#L763), [P0155](./GTI_FLUX_Project_Process_Templates_Source.json#L773), [P0157](./GTI_FLUX_Project_Process_Templates_Source.json#L783), [P0159](./GTI_FLUX_Project_Process_Templates_Source.json#L793), [P0161](./GTI_FLUX_Project_Process_Templates_Source.json#L803), [P0163](./GTI_FLUX_Project_Process_Templates_Source.json#L813), [P0164](./GTI_FLUX_Project_Process_Templates_Source.json#L818). **Resolves prerequisites for:** [GTI-B08](./GTI_Standard_Template_Blockers.md#gti-b08), [GTI-B09](./GTI_Standard_Template_Blockers.md#gti-b09), [GTI-B10](./GTI_Standard_Template_Blockers.md#gti-b10), [GTI-B15](./GTI_Standard_Template_Blockers.md#gti-b15), [GTI-B25](./GTI_Standard_Template_Blockers.md#gti-b25), [GTI-B26](./GTI_Standard_Template_Blockers.md#gti-b26), [GTI-B40](./GTI_Standard_Template_Blockers.md#gti-b40).

<a id="gti-d08"></a>

### GTI-D08 — Exhibition contractor, organiser and report authority

**OPEN · P0 · Required GTI decision.** Affects EXH. Proposed decision owner: Director with Exhibition/event owner.

**Question:** Who authorizes invitations, contract, organiser acceptance and wrap-up; which snags block acceptance; are aggregate event results sufficient?

**Recommended starting position:** Keep distinct Director contractor and real organiser decisions; identify the source-unspecified report approver and fixed milestone policy. Confirm whether individual CRM records are needed rather than assuming a CRM build.

**Source:** [P0166](./GTI_FLUX_Project_Process_Templates_Source.json#L828), [P0170](./GTI_FLUX_Project_Process_Templates_Source.json#L848), [P0172](./GTI_FLUX_Project_Process_Templates_Source.json#L858), [P0174](./GTI_FLUX_Project_Process_Templates_Source.json#L868), [P0178](./GTI_FLUX_Project_Process_Templates_Source.json#L888), [P0180](./GTI_FLUX_Project_Process_Templates_Source.json#L898), [P0182](./GTI_FLUX_Project_Process_Templates_Source.json#L908), [P0183](./GTI_FLUX_Project_Process_Templates_Source.json#L913). **Resolves prerequisites for:** [GTI-B11](./GTI_Standard_Template_Blockers.md#gti-b11), [GTI-B15](./GTI_Standard_Template_Blockers.md#gti-b15), [GTI-B17](./GTI_Standard_Template_Blockers.md#gti-b17), [GTI-B21](./GTI_Standard_Template_Blockers.md#gti-b21), [GTI-B25](./GTI_Standard_Template_Blockers.md#gti-b25), [GTI-B26](./GTI_Standard_Template_Blockers.md#gti-b26), [GTI-B35](./GTI_Standard_Template_Blockers.md#gti-b35), [GTI-B45](./GTI_Standard_Template_Blockers.md#gti-b45).

<a id="gti-d09"></a>

### GTI-D09 — Digital acceptance and maintenance versus completion

**OPEN · P0 · Required GTI decision.** Affects DIG. Proposed decision owner: Director with Digital/IT owner.

**Question:** Who accepts UX/UI, UAT and go-live; which defects block; does maintenance remain indefinitely ACTIVE, end after a defined period, or move into separately governed work?

**Recommended starting position:** Resolve maintenance and closure triggers before official Digital designation. Retain seven execution stages and no new status until approved; support-period end is not automatic completion; completed history cannot reopen.

**Source:** [P0185](./GTI_FLUX_Project_Process_Templates_Source.json#L923), [P0191](./GTI_FLUX_Project_Process_Templates_Source.json#L953), [P0193](./GTI_FLUX_Project_Process_Templates_Source.json#L963), [P0197](./GTI_FLUX_Project_Process_Templates_Source.json#L983), [P0199](./GTI_FLUX_Project_Process_Templates_Source.json#L993), [P0200](./GTI_FLUX_Project_Process_Templates_Source.json#L998), [P0201](./GTI_FLUX_Project_Process_Templates_Source.json#L1003), [P0202](./GTI_FLUX_Project_Process_Templates_Source.json#L1008), [P0518](./GTI_FLUX_Project_Process_Templates_Source.json#L2588). **Resolves prerequisites for:** [GTI-B12](./GTI_Standard_Template_Blockers.md#gti-b12), [GTI-B13](./GTI_Standard_Template_Blockers.md#gti-b13), [GTI-B14](./GTI_Standard_Template_Blockers.md#gti-b14), [GTI-B15](./GTI_Standard_Template_Blockers.md#gti-b15), [GTI-B25](./GTI_Standard_Template_Blockers.md#gti-b25), [GTI-B38](./GTI_Standard_Template_Blockers.md#gti-b38), [GTI-B39](./GTI_Standard_Template_Blockers.md#gti-b39), [GTI-B40](./GTI_Standard_Template_Blockers.md#gti-b40).

<a id="gti-d10"></a>

### GTI-D10 — Official designation and release scope

**OPEN · P0 · Required GTI decision.** Affects PKG POSM RTL EXH DIG. Proposed decision owner: Director.

**Question:** Which exact source/blueprint/published version may be designated official, and which unresolved requirements, if any, may be explicitly deferred for a stated scope?

**Recommended starting position:** Approve the separate immutable designation proposal in Phase 5.4. Each disposition needs evidence, accountable owner, constraints and review trigger. Publication approval alone must never create official status.

**Source:** [P0033](./GTI_FLUX_Project_Process_Templates_Source.json#L163), [P0040](./GTI_FLUX_Project_Process_Templates_Source.json#L198). **Resolves prerequisites for:** [GTI-B02](./GTI_Standard_Template_Blockers.md#gti-b02), [GTI-B46](./GTI_Standard_Template_Blockers.md#gti-b46).

<a id="gti-d11"></a>

### GTI-D11 — Legal documents, signatures and compliance ownership

**OPEN · P0 · Required GTI decision.** Affects PKG POSM RTL EXH DIG. Proposed decision owner: GTI counsel with Director.

**Question:** Who owns approved legal wording, signatory authority and valid signing/acceptance proof, and where must signed agreements block release?

**Recommended starting position:** Use counsel-approved versioned templates and defined evidence/provider; separate pre-production agreements from final-project documents. Source legal assertions are requirements for counsel review, not legal conclusions made by this review.

**Source:** [P0107](./GTI_FLUX_Project_Process_Templates_Source.json#L533), [P0408](./GTI_FLUX_Project_Process_Templates_Source.json#L2038), [P0424](./GTI_FLUX_Project_Process_Templates_Source.json#L2118), [P0426](./GTI_FLUX_Project_Process_Templates_Source.json#L2128), [P0446](./GTI_FLUX_Project_Process_Templates_Source.json#L2228), [P0462](./GTI_FLUX_Project_Process_Templates_Source.json#L2308), [P0477](./GTI_FLUX_Project_Process_Templates_Source.json#L2383), [P0490](./GTI_FLUX_Project_Process_Templates_Source.json#L2448), [P0492](./GTI_FLUX_Project_Process_Templates_Source.json#L2458), [P0493](./GTI_FLUX_Project_Process_Templates_Source.json#L2463), [P0494](./GTI_FLUX_Project_Process_Templates_Source.json#L2468), [P0495](./GTI_FLUX_Project_Process_Templates_Source.json#L2473), [P0496](./GTI_FLUX_Project_Process_Templates_Source.json#L2478), [P0497](./GTI_FLUX_Project_Process_Templates_Source.json#L2483), [P0498](./GTI_FLUX_Project_Process_Templates_Source.json#L2488), [P0505](./GTI_FLUX_Project_Process_Templates_Source.json#L2523), [P0521](./GTI_FLUX_Project_Process_Templates_Source.json#L2603). **Resolves prerequisites for:** [GTI-B18](./GTI_Standard_Template_Blockers.md#gti-b18), [GTI-B19](./GTI_Standard_Template_Blockers.md#gti-b19), [GTI-B20](./GTI_Standard_Template_Blockers.md#gti-b20), [GTI-B23](./GTI_Standard_Template_Blockers.md#gti-b23), [GTI-B24](./GTI_Standard_Template_Blockers.md#gti-b24), [GTI-B25](./GTI_Standard_Template_Blockers.md#gti-b25), [GTI-B27](./GTI_Standard_Template_Blockers.md#gti-b27).

<a id="gti-d12"></a>

### GTI-D12 — Vendor/CERBER source of truth and procurement

**OPEN · P0 · Required GTI decision.** Affects PKG POSM RTL EXH DIG. Proposed decision owner: Director with CERBER/procurement owner.

**Question:** Which system owns vendor identity/status, how fresh must approval be, and what invitation, offer, selection and suspension rules apply?

**Recommended starting position:** Resolve the source’s open master-data/re-verification point before any send integration; require verified status at release and exact Director-selected participants, with no junior recipient swaps.

**Source:** [P0030](./GTI_FLUX_Project_Process_Templates_Source.json#L148), [P0035](./GTI_FLUX_Project_Process_Templates_Source.json#L173), [P0129](./GTI_FLUX_Project_Process_Templates_Source.json#L643), [P0172](./GTI_FLUX_Project_Process_Templates_Source.json#L858), [P0189](./GTI_FLUX_Project_Process_Templates_Source.json#L943), [P0359](./GTI_FLUX_Project_Process_Templates_Source.json#L1793), [P0371](./GTI_FLUX_Project_Process_Templates_Source.json#L1853), [P0375](./GTI_FLUX_Project_Process_Templates_Source.json#L1873), [P0376](./GTI_FLUX_Project_Process_Templates_Source.json#L1878), [P0377](./GTI_FLUX_Project_Process_Templates_Source.json#L1883), [P0384](./GTI_FLUX_Project_Process_Templates_Source.json#L1918), [P0522](./GTI_FLUX_Project_Process_Templates_Source.json#L2608). **Resolves prerequisites for:** [GTI-B16](./GTI_Standard_Template_Blockers.md#gti-b16), [GTI-B17](./GTI_Standard_Template_Blockers.md#gti-b17), [GTI-B18](./GTI_Standard_Template_Blockers.md#gti-b18), [GTI-B19](./GTI_Standard_Template_Blockers.md#gti-b19), [GTI-B31](./GTI_Standard_Template_Blockers.md#gti-b31).

<a id="gti-d13"></a>

### GTI-D13 — Toolio proof and Toolkit master

**OPEN · P0 · Required GTI decision.** Affects PKG. Proposed decision owner: Director with Packaging and Digital Lead.

**Question:** What independently verifies manual Toolio entry, and which Toolkit layout/content and Director-only note-removal controls are approved?

**Recommended starting position:** Prefer verifiable manual entry proof before assuming Toolio API access. Approve full/short master layouts and exact-version note decisions; linked POSM work must follow normal creation governance.

**Source:** [P0117](./GTI_FLUX_Project_Process_Templates_Source.json#L583), [P0118](./GTI_FLUX_Project_Process_Templates_Source.json#L588), [P0119](./GTI_FLUX_Project_Process_Templates_Source.json#L593), [P0120](./GTI_FLUX_Project_Process_Templates_Source.json#L598), [P0121](./GTI_FLUX_Project_Process_Templates_Source.json#L603), [P0524](./GTI_FLUX_Project_Process_Templates_Source.json#L2618). **Resolves prerequisites for:** [GTI-B41](./GTI_Standard_Template_Blockers.md#gti-b41), [GTI-B42](./GTI_Standard_Template_Blockers.md#gti-b42).

<a id="gti-d14"></a>

### GTI-D14 — External submissions in first official rollout

**OPEN · P0 · Required rollout-scope decision.** Affects PKG POSM RTL EXH DIG. Proposed decision owner: Director with security/operations owner.

**Question:** Are real vendor/organiser submissions and bilateral confirmations required in the first official rollout, or is a narrower evidence procedure acceptable?

**Recommended starting position:** If required, implement genuine scoped external identities/tokens and provenance. Any narrower rollout needs an explicit Director disposition with limits; current absence of external links is not an approved deferral.

**Source:** [P0030](./GTI_FLUX_Project_Process_Templates_Source.json#L148), [P0353](./GTI_FLUX_Project_Process_Templates_Source.json#L1763), [P0354](./GTI_FLUX_Project_Process_Templates_Source.json#L1768), [P0360](./GTI_FLUX_Project_Process_Templates_Source.json#L1798), [P0505](./GTI_FLUX_Project_Process_Templates_Source.json#L2523). **Resolves prerequisites for:** [GTI-B19](./GTI_Standard_Template_Blockers.md#gti-b19), [GTI-B20](./GTI_Standard_Template_Blockers.md#gti-b20), [GTI-B21](./GTI_Standard_Template_Blockers.md#gti-b21), [GTI-B25](./GTI_Standard_Template_Blockers.md#gti-b25).

<a id="gti-d15"></a>

### GTI-D15 — Durations, starter tasks, support and leave

**OPEN · P1 · Required before associated automation.** Affects PKG POSM RTL EXH DIG. Proposed decision owner: Director with process/operations owners.

**Question:** What durations/calendars, starter tasks, assignees, reminders and support obligations are authoritative; should any absence restrictions or deputy rights be proposed?

**Recommended starting position:** Approve scheduling/task recipes per template; keep leave availability separate from forced lockout/delegation. Those rights require explicit new policy and cannot be inferred from calendar entries.

**Source:** [P0062](./GTI_FLUX_Project_Process_Templates_Source.json#L308), [P0064](./GTI_FLUX_Project_Process_Templates_Source.json#L318), [P0065](./GTI_FLUX_Project_Process_Templates_Source.json#L323), [P0163](./GTI_FLUX_Project_Process_Templates_Source.json#L813), [P0199](./GTI_FLUX_Project_Process_Templates_Source.json#L993), [P0312](./GTI_FLUX_Project_Process_Templates_Source.json#L1558), [P0331](./GTI_FLUX_Project_Process_Templates_Source.json#L1653), [P0332](./GTI_FLUX_Project_Process_Templates_Source.json#L1658), [P0400](./GTI_FLUX_Project_Process_Templates_Source.json#L1998), [P0401](./GTI_FLUX_Project_Process_Templates_Source.json#L2003), [P0402](./GTI_FLUX_Project_Process_Templates_Source.json#L2008), [P0403](./GTI_FLUX_Project_Process_Templates_Source.json#L2013), [P0404](./GTI_FLUX_Project_Process_Templates_Source.json#L2018), [P0405](./GTI_FLUX_Project_Process_Templates_Source.json#L2023), [P0406](./GTI_FLUX_Project_Process_Templates_Source.json#L2028), [P0519](./GTI_FLUX_Project_Process_Templates_Source.json#L2593), [P0520](./GTI_FLUX_Project_Process_Templates_Source.json#L2598). **Resolves prerequisites for:** [GTI-B29](./GTI_Standard_Template_Blockers.md#gti-b29), [GTI-B30](./GTI_Standard_Template_Blockers.md#gti-b30), [GTI-B40](./GTI_Standard_Template_Blockers.md#gti-b40), [GTI-B44](./GTI_Standard_Template_Blockers.md#gti-b44).

<a id="gti-d16"></a>

### GTI-D16 — Money visibility, ratings and no-vendor cases

**OPEN · P0 · Required before financial/vendor closeout rollout.** Affects PKG POSM RTL EXH DIG. Proposed decision owner: Director with Finance/process owners.

**Question:** Which currency/accounting rules and cost access boundaries apply, and how are three ratings handled when a project has no Co-owner or no external vendor?

**Recommended starting position:** Approve actual Owner/Co-owner/Director cost access across files/tasks/exports; define who approves commitments/invoices and each rating. Never invent a participant just to satisfy a three-rater gate.

**Source:** [P0056](./GTI_FLUX_Project_Process_Templates_Source.json#L278), [P0182](./GTI_FLUX_Project_Process_Templates_Source.json#L908), [P0387](./GTI_FLUX_Project_Process_Templates_Source.json#L1933), [P0388](./GTI_FLUX_Project_Process_Templates_Source.json#L1938), [P0389](./GTI_FLUX_Project_Process_Templates_Source.json#L1943), [P0390](./GTI_FLUX_Project_Process_Templates_Source.json#L1948), [P0392](./GTI_FLUX_Project_Process_Templates_Source.json#L1958), [P0393](./GTI_FLUX_Project_Process_Templates_Source.json#L1963), [P0394](./GTI_FLUX_Project_Process_Templates_Source.json#L1968), [P0395](./GTI_FLUX_Project_Process_Templates_Source.json#L1973), [P0396](./GTI_FLUX_Project_Process_Templates_Source.json#L1978), [P0397](./GTI_FLUX_Project_Process_Templates_Source.json#L1983), [P0398](./GTI_FLUX_Project_Process_Templates_Source.json#L1988), [P0399](./GTI_FLUX_Project_Process_Templates_Source.json#L1993). **Resolves prerequisites for:** [GTI-B31](./GTI_Standard_Template_Blockers.md#gti-b31), [GTI-B32](./GTI_Standard_Template_Blockers.md#gti-b32).

<a id="gti-d17"></a>

### GTI-D17 — Preflight profiles and qualified compliance evidence

**OPEN · P1 · Required before certification claims.** Affects PKG POSM RTL EXH DIG. Proposed decision owner: Director with artwork, engineering, legal and Digital specialists.

**Question:** Which exact versioned file profiles and qualified reviews establish technical, physical, regulatory or software acceptance?

**Recommended starting position:** Approve domain profiles and authoritative evidence; unknown formats/results cannot auto-pass. Automated preflight is distinct from jurisdictional judgment, physical inspection and security acceptance.

**Source:** [P0082](./GTI_FLUX_Project_Process_Templates_Source.json#L408), [P0128](./GTI_FLUX_Project_Process_Templates_Source.json#L638), [P0150](./GTI_FLUX_Project_Process_Templates_Source.json#L748), [P0157](./GTI_FLUX_Project_Process_Templates_Source.json#L783), [P0187](./GTI_FLUX_Project_Process_Templates_Source.json#L933), [P0195](./GTI_FLUX_Project_Process_Templates_Source.json#L973), [P0442](./GTI_FLUX_Project_Process_Templates_Source.json#L2208), [P0459](./GTI_FLUX_Project_Process_Templates_Source.json#L2293), [P0509](./GTI_FLUX_Project_Process_Templates_Source.json#L2543), [P0510](./GTI_FLUX_Project_Process_Templates_Source.json#L2548), [P0511](./GTI_FLUX_Project_Process_Templates_Source.json#L2553), [P0512](./GTI_FLUX_Project_Process_Templates_Source.json#L2558), [P0513](./GTI_FLUX_Project_Process_Templates_Source.json#L2563), [P0514](./GTI_FLUX_Project_Process_Templates_Source.json#L2568), [P0515](./GTI_FLUX_Project_Process_Templates_Source.json#L2573), [P0516](./GTI_FLUX_Project_Process_Templates_Source.json#L2578). **Resolves prerequisites for:** [GTI-B27](./GTI_Standard_Template_Blockers.md#gti-b27), [GTI-B28](./GTI_Standard_Template_Blockers.md#gti-b28).

<a id="gti-d18"></a>

### GTI-D18 — Archive, related work, inventory and event-detail scope

**OPEN · P1 · Required rollout scope; some methods optional.** Affects PKG POSM RTL EXH DIG. Proposed decision owner: Director with Archive/event/warehouse owners.

**Question:** Which related-project, Archive, annual report and stock evidence must be authoritative; are aggregate event records sufficient?

**Recommended starting position:** Retain separate project budgets and authorized references; specify Archive publication authority and warehouse source of truth. CRM integration and budget roll-up are optional methods, not automatic source requirements.

**Source:** [P0120](./GTI_FLUX_Project_Process_Templates_Source.json#L598), [P0144](./GTI_FLUX_Project_Process_Templates_Source.json#L718), [P0145](./GTI_FLUX_Project_Process_Templates_Source.json#L723), [P0166](./GTI_FLUX_Project_Process_Templates_Source.json#L828), [P0170](./GTI_FLUX_Project_Process_Templates_Source.json#L848), [P0176](./GTI_FLUX_Project_Process_Templates_Source.json#L878), [P0180](./GTI_FLUX_Project_Process_Templates_Source.json#L898), [P0182](./GTI_FLUX_Project_Process_Templates_Source.json#L908), [P0183](./GTI_FLUX_Project_Process_Templates_Source.json#L913), [P0280](./GTI_FLUX_Project_Process_Templates_Source.json#L1398), [P0340](./GTI_FLUX_Project_Process_Templates_Source.json#L1698), [P0398](./GTI_FLUX_Project_Process_Templates_Source.json#L1988), [P0399](./GTI_FLUX_Project_Process_Templates_Source.json#L1993). **Resolves prerequisites for:** [GTI-B33](./GTI_Standard_Template_Blockers.md#gti-b33), [GTI-B34](./GTI_Standard_Template_Blockers.md#gti-b34), [GTI-B35](./GTI_Standard_Template_Blockers.md#gti-b35), [GTI-B36](./GTI_Standard_Template_Blockers.md#gti-b36), [GTI-B45](./GTI_Standard_Template_Blockers.md#gti-b45).

<a id="gti-d19"></a>

### GTI-D19 — Digital access-handover system and release evidence

**OPEN · P0 · Required for official Digital handover.** Affects DIG. Proposed decision owner: IT/security owner with Director.

**Question:** Which approved access/secret system owns credentials, and what independent IT confirmation proves ownership, transfer and the accepted deployed build?

**Recommended starting position:** Keep only non-secret record references in FLUX. Choose prevention/response controls explicitly; neither ordinary fields nor uploaded files are a vault. Deployment automation is optional if approved verifiable release evidence is sufficient.

**Source:** [P0195](./GTI_FLUX_Project_Process_Templates_Source.json#L973), [P0199](./GTI_FLUX_Project_Process_Templates_Source.json#L993), [P0200](./GTI_FLUX_Project_Process_Templates_Source.json#L998). **Resolves prerequisites for:** [GTI-B37](./GTI_Standard_Template_Blockers.md#gti-b37), [GTI-B39](./GTI_Standard_Template_Blockers.md#gti-b39).

<a id="gti-d20"></a>

### GTI-D20 — File support envelope and operational release proof

**OPEN · P1 · Required before real rollout.** Affects PKG POSM RTL EXH DIG. Proposed decision owner: Director with engineering/operations.

**Question:** What size/format/preview/retention limits and real-environment acceptance evidence will GTI promise and fund?

**Recommended starting position:** Approve a bounded support matrix and separate operational release plan. Unlimited attachments, every format, real S3/IAM and recovery readiness are not established by isolated development acceptance.

**Source:** [P0310](./GTI_FLUX_Project_Process_Templates_Source.json#L1548), [P0334](./GTI_FLUX_Project_Process_Templates_Source.json#L1668), [P0335](./GTI_FLUX_Project_Process_Templates_Source.json#L1673), [P0336](./GTI_FLUX_Project_Process_Templates_Source.json#L1678), [P0337](./GTI_FLUX_Project_Process_Templates_Source.json#L1683), [P0338](./GTI_FLUX_Project_Process_Templates_Source.json#L1688), [P0339](./GTI_FLUX_Project_Process_Templates_Source.json#L1693), [P0340](./GTI_FLUX_Project_Process_Templates_Source.json#L1698), [P0341](./GTI_FLUX_Project_Process_Templates_Source.json#L1703), [P0523](./GTI_FLUX_Project_Process_Templates_Source.json#L2613). **Resolves prerequisites for:** [GTI-B43](./GTI_Standard_Template_Blockers.md#gti-b43), [GTI-B46](./GTI_Standard_Template_Blockers.md#gti-b46).

## Required decisions versus optional methods

Source obligations remain OPEN until resolved or explicitly disposed of by the Director. A manual evidence procedure is sufficient only if GTI approves its scope and the system verifies the promised authority/version; a checkbox is not an integration. Toolio API synchronization, direct deployment automation, an in-house credential vault, a universal legal rules engine, CRM integration, linked-budget aggregation and auto-generated packshots are **optional implementation methods/enhancements**, not individually mandated by the source. Structured records, secure handover, approved evidence and separate budgets may still be required.

External runtime submissions, CERBER, signatures, inventory and production operations are **future integration dependencies**, with initial-rollout necessity decided explicitly. No decision here marks them VERIFIED_DEFERRED. Capture each eventual answer with actual decision-maker, date, exact template/source/revision scope, approved choice, evidence, constraints and review trigger. If scope changes, issue a new decision; retain history.
