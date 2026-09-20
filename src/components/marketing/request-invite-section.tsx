import Link from "next/link";

import { WaitlistForm } from "@/components/waitlist/waitlist-form";
import { Section, SectionHeading } from "@/components/ui/section";
import { INVITE_SECTION_ID, VENDOR_PILOT_ANCHOR_ID } from "@/lib/waitlist/preselect";

/**
 * Where Max starts: a request, answered by a person.
 *
 * This section was the waitlist through the beta, and the machinery
 * behind the form is deliberately the same — validated, spam-guarded,
 * stored server-side — wearing launch-day words. A vendor is set up
 * with us rather than self-serve, because a booth on a show's map is a
 * real business we want to have talked to. Nobody else lands here:
 * a player's account is a button away and free, and a game store
 * starts its Ultra trial itself at /ultra.
 */
export function RequestInviteSection() {
  return (
    <Section
      id={INVITE_SECTION_ID}
      labelledBy="request-invite-title"
      className="bg-surface"
    >
      {/* The Max CTAs land here; the form reads the fragment to preselect. */}
      <span id={VENDOR_PILOT_ANCHOR_ID} className="sr-only" />

      <SectionHeading
        id="request-invite-title"
        eyebrow="Card show vendors"
        title="Request an invite"
        description="Max for show vendors is set up personally. Tell us who you are and which shows you work, and we will be in touch to get your booth running."
      />

      <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-text-secondary">
        Run a game store?{" "}
        <Link href="/ultra" className="font-semibold text-accent hover:underline">
          Ultra is self-serve
        </Link>
        , with a free trial and no invite. Just here to play?{" "}
        <Link href="/signup" className="font-semibold text-accent hover:underline">
          Player accounts are free
        </Link>
        .
      </p>

      <div className="mx-auto mt-10 w-full max-w-2xl">
        <WaitlistForm />
      </div>
    </Section>
  );
}
