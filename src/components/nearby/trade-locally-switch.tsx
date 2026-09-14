"use client";

import { useState, useTransition } from "react";

import { setLocalTradeAction } from "@/lib/nearby/actions";

import { Toggle } from "./nearby-card";

/**
 * "Trade locally", on one Have list row.
 *
 * The per-card half of Nearby matching. Off is the default and stays
 * the meaning of the rest of the list: private, matched only inside a
 * room. On means people nearby hunting this card are told they can
 * answer you, and nothing else about the list.
 */
export function TradeLocallySwitch({
  entryId,
  on: initial,
}: {
  entryId: string;
  on: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();

  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <Toggle
        on={on}
        pending={pending}
        label="Trade locally"
        onClick={() => {
          const next = !on;
          setOn(next);
          startTransition(async () => {
            const result = await setLocalTradeAction(entryId, next);
            if (!result.ok) setOn(!next);
          });
        }}
      />
      <span className="text-[10px] text-text-muted">Trade locally</span>
    </span>
  );
}
