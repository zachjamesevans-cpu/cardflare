"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, ChevronDown, Flame, Loader2, Sparkles } from "lucide-react";

import { EditPlayerName } from "@/components/admin/edit-player-form";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { grantEmbersAction, unlockCosmeticsAction } from "@/lib/admin/grant-actions";
import { GRANT_IDLE, GRANT_MAX, type GrantState } from "@/lib/admin/grant-schema";

/**
 * One player in the console, and everything an admin can do to them.
 *
 * The WHOLE ROW is the button. The first cut hid the controls behind a
 * small ghost button labelled "Embers", and the founder's report wrote
 * the review: "I can't even click on players in the player menu to
 * grant them embers. Where do I even grant embers?" A row of people
 * reads as a list of things to tap, so tapping one is now what opens
 * it — rename, grant and unlock together underneath, the same drawer
 * gesture the rest of the product uses.
 */
export function AdminPlayerRow({
  playerId,
  displayName,
  email,
  avatarUrl,
  embersEarned,
  embersBalance,
  cosmeticsUnlocked,
  purchasedCount,
  setupOwed,
}: {
  playerId: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  embersEarned: number;
  embersBalance: number;
  cosmeticsUnlocked: boolean;
  purchasedCount: number;
  setupOwed: boolean;
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

  return (
    <li className="flex flex-col border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-control)] py-3 text-left transition-colors hover:bg-elevated/60"
      >
        <PlayerAvatar
          displayName={displayName}
          seed={playerId}
          avatarUrl={avatarUrl}
          size="sm"
        />
        <span className="flex min-w-0 flex-1 basis-48 flex-col">
          <span className="truncate font-semibold text-text-primary">
            {displayName}
          </span>
          <span className="truncate text-xs text-text-muted">
            {email ?? "No address on file"}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-1.5 text-xs text-text-secondary tabular-nums">
          <Flame className="size-3.5 text-accent" aria-hidden="true" />
          {embersEarned.toLocaleString()} Embers
        </span>

        {cosmeticsUnlocked && <Badge>all unlocked</Badge>}
        {/* Signed up and never chose a username: worth seeing at a glance. */}
        {setupOwed && <Badge tone="neutral">setup owed</Badge>}

        <ChevronDown
          aria-hidden="true"
          className={`size-4 shrink-0 text-text-muted transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="mb-3 flex flex-col gap-4 rounded-[var(--radius-control)] border border-border bg-elevated p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-text-muted tabular-nums">
              {embersEarned.toLocaleString()} earned · {embersBalance.toLocaleString()}{" "}
              to spend · {purchasedCount} bought
            </p>
            <EditPlayerName playerId={playerId} displayName={displayName} />
          </div>

          <form action={grant} className="flex flex-col gap-2">
            <input type="hidden" name="playerId" value={playerId} />

            <p className="text-sm font-semibold text-text-primary">Grant Embers</p>

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
             * Said before it happens, so an admin knows exactly what a
             * gift does and does not do. Spendable only: the badge stays
             * a record of trades actually made.
             */}
            <p className="text-xs text-text-muted">
              Spendable Embers only. Their public lifetime total is not affected, so a
              grant never looks like trading they did not do.
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

          {said.status !== "idle" && (
            <p
              role="status"
              className={`flex items-center gap-1.5 text-sm ${
                said.status === "error" ? "text-danger" : "text-text-secondary"
              }`}
            >
              {said.status === "granted" && (
                <Check className="size-3.5 text-accent" aria-hidden="true" />
              )}
              {said.message}
            </p>
          )}
        </div>
      )}
    </li>
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
