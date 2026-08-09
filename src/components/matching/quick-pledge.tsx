"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { offerTradeAction } from "@/lib/matching/actions";

/**
 * The carousel tile's one-tap pledge, with feedback while it lands.
 *
 * The founder's complaint was a silent button: tapping "I got it" did
 * nothing visible until the server round-trip finished, which on store
 * wifi reads as broken. While the pledge is in flight the whole tile
 * greys out under a spinner — the overlay is positioned against the
 * tile (the nearest `relative` ancestor), not this form — and the
 * button disables so it cannot be double-tapped.
 *
 * A client island on a server-rendered board: `useFormStatus` is the
 * one hook that knows a plain form action is pending, and it only
 * works from inside the form.
 */

function PledgeButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <>
      {pending && (
        <span
          aria-hidden="true"
          className="absolute inset-0 z-10 flex items-center justify-center rounded-[8px] bg-canvas/60"
        >
          <Loader2 className="size-5 animate-spin text-accent" />
        </span>
      )}
      <button
        type="submit"
        disabled={pending}
        className="text-[11px] font-semibold text-accent underline underline-offset-2 disabled:opacity-60"
      >
        {pending ? "On it…" : label}
      </button>
    </>
  );
}

export function QuickPledge({
  code,
  flareId,
  early = false,
}: {
  code: string;
  flareId: string;
  early?: boolean;
}) {
  return (
    <form action={offerTradeAction}>
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="flareId" value={flareId} />
      <PledgeButton label={early ? "I got you" : "I got it"} />
    </form>
  );
}
