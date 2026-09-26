import assert from "node:assert/strict";

import {
  isValidProjectContactEmail,
  normalizeInternationalPhone,
  validateProjectContactInput,
} from "../src/lib/project-contact-validation";

for (const email of [
  "john@example.com",
  "john.smith@company.co.uk",
  "user+project@example.ae",
]) {
  assert.equal(isValidProjectContactEmail(email), true, `Expected valid email: ${email}`);
}

for (const email of [
  "abc",
  "abc@",
  "@gmail.com",
  "john@example",
  "john example@example.com",
]) {
  assert.equal(isValidProjectContactEmail(email), false, `Expected invalid email: ${email}`);
}

const phoneCases = new Map([
  ["+971501234567", "+971501234567"],
  ["+919876543210", "+919876543210"],
  ["+447911123456", "+447911123456"],
  ["+12025550123", "+12025550123"],
  ["+971 50 123 4567", "+971501234567"],
  ["+44 7911 123456", "+447911123456"],
  ["+1 (202) 555-0123", "+12025550123"],
  ["3432423434", "+3432423434"],
  ["971 50 123 4567", "+971501234567"],
]);

for (const [input, normalized] of phoneCases) {
  assert.equal(normalizeInternationalPhone(input), normalized);
}

for (const phone of ["0501234567", "+123", "+12 phone", "++447911123456"]) {
  assert.equal(normalizeInternationalPhone(phone), null, `Expected invalid phone: ${phone}`);
}

const optionalContact = validateProjectContactInput({
  name: "  John   Doe  ",
  company: " ABC ",
  email: "",
  phone: "",
});
assert.deepEqual(optionalContact.fieldErrors, {});
assert.deepEqual(optionalContact.data, {
  kind: "CONTACT",
  companyEmail: "",
  companyPhone: "",
  companyWebsite: "",
  name: "John Doe",
  company: "ABC",
  position: "",
  email: "",
  phone: "",
});

const normalizedContact = validateProjectContactInput({
  name: "Jane Doe",
  email: " Jane.Doe@Example.COM ",
  phone: "+1 (202) 555-0123",
});
assert.deepEqual(normalizedContact.fieldErrors, {});
assert.equal(normalizedContact.data.email, "jane.doe@example.com");
assert.equal(normalizedContact.data.phone, "+12025550123");

assert.equal(
  validateProjectContactInput({ name: "   " }).fieldErrors.name,
  "Name is required.",
);
assert.equal(
  validateProjectContactInput({ name: "John", email: "abc@" }).fieldErrors.email,
  "Enter a valid email address.",
);
assert.equal(
  validateProjectContactInput({ name: "John", phone: "0501234567" }).fieldErrors.phone,
  "Enter a valid international phone number including country code.",
);

const client = {
  kind: "CLIENT" as const,
  company: " Example Company ",
  name: " Jane   Doe ",
  email: " Jane@Example.COM ",
  phone: "+971 50 123 4567",
  position: " Account Manager ",
};
const requiredClient = validateProjectContactInput(client);
assert.deepEqual(requiredClient.fieldErrors, {});
assert.equal(requiredClient.data.company, "Example Company");
assert.equal(requiredClient.data.name, "Jane Doe");
assert.equal(requiredClient.data.companyEmail, "");
assert.equal(requiredClient.data.companyPhone, "");
assert.equal(requiredClient.data.companyWebsite, "");
for (const field of ["company", "name", "email", "phone", "position"] as const) {
  assert.ok(validateProjectContactInput({ ...client, [field]: " " }).fieldErrors[field], `${field} is required for a client`);
}
const completeClient = validateProjectContactInput({
  ...client,
  companyEmail: " INFO@Example.COM ",
  companyPhone: "+1 (202) 555-0123",
  companyWebsite: "example.com/contact",
});
assert.deepEqual(completeClient.fieldErrors, {});
assert.equal(completeClient.data.companyEmail, "info@example.com");
assert.equal(completeClient.data.companyPhone, "+12025550123");
assert.equal(completeClient.data.companyWebsite, "https://example.com/contact");
assert.equal(completeClient.data.email, "jane@example.com");
assert.equal(completeClient.data.phone, "+971501234567");
assert.ok(validateProjectContactInput({ ...client, companyEmail: "invalid@" }).fieldErrors.companyEmail);
assert.ok(validateProjectContactInput({ ...client, companyPhone: "0501234567" }).fieldErrors.companyPhone);
for (const companyWebsite of ["javascript:alert(1)", "ftp://example.com", "not a website", "https://", "https://user:password@example.com"]) {
  assert.ok(validateProjectContactInput({ ...client, companyWebsite }).fieldErrors.companyWebsite, `Reject invalid website: ${companyWebsite}`);
}
console.log("Project contact validation checks passed.");
