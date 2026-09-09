import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MaxMark, ProMark, UltraMark } from "@/components/stores/ultra-mark";
import { Section, SectionHeading } from "@/components/ui/section";
import { LOCAL_ENABLED } from "@/lib/local/enabled";
import { ULTRA_PRICE_LABEL, ULTRA_TRIAL_DAYS } from "@/lib/stores/ultra-schema";

/**
 * The four ways into cardflare, priced honestly, one line each.
 *
 * The founder, for the homepage: "Do not use long bullet lists." So a
 * tier is its name, its price, one sentence and a button to its own
 * page, where the full list lives. Nothing is listed here that has
 * not shipped.
 */

interface Tier {
  name: "Player" | "Pro" | "Ultra" | "Max";
  price: string;
  cadence: string | null;
  line: string;
  cta: { label: string; href: string };
  featured?: boolean;
}

const TIERS: Tier[] = [
  {
    name: "Player",
    price: "Free",
    cadence: null,
    line: LOCAL_ENABLED
      ? "Flares, Local, your binder and wants, Embers on every trade."
      : "Flares, the room, your binder and wants, Embers on every trade.",
    cta: { label: "Create account", href: "/signup" },
    featured: true,
  },
  {
    name: "Pro",
    price: "$7.99",
    cadence: "/mo",
    line: "Cosmetics, animated everything, your look on web and app.",
    cta: { label: "See Pro", href: "/pro" },
  },
  {
    name: "Ultra",
    price: ULTRA_PRICE_LABEL,
    cadence: "/mo",
    line: `FlareCast, Auto Mode and inventory matching. ${ULTRA_TRIAL_DAYS} days free.`,
    cta: { label: "See Ultra", href: "/ultra" },
  },
  {
    name: "Max",
    price: "By invite",
    cadence: null,
    line: "Your booth on the show floor, matched to every search in the hall.",
    cta: { label: "See Max", href: "/max" },
  },
];

const MARKS = {
  Player: "Player",
  Pro: <ProMark />,
  Ultra: <UltraMark />,
  Max: <MaxMark />,
} as const;

export function Pricing() {
  return (
    <Section id="pricing" labelledBy="pricing-title" padding="py-8 md:py-14">
      <SectionHeading
        id="pricing-title"
        eyebrow="Pricing"
        title={`Free for players. ${ULTRA_TRIAL_DAYS} days free for stores.`}
      />

      {/* Four tiles with width; on a phone, four rows, so the tiers
          read down the screen instead of as a column of small cards. */}
      <div className="mx-auto mt-6 grid w-full max-w-6xl gap-3 sm:grid-cols-2 md:mt-8 md:gap-4 lg:grid-cols-4">
        {TIERS.map((tier) => (
          <Card
            key={tier.name}
            className={`flex flex-row flex-wrap items-center gap-x-4 gap-y-2 sm:flex-col sm:items-stretch sm:gap-3 ${tier.featured ? "border-accent" : ""}`}
          >
            <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3 sm:flex-col sm:gap-3">
              <h3 className="text-lg font-bold text-text-primary">
                {MARKS[tier.name]}
              </h3>
              <p className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-text-primary sm:text-3xl">
                  {tier.price}
                </span>
                {tier.cadence && (
                  <span className="text-sm text-text-muted">{tier.cadence}</span>
                )}
              </p>
            </div>

            <p className="w-full text-sm text-text-secondary sm:flex-1">{tier.line}</p>

            <ButtonLink
              href={tier.cta.href}
              size="sm"
              variant={tier.featured ? "primary" : "secondary"}
              className="w-full"
            >
              {tier.cta.label}
            </ButtonLink>
          </Card>
        ))}
      </div>
    </Section>
  );
}
