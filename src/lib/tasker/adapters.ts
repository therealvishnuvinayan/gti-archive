import { Prisma, ProjectFileChecklistField, ProjectInquiryAttachmentField, ProjectInquiryClientOrigin, ProjectInquiryPriority } from "@prisma/client";
import { sanitizeRichText } from "@/lib/rich-text";
import { STAGE_FIVE_FIELD_DEFINITIONS } from "@/lib/stage-five-fields";
import { isProjectInquiryCountryLabel } from "@/lib/project-inquiry-countries";
import { validateStageFiveChecklistResponse } from "@/lib/stage-five";
import { taskAssert } from "./errors";
import { recordFieldChange } from "./field-changes";
import type { TaskField, TaskOption, TaskProjectRef, TaskProjectType, TaskValue } from "./types";

export type TaskDb = Prisma.TransactionClient;
type TargetScope = "inquiry" | "checklist" | "draft" | "project" | "milestone" | "folder";
export type AdapterField = TaskField & {
  scope: TargetScope;
  recordId: string;
  key: string;
  value: TaskValue;
  revision: string;
  draftValues?: TaskValue[];
  formKey?: string;
  path?: string[];
};
export type ProjectTaskContext = TaskProjectRef & {
  projectBrief?: string;
  deliverables?: string[];
  referenceFolders?: Array<TaskOption & { href: string }>;
  name: string;
  ownerId: string;
  coOwnerIds: string[];
  people: TaskOption[];
  stages: TaskOption[];
  fields: AdapterField[];
  destinations: TaskOption[];
};

export interface TaskProjectAdapter {
  type: TaskProjectType;
  load(db: TaskDb, projectId: string): Promise<ProjectTaskContext>;
  apply(db: TaskDb, context: ProjectTaskContext, field: AdapterField, value: TaskValue, files: PublishedTaskFile[], actorId: string, taskId: string): Promise<void>;
}
export type PublishedTaskFile = { id: string; name: string; mimeType: string; size: number };
const stageNames = ["Project inquiry", "Research and planning", "Concept creation", "Project development", "Final layout", "Production and handover", "Implementation and supervision"];
const choices = (values: string[]): TaskOption[] => values.map((id) => ({ id, label: id.replaceAll("_", " ").toLowerCase().replace(/^./, (s) => s.toUpperCase()) }));
const dateOnly = (date: Date | null | undefined) => date?.toISOString().slice(0, 10) ?? "";
const record = (value: unknown): Record<string, TaskValue> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, TaskValue> : {};
const attachmentValue = (files: PublishedTaskFile[]) => files.map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size }));

function field(scope: TargetScope, recordId: string, key: string, label: string, stageRef: string, control: TaskField["control"], value: TaskValue, revision: string, extra: Partial<AdapterField> = {}): AdapterField {
  return { id: `${scope}:${recordId}:${key}`, scope, recordId, key, label, stageRef, control, value, revision, ...extra };
}

export function publicTaskField(item: AdapterField | TaskField, showStage = true): TaskField {
  return { id: item.id, label: item.label, stageRef: showStage ? item.stageRef : "", control: item.control, options: item.options, checklistControl: item.checklistControl, acceptsFiles: item.acceptsFiles, maxFiles: item.maxFiles, required: item.required, help: item.help };
}

async function people(db: TaskDb, ids: string[]) {
  return (await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } })).map((u) => ({ id: u.id, label: u.name || u.email }));
}

export function assertTaskParticipant(context: ProjectTaskContext, userId: string) {
  taskAssert(context.people.some((p) => p.id === userId), "This project is not available to you in Tasker.", 403);
}

export function assertTaskDestination(context: ProjectTaskContext, destinationId: string, creatorId: string, recipientId: string) {
  assertTaskParticipant(context, creatorId);
  assertTaskParticipant(context, recipientId);
  // Both adapters expose only shared destinations readable by all of their eligible participants.
  taskAssert(context.destinations.some((d) => d.id === destinationId), "The destination is no longer accessible to both participants.", 409);
}

