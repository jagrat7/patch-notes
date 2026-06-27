import { NextResponse } from "next/server";
import { sendPatchNotes } from "@/lib/email";
import { getSettings, logSend } from "@/lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST /api/send — email the given patch notes via Resend to the recipients. */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const markdown = typeof body.markdown === "string" ? body.markdown : "";
  const subject =
    typeof body.subject === "string" && body.subject.trim()
      ? body.subject.trim()
      : "Patch Notes";
  const runId = typeof body.runId === "string" ? body.runId : null;

  const recipients = Array.isArray(body.recipients)
    ? [
        ...new Set(
          body.recipients
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim())
            .filter((v) => EMAIL_RE.test(v)),
        ),
      ]
    : [];

  if (!markdown) {
    return NextResponse.json({ error: "Nothing to send — 'markdown' is empty." }, { status: 400 });
  }
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "Add at least one valid recipient email." },
      { status: 400 },
    );
  }

  try {
    // Use the saved from-address unless the request overrides it.
    const settings = await getSettings().catch(() => null);
    const from =
      (typeof body.from === "string" && body.from.trim()) ||
      settings?.fromEmail ||
      undefined;

    const { id } = await sendPatchNotes({ to: recipients, subject, markdown, from });
    await logSend({ runId, recipients, subject, resendId: id }).catch(() => {});
    return NextResponse.json({ ok: true, id, recipients });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
