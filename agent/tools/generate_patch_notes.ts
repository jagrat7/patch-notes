import { defineTool } from "eve/tools";
import { z } from "zod";

const CATEGORIES = ["feature", "improvement", "fix", "internal"] as const;

const CATEGORY_HEADINGS: Record<(typeof CATEGORIES)[number], string> = {
  feature: "✨ Features",
  improvement: "🚀 Improvements",
  fix: "🐛 Bug Fixes",
  internal: "🔧 Internal / Chores",
};

const entrySchema = z.object({
  category: z
    .enum(CATEGORIES)
    .describe("Which section this change belongs in."),
  summary: z
    .string()
    .min(1)
    .describe(
      "One-line, reader-facing description of the change — what it means for " +
        "the user, not the raw commit subject.",
    ),
  author: z.string().optional().describe("GitHub username or display name."),
  prNumber: z.number().int().positive().optional().describe("Pull request number."),
  prUrl: z.string().url().optional().describe("Link to the pull request."),
  linearId: z
    .string()
    .optional()
    .describe("Referenced Linear issue identifier, e.g. ENG-123."),
  commitSha: z.string().optional().describe("Short commit SHA, if no PR."),
});

export default defineTool({
  description:
    "Assemble grouped, reader-facing patch notes from changes the agent " +
    "gathered from GitHub commits/PRs (and Linear issues). Returns both a " +
    "structured object and rendered markdown. Read-only: it formats input you " +
    "already collected and performs no external calls.",
  inputSchema: z.object({
    repo: z
      .string()
      .min(1)
      .describe("Repository in owner/repo form, e.g. acme/web."),
    branch: z.string().default("main").describe("Branch the changes are from."),
    range: z
      .string()
      .optional()
      .describe(
        "Human-readable range covered, e.g. 'since v1.4.0' or 'Jun 20–27'.",
      ),
    headline: z
      .string()
      .optional()
      .describe("One-sentence summary of the release as a whole."),
    entries: z
      .array(entrySchema)
      .describe("The individual changes, each tagged with a category."),
  }),
  outputSchema: z.object({
    repo: z.string(),
    branch: z.string(),
    totalChanges: z.number(),
    markdown: z.string(),
  }),
  async execute({ repo, branch, range, headline, entries }) {
    const titleSuffix = range ? ` (${range})` : "";
    const lines: string[] = [`## Patch Notes — ${repo}@${branch}${titleSuffix}`, ""];

    if (headline) {
      lines.push(headline, "");
    }

    if (entries.length === 0) {
      lines.push("_No user-facing changes in this range._");
    } else {
      for (const category of CATEGORIES) {
        const inCategory = entries.filter((e) => e.category === category);
        if (inCategory.length === 0) continue;

        lines.push(`### ${CATEGORY_HEADINGS[category]}`, "");
        for (const e of inCategory) {
          const refs: string[] = [];
          if (e.prNumber) {
            refs.push(e.prUrl ? `[#${e.prNumber}](${e.prUrl})` : `#${e.prNumber}`);
          } else if (e.commitSha) {
            refs.push(`\`${e.commitSha}\``);
          }
          if (e.linearId) refs.push(e.linearId);
          if (e.author) refs.push(`@${e.author}`);

          const suffix = refs.length ? ` (${refs.join(", ")})` : "";
          lines.push(`- ${e.summary}${suffix}`);
        }
        lines.push("");
      }
    }

    return {
      repo,
      branch,
      totalChanges: entries.length,
      markdown: lines.join("\n").trimEnd(),
    };
  },
});
