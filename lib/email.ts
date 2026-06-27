import "server-only";
import { marked } from "marked";
import { Resend } from "resend";

/** Wraps the patch-notes markdown into a simple, email-safe HTML document. */
function renderEmailHtml(markdown: string): string {
  const body = marked.parse(markdown, { async: false }) as string;
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f7f9;">
    <div style="max-width:640px;margin:0 auto;padding:24px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:28px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;line-height:1.6;font-size:15px;">
        ${body}
      </div>
      <p style="text-align:center;color:#9ca3af;font-size:12px;margin-top:16px;font-family:sans-serif;">
        Sent with Patch Notes
      </p>
    </div>
  </body>
</html>`;
}

export type SendResult = { id: string | null };

export async function sendPatchNotes(input: {
  to: string[];
  subject: string;
  markdown: string;
  from?: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set. Add it to send emails.");
  }
  const from =
    input.from?.trim() ||
    process.env.RESEND_FROM_EMAIL ||
    "Patch Notes <onboarding@resend.dev>";

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: renderEmailHtml(input.markdown),
    text: input.markdown,
  });
  if (error) throw new Error(error.message);
  return { id: data?.id ?? null };
}
