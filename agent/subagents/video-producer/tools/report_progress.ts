import { defineTool } from "eve/tools";
import { z } from "zod";
import { recordProgress } from "../../../../lib/video-progress.js";

/**
 * Lets the subagent surface what it's doing to the browser. The subagent runs
 * in a child session the root stream can't see in detail, so call this at each
 * phase boundary (preflight done, ingesting, storyboard, building frame N,
 * rendering, uploading) — the dashboard's video panel polls and displays it.
 */
export default defineTool({
  description:
    "Report a progress update for the current video render so the UI can show " +
    "it. Call at every phase boundary with a short phase label (e.g. " +
    "'storyboard', 'building frame 3/6', 'rendering', 'uploading') and the " +
    "project slug you were given.",
  inputSchema: z.object({
    project: z.string().min(1).describe("The project slug from your dispatch."),
    phase: z.string().min(1).describe("Short phase label shown to the user."),
    detail: z.string().optional().describe("Optional one-line extra detail."),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
  async execute({ project, phase, detail }) {
    recordProgress(project, phase, detail);
    return { ok: true };
  },
});
