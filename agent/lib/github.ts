/** Shared GitHub commit-fetching logic, used by both the agent tool and the
 * dashboard API route. No auth is required for public repos; GITHUB_TOKEN is
 * used when present for higher rate limits and private access. */

export type Commit = {
  sha: string;
  shortSha: string;
  message: string;
  subject: string;
  author: string | null;
  authorLogin: string | null;
  date: string | null;
  url: string;
  prNumber: number | null;
};

/** Extract a PR number from a merge/squash commit message, if present. */
export function extractPrNumber(message: string): number | undefined {
  // "Merge pull request #123" or "Title (#123)"
  const match = message.match(/(?:pull request #|\(#)(\d+)\)?/i);
  return match ? Number(match[1]) : undefined;
}

export type ListCommitsParams = {
  owner: string;
  repo: string;
  branch?: string;
  perPage?: number;
  since?: string;
};

export async function listCommits({
  owner,
  repo,
  branch = "main",
  perPage = 30,
  since,
}: ListCommitsParams): Promise<{ repo: string; branch: string; commits: Commit[] }> {
  const params = new URLSearchParams({ sha: branch, per_page: String(perPage) });
  if (since) params.set("since", since);

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "eve-patch-notes-agent",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?${params}`;
  const res = await fetch(url, { headers });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 404) {
      throw new Error(
        `Repository ${owner}/${repo} or branch '${branch}' not found, or it is private and no GITHUB_TOKEN is set.`,
      );
    }
    if (res.status === 403 && body.includes("rate limit")) {
      throw new Error(
        "GitHub rate limit hit (60 req/hour for unauthenticated requests). Set GITHUB_TOKEN to raise it to 5,000/hour.",
      );
    }
    throw new Error(`GitHub API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const raw = (await res.json()) as Array<{
    sha: string;
    html_url: string;
    commit: {
      message: string;
      author: { name?: string; date?: string } | null;
    };
    author: { login?: string } | null;
  }>;

  const commits: Commit[] = raw.map((c) => {
    const message = c.commit.message;
    return {
      sha: c.sha,
      shortSha: c.sha.slice(0, 7),
      message,
      subject: message.split("\n")[0],
      author: c.commit.author?.name ?? null,
      authorLogin: c.author?.login ?? null,
      date: c.commit.author?.date ?? null,
      url: c.html_url,
      prNumber: extractPrNumber(message) ?? null,
    };
  });

  return { repo: `${owner}/${repo}`, branch, commits };
}
