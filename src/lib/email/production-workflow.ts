function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildWorkflowEmail(input: {
  eyebrow: string;
  heading: string;
  recipientName: string;
  intro: string;
  rows: Array<[string, string]>;
  message?: string | null;
  actionLabel: string;
  actionUrl: string;
}) {
  const message = input.message?.trim() || null;
  const html = `
    <div style="margin:0;padding:32px 0;background:#eef3ec;font-family:Inter,Arial,sans-serif;color:#111712;">
      <div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #dbe3da;border-radius:24px;overflow:hidden;box-shadow:0 20px 60px rgba(20,40,28,.1);">
        <div style="padding:32px 38px;background:linear-gradient(140deg,#2f8d5d,#174f38 65%,#123b2b);color:#fff;">
          <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;opacity:.8;">${escapeHtml(input.eyebrow)}</div>
          <h1 style="margin:14px 0 0;font-size:28px;line-height:1.15;">${escapeHtml(input.heading)}</h1>
        </div>
        <div style="padding:32px 38px 38px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#4d5a51;">Hello ${escapeHtml(input.recipientName)},</p>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4d5a51;">${escapeHtml(input.intro)}</p>
          <div style="border:1px solid #e1e8e2;border-radius:14px;overflow:hidden;">
            ${input.rows.map(([label, value]) => `<div style="display:flex;gap:16px;padding:13px 16px;border-bottom:1px solid #edf2ed;"><strong style="min-width:150px;font-size:13px;color:#2b4937;">${escapeHtml(label)}</strong><span style="font-size:13px;color:#4d5a51;word-break:break-word;">${escapeHtml(value)}</span></div>`).join("")}
          </div>
          ${message ? `<div style="margin-top:20px;padding:16px;border-radius:12px;background:#f5f8f5;color:#4d5a51;font-size:14px;line-height:1.7;"><strong style="display:block;margin-bottom:6px;color:#2b4937;">Message</strong>${escapeHtml(message).replaceAll("\n", "<br>")}</div>` : ""}
          <div style="margin-top:26px;text-align:center;"><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;padding:13px 22px;border-radius:12px;background:#26744d;color:#fff;text-decoration:none;font-size:14px;font-weight:700;">${escapeHtml(input.actionLabel)}</a></div>
          <p style="margin:22px 0 0;font-size:12px;line-height:1.7;color:#718078;word-break:break-all;">If the button does not work, copy and paste this secure link into your browser:<br>${escapeHtml(input.actionUrl)}</p>
        </div>
      </div>
    </div>`;
  const text = [
    `Hello ${input.recipientName},`,
    "",
    input.intro,
    "",
    ...input.rows.map(([label, value]) => `${label}: ${value}`),
    ...(message ? ["", "Message:", message] : []),
    "",
    `${input.actionLabel}:`,
    input.actionUrl,
  ].join("\n");
  return { html, text };
}

export function buildProductionApprovalEmail(input: {
  recipientName: string;
  requesterName: string;
  projectName: string;
  unitName: string;
  stepLabel: string;
  message?: string | null;
  approvalUrl: string;
}) {
  return {
    subject: `[GTI Archive] Production approval — ${input.projectName} — ${input.unitName}`,
    ...buildWorkflowEmail({
      eyebrow: "GTI Archive · Production Approval",
      heading: "Production approval requested",
      recipientName: input.recipientName,
      intro: `${input.requesterName} has requested your yes/no approval for a production unit.`,
      rows: [
        ["Project", input.projectName],
        ["Production unit", input.unitName],
        ["Approval step", input.stepLabel],
      ],
      message: input.message,
      actionLabel: "Review Production Approval",
      actionUrl: input.approvalUrl,
    }),
  };
}

export function buildProductionHandoverEmail(input: {
  recipientName: string;
  senderName: string;
  projectName: string;
  unitName: string;
  routeLabel: string;
  recipientCompany?: string | null;
  recipientPhone?: string | null;
  note?: string | null;
  handoverUrl: string;
}) {
  return {
    subject: `[GTI Archive] Production Handover — ${input.projectName} — ${input.unitName}`,
    ...buildWorkflowEmail({
      eyebrow: "GTI Archive · Production Handover",
      heading: "Production files handed over",
      recipientName: input.recipientName,
      intro: `${input.senderName} has sent the approved production package through GTI Archive.`,
      rows: [
        ["Project", input.projectName],
        ["Production unit", input.unitName],
        ["Handover route", input.routeLabel],
        ...(input.recipientCompany
          ? ([["Recipient company", input.recipientCompany]] as Array<[string, string]>)
          : []),
        ...(input.recipientPhone
          ? ([["Recipient phone", input.recipientPhone]] as Array<[string, string]>)
          : []),
      ],
      message: input.note,
      actionLabel: "Open Secure Handover",
      actionUrl: input.handoverUrl,
    }),
  };
}
