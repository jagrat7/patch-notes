/**
 * File-backed progress log for video renders, keyed by project slug.
 *
 * IMPORTANT: the video-producer subagent's tools run in the *eve* runtime, but
 * the /api/video-progress route runs in the *Next* runtime — separate processes
 * (see vercel.json: Next owns /api, eve owns the agent). So an in-memory store
 * would NOT be shared. We persist to a small JSON file under a temp dir both
 * processes can reach. Fine for dev and single-instance deploys; a multi-
 * instance deploy would use shared storage (KV/Blob) instead.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ProgressEntry = {
  at: number;
  phase: string;
  detail?: string;
};

const MAX_ENTRIES = 200;
const DIR = join(tmpdir(), "patch-notes-video-progress");

function fileFor(project: string): string {
  const safe = project.replace(/[^a-z0-9_-]+/gi, "_");
  return join(DIR, `${safe}.json`);
}

type Snapshot = { project: string; updatedAt: number; entries: ProgressEntry[] };

function read(project: string): Snapshot | null {
  try {
    return JSON.parse(readFileSync(fileFor(project), "utf8")) as Snapshot;
  } catch {
    return null;
  }
}

export function recordProgress(project: string, phase: string, detail?: string): void {
  try {
    mkdirSync(DIR, { recursive: true });
    const prev = read(project);
    const entries = prev?.entries ?? [];
    entries.push({ at: Date.now(), phase, detail });
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    const snap: Snapshot = { project, updatedAt: Date.now(), entries };
    writeFileSync(fileFor(project), JSON.stringify(snap));
  } catch {
    // best-effort: never let progress logging break a render
  }
}

export function getProgress(project: string): ProgressEntry[] {
  return read(project)?.entries ?? [];
}

/** Most recently updated project — lets the UI follow without knowing the slug. */
export function latestActiveProject(): string | null {
  try {
    let best: { project: string; at: number } | null = null;
    for (const f of readdirSync(DIR)) {
      if (!f.endsWith(".json")) continue;
      const snap = JSON.parse(readFileSync(join(DIR, f), "utf8")) as Snapshot;
      if (!best || snap.updatedAt > best.at) best = { project: snap.project, at: snap.updatedAt };
    }
    return best?.project ?? null;
  } catch {
    return null;
  }
}
