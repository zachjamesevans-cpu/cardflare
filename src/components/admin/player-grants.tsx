"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Flame, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { grantEmbersAction, unlockCosmeticsAction } from "@/lib/admin/grant-actions";
import { GRANT_IDLE, GRANT_MAX, type GrantState } from "@/lib/admin/grant-schema";

/**
 * Handing one player Embers, or everything.
 *
 * Folded shut until asked for, the same as the rename editor next to it:
 * the players page is a list to read, and a row full of open number
 * inputs reads as a form somebody forgot to submit.
 *
 * The two controls are deliberately different weights. A grant is typed
 * and confirmed because the amount matters and lifetime Embers cannot be
 * taken back; the unlock is one tap because it is reversible and there
 * is nothing to get wrong.
 */
export function PlayerGrants({
  playerId,
  displayName,
  embersEarned,
  embersBalance,
  cosmeticsUnlocked,
  purchasedCount,
}: {
  playerId: string;
  displayName: string;
  embersEarned: number;
  embersBalance: number;
  cosmeticsUnlocked: boolean;
  purchasedCount: number;
}) {
  const [open, setOpen] = useState(false);

  const [grantState, grant] = useActionState<GrantState, FormData>(
    grantEmbersAction,
    GRANT_IDLE,
  );
  const [unlockState, unlock] = useActionState<GrantState, FormData>(
    unlockCosmeticsAction,
    GRANT_IDLE,
  );

  const said = grantState.status !== "idle" ? grantState : unlockState;

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          <Flame className="size-3.5" aria-hidden="true" />
          Embers
        </Button>
        {said.status === "granted" && (
          <span className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Check className="size-3.5 text-accent" aria-hidden="true" />
            {said.message}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4 rounded-[var(--radius-control)] border border-border bg-elevated p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-text-primary">{displayName}</p>
        <p className="text-xs text-text-muted tabular-nums">
          {embersEarned.toLocaleString()} earned · {embersBalance.toLocaleString()} to
          spend · {purchasedCount} bought
        </p>
      </div>

      <form action={grant} className="flex flex-col gap-2">
        <input type="hidden" name="playerId" value={playerId} />

        <div className="flex flex-wrap gap-2">
          <TextInput
            name="amount"
            type="number"
            min={1}
            max={GRANT_MAX}
            step={1}
            required
            defaultValue={100}
            aria-label={`Embers to grant ${displayName}`}
            className="w-28"
          />
          <TextInput
            name="note"
            maxLength={120}
            placeholder="What it is for (optional)"
            aria-label="Note for the ledger"
            className="min-w-0 flex-1 basis-48"
          />
          <GrantButton />
        </div>

        {/*
         * Said before it happens, so an admin knows exactly what a gift
         * does and does not do. Spendable only: the badge stays a record
         * of trades actually made, whoever is being generous.
         */}
        <p className="text-xs text-text-muted">
          Spendable Embers only. Their public lifetime badge is not affected, so a grant
          never looks like trading they did not do.
        </p>
      </form>

      <form action={unlock} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="playerId" value={playerId} />
        <input
          type="hidden"
          name="unlocked"
          value={cosmeticsUnlocked ? "false" : "true"}
        />
        <UnlockButton unlocked={cosmeticsUnlocked} />
        <p className="min-w-0 flex-1 basis-48 text-xs text-text-muted">
          {cosmeticsUnlocked
            ? "Owns every frame, holo and effect, including ones added later."
            : "Grants every frame, holo and effect, forever, including ones added later."}
        </p>
      </form>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Done
        </Button>
        {said.status !== "idle" && (
          <span
            className={`text-xs ${
              said.status === "error" ? "text-danger" : "text-text-secondary"
            }`}
          >
            {said.message}
          </span>
        )}
      </div>
    </div>
  );
}

function GrantButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Granting…" : "Grant"}
    </Button>
  );
}

function UnlockButton({ unlocked }: { unlocked: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Sparkles className="size-3.5" aria-hidden="true" />
      )}
      {unlocked ? "Remove unlock all" : "Unlock all cosmetics"}
    </Button>
  );
}
