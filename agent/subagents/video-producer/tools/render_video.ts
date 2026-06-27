import { defineTool } from "eve/tools";
import { put } from "@vercel/blob";
import { z } from "zod";
import { recordProgress } from "../../../../lib/video-progress.js";

/**
 * Final step: render the assembled HyperFrames project to MP4 in the sandbox,
 * read the bytes back out, and upload to Vercel Blob so the browser can play
 * it. Returns a public URL.
 *
 * Assumes the project's index.html + frames are already built (i.e. /pr-to-video
 * Steps 2→5 ran). This tool owns only the `render` + deliver step.
 */
export default defineTool({
  description:
    "Render the assembled HyperFrames project to an MP4 and upload it to Vercel " +
    "Blob, returning a public video URL. Run only after index.html and all " +
    "frames are built and lint/validate/inspect pass.",
  inputSchema: z.object({
    projectDir: z
      .string()
      .min(1)
      .describe("The project directory, e.g. 'videos/acme-web-jun27'."),
    quality: z
      .enum(["draft", "standard", "high"])
      .default("draft")
      .describe(
        "Render quality. Default 'draft' — fast and cheap on sandbox CPU. Use " +
          "'high' only when the user explicitly asked for a final / HQ render.",
      ),
  }),
  outputSchema: z.object({
    url: z.string().url(),
    bytes: z.number(),
    durationSeconds: z.number().nullable(),
    quality: z.enum(["draft", "standard", "high"]),
  }),
  async execute({ projectDir, quality }, ctx) {
    const sandbox = await ctx.getSandbox();
    if (!sandbox) throw new Error("No sandbox available.");

    const slug = projectDir.replace(/^videos\//, "");
    const outPath = `${projectDir}/renders/video.mp4`;

    recordProgress(slug, "rendering", `Encoding MP4 at ${quality} quality…`);

    const render = await sandbox.run({
      command:
        `cd "${projectDir}" && npx -y hyperframes@latest render ` +
        `--skill=pr-to-video --quality ${quality} --output renders/video.mp4 2>&1`,
    });

    // Confirm the MP4 exists and get its size.
    const stat = await sandbox.run({
      command: `stat -c %s "${outPath}" 2>/dev/null || echo 0`,
    });
    const bytes = Number((stat.stdout || "0").trim()) || 0;
    if (bytes === 0) {
      throw new Error(
        `Render produced no MP4. Last output:\n${(render.stdout || render.stderr).slice(-1500)}`,
      );
    }

    // Probe duration (best-effort).
    const probe = await sandbox.run({
      command:
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${outPath}" 2>/dev/null || echo ""`,
    });
    const durationSeconds = probe.stdout.trim()
      ? Number(parseFloat(probe.stdout.trim()).toFixed(2))
      : null;

    // Blob needs a store: BLOB_READ_WRITE_TOKEN, or OIDC + BLOB_STORE_ID on Vercel.
    if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
      throw new Error(
        "Vercel Blob is not configured. Set BLOB_READ_WRITE_TOKEN (from a Blob " +
          "store in the Vercel dashboard) in your environment, or BLOB_STORE_ID " +
          "when running on Vercel with OIDC. The MP4 rendered but can't be uploaded.",
      );
    }

    // Read the MP4 bytes out of the sandbox and push to Blob.
    recordProgress(slug, "uploading", `Uploading ${(bytes / 1e6).toFixed(1)} MB to Blob…`);
    const data = await sandbox.readBinaryFile({ path: outPath });
    if (!data) throw new Error(`Could not read rendered MP4 at ${outPath}.`);
    const key = `patch-notes-videos/${projectDir.replace(/[^a-z0-9]+/gi, "-")}-${Date.now()}.mp4`;
    const blob = await put(key, Buffer.from(data), {
      access: "public",
      contentType: "video/mp4",
    });

    recordProgress(slug, "done", blob.url);
    return { url: blob.url, bytes, durationSeconds, quality };
  },
});