const structuredAdapter: TaskProjectAdapter = {
  type: "STRUCTURED",
  async load(db, projectId) {
    const project = await db.project.findUnique({ where: { id: projectId }, include: {
      coOwners: { select: { userId: true } }, executors: { select: { userId: true } },
      inquiry: { include: { parties: true, deliverables: true, targetMarkets: true, attachments: { include: { attachment: true } } } },
      fileChecklists: { include: { sourceAttachment: { select: { originalFileName: true } }, items: { include: { attachments: { include: { attachment: true } } } } } },
      productionUnits: { where: { retiredAt: null }, select: { id: true, sourceAttachment: { select: { id: true, originalFileName: true } }, files: { select: { attachment: { select: { id: true, originalFileName: true, status: true } } } } } },
    } });
    taskAssert(project?.ownerId, "Project not found.", 404);
    const participantOptions = await people(db, [project.ownerId, ...project.coOwners.map((u) => u.userId), ...project.executors.map((u) => u.userId)]);
    const context: ProjectTaskContext = { projectType: "STRUCTURED", projectId, name: project.name, ownerId: project.ownerId, coOwnerIds: project.coOwners.map((u) => u.userId), people: participantOptions, stages: stageNames.map((label, index) => ({ id: String(index + 1), label: `${index + 1}. ${label}` })), fields: [], destinations: [] };
    const inquiry = project.inquiry;
    context.projectBrief = inquiry?.initialBrief ?? "";
    context.deliverables = inquiry?.deliverables.map((d) => d.label) ?? [];
    const rev = inquiry?.updatedAt.toISOString() ?? "missing";
    const inquiryForm = "stage-one-project-inquiry";
    const addInquiry = (key: string, label: string, control: TaskField["control"], value: TaskValue, extra: Partial<AdapterField> = {}) => context.fields.push(field("inquiry", projectId, key, label, "1", control, value, rev, { formKey: inquiryForm, path: [key], ...extra }));
    for (const [key, label] of [["initialBrief", "Initial brief"], ["businessObjectives", "Business objectives"], ["legalNotes", "Legal notes"]] as const) {
      addInquiry(key, label, "textarea", inquiry?.[key] ?? "");
      const attachmentField = ({ initialBrief: "INITIAL_BRIEF", businessObjectives: "BUSINESS_OBJECTIVES", legalNotes: "LEGAL_NOTES" } as const)[key];
      const value = inquiry?.attachments.filter((a) => a.field === attachmentField).map((a) => a.attachmentId).sort() ?? [];
      addInquiry(attachmentField, `${label} attachments`, "files", value, { acceptsFiles: true, path: ["attachments", attachmentField] });
    }
    addInquiry("clientOrigin", "Client origin", "select", inquiry?.clientOrigin ?? "", { options: choices(["INTERNAL", "EXTERNAL"]) });
    addInquiry("priority", "Inquiry priority", "select", inquiry?.priority ?? "", { options: choices(["LOW", "MEDIUM", "HIGH"]) });
    addInquiry("inquiryDate", "Inquiry date", "date", dateOnly(inquiry?.inquiryDate));
    addInquiry("deadline", "Inquiry deadline", "date", dateOnly(inquiry?.deadline));
    addInquiry("targetMarkets", "Target markets", "list", inquiry?.targetMarkets.map((m) => m.label) ?? []);
    addInquiry("deliverables", "Deliverables", "list", inquiry?.deliverables.map((d) => d.label) ?? []);
    // Directory entries carry only display names into the task; contact details are resolved on acceptance.
    const contacts = await db.contactDirectoryEntry.findMany({ where: { deletedAt: null }, select: { id: true, name: true, company: true, directoryRoles: true }, orderBy: { name: "asc" } });
    for (const [key, label, role] of [["client", "Client", "CLIENT"], ["finalBeneficiaries", "Final beneficiaries", "FINAL_BENEFICIARY"]] as const) {
      const options = [...participantOptions.map((p) => ({ ...p, id: `USER:${p.id}` })), ...contacts.filter((c) => c.directoryRoles.includes(role)).map((c) => ({ id: `MANUAL_CONTACT:${c.id}`, label: [c.name, c.company].filter(Boolean).join(" · ") }))];
      const ids = inquiry?.parties.filter((p) => p.role === role).sort((a, b) => a.sequence - b.sequence).map((p) => `${p.source}:${p.userId ?? p.contactId}`) ?? [];
      addInquiry(key, label, key === "client" ? "select" : "multi-select", key === "client" ? ids[0] ?? "" : ids, { options, required: true });
    }
    for (const checklist of project.fileChecklists) {
      for (const definition of STAGE_FIVE_FIELD_DEFINITIONS) {
        const item = checklist.items.find((i) => i.fieldKey === definition.key);
        context.fields.push(field("checklist", checklist.id, definition.key, `${checklist.sourceAttachment.originalFileName} · ${definition.title}`, "5", "checklist", { ...record(item?.value), attachmentIds: item?.attachments.map((a) => a.attachmentId).sort() ?? [] }, item?.updatedAt.toISOString() ?? "missing", {
          checklistControl: definition.control, acceptsFiles: ["file", "multi-file", "health-warning", "finishes", "text-attachment"].includes(definition.control), maxFiles: definition.control === "file" ? 1 : 20,
          formKey: `stage-five-checklist:${checklist.handoffId}`, help: definition.helper,
        }));
      }
    }
    const folders = await db.projectResearchFolder.findMany({ where: { workspace: { projectId, ownerUserId: project.ownerId } }, orderBy: { sortOrder: "asc" } });
    for (const folder of folders) {
      let ancestor = folder;
      const visited = new Set<string>();
      const path = [folder.name];
      while (ancestor.parentFolderId && !visited.has(ancestor.id)) {
        visited.add(ancestor.id);
        const parent = folders.find((f) => f.id === ancestor.parentFolderId);
        if (!parent) break;
        ancestor = parent;
        path.unshift(parent.name);
      }
      if (!["BRIEF", "TECH"].includes(ancestor.systemKey ?? "")) continue;
      context.destinations.push({ id: folder.id, label: path.join(" / ") });
      if (!folder.isSystem) context.fields.push(field("folder", folder.id, "name", `${path.join(" / ")} · Folder name`, "2", "text", folder.name, folder.updatedAt.toISOString(), { required: true }));
    }
    // Stage 6/7 requests fill editable request drafts, never issued snapshots or approval decisions.
    const handoverFields: Array<[string, string, TaskField["control"], TaskOption[]?]> = [
      ["route", "Handover route", "select", choices(["PURCHASE_DEPARTMENT", "DIRECT_VENDOR"])], ["recipientUserId", "Recipient", "select", participantOptions],
      ["company", "Company", "text"], ["contactName", "Contact name", "text"], ["email", "Email", "text"], ["phone", "Phone", "text"], ["note", "Handover note", "textarea"],
    ];
    const sampleFields: typeof handoverFields = [
      ["name", "Sample name", "text"], ["type", "Sample type", "select", choices(["PRE_PRODUCTION_SAMPLE", "PRODUCTION_SAMPLE", "FINAL_MASS_PRODUCTION_SIGN_OFF", "CUSTOM"])],
      ["customTypeName", "Custom sample type", "text"], ["deadline", "Sample deadline", "date"],
      ["recipientRoute", "Recipient route", "select", choices(["PURCHASE_DEPARTMENT", "DIRECT_VENDOR"])], ["recipientUserId", "Recipient", "select", participantOptions],
      ["recipientCompany", "Recipient company", "text"], ["recipientName", "Recipient name", "text"], ["recipientEmail", "Recipient email", "text"], ["recipientPhone", "Recipient phone", "text"],
      ["requestNote", "Sample request note", "textarea"], ["reminderEnabled", "Enable sample request reminders", "boolean"], ["reminderIntervalHours", "Sample reminder interval (hours)", "select", choices(["24", "48", "72"])],
    ];
    for (const unit of project.productionUnits) {
      for (const [stageRef, formKey, definitions] of [
        ["6", `stage-six-handover:${unit.id}`, [...handoverFields, ["fieldKeys", "Information to share", "multi-select", STAGE_FIVE_FIELD_DEFINITIONS.map((f) => ({ id: f.key, label: f.title }))], ["fileIds", "Files to hand over", "multi-select", [unit.sourceAttachment, ...unit.files.filter((f) => f.attachment.status === "READY").map((f) => f.attachment)].map((f) => ({ id: f.id, label: f.originalFileName }))]] as typeof handoverFields], ["7", `stage-seven-sample-request:${unit.id}`, sampleFields],
      ] as const) {
        const changes = await db.taskerFieldChange.findMany({ where: { projectId, formKey }, orderBy: { id: "asc" } });
        for (const [key, label, control, options] of definitions) {
          const latest = changes.filter((c) => c.path[0] === key).at(-1);
          context.fields.push(field("draft", unit.id, key, `${unit.sourceAttachment.originalFileName} · ${label}`, stageRef, control, latest?.value as TaskValue ?? (control === "boolean" ? false : ""), String(latest?.id ?? 0), { id: `draft:${stageRef}:${unit.id}:${key}`, options, formKey, path: [key], help: "Fills the current request form. Sending and approvals remain separate." }));
        }
      }
    }
    context.referenceFolders = context.destinations.map((d) => ({ ...d, href: `/projects/${projectId}/workspace/shared/${d.id}` }));
    const drafts = await db.projectFormDraft.findMany({ where: { projectId, userId: { in: [context.ownerId, ...context.coOwnerIds] } }, orderBy: { userId: "asc" } });
    for (const target of context.fields) {
      if (!target.formKey) continue;
      const path = target.path ?? ["draft", "textValues", target.key];
      const relevant = drafts.filter((d) => d.formKey === target.formKey).flatMap((d) => {
        let value: unknown = d.payload;
        for (const key of path) value = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
        return value === undefined ? [] : [{ userId: d.userId, value: value as TaskValue }];
      });
      target.draftValues = relevant.map((d) => d.value);
      target.revision = JSON.stringify({ saved: target.revision, drafts: relevant });
      if (target.scope === "draft" && relevant.length) target.value = relevant[0].value;
    }
    return context;
  },
  async apply(db, context, target, value, files, actorId, taskId) {
    const { projectId } = context;
    let patch: TaskValue = value;
    if (target.scope === "inquiry") {
      const inquiry = await db.projectInquiry.upsert({ where: { projectId }, create: { projectId }, update: {} });
      const key = target.key;
      if (["initialBrief", "businessObjectives", "legalNotes"].includes(key)) {
        await db.projectInquiry.update({ where: { id: inquiry.id }, data: { [key]: sanitizeRichText(String(value)) } });
      } else if (key === "clientOrigin" || key === "priority") {
        await db.projectInquiry.update({ where: { id: inquiry.id }, data: key === "clientOrigin" ? { clientOrigin: value as ProjectInquiryClientOrigin || null } : { priority: value as ProjectInquiryPriority || null } });
      } else if (key === "deadline" || key === "inquiryDate") {
        await db.projectInquiry.update({ where: { id: inquiry.id }, data: { [key]: value ? new Date(`${value}T00:00:00Z`) : null } });
      } else if (key === "deliverables" || key === "targetMarkets") {
        const values = value as string[];
        if (key === "deliverables") {
          await db.projectInquiryDeliverable.deleteMany({ where: { inquiryId: inquiry.id } });
          await db.projectInquiryDeliverable.createMany({ data: values.map((label) => ({ inquiryId: inquiry.id, label, normalizedLabel: label.toLowerCase() })) });
        } else {
          await db.projectInquiryTargetMarket.deleteMany({ where: { inquiryId: inquiry.id } });
          await db.projectInquiryTargetMarket.createMany({ data: values.map((label) => ({ inquiryId: inquiry.id, label, normalizedLabel: label.toLowerCase(), kind: label.toLowerCase() === "global" ? "GLOBAL" : isProjectInquiryCountryLabel(label) ? "COUNTRY" : "REGION" })) });
          patch = values.map((label) => ({ label }));
        }
      } else if (key === "client" || key === "finalBeneficiaries") {
        const role = key === "client" ? "CLIENT" : "FINAL_BENEFICIARY";
        const ids = typeof value === "string" ? [value] : value as string[];
        const snapshots = [];
        for (const id of ids) {
          const [source, referenceId] = id.split(":");
          if (source === "USER") {
            const user = await db.user.findUniqueOrThrow({ where: { id: referenceId } });
            snapshots.push({ source: "USER" as const, userId: user.id, contactId: null, snapshotName: user.name || user.email, snapshotEmail: user.email, snapshotPhone: user.phoneNumber, snapshotCompany: user.department, snapshotEntityType: "PERSON" as const });
          } else {
            const contact = await db.contactDirectoryEntry.findFirst({ where: { id: referenceId, deletedAt: null, directoryRoles: { has: role } } });
            taskAssert(contact, "The selected contact is no longer available.", 409);
            snapshots.push({ source: "MANUAL_CONTACT" as const, userId: null, contactId: contact.id, snapshotName: contact.name, snapshotEntityType: contact.entityType, snapshotCompany: contact.company, snapshotCompanyEmail: contact.companyEmail, snapshotCompanyPhone: contact.companyPhone, snapshotCompanyWebsite: contact.companyWebsite, snapshotPosition: contact.position, snapshotEmail: contact.email, snapshotPhone: contact.phone });
          }
        }
        if (role === "CLIENT") taskAssert(snapshots[0]?.snapshotCompany?.trim(), "The client must have a company name.");
        await db.projectInquiryParty.deleteMany({ where: { inquiryId: inquiry.id, role } });
        await db.projectInquiryParty.createMany({ data: snapshots.map((s, sequence) => ({ ...s, inquiryId: inquiry.id, role, sequence })) });
        const selections = snapshots.map((s) => ({ source: s.source, id: s.userId ?? s.contactId, name: s.snapshotName, entityType: s.snapshotEntityType, company: s.snapshotCompany, email: s.snapshotEmail, phone: s.snapshotPhone }));
        patch = key === "client" ? selections[0] as TaskValue : selections as TaskValue;
      } else {
        taskAssert(Object.values(ProjectInquiryAttachmentField).includes(key as ProjectInquiryAttachmentField), "Unknown inquiry field.");
        await db.projectInquiryAttachment.deleteMany({ where: { inquiryId: inquiry.id, field: key as ProjectInquiryAttachmentField } });
        await db.projectInquiryAttachment.createMany({ data: files.map((f) => ({ inquiryId: inquiry.id, field: key as ProjectInquiryAttachmentField, attachmentId: f.id })) });
        patch = attachmentValue(files);
      }
    } else if (target.scope === "checklist") {
      const input = record(value);
      const validated = validateStageFiveChecklistResponse(target.key as ProjectFileChecklistField, input, files.map((f) => f.id));
      taskAssert(!("error" in validated), "error" in validated ? validated.error : "Invalid response.");
      const item = await db.projectFileChecklistItem.upsert({ where: { checklistId_fieldKey: { checklistId: target.recordId, fieldKey: target.key as ProjectFileChecklistField } }, create: { checklistId: target.recordId, fieldKey: target.key as ProjectFileChecklistField, value: validated.value, status: "FILLED", updatedById: actorId }, update: { value: validated.value, status: "FILLED", updatedById: actorId } });
      await db.projectFileChecklistItemAttachment.deleteMany({ where: { checklistItemId: item.id } });
      await db.projectFileChecklistItemAttachment.createMany({ data: files.map((f) => ({ checklistItemId: item.id, attachmentId: f.id })) });
      const prefix = ["draft"];
      const changes: Array<[string[], TaskValue]> = [
        [[...prefix, "textValues", target.key], validated.value.text ?? ""], [[...prefix, "multiValues", target.key], validated.value.values ?? []],
        [[...prefix, "files", target.key], files.map((f) => ({ id: f.id, attachmentId: f.id, name: f.name, mimeType: f.mimeType, size: f.size, source: "server", status: "ready" }))],
      ];
      if (target.key === "HEALTH_WARNING") changes.push([[...prefix, "healthWarningIncluded"], validated.value.included ?? false]);
      for (const [path, v] of changes) await recordFieldChange(db, projectId, target.formKey!, path, v, taskId);
      return;
    } else if (target.scope === "folder") {
      await db.projectResearchFolder.update({ where: { id: target.recordId }, data: { name: String(value), normalizedName: String(value).trim().toLowerCase() } });
      return;
    } else {
      taskAssert(target.scope === "draft", "This field cannot be delegated.");
      if (target.key === "reminderIntervalHours") patch = Number(value);
    }
    if (target.formKey && target.path) await recordFieldChange(db, projectId, target.formKey, target.path, patch, taskId);
  },
};

