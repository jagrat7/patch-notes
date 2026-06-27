import { defineTool } from "eve/tools";
import { z } from "zod";
import { listCommits } from "#lib/github.js";

const commitSchema = z.object({
  sha: z.string(),
  shortSha: z.string(),
  message: z.string(),
  subject: z.string(),
  author: z.string().nullable(),
  authorLogin: z.string().nullable(),
  date: z.string().nullable(),
  url: z.string(),
  prNumber: z.number().int().positive().nullable(),
});

export default defineTool({
  description:
    "List recent commits on a branch (default `main`) of a PUBLIC GitHub " +
    "repository via the GitHub REST API. No auth is required for public repos; " +
    "if GITHUB_TOKEN is set it is used for higher rate limits and private " +
    "access. Returns commit subjects, authors, dates, SHAs, and any PR number " +
    "found in the message — the raw material for patch notes.",
  inputSchema: z.object({
    owner: z.string().min(1).describe("Repository owner, e.g. 'vercel'."),
    repo: z.string().min(1).describe("Repository name, e.g. 'next.js'."),
    branch: z.string().default("main").describe("Branch to read commits from."),
    perPage: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(30)
      .describe("How many recent commits to fetch (max 100)."),
    since: z
      .string()
      .optional()
      .describe("Optional ISO-8601 timestamp; only commits after it are returned."),
  }),
  outputSchema: z.object({
    repo: z.string(),
    branch: z.string(),
    count: z.number(),
    commits: z.array(commitSchema),
  }),
  async execute({ owner, repo, branch, perPage, since }) {
    const { repo: repoFull, branch: branchName, commits } = await listCommits({
      owner,
      repo,
      branch,
      perPage,
      since,
    });
    return { repo: repoFull, branch: branchName, count: commits.length, commits };
  },
});
