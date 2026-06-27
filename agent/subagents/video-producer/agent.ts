import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Renders a short MP4 release-notes video from structured patch-note " +
    "entries. Delegate to this when the user wants a video of the changes; " +
    "pass the patch-note entries (category + summary + optional author/PR) and " +
    "release metadata in the message. Returns a playable video URL.",
  model: "zai/glm-5.2",
});
