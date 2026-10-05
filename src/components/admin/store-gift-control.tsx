"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Gift, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/controls";
import { giftStoreAction, type GiftActionState } from "@/lib/stores/gift-actions";
import {
  GIFT_CHOICE_LABELS,
  GIFT_CHOICES,
  type GiftChoice,
} from "@/lib/stores/gift-shared";

/* A "use server" module exports only async functions, so the idle state
   lives with the one form that starts from it. */
const GIFT_IDLE: GiftActionState = { status: "idle" };

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Saving…" : "Save gift"}
    </Button>
  );
}

/**
 * Ultra as a gift, for a store that already exists: give it, change it,
 * or end it. Beside the listing controls because it moves the same tier,
 * but its own card, since a gift carries a date and an email and a plain
 * "Upgrade to Ultra" carries neither.
 *
 * The page works out the words server-side and hands over plain props:
 * `summary` is the one line saying the current gift, `live` says whether
 * there is one to end, and `current` is what the picker starts on.
 */
export function StoreGiftControl({
  storeId,
  summary,
  live,
  current,
}: {
  storeId: string;
  summary: string;
  live: boolean;
  current: GiftChoice;
}) {
  const [state, formAction] = useActionState(giftStoreAction, GIFT_IDLE);

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold text-text-primary">Beta gift</h3>
        <p className="text-sm text-text-secondary">
          Ultra with no card. Ending a gift keeps their founding price.
        </p>
      </div>

      <p className="flex items-center gap-2 text-sm text-text-secondary">
        <Gift
          className={`size-4 shrink-0 ${live ? "text-accent" : "text-text-muted"}`}
          aria-hidden="true"
        />
        <span>{summary}</span>
      </p>

      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="storeId" value={storeId} />
        <div className="min-w-56 flex-1">
          <Select name="gift" defaultValue={current} aria-label="Gift">
            {GIFT_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {choice === "none" && live
                  ? "End the gift"
                  : GIFT_CHOICE_LABELS[choice]}
              </option>
            ))}
          </Select>
        </div>
        <SaveButton />
      </form>

      {state.status !== "idle" && (
        <p
          role="status"
          className={`text-sm ${state.status === "error" ? "text-danger" : "text-accent"}`}
        >
          {state.message}
        </p>
      )}
    </Card>
  );
}
