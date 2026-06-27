import { defineTool } from "eve/tools";
import { z } from "zod";
import { recordProgress } from "../../../../lib/video-progress.js";

/**
 * Fast sandbox preflight. Confirms the heavy dependencies a HyperFrames render
 * needs are actually present BEFORE the subagent spends minutes authoring a
 * storyboard and frames. Catches the most likely failure — headless Chromium
 * missing a system .so on this sandbox image — as a clear diagnostic instead of
 * a crash deep inside `hyperframes render`.
 *
 * The subagent should call this first; if `ok` is false, it must stop and
 * report `report` rather than proceeding.
 */
export default defineTool({
  description:
    "Preflight the render environment: verify node, ffmpeg, and that " +
    "HyperFrames' headless Chromium can launch in the sandbox. Returns ok + a " +
    "human-readable report. Run this FIRST; if ok is false, stop and report it.",
  inputSchema: z.object({
    project: z
      .string()
      .optional()
      .describe("Project slug, so preflight progress shows in the UI."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    ffmpeg: z.boolean(),
    chromium: z.boolean(),
    report: z.string(),
  }),
  async execute({ project }, ctx) {
    const sandbox = await ctx.getSandbox();
    if (!sandbox) throw new Error("No sandbox available.");
    const note = (phase: string, detail?: string) => {
      if (project) recordProgress(project, phase, detail);
    };

    note("preflight", "Checking ffmpeg + Chromium in the sandbox");
    const lines: string[] = [];

    // node + ffmpeg
    const node = await sandbox.run({ command: "node --version 2>&1" });
    lines.push(`node: ${node.stdout.trim() || node.stderr.trim()}`);

    const ff = await sandbox.run({ command: "ffmpeg -version 2>&1 | head -n1 || echo MISSING" });
    const ffmpeg = !/MISSING/.test(ff.stdout) && /ffmpeg version/i.test(ff.stdout);
    lines.push(`ffmpeg: ${ffmpeg ? ff.stdout.trim() : "MISSING"}`);

    // hyperframes doctor — its own dependency check (Chrome, ffmpeg, disk, shm).
    const doctor = await sandbox.run({
      command: "npx -y hyperframes@latest doctor 2>&1 | sed -n '1,40p' || true",
    });
    lines.push("--- hyperframes doctor ---", doctor.stdout.trim().slice(0, 1500));

    // The decisive test: actually launch HyperFrames' Chromium headless. We let
    // hyperframes resolve/download its browser, then probe its shared libs.
    // First run downloads Chromium (~150 MB) — this is the slow step; surface it.
    note("downloading Chromium", "First render only — downloading the headless browser");
    const launch = await sandbox.run({
      command: [
        "npx -y hyperframes@latest browser ensure 2>&1 | tail -n 5 || true;",
        // Find the resolved chrome binary and check for missing libraries.
        "CHROME=$(find ~/.cache/puppeteer ~/.cache/hyperframes /root/.cache -name chrome -type f 2>/dev/null | head -n1);",
        'echo "chrome=$CHROME";',
        '[ -n "$CHROME" ] && (ldd "$CHROME" 2>&1 | grep -i "not found" || echo "libs: all resolved") || echo "no chrome binary resolved";',
      ].join(" "),
    });
    const launchOut = launch.stdout.trim();
    lines.push("--- chromium check ---", launchOut.slice(0, 1200));

    const missingLibs = /not found/i.test(launchOut);
    const chromium = !missingLibs && !/no chrome binary resolved/i.test(launchOut);

    const ok = ffmpeg && chromium;
    note(
      ok ? "preflight ok" : "preflight failed",
      ok ? "ffmpeg + Chromium ready" : "see report",
    );
    if (!ok && missingLibs) {
      lines.push(
        "",
        "DIAGNOSIS: headless Chromium is missing system libraries. Add the named",
        "packages to DNF_PACKAGES/APT_PACKAGES in",
        "agent/subagents/video-producer/sandbox/sandbox.ts and bump REVISION.",
      );
    }

    return { ok, ffmpeg, chromium, report: lines.join("\n") };
  },
});
