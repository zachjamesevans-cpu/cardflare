"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { BadgeCheck, Mail, Store } from "lucide-react";

import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/controls";
import { decideClaimAction, type DecisionState } from "@/lib/stores/claim-actions";
import type { StoreClaim } from "@/lib/stores/claims";

/**
 * The queue an admin works through.
 *
 * Approving hands somebody control of a real business's public profile,
 * so this is built to be READ rather than cleared: every claim shows
 * who asked, from what address, in what role, and what they said, with
 * the shop's own website beside it. The decision is a person's.
 *
 * THREE BUTTONS, NOT TWO. "Needs more information" is the honest answer
 * most of the time — an address that does not match the website is not
 * a rejection, it is a question — and without that button an admin has
 * only yes and no, so the queue fills with claims nobody wants to
 * refuse and nobody can approve.
 */
const STATE_LABEL: Record<string, string> = {
  pending: "Waiting",
  approved: "Approved",
  rejected: "Rejected",
  "more-info": "Needs more info",
};

function DecideButton({
  decision,
  label,
  variant = "secondary",
}: {
  decision: string;
  label: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      name="decision"
      value={decision}
      size="sm"
      variant={variant}
      disabled={pending}
    >
      {label}
    </Button>
  );
}

function ClaimRow({ claim }: { claim: StoreClaim }) {
  const [state, action] = useActionState<DecisionState, FormData>(decideClaimAction, {
    status: "idle",
    message: null,
  });
  const [open, setOpen] = useState(false);

  const when = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(claim.createdAt));

  return (
    <li className="flex flex-col gap-3 border-t border-border py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 font-semibold text-text-primary">
          <Store className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          {claim.storeName}
        </p>
        <Badge tone={claim.state === "pending" ? "accent" : "neutral"}>
          {STATE_LABEL[claim.state] ?? claim.state}
        </Badge>
        {/* A hint for the person reading, never a decision. Anybody can
            buy a domain, and plenty of real owners use gmail. */}
        {claim.domainMatchesWebsite && (
          <Badge tone="accent">
            <BadgeCheck className="size-3.5" aria-hidden="true" />
            Matches the shop&rsquo;s domain
          </Badge>
        )}
        <span className="text-xs text-text-muted tabular-nums">{when}</span>
      </div>

      <div className="flex flex-col gap-1 text-sm">
        <p className="text-text-primary">
          {claim.claimantName}
          {claim.claimantRole ? ` · ${claim.claimantRole}` : ""}
        </p>
        <p className="flex items-center gap-1.5 text-text-secondary">
          <Mail className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
          <a
            href={`mailto:${claim.claimantEmail}`}
            className="underline-offset-4 hover:underline"
          >
            {claim.claimantEmail}
          </a>
        </p>
        {claim.businessEmail && claim.businessEmail !== claim.claimantEmail && (
          <p className="text-xs text-text-muted">
            Store address given: {claim.businessEmail}
          </p>
        )}
        {claim.notes && (
          <p className="rounded-lg border border-border bg-elevated p-3 text-sm text-text-secondary">
            {claim.notes}
          </p>
        )}
      </div>

      {claim.state === "pending" ? (
        open ? (
          <form action={action} className="flex flex-col gap-2">
            <input type="hidden" name="claimId" value={claim.claimId} readOnly />
            <Textarea
              name="reviewNote"
              placeholder="Why (for our records — the claimant never sees this)"
              className="min-h-16"
            />
            <div className="flex flex-wrap gap-2">
              <DecideButton decision="approved" label="Approve" variant="primary" />
              <DecideButton decision="more-info" label="Needs more info" />
              <DecideButton decision="rejected" label="Reject" />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </div>
            <p className="text-xs text-text-muted">
              Approving marks the listing claimed and makes this the contact address. It
              does not verify them and does not change their tier — those stay separate
              decisions.
            </p>
          </form>
        ) : (
          <div>
            <Button type="button" size="sm" onClick={() => setOpen(true)}>
              Review this claim
            </Button>
          </div>
        )
      ) : (
        claim.reviewNote && (
          <p className="text-xs text-text-muted">Note: {claim.reviewNote}</p>
        )
      )}

      {state.message && (
        <p
          className={`text-sm ${state.status === "error" ? "text-danger" : "text-accent"}`}
          role="status"
        >
          {state.message}
        </p>
      )}
    </li>
  );
}

export function ClaimQueue({ claims }: { claims: StoreClaim[] }) {
  if (claims.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm text-text-secondary">
          No claims yet. They arrive from the &ldquo;Own or manage this store?&rdquo;
          button on an unclaimed listing.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <ul className="flex flex-col">
        {claims.map((claim) => (
          <ClaimRow key={claim.claimId} claim={claim} />
        ))}
      </ul>
    </Card>
  );
}
