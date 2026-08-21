"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { BadgeCheck, Eye, EyeOff, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  setListingStateAction,
  setTierAction,
  setVerifiedAction,
} from "@/lib/stores/listing-actions";
import { LISTING_IDLE, type ListingState } from "@/lib/stores/listing-schema";

/**
 * Publish, verify, Ultra — three decisions, three controls.
 *
 * Deliberately not one "status" dropdown. Publishing says a discovered
 * record is real enough to show a player. Verifying says CardFlare
 * confirmed who controls the profile, which is trust and is never for
 * sale. Ultra is the commercial tier. A single control implying they
 * move together is precisely the confusion the schema was built to stop.
 */
function Pending({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? busy : label}
    </Button>
  );
}

function Outcome({ state }: { state: ListingState }) {
  if (!state.message) return null;

  return (
    <p
      role="status"
      className={`text-sm ${state.status === "error" ? "text-danger" : "text-accent"}`}
    >
      {state.message}
    </p>
  );
}

export function StoreListingControls({
  storeId,
  published,
  verified,
  ultra,
}: {
  storeId: string;
  published: boolean;
  verified: boolean;
  ultra: boolean;
}) {
  const [listing, listingAction] = useActionState(setListingStateAction, LISTING_IDLE);
  const [trust, trustAction] = useActionState(setVerifiedAction, LISTING_IDLE);
  const [tier, tierAction] = useActionState(setTierAction, LISTING_IDLE);

  return (
    <Card className="flex flex-col gap-5 p-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold text-text-primary">Listing</h3>
        <p className="text-sm text-text-secondary">
          A discovered store arrives as a draft that no player can see. Verified and
          Ultra are separate: one is trust, the other is the product.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <form action={listingAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="publish" value={published ? "false" : "true"} />
          {published ? (
            <Eye className="size-4 text-accent" aria-hidden="true" />
          ) : (
            <EyeOff className="size-4 text-text-muted" aria-hidden="true" />
          )}
          <span className="flex-1 text-sm text-text-secondary">
            {published
              ? "Published — players can see it"
              : "Draft — hidden from players"}
          </span>
          <Pending
            label={published ? "Unpublish" : "Publish"}
            busy={published ? "Unpublishing…" : "Publishing…"}
          />
        </form>
        <Outcome state={listing} />
      </div>

      <div className="flex flex-col gap-2">
        <form action={trustAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="verified" value={verified ? "false" : "true"} />
          <BadgeCheck
            className={`size-4 ${verified ? "text-accent" : "text-text-muted"}`}
            aria-hidden="true"
          />
          <span className="flex-1 text-sm text-text-secondary">
            {verified
              ? "CardFlare Verified — confirmed the business controls this profile"
              : "Not verified"}
          </span>
          <Pending
            label={verified ? "Remove verification" : "Mark Verified"}
            busy="Saving…"
          />
        </form>
        <Outcome state={trust} />
      </div>

      <div className="flex flex-col gap-2">
        <form action={tierAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="ultra" value={ultra ? "false" : "true"} />
          <Sparkles
            className={`size-4 ${ultra ? "text-accent" : "text-text-muted"}`}
            aria-hidden="true"
          />
          <span className="flex-1 text-sm text-text-secondary">
            {ultra ? "Ultra — premium store tier" : "Free tier"}
          </span>
          <Pending label={ultra ? "Back to free" : "Upgrade to Ultra"} busy="Saving…" />
        </form>
        <Outcome state={tier} />
      </div>
    </Card>
  );
}
