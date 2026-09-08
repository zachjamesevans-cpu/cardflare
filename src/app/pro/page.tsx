import type { Metadata } from "next";
import Link from "next/link";
import { Check, Film, RefreshCw, Sparkles } from "lucide-react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ProMark } from "@/components/stores/ultra-mark";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section, SectionHeading } from "@/components/ui/section";
import { getViewer } from "@/lib/auth/session";
import {
  PRO_PRICE_LABEL,
  proIsSellableOnWeb,
  proPlanForPlayer,
} from "@/lib/billing/pro";
import {
  manageProBillingAction,
  startProCheckoutAction,
} from "@/lib/billing/pro-actions";
import { playerForUser } from "@/lib/players/accounts";
import { SITE } from "@/lib/site";
import { planDate } from "@/lib/stores/ultra";
import { reconcileCheckoutSession } from "@/lib/billing/reconcile";

export const metadata: Metadata = {
  title: "cardflare Pro",
  description:
    "Rings, auras, card borders, titles and animated pictures that follow you from the app to the website and into every room. $7.99 a month.",
  alternates: { canonical: "/pro" },
};

export const dynamic = "force-dynamic";

/*
 * The same three lines the app's paywall shows, word for word, so a
 * player reading both is told the same thing. See mobile/src/screens/pro.tsx.
 */
const BENEFITS = [
  { icon: Sparkles, text: "Wear cosmetics: rings, auras, card borders, titles" },
  { icon: Film, text: "Animated everything, including GIF profile pictures" },
  { icon: RefreshCw, text: "Your look follows you on web and app" },
] as const;

const INCLUDED = [
  "Every ring, aura, card border, holo, name style, title and badge you unlock",
  "Animated profile pictures, on your profile and beside every Flare you post",
  "Showcase backgrounds and profile scenes",
  "Equip once and it shows on the website, in the app and on the room's board",
];

const FAQ = [
  {
    q: "What do I get without Pro?",
    a: "Everything that makes cardflare work: Flares, rooms, your binder and your friends. You can browse and unlock cosmetics with Embers too. Pro is what lets you wear them.",
  },
  {
    q: "What happens if I stop?",
    a: "Your equipped cosmetics stop showing but stay saved. Start again and they are back where you left them.",
  },
  {
    q: "How do I cancel?",
    a: "Bought in the app: in your iPhone's Settings, under Subscriptions. Bought on the website: from the Manage billing button on this page.",
  },
  {
    q: "Does it work on both?",
    a: "Yes. Buy it in the app or here and you are Pro everywhere you sign in.",
  },
];

export default async function ProPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; session_id?: string }>;
}) {
  const { checkout, session_id } = await searchParams;
  const viewer = await getViewer();
  const sellable = proIsSellableOnWeb();

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);
  /* Back from Stripe: read the session now rather than wait for the
     webhook, so the page says Pro to somebody who just paid for it. */
  if (checkout === "success" && session_id && playerId) {
    await reconcileCheckoutSession(session_id, { playerId });
  }
  const plan = playerId ? await proPlanForPlayer(playerId) : null;

  const notice =
    checkout === "success"
      ? "Welcome to Pro. Everything you equip shows everywhere now."
      : checkout === "cancelled"
        ? "Checkout was closed. Nothing was charged."
        : checkout === "failed"
          ? "Stripe could not be reached. Try again in a moment."
          : null;

  return (
    <>
      <SiteHeader />
      <main>
        <Section labelledBy="pro-title" className="pb-10 md:pb-16">
          <div className="flex flex-col items-center gap-6 text-center">
            <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
              For players
            </p>
            <h1
              id="pro-title"
              className="text-5xl font-bold tracking-tight text-balance text-text-primary sm:text-6xl"
            >
              {SITE.name} <ProMark />
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-pretty text-text-secondary sm:text-xl">
              Your look, everywhere you play. Rings, auras, borders, titles and animated
              pictures that follow you from the app to the website and into every room.
            </p>
            <p className="text-text-primary">
              <span className="text-3xl font-bold">{PRO_PRICE_LABEL}</span>
              <span className="text-text-muted"> /month</span>
            </p>
            <ButtonLink href="#get-pro" size="lg">
              Get Pro
            </ButtonLink>
          </div>
        </Section>

        <Section labelledBy="pro-benefits-title" className="bg-surface">
          <SectionHeading
            id="pro-benefits-title"
            eyebrow="What Pro does"
            title="Wear what you unlock"
            description="Cosmetics are earned with Embers and bought in the shop by anyone. Pro is what puts them on."
          />
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {BENEFITS.map((benefit) => (
              <Card key={benefit.text} className="flex flex-col gap-4">
                <span className="flex size-11 items-center justify-center rounded-[var(--radius-control)] border border-accent/30 bg-accent/10">
                  <benefit.icon className="size-5 text-accent" aria-hidden="true" />
                </span>
                <p className="text-lg font-semibold text-text-primary">
                  {benefit.text}
                </p>
              </Card>
            ))}
          </div>
        </Section>

        <Section id="get-pro" labelledBy="get-pro-title">
          <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1fr_1fr]">
            <Card className="flex flex-col gap-6 border-accent">
              <div className="flex flex-col gap-1">
                <h2 id="get-pro-title" className="text-2xl font-bold text-text-primary">
                  {SITE.name} <ProMark />
                </h2>
                <p className="text-text-secondary">For players and collectors</p>
              </div>
              <p className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-text-primary">
                  {PRO_PRICE_LABEL}
                </span>
                <span className="text-sm text-text-muted">/month, cancel any time</span>
              </p>
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
              {notice && (
                <p role="status" className="text-sm text-success">
                  {notice}
                </p>
              )}
              <ProDoor
                signedIn={viewer.kind !== "anonymous"}
                isPlayer={playerId !== null}
                plan={plan}
                sellable={sellable}
              />
            </Card>
          </div>
        </Section>

        <Section labelledBy="pro-faq-title" className="bg-surface">
          <SectionHeading id="pro-faq-title" title="Questions players ask" />
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

