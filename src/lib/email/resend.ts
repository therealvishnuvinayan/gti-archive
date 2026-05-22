type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

type SendEmailResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendResendEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !from) {
    return {
      ok: false,
      error: "Resend is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.",
    };
  }

  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "GTI Archive/1.0",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!response.ok) {
    let errorMessage = "Unable to send email via Resend.";

    try {
      const payload = (await response.json()) as {
        message?: string;
        error?: string;
        name?: string;
      };
      errorMessage = payload.message || payload.error || payload.name || errorMessage;
    } catch {
      // Keep fallback error message.
    }

    return { ok: false, error: errorMessage };
  }

  try {
    const payload = (await response.json()) as { id?: string };
    return { ok: true, id: payload.id };
  } catch {
    return { ok: true };
  }
}
