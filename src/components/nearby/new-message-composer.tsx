"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonStyles } from "@/components/ui/button";
import { answerNearbyAction } from "@/lib/nearby/actions";

/**
 * The composer of a conversation not started yet, the first line
 * already in it. Send creates the conversation and swaps this page for
 * it in Messages; Back from there goes where the page was opened from.
 * The app's NewMessageScreen is the same.
 */
export function NewMessageComposer({
  ask,
  draft,
  firstName,
}: {
  ask: { kind: "want" | "flare"; id: string };
  draft: string;
  firstName: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const send = () =>
    startTransition(async () => {
      setError(null);
      const result = await answerNearbyAction(ask, text);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.replace(`/local?thread=${encodeURIComponent(result.threadId)}`);
    });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      className="flex flex-col gap-2 border-t border-border p-3"
    >
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={2}
          autoFocus
          aria-label={`Message to ${firstName}`}
          placeholder="Message"
          className="min-w-0 flex-1 resize-none rounded-[var(--radius-control)] border border-border-strong bg-canvas px-3 py-2 text-sm text-text-primary"
        />
        <button
          type="submit"
          disabled={pending || !text.trim()}
          className={buttonStyles("primary", "sm")}
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
