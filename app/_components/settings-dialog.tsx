"use client";

import { AlertCircleIcon, CheckIcon, XIcon } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Settings = {
  defaultRepo: string | null;
  recipients: string[];
  fromEmail: string | null;
};

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSaved,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly settings: Settings;
  readonly onSaved: (settings: Settings) => void;
}) {
  const [defaultRepo, setDefaultRepo] = useState(settings.defaultRepo ?? "");
  const [fromEmail, setFromEmail] = useState(settings.fromEmail ?? "");
  const [recipients, setRecipients] = useState<string[]>(settings.recipients);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setDefaultRepo(settings.defaultRepo ?? "");
      setFromEmail(settings.fromEmail ?? "");
      setRecipients(settings.recipients);
      setDraft("");
      setError(null);
      setSaved(false);
    }
  }, [open, settings]);

  function addDraft() {
    const candidates = draft
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (candidates.length === 0) return;
    const invalid = candidates.find((c) => !EMAIL_RE.test(c));
    if (invalid) {
      setError(`"${invalid}" is not a valid email.`);
      return;
    }
    setError(null);
    setRecipients((prev) => [...new Set([...prev, ...candidates])]);
    setDraft("");
  }

  function onDraftKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      addDraft();
    }
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    const pending = draft
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const invalid = pending.find((c) => !EMAIL_RE.test(c));
    if (invalid) {
      setError(`"${invalid}" is not a valid email.`);
      return;
    }
    if (fromEmail.trim() && !EMAIL_RE.test(fromEmail.trim())) {
      setError("From email is not valid.");
      return;
    }
    const allRecipients = [...new Set([...recipients, ...pending])];

    setSaving(true);
    setError(null);
    try {
      const payload: Settings = {
        defaultRepo: defaultRepo.trim() || null,
        recipients: allRecipients,
        fromEmail: fromEmail.trim() || null,
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
      setSaved(true);
      onSaved(data);
      setTimeout(() => onOpenChange(false), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSave}>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>
              Shared workspace settings — saved to Supabase and used across the team.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="settings-repo">Default repository</Label>
              <Input
                id="settings-repo"
                onChange={(e) => setDefaultRepo(e.target.value)}
                placeholder="owner/repo"
                value={defaultRepo}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-from">From email (optional)</Label>
              <Input
                id="settings-from"
                onChange={(e) => setFromEmail(e.target.value)}
                placeholder="Patch Notes <notes@yourdomain.com>"
                value={fromEmail}
              />
              <p className="text-muted-foreground text-xs">
                Must be a verified Resend sender. Leave blank to use the Resend default.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-recipients">Default recipients</Label>
              {recipients.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {recipients.map((email) => (
                    <span
                      className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
                      key={email}
                    >
                      {email}
                      <button
                        aria-label={`Remove ${email}`}
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setRecipients((p) => p.filter((r) => r !== email))}
                        type="button"
                      >
                        <XIcon className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="flex gap-2">
                <Input
                  id="settings-recipients"
                  onBlur={addDraft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={onDraftKeyDown}
                  placeholder="name@team.com — press Enter to add"
                  type="email"
                  value={draft}
                />
                <Button onClick={addDraft} size="sm" type="button" variant="outline">
                  Add
                </Button>
              </div>
            </div>

            {error ? (
              <div className="flex items-start gap-2 text-destructive text-sm">
                <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={saving || saved} type="submit">
              {saving ? <Spinner /> : saved ? <CheckIcon className="size-4" /> : null}
              {saved ? "Saved" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
