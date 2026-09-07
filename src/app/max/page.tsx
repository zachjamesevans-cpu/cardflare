import type { Metadata } from "next";
import { Check } from "lucide-react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { VENDOR_BENEFITS } from "@/components/marketing/for-vendors";
import { MaxMark } from "@/components/stores/ultra-mark";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section, SectionHeading } from "@/components/ui/section";
import { SITE } from "@/lib/site";
import { VENDOR_PILOT_ANCHOR } from "@/lib/waitlist/preselect";

export const metadata: Metadata = {
  title: "cardflare Max for card show vendors",
  description:
    "Your booth on the show floor's map and your inventory matched to every buyer who scans in. Set up with us, show by show.",
  alternates: { canonical: "/max" },
};

const INCLUDED = [
  "Your booth on the show floor's map, for everyone who scans that show's code",
  "Raw singles and graded slabs, uploaded before the doors open",
  "Every search in the hall answered with your booth number when you have the card",
  "Grader and grade on every result, best grade first",
  "Claim a booth per show and move it if the floor plan changes",
  "We set your booth up with you before your first show",
];

const FAQ = [
  {
    q: "What does it cost?",
    a: "Max is set up person to person for now, so it starts with a conversation. Request an invite and we will get back to you with the details for your shows.",
  },
  {
    q: "What do I upload?",
    a: "A list of what you are bringing: card, quantity, and the grader and grade for slabs. Prices are not shown; the number on the sticker is booth talk.",
  },
  {
    q: "What do buyers need?",
    a: "Nothing. They scan the show's code at the door, search for a card, and get your booth number.",
  },
  {
    q: "Do I need to be a store?",
    a: "No. A vendor is its own kind of account on cardflare, with its own dashboard: shows, booths and inventory, no rooms or counter code.",
  },
];

export default function MaxPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Section labelledBy="max-title" className="pb-10 md:pb-16">
          <div className="flex flex-col items-center gap-6 text-center">
            <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
              For card show vendors
            </p>
            <h1
              id="max-title"
              className="text-5xl font-bold tracking-tight text-balance text-text-primary sm:text-6xl"
            >
              {SITE.name} <MaxMark />
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-pretty text-text-secondary sm:text-xl">
              Every buyer in the hall, pointed at your booth. Upload what you are
              bringing and the person hunting it walks straight to your table.
            </p>
            <p className="text-text-primary">
              <span className="text-3xl font-bold">By invite</span>
            </p>
            <ButtonLink href={VENDOR_PILOT_ANCHOR} size="lg">
              Request an invite
            </ButtonLink>
          </div>
        </Section>

        <Section labelledBy="max-benefits-title" className="bg-surface">
          <SectionHeading
            id="max-benefits-title"
            eyebrow="On the show floor"
            title="The sale finds you"
            description="Buyers stop working the hall table by table, and you stop hoping the right one reaches yours."
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {VENDOR_BENEFITS.map((benefit) => (
              <Card key={benefit.title} className="flex flex-col gap-4">
                <span className="flex size-11 items-center justify-center rounded-[var(--radius-control)] border border-accent/30 bg-accent/10">
                  <benefit.icon className="size-5 text-accent" aria-hidden="true" />
                </span>
                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold text-text-primary">
                    {benefit.title}
                  </h3>
                  <p className="leading-relaxed text-text-secondary">
                    {benefit.description}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </Section>

        <Section labelledBy="max-included-title">
          <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1fr_1fr]">
            <Card className="flex flex-col gap-6 border-accent">
              <div className="flex flex-col gap-1">
                <h2
                  id="max-included-title"
                  className="text-2xl font-bold text-text-primary"
                >
                  {SITE.name} <MaxMark />
                </h2>
                <p className="text-text-secondary">For card show vendors</p>
              </div>
              <ul className="flex flex-col gap-2">
                {INCLUDED.map((point) => (
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
            </Card>
            <Card className="flex flex-col gap-5">
              <div className="flex flex-col gap-1">
                <h3 className="text-xl font-bold text-text-primary">
                  Tell us about your booth
                </h3>
                <p className="text-sm text-text-secondary">
                  Which shows you work, what you bring, and where to reach you. We set
                  your account up with you before your first show on cardflare.
                </p>
              </div>
              <div>
                <ButtonLink href={VENDOR_PILOT_ANCHOR} size="lg">
                  Request an invite
                </ButtonLink>
              </div>
            </Card>
          </div>
        </Section>

        <Section labelledBy="max-faq-title" className="bg-surface">
          <SectionHeading id="max-faq-title" title="Questions vendors ask" />
          <dl className="mx-auto mt-10 grid w-full max-w-4xl gap-6 sm:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q} className="flex flex-col gap-2">
                <dt className="font-semibold text-text-primary">{item.q}</dt>
                <dd className="text-sm leading-relaxed text-text-secondary">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      </main>
      <SiteFooter />
    </>
  );
}
