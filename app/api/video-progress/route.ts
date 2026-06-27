import { getProgress, latestActiveProject } from "@/lib/video-progress";

/**
 * Returns the progress log for a video render. The browser polls this to show
 * what the video-producer subagent is doing (it runs in a child session the
 * root stream can't see in detail). Pass ?project=<slug>, or omit to follow the
 * most recently active project.
 */
export function GET(request: Request) {
  const url = new URL(request.url);
  const project = url.searchParams.get("project") ?? latestActiveProject();

  if (!project) {
    return Response.json({ project: null, entries: [] });
  }

  return Response.json({ project, entries: getProgress(project) });
}
