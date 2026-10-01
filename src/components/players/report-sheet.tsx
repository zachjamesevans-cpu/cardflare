"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import {
  REPORT_REASONS,
  type ReportKind,
  type ReportReason,
} from "@/lib/players/safety-reasons";
import { reportAction } from "@/lib/players/safety-actions";

/**
 * The report sheet: one form for a profile, a post and a conversation.
 *
 * A reason from a short list, a note that helps whoever looks, and one
 * button. It never says what happens next beyond "we will take a
 * look", because nothing automatic does: the report lands in the admin
 * queue and a person deals with it. The app draws the same sheet as a
 * modal (mobile/src/report-sheet.tsx) with the same four reasons.
 *
 * The reasons are the one list in safety-reasons.ts, which has no
 * server imports so it can be read here in the browser. The server
 * still validates the value.
 */
const REASONS = REPORT_REASONS;

export const REPORT_NOTE_MAX = 500;

export function ReportSheet({
  open,
  onClose,
  kind,
  targetId,
}: {
  open: boolean;
  onClose: () => void;
  kind: ReportKind;
  targetId: string;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  /* A fresh form every time it opens: closing clears it, and a sent
     one closes itself a second after the thanks. */
  const close = () => {
    if (timer.current) clearTimeout(timer.current);
    setReason(null);
    setNote("");
    setError(null);
    setSent(false);
    onClose();
  };

  const send = () => {
    if (!reason || pending) return;
    setError(null);
    start(async () => {
      const result = await reportAction({ kind, targetId, reason, note });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSent(true);
      timer.current = setTimeout(close, 1000);
    });
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Report"
      footer={
        sent ? null : (
          <Button
            type="button"
            size="md"
            className="w-full"
            onClick={send}
            disabled={!reason || pending}
          >
            {pending ? "Sending…" : "Send report"}
          </Button>
        )
      }
    >
      {sent ? (
        <p
          role="status"
          className="flex items-center gap-2 py-4 text-sm font-semibold text-text-primary"
        >
          <Check className="size-4 text-accent" aria-hidden="true" />
          Thanks. We will take a look.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm text-text-secondary">
              What is wrong with it?
            </legend>
            {REASONS.map((choice) => {
              const on = reason === choice.value;
              return (
                <label
                  key={choice.value}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3 py-2.5 text-sm font-medium transition-colors",
                    on
                      ? "border-accent bg-accent/[0.08] text-text-primary"
                      : "border-border bg-elevated text-text-secondary hover:border-border-strong",
                  )}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={choice.value}
                    checked={on}
                    onChange={() => setReason(choice.value)}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  {choice.label}
                </label>
              );
            })}
          </fieldset>

          <Textarea
            rows={3}
            maxLength={REPORT_NOTE_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Anything that helps us look (optional)"
            aria-label="Note"
            className="min-h-20"
          />

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
