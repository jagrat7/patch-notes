import { defineTool } from "eve/tools";
import { z } from "zod";
import { buildPrPackage, type SelectedCommit } from "#lib/pr-package.js";
import { recordProgress } from "../../../../lib/video-progress.js";

/**
 * Step-1 replacement for /pr-to-video. Instead of running `gh` (which needs a
 * login and breaks unattended flow), we synthesize the capture package from the
 * public GitHub REST API and write it into a fresh hyperframes project in the
 * sandbox. After this, the subagent runs /pr-to-video Steps 2→6 against the
 * project at `videos/<project>`.
 */

const commitSchema = z.object({
  sha: z.string(),
  subject: z.string(),
  author: z.string().nullable().default(null),
  authorLogin: z.string().nullable().default(null),
});

export default defineTool({
  description:
    "Create a HyperFrames project in the sandbox and seed it with a synthetic " +
    "/pr-to-video capture package (capture/pr.json + capture/diff.patch) built " +
    "from the selected commits via the public GitHub API — no gh CLI. Returns " +
    "the project directory and a one-line change summary. Run this FIRST, then " +
    "drive /pr-to-video from Step 2 against the returned projectDir.",
  inputSchema: z.object({
    owner: z.string().min(1),
    repo: z.string().min(1),
    project: z
      .string()
      .min(1)
      .describe("kebab-case project name, e.g. 'acme-web-jun27'."),
    commits: z.array(commitSchema).min(1).describe("The commits to feature."),
    title: z.string().optional().describe("Human title for the synthetic PR."),
  }),
  outputSchema: z.object({
    projectDir: z.string(),
    changedFiles: z.number(),
    additions: z.number(),
    deletions: z.number(),
    summary: z.string(),
  }),
  async execute({ owner, repo, project, commits, title }, ctx) {
    const sandbox = await ctx.getSandbox();
    if (!sandbox) throw new Error("No sandbox available.");

    recordProgress(project, "ingesting", `Fetching diffs for ${commits.length} commits`);

    const pkg = await buildPrPackage({
      owner,
      repo,
      commits: commits as SelectedCommit[],
      title,
    });

    const projectDir = `videos/${project}`;

    // Scaffold a blank HyperFrames project (idempotent: init no-ops if present).
    await sandbox.run({
      command:
        `npx -y hyperframes@latest init "${projectDir}" ` +
        `--non-interactive --skip-skills --example=blank`,
    });

    // Write the synthetic capture package where ingest.mjs expects it.
    await sandbox.run({ command: `mkdir -p "${projectDir}/capture"` });
    await sandbox.writeTextFile({
      path: `${projectDir}/capture/pr.json`,
      content: JSON.stringify(pkg.prJson, null, 2),
    });
    await sandbox.writeTextFile({
      path: `${projectDir}/capture/diff.patch`,
      content: pkg.diffPatch,
    });

    const { additions, deletions, changedFiles } = pkg.prJson;
    recordProgress(
      project,
      "project ready",
      `${pkg.prJson.title} — +${additions}/−${deletions}, ${changedFiles} files`,
    );
    return {
      projectDir,
      changedFiles,
      additions,
      deletions,
      summary: `${pkg.prJson.title} — +${additions}/−${deletions} across ${changedFiles} files`,
    };
  },
});
