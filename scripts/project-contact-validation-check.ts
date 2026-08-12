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

console.log("Project contact validation checks passed.");
