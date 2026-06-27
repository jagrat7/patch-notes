"use client";

import { AlertCircleIcon, CheckIcon, SendIcon, XIcon } from "lucide-react";
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

export function SendDialog({
  open,
  onOpenChange,
  markdown,
  defaultSubject,
  initialRecipients,
  runId,
  onSent,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly markdown: string | null;
  readonly defaultSubject: string;
  readonly initialRecipients: string[];
  readonly runId: string | null;
  readonly onSent?: () => void;
}) {
  const [recipients, setRecipients] = useState<string[]>(initialRecipients);
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState<number | null>(null);

  // Reset the form whenever the dialog is (re)opened.
  useEffect(() => {
    if (open) {
      setRecipients(initialRecipients);
      setSubject(defaultSubject);
      setDraft("");
      setError(null);
      setSentCount(null);
    }
  }, [open, initialRecipients, defaultSubject]);

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

  function removeRecipient(email: string) {
    setRecipients((prev) => prev.filter((r) => r !== email));
  }

  function onDraftKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      addDraft();
    }
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    // Fold any pending text in the input into the recipient list first.
    const pending = draft
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const invalid = pending.find((c) => !EMAIL_RE.test(c));
    if (invalid) {
      setError(`"${invalid}" is not a valid email.`);
      return;
    }
    const to = [...new Set([...recipients, ...pending])];
    if (to.length === 0) {
      setError("Add at least one recipient.");
      return;
    }
    if (!markdown) {
      setError("There are no patch notes to send.");
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipients: to, subject, markdown, runId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
      setSentCount(data.recipients?.length ?? to.length);
      onSent?.();
      setTimeout(() => onOpenChange(false), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSend}>
          <DialogHeader>
            <DialogTitle>Send patch notes</DialogTitle>
            <DialogDescription>
              Email the current patch notes. Edit the recipients and subject before sending.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="send-subject">Subject</Label>
              <Input
                id="send-subject"
                onChange={(e) => setSubject(e.target.value)}
                value={subject}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="send-recipients">Recipients</Label>
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
                        onClick={() => removeRecipient(email)}
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
                  id="send-recipients"
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
            {sentCount !== null ? (
              <div className="flex items-center gap-2 text-emerald-600 text-sm dark:text-emerald-400">
                <CheckIcon className="size-4" />
                <span>Sent to {sentCount} recipient{sentCount === 1 ? "" : "s"}.</span>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button onClick={() => onOpenChange(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={sending || sentCount !== null} type="submit">
              {sending ? <Spinner /> : <SendIcon className="size-4" />}
              Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
