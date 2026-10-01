"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, MessageCircle } from "lucide-react";

import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { openDirectThreadAction } from "@/lib/local/actions";

/**
 * "Message", beside Follow on somebody's profile.
 *
 * The founder: "I should be able to go on someone's profile and message
 * them directly about anything." One tap opens (or finds) the direct
 * conversation with that person and lands in it; nothing is sent until
 * they write the first line there. Drawn under the same condition as
 * Follow, so a guest and your own page never see it.
 */
export function MessageButton({
  playerId,
  className,
}: {
  playerId: string;
  /** Goes on the wrapper, so "flex-1" shares the row with Follow. */
  className?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = () => {
    if (pending) return;
    setError(null);
    start(async () => {
      const result = await openDirectThreadAction(playerId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/local?thread=${encodeURIComponent(result.threadId)}`);
    });
  };

  return (
    <span className={cn("flex min-w-0 flex-col gap-1", className)}>
      <button
        type="button"
        onClick={open}
        disabled={pending}
        className={cn(buttonStyles("secondary", "sm"), "w-full")}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <MessageCircle className="size-4" aria-hidden="true" />
        )}
        Message
      </button>
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
