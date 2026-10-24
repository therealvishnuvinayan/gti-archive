# FLUX V2 — Human QA guide

24 October 2026 · Local practice only · **Independent human QA: NOT RUN**

## Start here

Use the developer computer. Ask the developer to start the disposable QA session using [the setup instructions](./FLUX_V2_QA_Setup.md), then open **http://127.0.0.1:3117**. Port **3000 is the development database**, not this QA session. If 3117 does not open, stop and mark the affected tests BLOCKED.

The developer separately provides a private **account card**, **fixture links** page and **QA-proof.pdf**. Use only those synthetic accounts and files. No passwords belong in this guide, screenshots or issue reports. All practice records begin with “QA”. Each account's name identifies its role. “Other SPM” and “Ungranted Designer” are deliberately outside selected work.

To change users, open the profile menu at the top right, choose **Sign out**, then sign in with the next account. Check the displayed name before acting. Alternatively, use separate browser profiles for each role; two ordinary tabs share a login. Refresh after switching roles or after another user changes a record.

Use the fixture links to open named records. Otherwise use Tasks, Projects, Archives, Calendar and Notifications. Record names in this guide refer to the supplied fixture. Use **QA Human …** for anything you create. Ask for a reset when you need the starting state again; save your results and screenshots first. Reset removes all practice work and changes the test passwords.

Choose one outcome per test, replacing the initial NOT RUN tick:

- **PASS:** you personally performed the steps and observed the expected result.
- **FAIL:** the implemented behavior differs from the expected result.
- **BLOCKED:** access, data or a prerequisite prevents the test; explain what is missing.
- **NOT RUN:** you have not attempted it. Automated checks do not change this status.

For a problem, take a screenshot with **Shift–Command–4**, save it as `QA-001-screen.png`, and use [the issue template](./FLUX_V2_QA_Issues.md). Include the test number, role, page, exact steps and expected/actual result. Exclude the account card, passwords and unrelated desktop content. A developer's “fixed” note still needs your retest.

## Phase 1 — Roles and permissions

### R1 — Login and Director oversight
1. **Role:** QA Director.
2. **Click:** Sign-in page → Dashboard → Projects.
3. **Do:** Sign in; open QA Task Workspace and QA Restricted Other Project using the fixture links.
4. **Expect:** Both are visible to the Director. The Dashboard shows relevant oversight and pending decisions.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### R2 — SPM project boundaries
1. **Role:** QA SPM.
2. **Click:** Fixture links → QA Native Artwork, QA Flexible Campaign and QA Task Workspace.
3. **Do:** Open each; then try QA Restricted Other Project.
4. **Expect:** Assigned work opens. The other SPM's private runtime project is denied without exposing its details.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### R3 — JPM governance
1. **Role:** QA JPM.
2. **Click:** Dashboard → Request a project.
3. **Do:** Inspect project creation; open the existing QA JPM Requested Project request at `/projects/runtime/requests`.
4. **Expect:** A request needs Director approval and a qualifying SPM participant. JPM cannot directly activate a project or decide their own request.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### R4 — Limited business roles
1. **Role:** QA Designer, then QA Digital Lead.
2. **Click:** Dashboard → My Work; fixture link → QA Restricted Other Project.
3. **Do:** Open assigned tasks and try the restricted project. Digital Lead has QA Digital Lead Assignment.
4. **Expect:** Each sees permitted work; neither gains unrestricted project management or Director publication controls.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### R5 — Technical access is separate
1. **Role:** QA Technical Only.
2. **Click:** Sign in; then fixture links → Tasks, QA Runtime Practice and QA Artwork.
3. **Do:** Try business work and file access.
4. **Expect:** Settings is the landing page. Technical privileges do not unlock business records, approvals or downloads.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

## Phase 2 — Files and approvals

