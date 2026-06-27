import { NextResponse } from "next/server";
import { getSettings, saveSettings, type Settings } from "@/lib/supabase";

/** GET /api/settings — read the shared workspace settings. */
export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json(settings);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load settings.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function cleanEmails(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)),
    ),
  ];
}

/** PUT /api/settings — replace the shared workspace settings. */
export async function PUT(request: Request) {
  let body: Partial<Settings>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const saved = await saveSettings({
      defaultRepo:
        typeof body.defaultRepo === "string" && body.defaultRepo.trim()
          ? body.defaultRepo.trim()
          : null,
      recipients: cleanEmails(body.recipients),
      fromEmail:
        typeof body.fromEmail === "string" && body.fromEmail.trim()
          ? body.fromEmail.trim()
          : null,
    });
    return NextResponse.json(saved);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save settings.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