const flexibleAdapter: TaskProjectAdapter = {
  type: "FLEXIBLE",
  async load(db, projectId) {
    const project = await db.flexibleProject.findUnique({ where: { id: projectId }, include: { collaborators: { select: { userId: true } }, milestones: { orderBy: { sortOrder: "asc" } } } });
    taskAssert(project, "Project not found.", 404);
    const participantOptions = await people(db, [project.ownerId, ...project.collaborators.map((u) => u.userId)]);
    const context: ProjectTaskContext = { projectType: "FLEXIBLE", projectId, name: project.name, ownerId: project.ownerId, coOwnerIds: [], people: participantOptions, stages: [{ id: "project", label: "Project" }, ...project.milestones.map((m) => ({ id: m.id, label: m.name }))], fields: [], destinations: project.milestones.map((m) => ({ id: m.id, label: `${m.name} / Files` })) };
    context.projectBrief = project.description ?? "";
    context.referenceFolders = context.destinations.map((d) => ({ ...d, href: `/projects/flexible/${project.slug}/milestones/${d.id}` }));
    for (const [key, label, control, value, options] of [
      ["name", "Project name", "text", project.name], ["description", "Project description", "textarea", project.description ?? ""],
      ["deadline", "Project deadline", "date", dateOnly(project.deadline)], ["priority", "Priority", "select", project.priority, choices(["LOW", "MEDIUM", "HIGH"])],
      ["scope", "Project scope", "select", project.scope, choices(["INTERNAL", "EXTERNAL"])],
    ] as const) context.fields.push(field("project", projectId, key, label, "project", control, value, project.updatedAt.toISOString(), { options, required: key === "name" }));
    for (const milestone of project.milestones) {
      for (const [key, label, control, value, options] of [
        ["name", "Name", "text", milestone.name], ["description", "Description", "textarea", milestone.description ?? ""], ["category", "Category", "text", milestone.category ?? ""],
        ["deadline", "Deadline", "date", dateOnly(milestone.deadline)], ["responsibleUserId", "Responsible person", "select", milestone.responsibleUserId ?? "", participantOptions],
      ] as const) context.fields.push(field("milestone", milestone.id, key, `${milestone.name} · ${label}`, milestone.id, control, value, milestone.updatedAt.toISOString(), { options, required: key === "name" }));
    }
    return context;
  },
  async apply(db, context, target, value) {
    const data = { [target.key]: target.key === "deadline" ? value ? new Date(`${value}T00:00:00Z`) : null : target.key === "description" ? sanitizeRichText(String(value)) : value || null };
    if (target.scope === "project") await db.flexibleProject.update({ where: { id: context.projectId }, data });
    else if (target.scope === "milestone") await db.flexibleMilestone.update({ where: { id: target.recordId, projectId: context.projectId }, data });
    else taskAssert(false, "This field cannot be delegated.");
  },
};

