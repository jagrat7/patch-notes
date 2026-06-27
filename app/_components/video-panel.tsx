"use client";

import type { EveMessageData } from "eve/react";
import { AlertCircleIcon, FilmIcon, Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type AgentData = EveMessageData;

type ProgressEntry = { at: number; phase: string; detail?: string };

/**
 * Polls /api/video-progress while a render is active so the panel can show the
 * subagent's live phase (preflight → ingest → storyboard → frames → render →
 * upload) — detail the root agent stream can't surface.
 */
function useVideoProgress(active: boolean): ProgressEntry[] {
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/video-progress", { cache: "no-store" });
        const data = (await res.json()) as { entries?: ProgressEntry[] };
        if (!cancelled && Array.isArray(data.entries)) setEntries(data.entries);
      } catch {
        // transient; keep last entries
      }
    };

    poll();
    timer.current = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, [active]);

  return entries;
}

/** The structured result video-producer returns (render_video's output). */
type VideoResult = {
  url?: string;
  bytes?: number;
  durationSeconds?: number | null;
  quality?: "draft" | "standard" | "high";
};

type VideoState =
  | { phase: "idle" }
  | { phase: "starting" } // subagent called, args still streaming in
  | { phase: "running" } // subagent working (preflight → render). May take minutes.
  | { phase: "done"; result: VideoResult }
  | { phase: "error"; message: string };

/**
 * Reads the `video-producer` subagent's lowered tool part out of the root
 * agent's message stream. The subagent is exposed to the model as a
 * `dynamic-tool` named `video-producer`; its lifecycle (`input-available` →
 * `output-available` / `output-error`) is what we surface. The subagent's OWN
 * nested tool calls (preflight, prepare_project, render_video) run in a child
 * session and are NOT in this stream — for fine-grained phase text we poll the
 * progress route (see PhaseLine). This gives the coarse called/working/done.
 */
function deriveVideoState(data: AgentData): VideoState {
  let state: VideoState = { phase: "idle" };

  for (const message of data.messages) {
    for (const part of message.parts) {
      if (part.type !== "dynamic-tool" || part.toolName !== "video-producer") continue;

      switch (part.state) {
        case "input-streaming":
          state = { phase: "starting" };
          break;
        case "input-available":
        case "approval-requested":
        case "approval-responded":
          state = { phase: "running" };
          break;
        case "output-available": {
          const output = part.output as { url?: string } & VideoResult;
          // task-mode output may be nested under a known key; accept either.
          const result: VideoResult =
            output && typeof output === "object" && "url" in output
              ? output
              : ((output as { result?: VideoResult })?.result ?? {});
          state = result.url
            ? { phase: "done", result }
            : {
                phase: "error",
                message:
                  "The subagent finished but returned no video URL. Check the eve dev " +
                  "logs (run with --subagents full --logs sandbox) for where it stopped.",
              };
          break;
        }
        case "output-error":
          state = {
            phase: "error",
            message: part.errorText ?? "Video generation failed (no error text).",
          };
          break;
        case "output-denied":
          state = { phase: "error", message: "Video generation was denied." };
          break;
      }
    }
  }

  return state;
}

function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function VideoPanel({ data }: { readonly data: AgentData }) {
  const state = deriveVideoState(data);
  const isWorking = state.phase === "starting" || state.phase === "running";
  const progress = useVideoProgress(isWorking);

  return (
    <section className="flex min-h-0 flex-col border-t">
      <div className="flex items-center gap-2 border-b px-4 py-2 font-medium text-sm">
        <FilmIcon className="size-4 text-primary" />
        Release video
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        {state.phase === "idle" ? (
          <p className="text-center text-muted-foreground text-sm">
            A short video of these changes will render here alongside the notes.
          </p>
        ) : null}

        {isWorking ? <ProgressView entries={progress} /> : null}

        {state.phase === "done" ? (
          <div className="flex w-full max-w-2xl flex-col gap-2">
            {/* biome-ignore lint/a11y/useMediaCaption: generated release reel, no captions track */}
            <video
              className="w-full rounded-lg border bg-black"
              controls
              src={state.result.url}
            />
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <a
                className="underline hover:text-foreground"
                href={state.result.url}
                rel="noreferrer"
                target="_blank"
              >
                Open MP4
              </a>
              <span className="flex items-center gap-2">
                {state.result.quality ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 uppercase">
                    {state.result.quality}
                  </span>
                ) : null}
                {formatDuration(state.result.durationSeconds) ? (
                  <span>{formatDuration(state.result.durationSeconds)}</span>
                ) : null}
              </span>
            </div>
            {state.result.quality === "draft" ? (
              <p className="text-muted-foreground text-xs">
                Draft render. For a final cut, re-run with <strong>HQ</strong> checked, or
                ask in chat for a high-quality render.
              </p>
            ) : null}
          </div>
        ) : null}

        {state.phase === "error" ? (
          <div className="flex max-w-md flex-col gap-2">
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span className="whitespace-pre-wrap">{state.message}</span>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function ProgressView({ entries }: { readonly entries: ProgressEntry[] }) {
  const latest = entries.at(-1);
  const startedAt = entries[0]?.at;
  const [elapsed, setElapsed] = useState(0);

  // Tick a wall clock so a stall is visible (the phase stops advancing while
  // the timer keeps climbing).
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <div className="flex items-center gap-3">
        <Loader2Icon className="size-5 shrink-0 animate-spin text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-foreground text-sm">
            {latest ? latest.phase : "Starting video render…"}
          </p>
          {latest?.detail ? (
            <p className="truncate text-muted-foreground text-xs">{latest.detail}</p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Waiting for the sandbox subagent to report in…
            </p>
          )}
        </div>
        {startedAt ? (
          <span className="shrink-0 tabular-nums text-muted-foreground text-xs">{elapsed}s</span>
        ) : null}
      </div>

      {entries.length > 0 ? (
        <ol className="max-h-40 overflow-y-auto rounded-md border bg-muted/30 px-3 py-2 text-muted-foreground text-xs">
          {entries.map((e, i) => (
            <li className="flex gap-2 py-0.5" key={`${e.at}-${i}`}>
              <span className="shrink-0 tabular-nums opacity-60">
                {new Date(e.at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
              <span className="font-medium text-foreground/80">{e.phase}</span>
              {e.detail ? <span className="truncate">— {e.detail}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
