import Link from "next/link";

import { WaitlistForm } from "@/components/waitlist/waitlist-form";
import { Section, SectionHeading } from "@/components/ui/section";
import {
  INVITE_SECTION_ID,
  STORE_PILOT_ANCHOR_ID,
  VENDOR_PILOT_ANCHOR_ID,
} from "@/lib/waitlist/preselect";

/**
 * Where Ultra and Max start: a request, answered by a person.
 *
 * This section was the waitlist through the beta, and the machinery
 * behind the form is deliberately the same — validated, spam-guarded,
 * stored server-side — wearing launch-day words. Stores and vendors are
 * set up with us rather than self-serve, because a counter code and a
 * booth on a map both involve a real business we want to have talked
 * to. Players never land here: their account is a button away and free.
 */
export function RequestInviteSection() {
  return (
    <Section
      id={INVITE_SECTION_ID}
      labelledBy="request-invite-title"
      className="bg-surface"
    >
      {/* Tier CTAs land here; the form reads the fragment to preselect. */}
      <span id={STORE_PILOT_ANCHOR_ID} className="sr-only" />
      <span id={VENDOR_PILOT_ANCHOR_ID} className="sr-only" />

      <SectionHeading
        id="request-invite-title"
        eyebrow="Stores & vendors"
        title="Request an invite"
        description="Ultra for game stores and Max for show vendors are set up personally. Tell us who you are and we will be in touch to get you running."
      />

      <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-text-secondary">
        Just here to play?{" "}
        <Link href="/signup" className="font-semibold text-accent hover:underline">
          Player accounts are free
        </Link>{" "}
        and need no invite.
      </p>

      <div className="mx-auto mt-10 w-full max-w-2xl">
        <WaitlistForm />
      </div>
    </Section>
  );
}