### F1 — Upload, exact version and independent review
1. **Role:** QA SPM, then QA Director.
2. **Click:** QA Runtime Practice → Proof → File for Output.
3. **Do:** SPM selects QA-proof.pdf and clicks Upload to Output. Open its version link. Director enters a File review reason and chooses Reject file. SPM uploads a replacement using the replacement selector; Director opens that version and chooses Accept file.
4. **Expect:** The permitted PDF opens; rejection and acceptance retain separate version history. SPM cannot independently accept their own submitted stage file. Stage/project completion remains a separate action.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### F2 — Unauthorized evidence access
1. **Role:** QA Ungranted Designer.
2. **Click:** The same runtime project and exact file link copied during F1.
3. **Do:** Try opening the evidence and finding an approval control.
4. **Expect:** Access is denied; no protected file or approval authority is granted by knowing its link.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

## Phase 3 — Universal Tasker

The **Task Owner** requests and reviews the work; the **executor** performs it; a **spectator** watches. For responses and decisions, enter a **Message or decision reason** before pressing the action button. Check selected attachments before submitting. Acceptance of a task does **not** complete its stage or project.

### T1 — Create and review General work
1. **Role:** QA SPM → QA Designer → QA SPM.
2. **Click:** Tasks → New Task.
3. **Do:** SPM selects QA Task Workspace, General, a QA Human title, brief, future deadline and Designer executor; add Digital Lead as spectator. Create General Task. Designer submits a response, then requests completion. SPM requests changes with a reason; Designer revises and requests again; SPM approves completion.
4. **Expect:** Work follows the separate execution/review steps and retains history. QA General Review is also supplied already awaiting Owner review.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### T2 — File Upload
1. **Role:** QA Designer → QA SPM.
2. **Click:** QA File Upload → Attach supporting file.
3. **Do:** Attach QA-proof.pdf, select it, submit the response and request completion. SPM reviews the stated destination, checks Confirm destination and submission, and approves.
4. **Expect:** The accepted file reaches the named stage destination. Its stage review and completion remain separate; private attachments are not automatically archived.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### T3 — Data Input
1. **Role:** QA Designer → QA SPM.
2. **Click:** QA Data Input → Proposed field value.
3. **Do:** Enter “QA approved audience”, submit and request completion. SPM confirms the destination and submission, then approves. Open QA Task Workspace → Proof → Brief.
4. **Expect:** The accepted value appears in Note only after Owner acceptance. The project stays active.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### T4 — Inspect File
1. **Role:** QA Designer → QA SPM.
2. **Click:** QA Inspect File → Preview exact version or Download exact version.
3. **Do:** Inspect the supplied source; submit written findings and request completion. SPM reviews and approves or requests changes.
4. **Expect:** Findings concern that pinned version. Completing the inspection does not alter or approve the original source file itself.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### T5 — Initial Concept
1. **Role:** QA Designer → QA SPM.
2. **Click:** QA Initial Concept.
3. **Do:** Inspect the already submitted synthetic concept, request completion, then have SPM review it. For another proposal, attach a fresh synthetic PDF and submit it before requesting review.
4. **Expect:** Concept evidence and Owner review are recorded; no automatic project concept gate is implied.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### T6 — Final Concept
1. **Role:** QA Designer → QA SPM.
2. **Click:** QA Final Concept → Initial Concept inspiration.
3. **Do:** Open the selected inspiration; attach QA-proof.pdf as your final proposal, submit and request completion; SPM reviews separately.
4. **Expect:** Selected inspiration remains traceable. Its earlier submission or acceptance does not approve the final proposal.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### T7 — Spectator and Sister independence
1. **Role:** QA Digital Lead → QA Designer → QA SPM.
2. **Click:** QA General Review, then QA Sister Independent Work.
3. **Do:** Digital Lead checks spectator controls. Designer performs and requests review of the Sister; SPM decides. To create another, open QA Sister Source Completed in Tasks → Create Sister Task → Modify → Review Sister Task → confirm and create.
4. **Expect:** A spectator cannot submit or decide that task. The Sister has its own work, status and review; its source remains completed.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

## Phase 4 — Stage Builder and runtime

