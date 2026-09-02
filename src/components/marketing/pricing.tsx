import { Check } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section, SectionHeading } from "@/components/ui/section";
import { LOCAL_ENABLED } from "@/lib/local/enabled";
import { STORE_PILOT_ANCHOR, VENDOR_PILOT_ANCHOR } from "@/lib/waitlist/preselect";

/**
 * The four ways into cardflare, priced honestly.
 *
 * Player accounts are open and free — that column's button creates one
 * right now. Pro is named with its price and marked as arriving, not
 * sold: there is no payment rail yet, and a buy button that cannot buy
 * is exactly the fake functionality the working agreement bans. Ultra
 * and Max are set up person-to-person, so their buttons request an
 * invite rather than pretending at self-serve.
 *
 * No feature is listed that has not shipped.
 */

interface Tier {
  name: string;
  audience: string;
  price: string;
  cadence: string | null;
  points: string[];
  cta: { label: string; href: string } | { note: string };
  featured?: boolean;
}

const TIERS: Tier[] = [
  {
    name: "Player",
    audience: "Players & collectors",
    price: "Free",
    cadence: null,
    points: [
      "Post Flares and see who has your cards",
      ...(LOCAL_ENABLED
        ? ["Local: every Flare near you, and messaging"]
        : ["The room: everyone at tonight's event, on one board"]),
      "Your binder, wants and decks on web and app",
      "Earn Embers on confirmed trades",
    ],
    cta: { label: "Create your account", href: "/signup" },
    featured: true,
  },
  {
    name: "Pro",
    audience: "Players who want more",
    price: "$7.99",
    cadence: "/month",
    points: [
      "Wear cosmetics: rings, auras, card borders, titles",
      "Animated everything, including GIF profile pictures",
      "Your look follows you on web and app",
    ],
    /* Sold through Apple in the iPhone app; no web checkout yet, and a
       buy button that cannot buy is banned fake functionality. */
    cta: { note: "Subscribe in the iPhone app" },
  },
  {
    name: "Ultra",
    audience: "Local game stores",
    price: "By invite",
    cadence: null,
    points: [
      "Counter code and walk-in rooms",
      "Event Hub: timers, boards, the TV display",
      "FlareCast: the room's wants on your screen",
      "We set your store up with you",
    ],
    cta: { label: "Request an invite", href: STORE_PILOT_ANCHOR },
  },
  {
    name: "Max",
    audience: "Card show vendors",
    price: "By invite",
    cadence: null,
    points: [
      "Your booth on the show floor's map",
      "Inventory matching against the room's wants",
      "We set your booth up with you",
    ],
    cta: { label: "Request an invite", href: VENDOR_PILOT_ANCHOR },
  },
];

export function Pricing() {
  return (
    <Section id="pricing" labelledBy="pricing-title">
      <SectionHeading
        id="pricing-title"
        eyebrow="Pricing"
        title="Free for players. Invites for the counter."
        description="A player account costs nothing and works today. Stores and vendors get set up personally, so those tiers start with a conversation."
      />

      <div className="mx-auto mt-12 grid w-full max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TIERS.map((tier) => (
          <Card
            key={tier.name}
            className={`flex flex-col gap-4 ${tier.featured ? "border-accent" : ""}`}
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-bold text-text-primary">{tier.name}</h3>
              <p className="text-sm text-text-secondary">{tier.audience}</p>
            </div>

            <p className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-text-primary">{tier.price}</span>
              {tier.cadence && (
                <span className="text-sm text-text-muted">{tier.cadence}</span>
              )}
            </p>

            <ul className="flex flex-1 flex-col gap-2">
              {tier.points.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-2 text-sm text-text-secondary"
                >
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-accent"
                    aria-hidden="true"
                  />
                  {point}
                </li>
              ))}
            </ul>

            {"href" in tier.cta ? (
              <ButtonLink
                href={tier.cta.href}
                size="sm"
                variant={tier.featured ? "primary" : "secondary"}
              >
                {tier.cta.label}
              </ButtonLink>
            ) : (
              <p className="rounded-[var(--radius-control)] border border-dashed border-border py-2 text-center text-sm font-semibold text-text-muted">
                {tier.cta.note}
              </p>
            )}
          </Card>
        ))}
      </div>
    </Section>
  );
}
