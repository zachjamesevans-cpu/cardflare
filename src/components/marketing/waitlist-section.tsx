import { WaitlistForm } from "@/components/waitlist/waitlist-form";
import { Section, SectionHeading } from "@/components/ui/section";
import {
  STORE_PILOT_ANCHOR_ID,
  VENDOR_PILOT_ANCHOR_ID,
  WAITLIST_SECTION_ID,
} from "@/lib/waitlist/preselect";

export function WaitlistSection() {
  return (
    <Section
      id={WAITLIST_SECTION_ID}
      labelledBy="waitlist-title"
      className="bg-surface"
    >
      {/* Pilot CTAs land here; the form reads the fragment to preselect. */}
      <span id={STORE_PILOT_ANCHOR_ID} className="sr-only" />
      <span id={VENDOR_PILOT_ANCHOR_ID} className="sr-only" />

      <SectionHeading
        id="waitlist-title"
        eyebrow="Early Access"
        title="Join the cardflare waitlist"
        description="cardflare is currently being built and preparing for its first store and card-show pilots. Join the waitlist for product updates, early testing opportunities, and launch access."
      />

      <div className="mx-auto mt-12 w-full max-w-2xl">
        <WaitlistForm />
      </div>
    </Section>
  );
}
