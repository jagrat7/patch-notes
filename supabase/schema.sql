-- Patch Notes — Supabase schema.
-- Run this once in the Supabase SQL editor (or `supabase db push`).
--
-- This app uses a single shared workspace (no per-user auth). Everything is
-- scoped by a fixed workspace id so a team shares one set of settings and one
-- history of runs. All access goes through the Next.js server using the
-- SERVICE ROLE key, so we keep RLS enabled and add no public policies.

create extension if not exists "pgcrypto";

-- One settings row per workspace.
create table if not exists public.settings (
  workspace_id text primary key,
  default_repo text,
  recipients text[] not null default '{}',
  from_email text,
  updated_at timestamptz not null default now()
);

-- A saved patch-notes run: the rendered markdown plus the commits it covered.
create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  repo text not null,
  branch text not null default 'main',
  headline text,
  markdown text not null,
  commit_count integer not null default 0,
  commits jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists runs_workspace_created_idx
  on public.runs (workspace_id, created_at desc);

-- A log of emails sent, for the history view.
create table if not exists public.sends (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  run_id uuid references public.runs (id) on delete set null,
  recipients text[] not null default '{}',
  subject text,
  resend_id text,
  created_at timestamptz not null default now()
);

create index if not exists sends_workspace_created_idx
  on public.sends (workspace_id, created_at desc);

-- RLS on, no policies: only the service role (used server-side) can read/write.
alter table public.settings enable row level security;
alter table public.runs enable row level security;
alter table public.sends enable row level security;
