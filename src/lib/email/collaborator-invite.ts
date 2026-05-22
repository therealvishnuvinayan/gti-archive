import type {
  CollaboratorInput,
  PermissionLevel,
} from "@/lib/collaboration";

type InviteEmailPayload = {
  collaboratorName: string;
  collaboratorEmail: string;
  inviterName: string;
  inviteUrl: string;
  collaboratorType: CollaboratorInput["type"];
  permissions: CollaboratorInput["permissions"];
};

const permissionLabelMap: Record<PermissionLevel, string> = {
  full: "Full access",
  limited: "Limited access",
  none: "No access",
};

const areaLabelMap: Record<keyof CollaboratorInput["permissions"], string> = {
  project: "Project",
  calendar: "Calendar",
  library: "Library",
  archive: "Archives",
};

function buildPermissionRows(
  permissions: CollaboratorInput["permissions"],
) {
  return (Object.keys(permissions) as Array<keyof typeof permissions>)
    .map((area) => {
      const permission = permissions[area];

      return `
        <tr>
          <td style="padding: 10px 14px; border-bottom: 1px solid #edf2ec; color: #5f6b62; font-size: 13px;">${areaLabelMap[area]}</td>
          <td style="padding: 10px 14px; border-bottom: 1px solid #edf2ec; color: #173f2d; font-size: 13px; font-weight: 700;">${permissionLabelMap[permission]}</td>
        </tr>
      `;
    })
    .join("");
}

export function buildCollaboratorInviteEmail({
  collaboratorName,
  collaboratorEmail,
  inviterName,
  inviteUrl,
  collaboratorType,
  permissions,
}: InviteEmailPayload) {
  const subject = `You’ve been invited to GTI Archive`;
  const permissionRows = buildPermissionRows(permissions);
  const safeName = collaboratorName || collaboratorEmail;

  const html = `
    <div style="margin:0; padding:32px 0; background:#eef3ec; font-family: Inter, Arial, sans-serif; color:#111712;">
      <div style="max-width:680px; margin:0 auto; background:#ffffff; border:1px solid #dbe3da; border-radius:28px; overflow:hidden; box-shadow:0 24px 70px rgba(20,40,28,0.12);">
        <div style="padding:40px 42px; background:linear-gradient(140deg,#2f8d5d 0%, #174f38 60%, #123b2b 100%); color:#ffffff;">
          <div style="font-size:13px; letter-spacing:0.18em; text-transform:uppercase; opacity:0.78;">GTI Archive</div>
          <h1 style="margin:18px 0 10px; font-size:36px; line-height:1.04; font-weight:700;">You’ve been invited</h1>
          <p style="margin:0; max-width:480px; font-size:16px; line-height:1.7; color:rgba(255,255,255,0.9);">
            ${inviterName} invited you to collaborate in GTI Archive as an ${collaboratorType.toLowerCase()} collaborator.
          </p>
        </div>

        <div style="padding:36px 42px 42px;">
          <p style="margin:0 0 18px; font-size:16px; line-height:1.7; color:#4d5a51;">
            Hello ${safeName},
          </p>
          <p style="margin:0 0 24px; font-size:15px; line-height:1.8; color:#4d5a51;">
            Your account has been prepared and access has been assigned. Use the button below to set your password and activate your collaborator access.
          </p>

          <div style="margin:0 0 26px; padding:20px 22px; border:1px solid #e2e8e2; border-radius:22px; background:#f8fbf8;">
            <div style="font-size:12px; text-transform:uppercase; letter-spacing:0.16em; color:#7a867c; margin-bottom:12px;">Assigned access</div>
            <table style="width:100%; border-collapse:collapse; background:#ffffff; border:1px solid #edf2ec; border-radius:16px; overflow:hidden;">
              <tbody>${permissionRows}</tbody>
            </table>
          </div>

          <div style="text-align:center; margin:30px 0 28px;">
            <a href="${inviteUrl}" style="display:inline-block; padding:16px 32px; border-radius:999px; background:linear-gradient(90deg,#2f8d5d,#123f2d); color:#ffffff; text-decoration:none; font-size:16px; font-weight:700; box-shadow:0 16px 34px rgba(35,94,63,0.24);">
              Set your password
            </a>
          </div>

          <p style="margin:0 0 8px; font-size:13px; line-height:1.8; color:#6e796f;">
            If the button does not work, copy and paste this link into your browser:
          </p>
          <p style="margin:0 0 24px; font-size:13px; line-height:1.8; color:#2f8d5d; word-break:break-all;">
            ${inviteUrl}
          </p>

          <div style="padding-top:20px; border-top:1px solid #edf2ec; color:#839086; font-size:12px; line-height:1.8;">
            This invitation was sent to ${collaboratorEmail}. If you were not expecting it, you can ignore this email.
          </div>
        </div>
      </div>
    </div>
  `;

  const text = [
    "You’ve been invited to GTI Archive",
    "",
    `${inviterName} invited you as an ${collaboratorType.toLowerCase()} collaborator.`,
    "",
    "Assigned access:",
    ...(Object.keys(permissions) as Array<keyof typeof permissions>).map(
      (area) => `- ${areaLabelMap[area]}: ${permissionLabelMap[permissions[area]]}`,
    ),
    "",
    `Set your password: ${inviteUrl}`,
  ].join("\n");

  return { subject, html, text };
}