### W1 — Editable custom workflow
1. **Role:** QA SPM.
2. **Click:** Projects → Workflow drafts · Stage Builder → Create New Workflow Draft.
3. **Do:** Name it QA Human Workflow, choose Custom, Add Stage. Add Information with a typed field, File requirement for PDF, Checklist with an item, and Approval with a Director step. Fill required settings; Save Draft, resolve displayed validation issues, reload and Preview Workflow. QA Editable Draft is a populated alternative.
4. **Expect:** Saved structure survives reload; preview is read-only and saving does not publish it.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### W2 — Director publication
1. **Role:** QA SPM → QA Director.
2. **Click:** Saved valid draft → Director review and publication; then `/projects/workflow-approvals`.
3. **Do:** SPM enters Change summary → Submit Valid Draft for Approval. Director opens the submission, reviews it, enters Decision reason, confirms and chooses Approve and publish definition. QA Awaiting Publication is also ready for review.
4. **Expect:** Only the reviewed version becomes published; later draft edits do not rewrite it. This is custom QA publication, not official GTI standard approval.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### W3 — Authorized and governed project creation
1. **Role:** QA SPM → QA JPM → QA Director.
2. **Click:** `/projects/runtime/new`; Director uses `/projects/runtime/requests`.
3. **Do:** SPM selects published QA Practice Workflow, enters a QA Human title and participants, then Create authorized project. JPM submits a separate request with SPM as co-owner. Director reviews QA JPM Requested Project, selects Approve and create project, supplies a reason, confirms and records the decision.
4. **Expect:** SPM can create authorized work. JPM's project starts only after the Director decision; required governance participants remain enforced.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### W4 — Runtime evidence and stage decision
1. **Role:** QA SPM → QA Director → QA SPM.
2. **Click:** QA Runtime Practice → Proof.
3. **Do:** Save Brief fields; tick Proof checked, enter evidence and Save Proof checked. Complete F1. Submit Director review for review. Director reviews the current evidence, enters Stage approval reason, confirms and approves the current step. SPM gives Stage completion reason → Complete stage explicitly.
4. **Expect:** Evidence and the independent decision persist. Changed evidence needs fresh review. Stage completion is explicit; the project remains active. This practice workflow has optional requirements; it does not represent unresolved GTI gate policy.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### W5 — Document policy and final completion
1. **Role:** QA Director → QA SPM → QA Director.
2. **Click:** Fixture link → QA Final Completion.
3. **Do:** Director sets Approval proof requirement to Required, other document requirements to Not applicable, gives a policy reason and confirms Approve document policy. SPM uploads QA-proof.pdf under Upload Approval proof, reviews it using the permitted document controls, then supplies Owner completion reason and confirms Request final completion. Director reviews, gives a decision reason, confirms and approves final completion.
4. **Expect:** Missing required proof prevents the Owner request. Only the actual Owner requests final completion; Director decides. Completed work becomes immutable. Document-review permissions follow this document workflow, separately from stage-file independence.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

## Phase 5 — Five internal template candidates

These candidates are **not officially approved GTI standards**. Test loading and preview only. Vendor/CERBER, Toolio, external signatures, automatic concept gates and Digital maintenance are unfinished requirements, not promised working scenarios. Keep them in the separate business backlog.

### B1 — Packaging / Artwork
1. **Role:** QA SPM.
2. **Click:** Workflow drafts → Packaging blueprint.
3. **Do:** Expand Stage coverage and outstanding requirements, acknowledge the internal scope, Load Packaging draft, then Preview Workflow.
4. **Expect:** Packaging / Artwork internal candidate loads with six stages and its limitations remain visible.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### B2 — POSM & Promotional Materials
1. **Role:** QA SPM.
2. **Click:** Workflow drafts → POSM blueprint.
3. **Do:** Read scope, acknowledge, Load POSM draft → Preview Workflow.
4. **Expect:** The POSM internal candidate loads with six stages; it has no official-standard designation.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### B3 — Retail Display
1. **Role:** QA SPM.
2. **Click:** Workflow drafts → Retail Display blueprint.
3. **Do:** Read scope, acknowledge, Load Retail Display draft → Preview Workflow.
4. **Expect:** The Retail Display internal candidate loads with seven stages and visible outstanding requirements.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### B4 — Exhibition Stand
1. **Role:** QA SPM.
2. **Click:** Workflow drafts → Exhibition Stand blueprint.
3. **Do:** Read scope, acknowledge, Load Exhibition Stand draft → Preview Workflow.
4. **Expect:** The Exhibition Stand internal candidate loads with eight stages; external approvals are not silently treated as implemented.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### B5 — Digital
1. **Role:** QA SPM.
2. **Click:** Workflow drafts → Digital blueprint.
3. **Do:** Read scope, acknowledge, Load Digital draft → Preview Workflow.
4. **Expect:** The Digital internal candidate loads with seven stages; preview does not promise working maintenance automation.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

