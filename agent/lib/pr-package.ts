/**
 * Builds the synthetic `/pr-to-video` capture package (capture/pr.json +
 * capture/diff.patch) from a set of selected commits, using ONLY the public
 * GitHub REST API — no `gh` CLI, no auth required for public repos.
 *
 * This lets the video-producer subagent skip /pr-to-video's Step 1 (`gh`
 * ingest) and start at Step 2, feeding it a "pull request" synthesized from
 * whatever commits the user selected on main. The shapes here match what
 * pr-to-video/scripts/ingest.mjs reads from pr.json (the `gh pr view --json`
 * shape) and the standard unified diff it parses from diff.patch.
 */

const GH_API = "https://api.github.com";

function ghHeaders(accept: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "eve-patch-notes-agent",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

/** A commit the user selected to include in the video. */
export type SelectedCommit = {
  sha: string;
  subject: string;
  author: string | null;
  authorLogin: string | null;
};

/** The `gh pr view --json`-shaped object ingest.mjs consumes. */
export type SyntheticPrJson = {
  number: number;
  title: string;
  url: string;
  body: string;
  author: { login: string | null; name: string | null };
  baseRefName: string;
  headRefName: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  files: Array<{ path: string; additions: number; deletions: number }>;
  commits: Array<{
    oid: string;
    messageHeadline: string;
    authors: Array<{ login: string | null; name: string | null }>;
  }>;
  labels: string[];
};

export type PrPackage = {
  prJson: SyntheticPrJson;
  diffPatch: string;
};

type CompareResponse = {
  files?: Array<{
    filename: string;
    additions?: number;
    deletions?: number;
    patch?: string;
    status?: string;
  }>;
};

/** Fetch one commit's diff as a raw unified patch (.diff media type). */
async function fetchCommitPatch(owner: string, repo: string, sha: string): Promise<string> {
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/commits/${sha}`, {
    headers: ghHeaders("application/vnd.github.diff"),
  });
  if (!res.ok) {
    throw new Error(`GitHub diff fetch failed for ${sha.slice(0, 7)}: ${res.status}`);
  }
  return res.text();
}

/** Fetch the JSON compare between two SHAs (for file stats + per-file patches). */
async function fetchCompare(
  owner: string,
  repo: string,
  base: string,
  head: string,
): Promise<CompareResponse> {
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/compare/${base}...${head}`, {
    headers: ghHeaders("application/vnd.github+json"),
  });
  if (!res.ok) {
    throw new Error(`GitHub compare failed (${base.slice(0, 7)}...${head.slice(0, 7)}): ${res.status}`);
  }
  return (await res.json()) as CompareResponse;
}

/**
 * Build a synthetic PR package from selected commits.
 *
 * Strategy: when the selection is a contiguous run we can compare base..head
 * for accurate aggregate file stats and a single combined patch. We don't
 * assume contiguity here — we fetch each commit's own patch and concatenate,
 * and derive file stats from the per-file patches. This is robust to an
 * arbitrary commit selection (which is what the dashboard produces).
 */
export async function buildPrPackage(params: {
  owner: string;
  repo: string;
  commits: SelectedCommit[];
  /** Optional human title for the synthetic PR (e.g. "Release notes: Jun 20–27"). */
  title?: string;
  /** Optional base branch name for display. */
  baseRef?: string;
}): Promise<PrPackage> {
  const { owner, repo, commits, title, baseRef = "main" } = params;
  if (commits.length === 0) {
    throw new Error("buildPrPackage: no commits selected.");
  }

  // Concatenate each selected commit's unified diff. Order = selection order.
  const patches: string[] = [];
  for (const c of commits) {
    patches.push(await fetchCommitPatch(owner, repo, c.sha));
  }
  const diffPatch = patches.join("\n");

  // Aggregate per-file additions/deletions by parsing the combined diff.
  const fileStats = aggregateFileStats(diffPatch);
  const additions = fileStats.reduce((n, f) => n + f.additions, 0);
  const deletions = fileStats.reduce((n, f) => n + f.deletions, 0);

  // Dedupe contributor identities across commits.
  const authors = dedupeAuthors(commits);

  const prJson: SyntheticPrJson = {
    number: 0, // synthetic — not a real PR number
    title: title || synthTitle(commits),
    url: `https://github.com/${owner}/${repo}`,
    body: commits.map((c) => `- ${c.subject}`).join("\n"),
    author: authors[0] ?? { login: null, name: null },
    baseRefName: baseRef,
    headRefName: "selected-commits",
    additions,
    deletions,
    changedFiles: fileStats.length,
    files: fileStats,
    commits: commits.map((c) => ({
      oid: c.sha,
      messageHeadline: c.subject,
      authors: [
        { login: c.authorLogin, name: c.author },
      ],
    })),
    labels: [],
  };

  return { prJson, diffPatch };
}

function synthTitle(commits: SelectedCommit[]): string {
  if (commits.length === 1) return commits[0].subject;
  return `${commits.length} changes — ${commits[0].subject}`;
}

function dedupeAuthors(
  commits: SelectedCommit[],
): Array<{ login: string | null; name: string | null }> {
  const seen = new Set<string>();
  const out: Array<{ login: string | null; name: string | null }> = [];
  for (const c of commits) {
    const key = c.authorLogin ?? c.author ?? "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ login: c.authorLogin, name: c.author });
  }
  return out;
}

/** Parse `+/-` line counts per file from a unified diff. */
function aggregateFileStats(
  diff: string,
): Array<{ path: string; additions: number; deletions: number }> {
  const byPath = new Map<string, { additions: number; deletions: number }>();
  let curPath: string | null = null;
  for (const line of diff.split("\n")) {
    const gitMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (gitMatch) {
      curPath = gitMatch[2];
      if (!byPath.has(curPath)) byPath.set(curPath, { additions: 0, deletions: 0 });
      continue;
    }
    const plusPath = line.startsWith("+++ ") ? line.slice(4).replace(/^b\//, "").trim() : null;
    if (plusPath && plusPath !== "/dev/null") {
      curPath = plusPath;
      if (!byPath.has(curPath)) byPath.set(curPath, { additions: 0, deletions: 0 });
      continue;
    }
    if (!curPath) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) byPath.get(curPath)!.additions++;
    else if (line.startsWith("-") && !line.startsWith("---")) byPath.get(curPath)!.deletions++;
  }
  return [...byPath.entries()].map(([path, s]) => ({ path, ...s }));
}
