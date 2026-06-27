import { NextResponse } from "next/server";
import { listRuns, type RunCommit, saveRun } from "@/lib/supabase";

/** GET /api/runs — list saved patch-notes runs for the workspace. */
export async function GET() {
  try {
    const runs = await listRuns(20);
    return NextResponse.json({ runs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load runs.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function cleanCommits(value: unknown): RunCommit[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((c): RunCommit[] => {
    if (!c || typeof c !== "object") return [];
    const o = c as Record<string, unknown>;
    if (typeof o.sha !== "string") return [];
    return [
      {
        sha: o.sha,
        shortSha: typeof o.shortSha === "string" ? o.shortSha : o.sha.slice(0, 7),
        subject: typeof o.subject === "string" ? o.subject : "",
        author: typeof o.author === "string" ? o.author : null,
        prNumber: typeof o.prNumber === "number" ? o.prNumber : null,
      },
    ];
  });
}

/** POST /api/runs — persist a generated patch-notes run. */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const repo = typeof body.repo === "string" ? body.repo.trim() : "";
  const markdown = typeof body.markdown === "string" ? body.markdown : "";
  if (!repo || !markdown) {
    return NextResponse.json(
      { error: "Both 'repo' and 'markdown' are required." },
      { status: 400 },
    );
  }

  try {
    const run = await saveRun({
      repo,
      branch: typeof body.branch === "string" ? body.branch : "main",
      headline: typeof body.headline === "string" ? body.headline : null,
      markdown,
      commits: cleanCommits(body.commits),
    });
    return NextResponse.json({ run });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save run.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
