import { richTextToPlainText } from "@/lib/rich-text";

type ChecklistInformationRequestEmailInput = {
  recipientName?: string | null;
  requesterName: string;
  projectName: string;
  fileName: string;
  fieldLabel: string;
  message?: string | null;
  responseUrl: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function buildChecklistInformationRequestEmail(
  input: ChecklistInformationRequestEmailInput,
) {
  const recipientName = input.recipientName?.trim() || "there";
  const message = richTextToPlainText(input.message) || null;
  const subject = `[GTI Archive] Information requested: ${input.fieldLabel} — ${input.projectName}`;
  const rows = [
    ["Project", input.projectName],
    ["File", input.fileName],
    ["Requested information", input.fieldLabel],
  ] as const;

  const html = `
    <div style="margin:0;padding:32px 0;background:#eef3ec;font-family:Inter,Arial,sans-serif;color:#111712;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #dbe3da;border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(20,40,28,0.1);">
        <div style="padding:32px 38px;background:linear-gradient(140deg,#2f8d5d,#174f38 65%,#123b2b);color:#ffffff;">
          <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;opacity:.8;">GTI Archive</div>
          <h1 style="margin:14px 0 0;font-size:28px;line-height:1.15;">Information requested</h1>
        </div>
        <div style="padding:32px 38px 38px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4d5a51;">Hello ${escapeHtml(recipientName)},</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4d5a51;">
            ${escapeHtml(input.requesterName)} has requested information for a project file in GTI Archive.
          </p>
          <div style="border:1px solid #e1e8e2;border-radius:14px;overflow:hidden;">
            ${rows
              .map(
                ([label, value]) => `
                  <div style="display:flex;gap:16px;padding:13px 16px;border-bottom:1px solid #edf2ed;">
                    <strong style="min-width:150px;font-size:13px;color:#2b4937;">${escapeHtml(label)}</strong>
                    <span style="font-size:13px;color:#4d5a51;word-break:break-word;">${escapeHtml(value)}</span>
                  </div>`,
              )
              .join("")}
          </div>
          ${
            message
              ? `<div style="margin-top:20px;padding:16px;border-radius:12px;background:#f5f8f5;color:#4d5a51;font-size:14px;line-height:1.7;"><strong style="display:block;margin-bottom:6px;color:#2b4937;">Message</strong>${escapeHtml(message).replaceAll("\n", "<br>")}</div>`
              : ""
          }
          <div style="margin-top:26px;text-align:center;">
            <a href="${escapeHtml(input.responseUrl)}" style="display:inline-block;padding:13px 22px;border-radius:12px;background:#26744d;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">
              Provide Information
            </a>
          </div>
          <p style="margin:22px 0 0;font-size:12px;line-height:1.7;color:#718078;word-break:break-all;">
            If the button does not work, copy and paste this secure link into your browser:<br>${escapeHtml(input.responseUrl)}
          </p>
        </div>
      </div>
    </div>`;

  const text = [
    `Hello ${recipientName},`,
    "",
    `${input.requesterName} has requested information for a project file in GTI Archive.`,
    "",
    `Project: ${input.projectName}`,
    `File: ${input.fileName}`,
    `Requested information: ${input.fieldLabel}`,
    ...(message ? ["", "Message:", message] : []),
    "",
    "Provide Information:",
    input.responseUrl,
  ].join("\n");

  return { subject, html, text };
}
