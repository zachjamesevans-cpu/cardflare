"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  Bell,
  Check,
  ChevronDown,
  Flame,
  KeyRound,
  Loader2,
  Sparkles,
  SquareArrowOutUpRight,
} from "lucide-react";

import { EditPlayerTier } from "@/components/admin/edit-player-form";
import { PlayerAccountControls } from "@/components/admin/player-account-controls";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, TextInput } from "@/components/ui/controls";
import {
  grantEmbersAction,
  resetLinkAction,
  sendTestNoticeAction,
  unlockCosmeticsAction,
} from "@/lib/admin/grant-actions";
import {
  GRANT_IDLE,
  GRANT_MAX,
  TEST_NOTICE_KINDS,
  TEST_NOTICE_LABELS,
  type GrantState,
} from "@/lib/admin/grant-schema";

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
  handle,
  email,
  avatarUrl,
  embersEarned,
  embersBalance,
  cosmeticsUnlocked,
  cosmeticsUnlockedDraft,
  purchasedCount,
  setupOwed,
  tier,
}: {
  playerId: string;
  displayName: string;
  /** The unique one. Blank only in the minutes before its migration lands. */
  handle: string;
  email: string | null;
  avatarUrl: string | null;
  embersEarned: number;
  embersBalance: number;
  cosmeticsUnlocked: boolean;
  /** Also holds the draft catalogue: the founder's own grant. */
  cosmeticsUnlockedDraft: boolean;
  purchasedCount: number;
  setupOwed: boolean;
  /** Membership tier: free, pro, ultra or max. */
  tier: string;
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
  const [unlockAllState, unlockAll] = useActionState<GrantState, FormData>(
    unlockCosmeticsAction,
    GRANT_IDLE,
  );
  const [testState, test] = useActionState<GrantState, FormData>(
    sendTestNoticeAction,
    GRANT_IDLE,
  );
  const [resetState, reset] = useActionState<GrantState, FormData>(
    resetLinkAction,
    GRANT_IDLE,
  );

  const said =
    [grantState, unlockState, unlockAllState, testState, resetState].find(
      (state) => state.status !== "idle",
    ) ?? GRANT_IDLE;

  return (
    <li className="flex flex-col border-t border-border first:border-t-0">
      {/*
       * The row opens the drawer; the arrow beside it opens their actual
       * profile. Two targets rather than one because they are two
       * different intentions, and because a link nested inside a button
       * is not markup a browser will honour.
       */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-control)] py-3 text-left transition-colors hover:bg-elevated/60"
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
              {handle ? `@${handle} · ` : ""}
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

        <Link
          href={`/p/${playerId}`}
          aria-label={`Open ${displayName}'s profile`}
          title="Open their profile"
          className="shrink-0 rounded-[var(--radius-control)] p-2 text-text-muted transition-colors hover:bg-elevated/60 hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <SquareArrowOutUpRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      {open && (
        <div className="mb-3 flex flex-col gap-4 rounded-[var(--radius-control)] border border-border bg-elevated p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-text-muted tabular-nums">
              {embersEarned.toLocaleString()} earned · {embersBalance.toLocaleString()}{" "}
              to spend · {purchasedCount} bought
            </p>
          </div>

          {/*
           * The support desk: name and handle together, the sign-in
           * address, and a password link. All three exist because a
           * player wrote in and an admin had to open the Supabase
           * dashboard to help them.
           */}
          <PlayerAccountControls
            playerId={playerId}
            displayName={displayName}
            handle={handle}
            email={email}
          />

          <EditPlayerTier playerId={playerId} tier={tier} />

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

          {/* Two grants, never one. The ordinary switch covers the shop;
              the second reaches the catalogue that is meant to stay
              behind the scenes, so it says so in its own name. */}
          <form action={unlock} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="playerId" value={playerId} />
            <input type="hidden" name="scope" value="live" />
            <input
              type="hidden"
              name="unlocked"
              value={cosmeticsUnlocked ? "false" : "true"}
            />
            <UnlockButton unlocked={cosmeticsUnlocked} />
            <p className="min-w-0 flex-1 basis-48 text-xs text-text-muted">
              {cosmeticsUnlocked
                ? "Owns every live cosmetic, including ones added later."
                : "Grants every live cosmetic, forever, including ones added later."}
            </p>
          </form>

          <form action={unlockAll} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="playerId" value={playerId} />
            <input type="hidden" name="scope" value="everything" />
            <input
              type="hidden"
              name="unlocked"
              value={cosmeticsUnlockedDraft ? "false" : "true"}
            />
            <UnlockEverythingButton unlocked={cosmeticsUnlockedDraft} />
            <p className="min-w-0 flex-1 basis-48 text-xs text-text-muted">
              {cosmeticsUnlockedDraft
                ? "Also owns the behind-the-scenes catalogue. Nobody else should have this."
                : "Also grants the behind-the-scenes catalogue, unreleased cosmetics included. For your own account only."}
            </p>
          </form>

          {/* Push is the one surface that cannot be checked by looking
              at a screen. This fires a real notification down the real
              rails, so the plumbing is provable before a Friday night. */}
          <form action={test} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="playerId" value={playerId} />
            <Select name="kind" defaultValue="offer-received" className="w-auto">
              {TEST_NOTICE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {TEST_NOTICE_LABELS[kind]}
                </option>
              ))}
            </Select>
            <TestNoticeButton />
            <p className="min-w-0 flex-1 basis-48 text-xs text-text-muted">
              Sends the real thing to every phone signed in to this account.
            </p>
          </form>

          {/* Locked out and writing to support is the case this answers,
              so the link comes back here to be pasted into the reply
              rather than being posted to an address they may have lost. */}
          <form action={reset} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="playerId" value={playerId} />
            <ResetLinkButton />
            <p className="min-w-0 flex-1 basis-48 text-xs text-text-muted">
              {email
                ? `Makes a one-time sign-in link for ${email}. Nothing is emailed.`
                : "No address on this account, so there is no link to make."}
            </p>
          </form>

          {said.status === "link" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`reset-${playerId}`} className="text-xs text-text-muted">
                {said.message}
              </label>
              {/* Read-only and selectable: an admin copies this into an
                  email, and a link they might edit by accident is worse
                  than useless. */}
              <TextInput
                id={`reset-${playerId}`}
                readOnly
                value={said.url}
                onFocus={(event) => event.currentTarget.select()}
                className="font-mono text-xs"
              />
            </div>
          )}

          {said.status !== "idle" && said.status !== "link" && (
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

function ResetLinkButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <KeyRound className="size-3.5" aria-hidden="true" />
      )}
      {pending ? "Making…" : "Make a reset link"}
    </Button>
  );
}

function UnlockEverythingButton({ unlocked }: { unlocked: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <KeyRound className="size-3.5" aria-hidden="true" />
      )}
      {unlocked ? "Remove unlock everything" : "Unlock everything (ADMIN)"}
    </Button>
  );
}

function TestNoticeButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Bell className="size-3.5" aria-hidden="true" />
      )}
      {pending ? "Sending…" : "Send test"}
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
      {unlocked ? "Remove unlock" : "Unlock all live cosmetics"}
    </Button>
  );
}