## Phase 6 — Archives

### A1 — Categories, nested folders and movement
1. **Role:** QA Director.
2. **Click:** Archives → QA Artwork → QA Proofs.
3. **Do:** New folder → name it QA Human Nested → Save folder. Return to the category root; use Move QA-archive-proof.pdf, choose the nested folder and confirm. Navigate with the breadcrumbs.
4. **Expect:** The folder nests correctly and the same file moves without duplication. Use the All files view if needed after moving it.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### A2 — Controlled sharing and revocation
1. **Role:** QA Director → QA Ungranted Designer → QA Director.
2. **Click:** QA Artwork → QA-archive-proof.pdf → Manage access.
3. **Do:** Find recipient “Ungranted Designer” → Search → Select recipient; choose expiry, confirm scope → Confirm grant. That Designer downloads the file. Director selects Revoke access, gives a reason, confirms and revokes. Retry the saved download link as that Designer.
4. **Expect:** Only the granted file becomes accessible; the revoked user loses access even through the old link. QA Designer starts with a separate grant.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### A3 — Verification and SPM restrictions
1. **Role:** QA Director → QA SPM → QA Director.
2. **Click:** QA-archive-proof.pdf → Verify.
3. **Do:** Director reviews the file, enters Verification note, confirms verification and reloads. SPM checks permitted file/folder controls. Director chooses Revoke verification, gives a reason and confirms.
4. **Expect:** Verification and revocation retain reviewer/history. SPM cannot verify, revoke verification or delete Archive files; permitted organization and sharing remain available. Revocation of verification is separate from access revocation.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### A4 — Explicit completed-project publication
1. **Role:** QA Director.
2. **Click:** QA Completed for Archives → Publish to Archives.
3. **Do:** Select QA Artwork and destination folder; select qa-stage-output.pdf, enter Publication reason, review and tick both confirmations → Publish selected files → Open published Archive.
4. **Expect:** Only eligible selected stage output appears. Private Tasker evidence and completion documents are not automatically published. Publication does not make the completed source editable.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

## Phase 7 — Dashboard and navigation

### N1 — Dashboard and Search
1. **Role:** QA SPM, then QA Designer.
2. **Click:** Dashboard → My Work; Search.
3. **Do:** Open a work item; search “QA”, then “QA Restricted Other Project”.
4. **Expect:** Links open the permitted real records. Results and Dashboard reflect the user's role; private project details do not appear for either account.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### N2 — Task Calendar
1. **Role:** QA Designer.
2. **Click:** Calendar → month, week, agenda.
3. **Do:** Find the QA tasks due in the next few days; use Date/Apply filters if crossing a month. Open a task and return.
4. **Expect:** All views show consistent authorized task deadlines in Dubai time; the task opens with its real status.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### N3 — Attention and recorded messages
1. **Role:** QA SPM, then QA Digital Lead for overdue work.
2. **Click:** Notifications → Needs my attention / Deadline watch; SPM opens Recorded messages.
3. **Do:** Open a pending review and an overdue task. SPM finds QA Recorded Message and toggles Mark as read / Mark as unread; reload.
4. **Expect:** Attention reflects current work. Read state persists only for recorded messages. Attention is not proof that email, push or other messages were delivered; this session sends none.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN

### N4 — Original Manual Calendar
1. **Role:** QA SPM.
2. **Click:** Calendar → Manual Events, or fixture link → Manual Events.
3. **Do:** Open QA Personal Review; choose Create, enter QA Human Meeting and Save Event. Reload, open it and use its delete control when finished.
4. **Expect:** Personal manual events persist and can be removed by their creator. They remain separate from Task Calendar deadlines; shared event permissions remain enforced.
5. **Result:** ☐ PASS ☐ FAIL ☐ BLOCKED ☒ NOT RUN
