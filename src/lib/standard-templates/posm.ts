import type { CapabilityGap } from "./contracts";
import { blueprintAuthoring, fileStandardChecks, generalBriefFields, internalScope } from "./authoring";

export const posmGaps: CapabilityGap[] = [
  { id: "candidate-decisions", paragraphs: [125, 126, 133, 137, 518, 523], classification: "REQUIRES_BUSINESS_DECISION", missing: "Field requiredness, detailed checklists, reviewer identities where unspecified, file limits and fixed pilot gates are proposed; no approved official designation process.", internalPilotTreatment: "Every field and block labels candidate choices. Owner brief review is a proposed internal route, not a source-assigned approver." },
  { id: "material-applicability-skip", paragraphs: [123, 128, 129, 130], classification: "REQUIRES_NEW_CAPABILITY", missing: "Material Type cannot change field/checklist requirements, make sourcing conditionally mandatory or allow Director-approved printed research skipping.", internalPilotTreatment: "One template, visible Printed POSM / Merchandise selector, optional branch fields and fixed stages for both. Human applicability review; no skip or bypass." },
  { id: "structured-offers", paragraphs: [129, 130, 418], classification: "REQUIRES_NEW_CAPABILITY", missing: "No structured vendor comparison or enforcement of at least three distinct RFP offers, per-offer MOQ, lead time, price and sample availability.", internalPilotTreatment: "Optional merchandise quote files and scalar summaries record evidence only; file count never substitutes for distinct offers." },
  { id: "vendor-orders", paragraphs: [129, 130, 139, 141, 142, 522], classification: "REQUIRES_EXTERNAL_INTEGRATION", missing: "No CERBER verification, Director external vendor selection, procurement, agreed external order conditions or approved production-order dispatch.", internalPilotTreatment: "Record references and independent Director internal evidence review. No vendor message, order or payment is sent." },
  { id: "concept-task-gates", paragraphs: [131, 132, 133, 327], classification: "REQUIRES_NEW_CAPABILITY", missing: "No concept-to-stage task gate, all-format adaptation validation or enforcement of merchandise 1–2 revision rounds.", internalPilotTreatment: "Manually create Initial/Final Concept Universal Tasks. Review exact uploaded design evidence; task references and round summaries do not prove task completion." },
  { id: "format-size-outlet-records", paragraphs: [125, 135, 136], classification: "REQUIRES_NEW_CAPABILITY", missing: "No repeating format, apparel-size, quantity or outlet-distribution records or cross-row completeness checks.", internalPilotTreatment: "Optional branch summaries and attached registers; no paragraph is treated as a validated row matrix." },
  { id: "outlet-photo-count", paragraphs: [144], classification: "REQUIRES_NEW_CAPABILITY", missing: "No per-outlet photo count calculated against the minimum in the brief.", internalPilotTreatment: "Record the brief minimum as an optional Printed POSM number and attach photos/report. Fixed file limits do not enforce that number." },
  { id: "physical-production-quality", paragraphs: [139, 140, 142, 145], classification: "REQUIRES_NEW_CAPABILITY", missing: "No physical golden-sample lifecycle, proof authenticity, mass-production or batch-quality certification.", internalPilotTreatment: "Human review of submitted proof/sample/QC evidence only, retaining reviewer independence." },
  { id: "inventory-distribution", paragraphs: [144, 145], classification: "REQUIRES_EXTERNAL_INTEGRATION", missing: "No real stock, warehouse intake, department/event issue or delivery/distribution quantity reconciliation.", internalPilotTreatment: "Store records and review notes without asserting inventory state." },
  { id: "artwork-regulatory-validation", paragraphs: [128, 135, 137, 442, 509, 510, 511, 512, 513, 514, 515, 516], classification: "REQUIRES_NEW_CAPABILITY", missing: "No local advertising compliance engine, binary artwork preflight or print/merchandise variant validation.", internalPilotTreatment: "Capture supplied restrictions, exact files and human File Standard attestations; no legal certification." },
  { id: "documents-signatures", paragraphs: [126, 146, 408, 424, 426, 429, 432, 446, 447, 505, 521], classification: "REQUIRES_NEW_CAPABILITY", missing: "No prefilled Creative Brief/RFP, signed external contracts, bilateral Acceptance Protocol, external document lifecycle or lawyer-approved wording. Fixed document stage numbers conflict with POSM's six stages.", internalPilotTreatment: "Upload manually prepared documents by business purpose. Optional framework/copyright evidence is not a signature or pre-production legal gate; final document policy stays separate." },
  { id: "planning-budget-tasks", paragraphs: [125, 443, 519, 520], classification: "REQUIRES_NEW_CAPABILITY", missing: "No automatic scheduling, budget accounting or template starter-task generation; source durations/tasks remain open.", internalPilotTreatment: "Store agreed dates, currency and budget values; create actual General Tasks manually." },
  { id: "completion-governance", paragraphs: [56, 146, 340, 398], classification: "SUPERSEDED_BY_APPROVED_V2_RULE", missing: "Source completion/automatic archive cannot substitute for V2 explicit final-project governance or establish signed acceptance.", internalPilotTreatment: "Stage evidence gates only. Explicit Director document policy, actual Owner request and separate Director final decision; no automatic archive." },
];

