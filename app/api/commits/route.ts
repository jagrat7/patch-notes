import { type NextRequest, NextResponse } from "next/server";
import { listCommits } from "@/agent/lib/github";

/** GET /api/commits?owner=&repo=&branch=&perPage= — fetches commits server-side
 * so any GITHUB_TOKEN stays on the server and the browser dodges CORS/limits. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const owner = searchParams.get("owner")?.trim();
  const repo = searchParams.get("repo")?.trim();
  const branch = searchParams.get("branch")?.trim() || "main";
  const perPage = Number(searchParams.get("perPage") ?? "30");

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Provide both 'owner' and 'repo' query params." },
      { status: 400 },
    );
  }

  try {
    const data = await listCommits({
      owner,
      repo,
      branch,
      perPage: Number.isFinite(perPage) ? Math.min(Math.max(perPage, 1), 100) : 30,
    });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch commits.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
