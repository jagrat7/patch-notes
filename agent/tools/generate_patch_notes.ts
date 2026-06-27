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
      "A clear, non-technical description of the change. Write for a " +
        "non-technical customer. Avoid jargon, commit subjects, and internal " +
        "terminology. Instead of 'refactored bottom bar event handler', write " +
        "'The bottom bar is now clickable.'",
    ),
  userImpact: z
    .string()
    .min(1)
    .describe(
      "Explain how this change affects the user's workflow or experience. " +
        "Be concrete and specific — describe what the user can now do that they " +
        "couldn't before, or what feels different. E.g. 'You can now click the " +
        "bottom bar to open the wallpaper currently on your screen, instead of " +
        "navigating through the menu.'",
    ),
});

export default defineTool({
  description:
    "Assemble grouped, reader-facing patch notes from changes the agent " +
    "gathered from GitHub commits/PRs. Returns both a structured object and " +
    "rendered markdown. Read-only: it formats input you already collected and " +
    "performs no external calls.",
  inputSchema: z.object({
    repo: z
      .string()
      .min(1)
      .describe("Repository in owner/repo form, e.g. acme/web."),
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
    totalChanges: z.number(),
    markdown: z.string(),
  }),
  async execute({ repo, range, headline, entries }) {
    const titleSuffix = range ? ` (${range})` : "";
    const lines: string[] = [`## Patch Notes — ${repo}${titleSuffix}`, ""];

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
          lines.push(`- **${e.summary}**`);
          lines.push(`  ${e.userImpact}`);
        }
        lines.push("");
      }
    }

    return {
      repo,
      totalChanges: entries.length,
      markdown: lines.join("\n").trimEnd(),
    };
  },
});