export function posmBlueprint() {
  const a = blueprintAuthoring("posm"), { field: f, info, file, checks, approval, stage } = a;
  const printed = "Printed POSM only; optional in this fixed internal template. Leave empty for merchandise. Conditional requiredness is not enforced.";
  const merch = "Merchandise only; optional in this fixed internal template. Leave empty for printed POSM. Conditional requiredness is not enforced.";
  stage("brief", "Brief", [124, 125, 126], "Capture the material choice and brief. Material Type records context; it does not switch required fields or skip stages.", [
    info("brief_fields", "Material Type and shared brief", [123, 125, 126], [
      f("scope", "Candidate scope", [123, 518], "READ_ONLY", false, [], "", internalScope),
      f("material_type", "Material Type", [123, 125], "SELECT", true, ["Printed POSM", "Merchandise"], "One source template. Both branches remain visible; no automatic applicability enforcement."),
      f("items_formats", "Items, formats and sizes", [123, 125]), f("languages", "Languages", [125]),
      f("quantities", "Quantities by format / size", [125]), f("outlet_count", "Number of outlets", [125], "NUMBER"),
      f("channel", "Channel", [125], "SELECT", true, ["Duty free", "Retail", "HoReCa", "Trade", "Event"]),
      f("market", "Target market", [125], "SHORT_TEXT"), f("purpose", "Purpose", [125], "SELECT", true, ["Campaign", "Event", "Trade gift"]),
      f("unit_budget", "Unit budget", [125], "NUMBER"), f("total_budget", "Total budget", [125], "NUMBER"),
      f("currency", "Agreed budget currency", [125], "SHORT_TEXT", true, [], "Source does not prescribe a currency; record the agreed unit."),
      f("required_date", "Required-by date", [125], "DATE"),
      f("printed_min_photos", "Printed POSM · brief minimum outlet photos", [144], "NUMBER", false, [], `${printed} Recorded value only; no downstream photo-count gate.`),
    ]),
    info("creative_brief", "Creative Brief – General content", [436, 437, 438, 439, 440, 441, 442, 443, 444, 445, 448], generalBriefFields(a)),
    file("brief_file", "Creative Brief – General evidence", [126, 412, 414, 446, 447], "Upload the manually prepared brief with licensed-elements legal note and Final Artwork File Standard. No generated document or external release."),
    approval("brief_review", "Owner internal brief review · candidate choice", [126, 448, 518], "PROJECT_OWNER", "The source requires brief approval but does not identify its reviewer. Fixed independent Owner review is a proposed candidate choice."),
  ]);
  stage("research", "Research / Sourcing", [127, 128, 129, 130], "Review applicable research or sourcing evidence. Printed research cannot be skipped; record limitations in the fixed internal review record. Merchandise three-offer/CERBER rules remain unenforced.", [
    info("research_summary", "Research / sourcing review summary", [128, 129, 130], [f("research_applicability", "Applicable research, sourcing evidence and unresolved conditions", [128, 129, 130])]),
    info("printed_research", "Printed POSM · research (optional capture)", [128], [f("printed_restrictions", "Printed POSM · local advertising restrictions", [128], "LONG_TEXT", false, [], printed), f("printed_benchmark", "Printed POSM · benchmark", [128], "LONG_TEXT", false, [], printed)], printed),
    info("merch_sourcing", "Merchandise · sourcing (optional capture)", [129, 130], [
      f("merch_offer_summary", "Merchandise · offers and catalogue references", [129], "LONG_TEXT", false, [], `${merch} Source requires at least three distinct quotes; not counted here.`),
      f("merch_moq", "Merchandise · MOQ summary", [129], "NUMBER", false, [], merch),
      f("merch_lead_time", "Merchandise · lead time with agreed unit", [129], "SHORT_TEXT", false, [], merch),
      f("merch_unit_cost", "Merchandise · unit cost", [129], "NUMBER", false, [], merch),
      f("merch_cost_currency", "Merchandise · quote currency", [129], "SHORT_TEXT", false, [], merch),
      f("merch_sample", "Merchandise · sample availability", [129], "LONG_TEXT", false, [], merch),
      f("merch_vendor", "Merchandise · Director vendor selection / CERBER evidence references", [129], "LONG_TEXT", false, [], `${merch} Reference only, no verified external state.`),
      f("merch_conditions", "Merchandise · agreed order conditions", [130], "LONG_TEXT", false, [], merch),
    ], merch),
    file("research_record", "Applicable research / sourcing review record", [128, 129, 130], "Record applicable research and exceptions. This fixed pilot evidence requirement is not source permission to skip or a vendor-selection gate.", [".pdf", ".xlsx", ".csv"]),
    file("printed_photos", "Printed POSM · outlet reference photos (optional)", [128], printed, [".pdf", ".jpg", ".png", ".zip"], false),
    file("merch_quotes", "Merchandise · catalogues, quotes and RFP (optional)", [129, 418], `${merch} No structured minimum offer count or external RFP dispatch.`, [".pdf", ".xlsx", ".zip"], false),
    checks("research_checks", "Applicable evidence review", [128, 129, 130], [["research_attestation", "Applicable restrictions / sourcing evidence and outstanding conditions reviewed", [128, 129, 130]]]),
  ]);
  stage("design", "Concept & Design", [131, 132, 133], "Create Initial Concept / Final Concept Universal Tasks manually for creative work. Review design evidence here; neither tasks, format coverage nor source 1–2 merchandise rounds are enforced by this stage.", [
    info("design_fields", "Design evidence summary", [132, 133], [f("key_visual", "Key Visual and all-format adaptations", [132]), f("concept_references", "Concept Task references and reviewed final design", [132, 133], "LONG_TEXT", true, [], "References do not verify task completion."), f("merch_logo", "Merchandise · logo placement", [132], "LONG_TEXT", false, [], merch), f("merch_colours", "Merchandise · item colours", [132], "LONG_TEXT", false, [], merch), f("merch_rounds", "Merchandise · revision rounds and review notes", [132], "LONG_TEXT", false, [], `${merch} Source 1–2 rounds are recorded, not enforced.`)]),
    file("design_evidence", "Reviewed design evidence", [132, 133], "Upload Key Visual, adaptations and applicable merchandise design outcomes with task references. Independent file review is a candidate route, not proof of all required concepts or revision rounds.", [".pdf", ".ai", ".psd", ".zip"]),
  ]);
  stage("specification", "Specification", [134, 135, 136, 137], "Capture applicable print / merchandise specifications and exact artwork versions. Branch fields remain optional; detailed per-format, outlet and size registers need human review.", [
    info("spec_summary", "Specification applicability", [135, 136, 137], [f("spec_applicability", "Selected material, applicable requirements and unresolved exceptions", [135, 136, 137])]),
    info("printed_spec", "Printed POSM · specification (optional capture)", [135], [
      ...[["sizes", "Final sizes with units"], ["bleed", "Bleed with units"], ["substrate", "Material / substrate"], ["finishes", "Finishes"], ["quantity", "Quantities by format"], ["texts", "Mandatory texts"], ["distribution", "Distribution by outlet"]].map(([key, label]) => f(`printed_${key}`, `Printed POSM · ${label}`, [135], "LONG_TEXT", false, [], printed)),
    ], printed),
    info("merch_spec", "Merchandise · specification (optional capture)", [136], [
      f("merch_branding", "Merchandise · branding method", [136], "SELECT", false, ["Engraving", "Pad print", "Embroidery", "Sublimation", "Screen print"], merch),
      ...[["pantone", "Pantone / colour specification"], ["print_area", "Print area with units"], ["packaging", "Unit packaging"], ["sizes", "Apparel size split S / M / L / XL"]].map(([key, label]) => f(`merch_${key}`, `Merchandise · ${label}`, [136], "LONG_TEXT", false, [], merch)),
    ], merch),
    file("spec_register", "Applicable format / outlet / size specification register", [135, 136, 137], "Detailed register is reviewed as evidence; no repeatable rows or quantity completeness enforced.", [".pdf", ".xlsx", ".csv"]),
    file("artwork", "Final Artwork and PDF previews", [137, 509, 515, 516], "Upload editable artwork and preview for the applicable print or merchandise variant. No binary preflight.", [".pdf", ".ai", ".psd", ".eps", ".zip"]),
    file("contract_evidence", "Framework / Copyright evidence where applicable (optional)", [424, 425, 426], "Manual evidence only; no signature verification, external dispatch or automatic before-artwork legal gate.", [".pdf"], false),
    fileStandardChecks(a, "POSM"),
  ]);
  stage("production", "Production & Approval", [138, 139, 140, 141, 142], "Review proof / golden-sample and production records. The Director decision approves internal evidence only; it does not place, dispatch or certify a production order.", [
    info("production_summary", "Production evidence summary", [139, 140, 141, 142], [f("production_order", "Production-order approval evidence and outstanding conditions", [141, 142]), f("printed_handover", "Printed POSM · printer proof, review and handover references", [139], "LONG_TEXT", false, [], printed), f("merch_production", "Merchandise · supplier visual, golden sample and mass production references", [140], "LONG_TEXT", false, [], merch)]),
    file("production_evidence", "Applicable proof / golden-sample and production evidence", [139, 140, 142], "Upload the applicable branch evidence and internal approval/handover records. A photo or PDF does not certify physical quality or external release.", [".pdf", ".jpg", ".png", ".zip"]),
    checks("production_checks", "Production evidence review", [139, 140, 142], [["production_attestation", "Applicable proof / sample and production evidence manually reviewed", [139, 140, 142]]]),
    approval("production_review", "Director internal production-evidence approval", [141, 142], "DIRECTOR", "Source production orders require the Director. This supported internal decision does not execute the source external order requirement or full approval chain."),
  ]);
  stage("delivery", "Delivery & Execution", [143, 144, 145, 146], "Review delivery / execution or batch / warehouse evidence and the Acceptance Protocol. Photo minima, inventory and bilateral signatures remain unenforced.", [
    info("delivery_summary", "Delivery and acceptance summary", [144, 145, 146, 500, 501, 503, 504], [f("acceptance_summary", "Received quantities, acceptance decision, remarks and fix deadlines", [500, 501, 503, 504]), f("printed_delivery", "Printed POSM · delivery and outlet distribution", [144], "LONG_TEXT", false, [], printed), f("printed_photo_review", "Printed POSM · execution photos against brief minimum (human review)", [144], "LONG_TEXT", false, [], `${printed} No automated count.`), f("merch_batch", "Merchandise · batch quality check", [145], "LONG_TEXT", false, [], merch), f("merch_intake", "Merchandise · warehouse intake", [145], "LONG_TEXT", false, [], merch), f("merch_issue", "Merchandise · issue to departments / events", [145], "LONG_TEXT", false, [], merch)]),
    file("execution_evidence", "Delivery / execution photos or batch / warehouse report", [144, 145], "Include applicable execution photographs or QC/intake/issue records. Counts and stock are not reconciled.", [".pdf", ".jpg", ".png", ".xlsx", ".zip"]),
    file("acceptance_protocol", "Acceptance Protocol evidence", [146, 499, 505, 506], "Upload a manually prepared protocol. Internal review does not prove both parties signed or confirm external acceptance."),
    checks("delivery_checks", "Delivery and acceptance review", [144, 145, 146], [["delivery_attestation", "Applicable execution or batch records reviewed with limitations", [144, 145]], ["acceptance_attestation", "Protocol, remarks and unresolved issues reviewed", [146, 503, 504, 505]]]),
  ]);
  return a.finish("gti-posm-promotional-materials", "POSM & Promotional Materials", "POSM", [122, 123, 146],
    "Material Type is visible but does not change gates. Printed and merchandise fields are optional; all six evidence stages remain fixed. No three-offer count, per-outlet photo minimum, stock reconciliation or signed acceptance enforcement.", structuredClone(posmGaps), [
      { type: "INITIAL_CONCEPT", paragraphs: [131, 132, 133], instructions: "Manually create Initial Concept tasks for Key Visual / directions and format adaptations. Existing independent review applies; no new fixed concept stage or minimum task count." },
      { type: "FINAL_CONCEPT", paragraphs: [131, 132, 133], instructions: "Manually create Final Concept tasks using eligible exact inspiration where appropriate; retain merchandise logo/colour revisions. Source 1–2 rounds and all-format coverage are not automatically enforced." },
    ]);
}
