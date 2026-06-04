type PasswordResetEmailPayload = {
  userName: string;
  resetUrl: string;
};

export function buildPasswordResetEmail({
  userName,
  resetUrl,
}: PasswordResetEmailPayload) {
  const subject = "Reset your GTI Archive password";
  const safeName = userName || "there";

  const html = `
    <div style="margin:0; padding:32px 0; background:#eef3ec; font-family: Inter, Arial, sans-serif; color:#111712;">
      <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #dbe3da; border-radius:28px; overflow:hidden; box-shadow:0 24px 70px rgba(20,40,28,0.12);">
        <div style="padding:36px 40px; background:linear-gradient(140deg,#2f8d5d 0%, #174f38 62%, #123b2b 100%); color:#ffffff;">
          <div style="font-size:13px; letter-spacing:0.18em; text-transform:uppercase; opacity:0.78;">GTI Archive</div>
          <h1 style="margin:18px 0 10px; font-size:34px; line-height:1.08; font-weight:700;">Reset your password</h1>
          <p style="margin:0; max-width:480px; font-size:16px; line-height:1.7; color:rgba(255,255,255,0.9);">
            Use this secure link to choose a new password for your account.
          </p>
        </div>

        <div style="padding:34px 40px 40px;">
          <p style="margin:0 0 18px; font-size:16px; line-height:1.7; color:#4d5a51;">
            Hello ${safeName},
          </p>
          <p style="margin:0 0 24px; font-size:15px; line-height:1.8; color:#4d5a51;">
            We received a request to reset your GTI Archive password. This link expires in 60 minutes.
          </p>

          <div style="text-align:center; margin:30px 0 28px;">
            <a href="${resetUrl}" style="display:inline-block; padding:16px 32px; border-radius:999px; background:linear-gradient(90deg,#2f8d5d,#123f2d); color:#ffffff; text-decoration:none; font-size:16px; font-weight:700; box-shadow:0 16px 34px rgba(35,94,63,0.24);">
              Reset password
            </a>
          </div>

          <p style="margin:0 0 8px; font-size:13px; line-height:1.8; color:#6e796f;">
            If the button does not work, copy and paste this link into your browser:
          </p>
          <p style="margin:0 0 24px; font-size:13px; line-height:1.8; color:#2f8d5d; word-break:break-all;">
            ${resetUrl}
          </p>

          <div style="padding-top:20px; border-top:1px solid #edf2ec; color:#839086; font-size:12px; line-height:1.8;">
            If you did not request this reset, you can ignore this email.
          </div>
        </div>
      </div>
    </div>
  `;

  const text = [
    "Reset your GTI Archive password",
    "",
    `Hello ${safeName},`,
    "",
    "We received a request to reset your GTI Archive password. This link expires in 60 minutes.",
    "",
    `Reset password: ${resetUrl}`,
    "",
    "If you did not request this reset, you can ignore this email.",
  ].join("\n");

  return { subject, html, text };
}
