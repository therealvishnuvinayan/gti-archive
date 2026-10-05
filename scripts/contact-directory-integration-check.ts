import assert from "node:assert/strict";
import { UserRole } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { deleteContactDirectoryEntry, getContactDirectory, saveContactDirectoryEntry } from "../src/lib/contact-directory";
import { completeProjectInquiry, createContactDirectoryEntry, getProjectInquiryPageData, searchProjectInquiryPartyOptions } from "../src/lib/project-inquiry";
import { getInitialProjectWorkflowStageData } from "../src/lib/project-workflow";
import { getSidebarVisibility } from "../src/lib/permissions/resolver";

const admin = { id: "directory-admin", role: UserRole.SUPER_ADMIN };
const deniedUser = { id: "directory-user", role: UserRole.USER };
const beneficiaryInput = { entityType: "PERSON" as const, name: "Jane Doe", email: "jane@example.test", phone: "+971501234567", position: "Manager" };
let checks = 0;
async function check(name: string, task: () => Promise<void>) {
  await task();
  checks++;
  console.log(`PASS: ${name}`);
}
async function main() {
  await prisma.user.createMany({ data: [
    { id: admin.id, role: admin.role, name: "Directory Admin", email: "directory-admin@example.test", passwordHash: "x" },
    { id: deniedUser.id, role: deniedUser.role, name: "Directory User", email: "directory-user@example.test", passwordHash: "x" },
  ] });
  const project = await prisma.project.create({ data: {
    id: "directory-project", name: "Directory project", ownerId: admin.id, createdById: admin.id,
    workflowStages: { createMany: { data: getInitialProjectWorkflowStageData() } },
  } });
  await check("Migration classifies known legacy roles and preserves shared or unused entries", async () => {
    assert.deepEqual((await prisma.contactDirectoryEntry.findUniqueOrThrow({ where: { id: "legacy-client" } })).directoryRoles, ["CLIENT"]);
    assert.deepEqual((await prisma.contactDirectoryEntry.findUniqueOrThrow({ where: { id: "legacy-beneficiary" } })).directoryRoles, ["FINAL_BENEFICIARY"]);
    for (const id of ["legacy-shared", "legacy-unused"]) {
      assert.deepEqual(new Set((await prisma.contactDirectoryEntry.findUniqueOrThrow({ where: { id } })).directoryRoles), new Set(["CLIENT", "FINAL_BENEFICIARY"]));
    }
  });
  await check("Directory routes and mutations reject unauthorized users", async () => {
    assert.equal(getSidebarVisibility(admin).clients, true);
    assert.equal(getSidebarVisibility(admin).finalBeneficiaries, true);
    assert.equal(getSidebarVisibility(deniedUser).clients, false);
    await assert.rejects(getContactDirectory(deniedUser, "CLIENT"));
    assert.ok("error" in await saveContactDirectoryEntry(deniedUser, "CLIENT", { company: "Denied" }));
    assert.ok("error" in await deleteContactDirectoryEntry(deniedUser, "CLIENT", "legacy-client"));
  });
  await check("Company and Person clients both require company names; beneficiary fields stay mandatory", async () => {
    for (const entityType of ["PERSON", "COMPANY"] as const) {
      const result = await saveContactDirectoryEntry(admin, "CLIENT", { entityType, name: "Client", company: "  " });
      assert.ok("error" in result && result.fieldErrors?.company);
    }
    const result = await saveContactDirectoryEntry(admin, "CONTACT", { entityType: "PERSON", name: "Beneficiary" });
    assert.ok("error" in result && result.fieldErrors?.email && result.fieldErrors?.phone && result.fieldErrors?.position);
  });
  const clientInput = { entityType: "COMPANY" as const, company: " RFQ LLC ", companyEmail: "COMPANY@example.test", companyWebsite: "example.test", name: "VVV" };
  const clientResult = await saveContactDirectoryEntry(admin, "CLIENT", clientInput);
  assert.ok("contact" in clientResult);
  const client = clientResult.contact;
  const beneficiaryResult = await saveContactDirectoryEntry(admin, "CONTACT", beneficiaryInput);
  assert.ok("contact" in beneficiaryResult);
  const beneficiary = beneficiaryResult.contact;
  await check("Create normalizes details and separates the two directories", async () => {
    assert.equal(client.company, "RFQ LLC");
    assert.equal(client.companyEmail, "company@example.test");
    assert.equal(client.companyWebsite, "https://example.test/");
    assert.deepEqual(client.directoryRoles, ["CLIENT"]);
    assert.deepEqual(beneficiary.directoryRoles, ["FINAL_BENEFICIARY"]);
    assert.ok((await getContactDirectory(admin, "CLIENT")).some(row => row.id === client.id));
    assert.ok(!(await getContactDirectory(admin, "CONTACT")).some(row => row.id === client.id));
    assert.ok(!(await getContactDirectory(admin, "CLIENT")).some(row => row.id === beneficiary.id));
  });
  await check("Wrong-directory edits and deletes cannot affect another entry", async () => {
    assert.ok("error" in await saveContactDirectoryEntry(admin, "CLIENT", { company: "Wrong directory" }, beneficiary.id));
    assert.ok("error" in await deleteContactDirectoryEntry(admin, "CONTACT", client.id));
    assert.equal((await prisma.contactDirectoryEntry.findUniqueOrThrow({ where: { id: client.id } })).deletedAt, null);
  });
  await check("Sidebar entries appear in the corresponding Stage 1 search, including searches by representative", async () => {
    assert.ok((await searchProjectInquiryPartyOptions(admin, project.id, "VVV", "CLIENT")).some(row => row.id === client.id));
    assert.ok(!(await searchProjectInquiryPartyOptions(admin, project.id, "RFQ", "CONTACT")).some(row => row.id === client.id));
    assert.ok((await searchProjectInquiryPartyOptions(admin, project.id, "Jane", "CONTACT")).some(row => row.id === beneficiary.id));
  });
  await check("Stage 1 additions appear in the matching sidebar directory", async () => {
    const inlineClient = await createContactDirectoryEntry(admin, project.id, { kind: "CLIENT", entityType: "PERSON", name: "Inline client", company: "Inline Ltd" });
    assert.ok("contact" in inlineClient);
    assert.ok((await getContactDirectory(admin, "CLIENT")).some(row => row.id === inlineClient.contact.id));
    assert.ok(!(await getContactDirectory(admin, "CONTACT")).some(row => row.id === inlineClient.contact.id));
    const inlineBeneficiary = await createContactDirectoryEntry(admin, project.id, { ...beneficiaryInput, kind: "CONTACT", name: "Inline beneficiary" });
    assert.ok("contact" in inlineBeneficiary);
    assert.ok((await getContactDirectory(admin, "CONTACT")).some(row => row.id === inlineBeneficiary.contact.id));
  });
  const inquiryInput = {
    projectId: project.id,
    client: { source: "MANUAL_CONTACT" as const, id: client.id },
    finalBeneficiaries: [{ source: "MANUAL_CONTACT" as const, id: beneficiary.id }],
  };
  assert.ok("success" in await completeProjectInquiry(admin, inquiryInput));
  await check("Edits update future selections while saved inquiry snapshots stay intact", async () => {
    const result = await saveContactDirectoryEntry(admin, "CLIENT", { ...clientInput, company: "Renamed Ltd" }, client.id);
    assert.ok("contact" in result && result.contact.company === "Renamed Ltd");
    assert.ok((await searchProjectInquiryPartyOptions(admin, project.id, "Renamed", "CLIENT")).some(row => row.id === client.id));
    assert.equal((await getProjectInquiryPageData(admin, project.id)).inquiry?.client?.company, "RFQ LLC");
  });
  await check("Deleted entries disappear from directories/search, and saved projects still display and save history", async () => {
    assert.ok("success" in await deleteContactDirectoryEntry(admin, "CLIENT", client.id));
    assert.ok("success" in await deleteContactDirectoryEntry(admin, "CONTACT", beneficiary.id));
    assert.ok(!(await getContactDirectory(admin, "CLIENT")).some(row => row.id === client.id));
    assert.ok(!(await searchProjectInquiryPartyOptions(admin, project.id, "", "CLIENT")).some(row => row.id === client.id));
    assert.ok(!(await searchProjectInquiryPartyOptions(admin, project.id, "", "CONTACT")).some(row => row.id === beneficiary.id));
    assert.equal((await getProjectInquiryPageData(admin, project.id)).inquiry?.client?.company, "RFQ LLC");
    assert.ok("success" in await completeProjectInquiry(admin, { ...inquiryInput, initialBrief: "Updated historical project" }));
    assert.equal((await getProjectInquiryPageData(admin, project.id)).inquiry?.client?.company, "RFQ LLC");
    assert.ok("error" in await saveContactDirectoryEntry(admin, "CLIENT", { company: "Revived" }, client.id));
  });
  await check("Deleted or wrong-directory entries cannot be used for new project selections", async () => {
    const otherProject = await prisma.project.create({ data: { id: "directory-other-project", name: "Other", ownerId: admin.id, createdById: admin.id, workflowStages: { createMany: { data: getInitialProjectWorkflowStageData() } } } });
    const result = await completeProjectInquiry(admin, { ...inquiryInput, projectId: otherProject.id });
    assert.ok("error" in result && result.fieldErrors?.client && result.fieldErrors?.finalBeneficiaries);
    const wrongRole = await completeProjectInquiry(admin, { ...inquiryInput, projectId: otherProject.id, client: { source: "MANUAL_CONTACT", id: "legacy-beneficiary" } });
    assert.ok("error" in wrongRole && wrongRole.fieldErrors?.client);
    assert.equal(await prisma.projectInquiry.count({ where: { projectId: otherProject.id } }), 0);
  });
  console.log(`${checks} contact directory integration checks passed.`);
}
main().finally(() => prisma.$disconnect()).catch(error => { console.error(error); process.exitCode = 1; });
