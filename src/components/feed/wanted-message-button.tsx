"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { openThreadAction } from "@/lib/local/actions";

/**
 * "Message", at the end of a "Wanted from you" row.
 *
 * The founder: "I should be able to DM them immediately - with pressing
 * a green DM button on that screen and it'll say something like 'I
 * have (insert card name here)' and it'll open a DM with that card as
 * a convo." So the tap sends `I have <card>.` as the first line of the
 * Flare's thread and lands in it. When a conversation on that Flare is
 * already open, the tap simply opens it: nothing is sent twice.
 *
 * It owns the row it sits in, because a refusal from the server is
 * shown under the row rather than in a toast nobody reads.
 */
export function WantedMessageButton({
  flareId,
  threadId,
  cardName,
  children,
}: {
  flareId: string;
  /** A conversation the viewer already has on this Flare. */
  threadId: string | null;
  cardName: string;
  /** The row's own content: the card, the face and the name. */
  children: ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const message = () => {
    if (pending) return;
    setError(null);
    if (threadId) {
      router.push(`/local?thread=${encodeURIComponent(threadId)}`);
      return;
    }
    start(async () => {
      const result = await openThreadAction(flareId, `I have ${cardName}.`);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/local?thread=${encodeURIComponent(result.threadId)}`);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        {children}
        <Button
          type="button"
          size="sm"
          onClick={message}
          disabled={pending}
          className="shrink-0"
        >
          Message
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
