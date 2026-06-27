"use client";

import {
  type EveMessage,
  type EveMessageData,
  type UseEveAgentHelpers,
  useEveAgent,
} from "eve/react";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  GitCommitHorizontalIcon,
  MessageSquareIcon,
  SendIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentMessage } from "@/app/_components/agent-message";
import { SendDialog } from "@/app/_components/send-dialog";
import { type Settings, SettingsDialog } from "@/app/_components/settings-dialog";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { MessageResponse } from "@/components/ai-elements/message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";

type Commit = {
  sha: string;
  shortSha: string;
  subject: string;
  author: string | null;
  authorLogin: string | null;
  date: string | null;
  url: string;
  prNumber: number | null;
};

type Run = {
  id: string;
  repo: string;
  branch: string;
  headline: string | null;
  markdown: string;
  commitCount: number;
  createdAt: string;
};

/** Pull a subject line out of the notes' headline for the email subject. */
function deriveSubject(notes: string | null, repo: string | null): string {
  if (notes) {
    const heading = notes.split("\n").find((line) => /^#{1,3}\s+/.test(line));
    if (heading) return heading.replace(/^#{1,3}\s+/, "").trim();
  }
  return repo ? `Patch Notes — ${repo}` : "Patch Notes";
}

/** Read the markdown off the most recent generate_patch_notes tool output. */
function latestPatchNotes(messages: readonly EveMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    for (const part of messages[i].parts) {
      if (
        part.type === "dynamic-tool" &&
        part.toolName === "generate_patch_notes" &&
        part.state === "output-available"
      ) {
        const output = part.output as { markdown?: unknown } | undefined;
        if (output && typeof output.markdown === "string") return output.markdown;
      }
    }
  }
  return null;
}

export function PatchNotesDashboard() {
  const agent = useEveAgent();
  const isBusy = agent.status === "submitted" || agent.status === "streaming";

  const [repoInput, setRepoInput] = useState("vercel/next.js");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loadedRepo, setLoadedRepo] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Right panel mode: false = rendered document, true = chat thread.
  const [chatOpen, setChatOpen] = useState(false);
  const [refineInput, setRefineInput] = useState("");

  // Persistence: shared settings + saved run history (Supabase).
  const [settings, setSettings] = useState<Settings>({
    defaultRepo: null,
    recipients: [],
    fromEmail: null,
  });
  const [runs, setRuns] = useState<Run[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  // A run loaded from history overrides the live agent notes until cleared.
  const [viewedRun, setViewedRun] = useState<Run | null>(null);

  const refreshRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/runs");
      if (!res.ok) return;
      const data = await res.json();
      setRuns(data.runs ?? []);
    } catch {
      // Persistence is optional; ignore load failures.
    }
  }, []);

  // On mount: load shared settings (default repo + recipients) and run history.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data: Settings = await res.json();
          setSettings(data);
          if (data.defaultRepo) setRepoInput(data.defaultRepo);
        }
      } catch {
        // ignore — settings are optional
      }
      await refreshRuns();
    })();
  }, [refreshRuns]);

  const allSelected = commits.length > 0 && selected.size === commits.length;
  const selectedCommits = useMemo(
    () => commits.filter((c) => selected.has(c.sha)),
    [commits, selected],
  );

  const notes = latestPatchNotes(agent.data.messages);
  const hasStarted = agent.data.messages.length > 0;

  // Auto-save each finished version of the notes to Supabase, once per change.
  const savedNotesRef = useRef<string | null>(null);
  useEffect(() => {
    if (!notes || isBusy || !loadedRepo) return;
    if (savedNotesRef.current === notes) return;
    savedNotesRef.current = notes;
    (async () => {
      try {
        await fetch("/api/runs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            repo: loadedRepo,
            headline: deriveSubject(notes, loadedRepo),
            markdown: notes,
            commits: selectedCommits.map((c) => ({
              sha: c.sha,
              shortSha: c.shortSha,
              subject: c.subject,
              author: c.author,
              prNumber: c.prNumber,
            })),
          }),
        });
        await refreshRuns();
      } catch {
        // Persistence is optional.
      }
    })();
  }, [notes, isBusy, loadedRepo, selectedCommits, refreshRuns]);

  async function handleFetch(event: FormEvent) {
    event.preventDefault();
    const [owner, repo] = repoInput.trim().split("/");
    if (!owner || !repo) {
      setFetchError("Enter a repository as owner/repo, e.g. vercel/next.js.");
      return;
    }

    setLoading(true);
    setFetchError(null);
    setCommits([]);
    setSelected(new Set());
    try {
      const res = await fetch(
        `/api/commits?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}&perPage=40`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
      setCommits(data.commits);
      setLoadedRepo(data.repo);
      setSelected(new Set(data.commits.map((c: Commit) => c.sha)));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to fetch commits.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(sha: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sha)) next.delete(sha);
      else next.add(sha);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(commits.map((c) => c.sha)));
  }

  async function handleGenerate() {
    if (selectedCommits.length === 0 || isBusy || !loadedRepo) return;
    setChatOpen(false); // a fresh generation returns to the document view
    setViewedRun(null); // back to live agent output

    const lines = selectedCommits.map((c) => {
      const pr = c.prNumber ? ` (PR #${c.prNumber})` : "";
      const author = c.author ? ` — ${c.author}` : "";
      return `- ${c.shortSha}: ${c.subject}${pr}${author}`;
    });

    const message = [
      `Generate patch notes for ${loadedRepo} from exactly these ${selectedCommits.length} selected commits.`,
      "Do not fetch more commits; use only what I list here.",
      "",
      ...lines,
    ].join("\n");

    await agent.send({ message });
  }

  async function handleRefine(event: FormEvent) {
    event.preventDefault();
    const text = refineInput.trim();
    if (!text || isBusy) return;
    setRefineInput("");
    setChatOpen(true); // asking a follow-up opens the chat thread
    setViewedRun(null); // refining acts on the live notes
    await agent.send({ message: text });
  }

  // Re-open a past run as the document (read-only view of saved markdown).
  function loadRun(run: Run) {
    setChatOpen(false);
    setLoadedRepo(run.repo);
    savedNotesRef.current = run.markdown; // don't re-save what we just loaded
    setViewedRun(run);
  }

  const displayNotes = viewedRun ? viewedRun.markdown : notes;

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex shrink-0 flex-col gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SparklesIcon className="size-5 text-primary" />
            <h1 className="font-medium text-lg tracking-tight">Patch Notes</h1>
          </div>
          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <ClockIcon className="size-4" />
                  History
                  {runs.length > 0 ? (
                    <Badge variant="secondary">{runs.length}</Badge>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Saved runs</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {runs.length === 0 ? (
                  <div className="px-2 py-3 text-muted-foreground text-sm">
                    No saved runs yet. Generate patch notes to see them here.
                  </div>
                ) : (
                  runs.map((run) => (
                    <DropdownMenuItem
                      className="flex flex-col items-start gap-0.5"
                      key={run.id}
                      onClick={() => loadRun(run)}
                    >
                      <span className="truncate font-medium text-sm">
                        {run.headline ?? run.repo}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {run.repo} · {run.commitCount} commit
                        {run.commitCount === 1 ? "" : "s"} ·{" "}
                        {new Date(run.createdAt).toLocaleString()}
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setSettingsOpen(true)} size="sm" variant="outline">
              <SettingsIcon className="size-4" />
              Settings
            </Button>
          </div>
        </div>
        <form className="flex flex-wrap items-center gap-2" onSubmit={handleFetch}>
          <Input
            aria-label="Repository (owner/repo)"
            className="max-w-xs"
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="owner/repo"
            value={repoInput}
          />
          <Button disabled={loading} type="submit">
            {loading ? <Spinner /> : <GitCommitHorizontalIcon className="size-4" />}
            Load commits from main
          </Button>
          {commits.length > 0 ? (
            <span className="text-muted-foreground text-sm">
              {selected.size} of {commits.length} selected
            </span>
          ) : null}
        </form>
        {fetchError ? (
          <div className="flex items-start gap-2 text-destructive text-sm">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
            <span>{fetchError}</span>
          </div>
        ) : null}
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* Left: selectable commit list */}
        <section className="flex min-h-0 flex-col border-r">
          {commits.length > 0 ? (
            <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                Select all
              </label>
              <Button
                disabled={selectedCommits.length === 0 || isBusy}
                onClick={handleGenerate}
                size="sm"
              >
                {isBusy && !chatOpen ? <Spinner /> : <SparklesIcon className="size-4" />}
                Generate ({selectedCommits.length})
              </Button>
            </div>
          ) : null}

          <ScrollArea className="min-h-0 flex-1">
            {commits.length === 0 ? (
              <p className="p-8 text-center text-muted-foreground text-sm">
                Load a repository to see its recent commits on <code>main</code>, then pick
                the ones to include.
              </p>
            ) : (
              <ul className="divide-y">
                {commits.map((commit) => (
                  <li key={commit.sha}>
                    <label className="flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-muted/40">
                      <Checkbox
                        checked={selected.has(commit.sha)}
                        className="mt-0.5"
                        onCheckedChange={() => toggle(commit.sha)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-sm">
                          {commit.subject}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                          <code className="rounded bg-muted px-1 py-0.5">{commit.shortSha}</code>
                          {commit.author ? <span>{commit.author}</span> : null}
                          {commit.prNumber ? (
                            <Badge variant="secondary">#{commit.prNumber}</Badge>
                          ) : null}
                          {commit.date ? (
                            <span>{new Date(commit.date).toLocaleDateString()}</span>
                          ) : null}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </section>

        {/* Right: patch notes — document view by default, chat when refining */}
        <section className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
            <span className="flex items-center gap-2 font-medium text-sm">
              {chatOpen ? "Refining patch notes" : "Patch notes"}
              {!chatOpen && viewedRun ? (
                <Badge variant="secondary">saved run</Badge>
              ) : null}
            </span>
            {chatOpen ? (
              <Button onClick={() => setChatOpen(false)} size="sm" variant="ghost">
                <ArrowLeftIcon className="size-4" />
                Back to document
              </Button>
            ) : null}
          </div>

          {agent.error ? (
            <div className="m-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
              <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>{agent.error.message}</span>
            </div>
          ) : null}

          {chatOpen ? (
            <ChatView agent={agent} isBusy={isBusy} />
          ) : (
            <DocumentView
              hasStarted={hasStarted}
              isBusy={isBusy}
              notes={displayNotes}
              onRefine={handleRefine}
              onSend={() => setSendOpen(true)}
              readOnly={viewedRun !== null}
              refineInput={refineInput}
              repo={loadedRepo}
              setRefineInput={setRefineInput}
            />
          )}
        </section>
      </div>

      <SettingsDialog
        onOpenChange={setSettingsOpen}
        onSaved={setSettings}
        open={settingsOpen}
        settings={settings}
      />
      <SendDialog
        defaultSubject={deriveSubject(displayNotes, loadedRepo)}
        initialRecipients={settings.recipients}
        markdown={displayNotes}
        onOpenChange={setSendOpen}
        onSent={refreshRuns}
        open={sendOpen}
        runId={viewedRun?.id ?? null}
      />
    </main>
  );
}

function DocumentView({
  hasStarted,
  isBusy,
  notes,
  onRefine,
  onSend,
  readOnly,
  refineInput,
  repo,
  setRefineInput,
}: {
  readonly hasStarted: boolean;
  readonly isBusy: boolean;
  readonly notes: string | null;
  readonly onRefine: (event: FormEvent) => void;
  readonly onSend: () => void;
  readonly readOnly: boolean;
  readonly refineInput: string;
  readonly repo: string | null;
  readonly setRefineInput: (value: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!notes) return;
    try {
      await navigator.clipboard.writeText(notes);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function handleDownload() {
    if (!notes) return;
    const slug = (repo ?? "patch-notes").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const blob = new Blob([notes], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-patch-notes.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {notes ? (
        <div className="flex items-center justify-end gap-2 border-b px-4 py-2">
          <Button onClick={handleCopy} size="sm" variant="outline">
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            {copied ? "Copied" : "Copy markdown"}
          </Button>
          <Button onClick={handleDownload} size="sm" variant="outline">
            <DownloadIcon className="size-4" />
            Download .md
          </Button>
          <Button onClick={onSend} size="sm">
            <SendIcon className="size-4" />
            Send email
          </Button>
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-6 py-6">
          {notes ? (
            <article className="prose prose-sm dark:prose-invert max-w-none">
              <MessageResponse>{notes}</MessageResponse>
            </article>
          ) : isBusy ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Spinner /> Generating patch notes…
            </div>
          ) : hasStarted ? (
            <p className="text-muted-foreground text-sm">
              Working on it — the patch notes will appear here.
            </p>
          ) : (
            <p className="text-center text-muted-foreground text-sm">
              Select commits and click <strong>Generate</strong> to produce patch notes.
            </p>
          )}
        </div>
      </ScrollArea>

      {notes && !readOnly ? (
        <form className="flex items-center gap-2 border-t px-4 py-3" onSubmit={onRefine}>
          <MessageSquareIcon className="size-4 shrink-0 text-muted-foreground" />
          <Input
            aria-label="Ask for an edit"
            disabled={isBusy}
            onChange={(e) => setRefineInput(e.target.value)}
            placeholder="Ask for an edit… e.g. 'group bug fixes first' or 'make it more concise'"
            value={refineInput}
          />
          <Button disabled={isBusy || !refineInput.trim()} size="sm" type="submit">
            Refine
          </Button>
        </form>
      ) : null}
    </>
  );
}

function ChatView({
  agent,
  isBusy,
}: {
  readonly agent: UseEveAgentHelpers<EveMessageData>;
  readonly isBusy: boolean;
}) {
  const [draft, setDraft] = useState("");

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || isBusy) return;
    setDraft("");
    await agent.send({ message: text });
  }

  return (
    <>
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-6 px-4 py-6">
          {agent.data.messages.map((message, index) => (
            <AgentMessage
              canRespond={!isBusy}
              isStreaming={
                agent.status === "streaming" && index === agent.data.messages.length - 1
              }
              key={message.id}
              message={message}
              onInputResponses={(inputResponses) => agent.send({ inputResponses })}
            />
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <form className="flex items-center gap-2 border-t px-4 py-3" onSubmit={handleSend}>
        <Input
          aria-label="Message"
          disabled={isBusy}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask for another edit…"
          value={draft}
        />
        <Button disabled={isBusy || !draft.trim()} size="sm" type="submit">
          Send
        </Button>
      </form>
    </>
  );
}
