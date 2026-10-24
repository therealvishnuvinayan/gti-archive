# FLUX V2 — QA issues

24 October 2026 · Phase 8.1 · **Independent human tests: NOT RUN**

No human defects have been reported yet. An automated smoke PASS is not a human PASS. Copy the form below for each observed problem; attach screenshots separately and exclude credentials.

Before filing, check whether the behavior is an implemented feature or an intentionally unsupported requirement. Record an incorrect implemented behavior here. For missing agreed test access/data, mark the guide test BLOCKED and describe the prerequisite. Link a requested future capability to the business backlog rather than calling it fixed or filing it automatically as a software defect.

The **46 OPEN template-resolution items** in [GTI blockers](../requirements/GTI_Standard_Template_Blockers.md) and **20 OPEN GTI decisions** in [GTI decisions](../requirements/GTI_Standard_Template_Decisions.md) remain separate and unchanged. Official GTI standard-template rollout is **NOT APPROVED**.

Severity: **Critical** = unauthorized sensitive access, destructive loss or unusable system; **High** = key implemented workflow cannot complete; **Medium** = wrong behavior with a workable alternative; **Low** = minor visual/text/usability problem.

Status: **Open → Investigating → Fixed → Retest → Closed**. “Fixed” means a developer supplied a change; close only after the expected result is independently retested. Reopen a failed retest.

## Copy for each issue

| Field | Tester entry |
| --- | --- |
| Issue number and date (Dubai time) | QA-___ · YYYY-MM-DD |
| Guide test number / outcome | e.g. T2 · FAIL or BLOCKED |
| Short title | |
| Tester role / synthetic account label | |
| Screen/page | Page title and local URL; omit any secret parameters |
| Exact reproduction steps | 1. … 2. … 3. … |
| Expected behavior | |
| Actual behavior | Include the visible error text |
| Screenshot reference | QA-___-screen.png |
| Severity | Critical / High / Medium / Low |
| Status | Open / Investigating / Fixed / Retest / Closed |
| Developer note or retest outcome | Change reference; retester/date; observed result |

Include whether the fixture had been reset and any earlier scenario that changed the same record. If uncertain whether something is a defect or a business requirement, describe the observation without deciding its classification; the QA lead can triage it.
