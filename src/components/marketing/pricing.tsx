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
    <Section id="pricing" labelledBy="pricing-title" className="py-14 md:py-20">
      <SectionHeading
        id="pricing-title"
        eyebrow="Pricing"
        title={`Free for players. ${ULTRA_TRIAL_DAYS} days free for stores.`}
      />

      <div className="mx-auto mt-10 grid w-full max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TIERS.map((tier) => (
          <Card
            key={tier.name}
            className={`flex flex-col gap-3 ${tier.featured ? "border-accent" : ""}`}
          >
            <h3 className="text-lg font-bold text-text-primary">{MARKS[tier.name]}</h3>

            <p className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-text-primary">{tier.price}</span>
              {tier.cadence && (
                <span className="text-sm text-text-muted">{tier.cadence}</span>
              )}
            </p>

            <p className="flex-1 text-sm text-text-secondary">{tier.line}</p>

            <ButtonLink
              href={tier.cta.href}
              size="sm"
              variant={tier.featured ? "primary" : "secondary"}
            >
              {tier.cta.label}
            </ButtonLink>
          </Card>
        ))}
      </div>
    </Section>
  );
}