/**
 * The one thing to do, for whoever is looking.
 *
 * A stranger gets the free account first, because Pro is a look on top
 * of an account. A player gets the subscribe button when Stripe has a
 * price, and the app otherwise. A player already on Pro is told so and
 * shown where to manage it, which depends on who took the money.
 */
function ProDoor({
  signedIn,
  isPlayer,
  plan,
  sellable,
}: {
  signedIn: boolean;
  isPlayer: boolean;
  plan: Awaited<ReturnType<typeof proPlanForPlayer>> | null;
  sellable: boolean;
}) {
  if (!signedIn) {
    return (
      <>
        <div className="flex flex-col gap-1">
          <h3 className="text-xl font-bold text-text-primary">
            Start with a free account
          </h3>
          <p className="text-sm text-text-secondary">
            Pro goes on top of it. Create the account, then come back here or open the
            app.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/signup">Create your account</ButtonLink>
          <ButtonLink href="/login?next=/pro" variant="secondary">
            Sign in
          </ButtonLink>
        </div>
      </>
    );
  }

  if (!isPlayer) {
    return (
      <>
        <h3 className="text-xl font-bold text-text-primary">
          Pro is for player accounts
        </h3>
        <p className="text-sm text-text-secondary">
          This account runs a store. Your console is at{" "}
          <Link
            href="/store"
            className="text-accent underline-offset-4 hover:underline"
          >
            cardflare.gg/store
          </Link>
          .
        </p>
      </>
    );
  }

  if (plan && plan.state !== "none") {
    const when = planDate(plan.state === "on" ? plan.renews : plan.until);
    return (
      <>
        <div className="flex flex-col gap-1">
          <h3 className="text-xl font-bold text-text-primary">You are on Pro</h3>
          <p className="text-sm text-text-secondary">
            {plan.state === "on"
              ? when
                ? `Renews ${when}.`
                : "On."
              : when
                ? `Cancelled. Pro stays on until ${when}.`
                : "Cancelled."}
          </p>
        </div>
        {plan.canManage ? (
          <form action={manageProBillingAction}>
            <Button type="submit" variant="secondary">
              Manage billing
            </Button>
          </form>
        ) : (
          <p className="text-sm text-text-muted">
            Managed in your iPhone&rsquo;s Settings, under Subscriptions.
          </p>
        )}
      </>
    );
  }

  if (sellable) {
    return (
      <>
        <div className="flex flex-col gap-1">
          <h3 className="text-xl font-bold text-text-primary">Subscribe</h3>
          <p className="text-sm text-text-secondary">
            {PRO_PRICE_LABEL} a month through Stripe. Cancel any time from this page.
          </p>
        </div>
        <form action={startProCheckoutAction}>
          <Button type="submit" size="lg">
            Get Pro for {PRO_PRICE_LABEL}/month
          </Button>
        </form>
        <p className="text-xs leading-relaxed text-text-muted">
          Renews monthly until cancelled. Bought in the app instead? It counts here too.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-bold text-text-primary">Subscribe in the app</h3>
        <p className="text-sm text-text-secondary">
          Open the cardflare app, go to Profile, then cardflare Pro. It is{" "}
          {PRO_PRICE_LABEL} a month through your Apple ID, and it counts here the moment
          it goes through.
        </p>
      </div>
      <ButtonLink href="/profile/customize" variant="secondary">
        Browse the cosmetics first
      </ButtonLink>
    </>
  );
}
