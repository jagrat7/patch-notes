import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using the SERVICE ROLE key. This bypasses RLS, so
 * it must only ever run on the server (the `server-only` import enforces that).
 * The app is a single shared workspace, so we scope every row by WORKSPACE_ID.
 */

export const WORKSPACE_ID = process.env.PATCH_NOTES_WORKSPACE_ID || "default";

let cached: SupabaseClient | null = null;

/** Returns the configured client, or null when Supabase env vars are absent so
 * the dashboard still works (in-memory) without persistence configured. */
export function getSupabase(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export type Settings = {
  defaultRepo: string | null;
  recipients: string[];
  fromEmail: string | null;
};

export type RunCommit = {
  sha: string;
  shortSha: string;
  subject: string;
  author: string | null;
  prNumber: number | null;
};

export type Run = {
  id: string;
  repo: string;
  branch: string;
  headline: string | null;
  markdown: string;
  commitCount: number;
  commits: RunCommit[];
  createdAt: string;
};

const DEFAULT_SETTINGS: Settings = {
  defaultRepo: null,
  recipients: [],
  fromEmail: null,
};

export async function getSettings(): Promise<Settings> {
  const db = getSupabase();
  if (!db) return DEFAULT_SETTINGS;
  const { data, error } = await db
    .from("settings")
    .select("default_repo, recipients, from_email")
    .eq("workspace_id", WORKSPACE_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return DEFAULT_SETTINGS;
  return {
    defaultRepo: data.default_repo ?? null,
    recipients: data.recipients ?? [],
    fromEmail: data.from_email ?? null,
  };
}

export async function saveSettings(input: Settings): Promise<Settings> {
  const db = getSupabase();
  if (!db) throw new Error("Supabase is not configured.");
  const { error } = await db.from("settings").upsert(
    {
      workspace_id: WORKSPACE_ID,
      default_repo: input.defaultRepo,
      recipients: input.recipients,
      from_email: input.fromEmail,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id" },
  );
  if (error) throw new Error(error.message);
  return input;
}

export async function listRuns(limit = 20): Promise<Run[]> {
  const db = getSupabase();
  if (!db) return [];
  const { data, error } = await db
    .from("runs")
    .select("id, repo, branch, headline, markdown, commit_count, commits, created_at")
    .eq("workspace_id", WORKSPACE_ID)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRun);
}

export async function saveRun(input: {
  repo: string;
  branch?: string;
  headline?: string | null;
  markdown: string;
  commits: RunCommit[];
}): Promise<Run> {
  const db = getSupabase();
  if (!db) throw new Error("Supabase is not configured.");
  const { data, error } = await db
    .from("runs")
    .insert({
      workspace_id: WORKSPACE_ID,
      repo: input.repo,
      branch: input.branch ?? "main",
      headline: input.headline ?? null,
      markdown: input.markdown,
      commit_count: input.commits.length,
      commits: input.commits,
    })
    .select("id, repo, branch, headline, markdown, commit_count, commits, created_at")
    .single();
  if (error) throw new Error(error.message);
  return mapRun(data);
}

export async function logSend(input: {
  runId: string | null;
  recipients: string[];
  subject: string | null;
  resendId: string | null;
}): Promise<void> {
  const db = getSupabase();
  if (!db) return;
  const { error } = await db.from("sends").insert({
    workspace_id: WORKSPACE_ID,
    run_id: input.runId,
    recipients: input.recipients,
    subject: input.subject,
    resend_id: input.resendId,
  });
  if (error) throw new Error(error.message);
}

// biome-ignore lint/suspicious/noExplicitAny: row shape from supabase-js
function mapRun(row: any): Run {
  return {
    id: row.id,
    repo: row.repo,
    branch: row.branch,
    headline: row.headline ?? null,
    markdown: row.markdown,
    commitCount: row.commit_count ?? 0,
    commits: row.commits ?? [],
    createdAt: row.created_at,
  };
}
