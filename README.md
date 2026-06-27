# Patch Notes

An AI agent that keeps your users updated on what you've built. Point it at any
public GitHub repo, pick the commits you want to share, and it writes clear,
reader-friendly patch notes your team can send straight to users.

## Why

Every time you ship, your users want to know what changed. But translating commit
messages into something a non-technical person can read is tedious. Patch Notes
does it for you — it reads your repo, groups changes into categories (Features,
Improvements, Bug Fixes, Internal), and writes each entry from the user's
perspective.

## How it works

1. **Load commits** from any public GitHub repo (e.g. `vercel/next.js`).
2. **Select** the ones you want to include.
3. **Generate** patch notes — the AI writes them in plain language.
4. **Refine** by chatting with the agent ("make it shorter", "lead with bug fixes").
5. **Send** the finished notes to your users by email.

## Getting started

```bash
bun install
cp .env.example .env   # fill in your keys
bun dev
```

See [`.env.example`](./.env.example) for the full list of environment variables.

## Tech

Built with [eve](https://eve.dev), Next.js, TailwindCSS, Supabase, and Resend.
Deploys to Vercel.