// Future templates register an adapter here; they do not introduce another task engine.
const adapters: Record<TaskProjectType, TaskProjectAdapter> = { STRUCTURED: structuredAdapter, FLEXIBLE: flexibleAdapter };
export function getTaskProjectAdapter(type: TaskProjectType): TaskProjectAdapter {
  taskAssert(type === "STRUCTURED" || type === "FLEXIBLE", "Unknown project type.");
  return adapters[type];
}

export function validateTaskFieldValue(target: AdapterField, value: unknown, fileIds: string[]): TaskValue {
  if (target.control === "files") {
    taskAssert(fileIds.length > 0 && fileIds.length <= (target.maxFiles ?? 20), "Attach the requested files.");
    return null;
  }
  if (target.control === "checklist") {
    const result = validateStageFiveChecklistResponse(target.key as ProjectFileChecklistField, record(value), fileIds);
    taskAssert(!("error" in result), "error" in result ? result.error : "Invalid response.");
    return result.value as TaskValue;
  }
  taskAssert(!fileIds.length, "This input does not accept files.");
  if (target.control === "boolean") { taskAssert(typeof value === "boolean", "Choose yes or no."); return value; }
  if (target.control === "list" || target.control === "multi-select") {
    const maxItems = target.scope === "inquiry" ? 50 : 100, maxLength = target.scope === "inquiry" ? 160 : 500;
    taskAssert(Array.isArray(value) && value.length <= maxItems && value.every((v) => typeof v === "string" && v.length <= maxLength), `Enter a valid list (up to ${maxItems} items, ${maxLength} characters each).`);
    const values = [...new Map((value as string[]).map((v) => { const normalized = v.trim().replace(/\s+/g, " "); return [normalized.toLowerCase(), normalized]; })).values()].filter(Boolean);
    if (target.required) taskAssert(values.length, "Select at least one value.");
    if (target.control === "multi-select") taskAssert(values.every((v) => target.options?.some((o) => o.id === v)), "A selected option is no longer available.");
    return values;
  }
  taskAssert(typeof value === "string", "Enter a valid response.");
  const text = value.trim();
  const maxLength = target.control === "textarea" ? target.scope === "inquiry" ? 10000 : 5000 : target.key === "category" ? 80 : /name|company/i.test(target.key) ? 160 : 500;
  taskAssert(text.length <= maxLength, `The response must be ${maxLength} characters or fewer.`);
  if (target.required) taskAssert(text, "This value is required.");
  if (target.control === "select") taskAssert(!text || target.options?.some((o) => o.id === text), "Select a valid option.");
  if (target.control === "date" && text) taskAssert(/^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(text)) && new Date(text).toISOString().slice(0, 10) === text, "Enter a valid date.");
  if (target.key.toLowerCase().includes("email") && text) taskAssert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text), "Enter a valid email address.");
  return target.control === "textarea" ? sanitizeRichText(text) : text;
}
