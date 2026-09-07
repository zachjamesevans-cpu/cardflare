import type { Metadata } from "next";
import Link from "next/link";
import {
  BellRing,
  Check,
  MonitorPlay,
  PackageSearch,
  QrCode,
  Repeat,
  Timer,
  TrendingUp,
  Volume2,
} from "lucide-react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { UltraMark } from "@/components/stores/ultra-mark";
import { UltraSignupForm } from "@/components/stores/ultra-signup-form";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Section, SectionHeading } from "@/components/ui/section";
import { getViewer } from "@/lib/auth/session";
import { GAME_PROFILES } from "@/lib/event-hub/game-profiles";
import { roundReadyLine } from "@/lib/event-hub/voice";
import { SITE } from "@/lib/site";
import { ultraIsSellable } from "@/lib/stores/ultra";
import { startUltraCheckoutAction } from "@/lib/stores/ultra-actions";
import { ULTRA_PRICE_LABEL, ULTRA_TRIAL_DAYS } from "@/lib/stores/ultra-schema";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "cardflare Ultra for game stores",
  description:
    "Sell more singles, run tournaments on Auto Mode, and put the whole room on your TV. Fourteen days free, then $50 a month.",
  alternates: { canonical: "/for-stores" },
};

export const dynamic = "force-dynamic";

/**
 * The store pitch and the door in, on one page.
 *
 * The founder's brief: a sales pitch of what works well and how it
 * helps the store, with a two-week free trial at $50 a month;
 * "emphasize how it increases sales and emphasize auto mode for
 * tournaments." Every claim below names a feature that has shipped
 * and is on the console the moment the trial starts. Nothing here is
 * a roadmap.
 */

const SALES = [
  {
    icon: PackageSearch,
    title: "Your case, matched to every want",
    body: "Upload your TCGplayer inventory export. When a player in your room posts a Flare for a card you stock, their Flare says your counter may have it. The single sells to the exact person hunting it, the night they are in the building.",
  },
  {
    icon: Repeat,
    title: "Players come for the trade and stay for the night",
    body: "Every Flare posted in your room stays in your store, between the people standing in it. A player who finished a deck at your tables comes back to your tables.",
  },
  {
    icon: BellRing,
    title: "A reason to walk in on a Tuesday",
    body: "Your early board opens before the event and everybody who saved your store gets a push. Wants go up from the couch and get answered at the counter.",
  },
] as const;

const AUTO = [
  {
    icon: Timer,
    title: "Time hits, the countdown starts",
    body: "Regulation reaches zero and a between-rounds countdown begins on the wall, long enough to enter results and post pairings in whatever you already use.",
  },
  {
    icon: Volume2,
    title: "The TO's computer says when the round is ready",
    body: `Out loud, on the organizer's screen: "${roundReadyLine(GAME_PROFILES["one-piece"], 4)}" Nobody has to watch a clock.`,
  },
  {
    icon: Repeat,
    title: "The next round starts itself",
    body: "Round number up, regulation reloaded, every screen back to normal. Hold, add two minutes, or start now: three buttons for when reality disagrees.",
  },
] as const;

const FLARECAST = [
  {
    icon: QrCode,
    title: "Scan in from the wall",
    body: "Your counter code stays on screen all night. A player scans it and they are in the room with no account.",
  },
  {
    icon: MonitorPlay,
    title: "Wants on the screen",
    body: "The room's Flares rotate on the display, so a player who has the card knows before they leave their table.",
  },
  {
    icon: TrendingUp,
    title: "Trades stay in your store",
    body: "Matches happen at your tables and the singles come from your case. The store is the venue and the answer.",
  },
] as const;

const INCLUDED = [
  "One printed counter code; players scan in with no account setup at the door",
  "A room for every event night, and walk-in rooms between them",
  "FlareCast: timers, the room's wants and your code on the television",
  "Auto Mode with the round-ready voice on the organizer's computer",
  "Every game's real overtime rules on the wall, with a beginner mode",
  "TCGplayer inventory matching against every Flare in your room",
  "Early boards that open before the event, with a push to your regulars",
  `Your store in the ${SITE.name} directory with the Ultra badge`,
];

const FAQ = [
  {
    q: "Do I need new hardware?",
    a: "No. Any television with a browser, or the laptop you already run pairings on, plugged into the TV. The organizer's controls run on a phone.",
  },
  {
    q: "What do players need?",
    a: "Nothing. They scan the code on your counter and they are in the room. An account is optional and free.",
  },
  {
    q: "What happens after the trial?",
    a: `Stripe charges ${ULTRA_PRICE_LABEL} a month to the card on file. Cancel before day ${ULTRA_TRIAL_DAYS} and nothing is charged; cancel later and Ultra stays on until the end of the month you paid for.`,
  },
  {
    q: "Which games?",
    a: "One Piece, Pokemon, Lorcana, Riftbound, Flesh and Blood and Magic: The Gathering, each with its own timer presets and overtime rules.",
  },
];

function FeatureGrid({
  items,
}: {
  items: readonly { icon: typeof Timer; title: string; body: string }[];
}) {
  return (
    <div className="mt-12 grid gap-5 md:grid-cols-3">
      {items.map((item) => (
        <Card key={item.title} className="flex flex-col gap-4">
          <span className="flex size-11 items-center justify-center rounded-[var(--radius-control)] border border-accent/30 bg-accent/10">
            <item.icon className="size-5 text-accent" aria-hidden="true" />
          </span>
          <h3 className="text-lg font-semibold text-text-primary">{item.title}</h3>
          <p className="leading-relaxed text-text-secondary">{item.body}</p>
        </Card>
      ))}
    </div>
  );
}

export default async function ForStoresPage() {
  const viewer = await getViewer();
  const sellable = ultraIsSellable();

  /* A signed-in member of a store does not need a second account: they
     get the trial button for the store they already have. */
  const memberStores =
    (viewer.kind === "store" || viewer.kind === "admin") &&
    viewer.storeIds.length > 0 &&
    isSupabaseConfigured()
      ? ((
          await getSupabaseAdmin()
            .from("stores")
            .select("id, name, tier, kind")
            .in("id", viewer.storeIds)
            .eq("kind", "lgs")
            .order("name")
        ).data ?? [])
      : [];

  return (
    <>
      <SiteHeader />
      <main>
        <Section labelledBy="ultra-title" className="pb-10 md:pb-16">
          <div className="flex flex-col items-center gap-6 text-center">
            <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">
              For game stores
            </p>
            <h1
              id="ultra-title"
              className="text-5xl font-bold tracking-tight text-balance text-text-primary sm:text-6xl"
            >
              {SITE.name} <UltraMark />
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-pretty text-text-secondary sm:text-xl">
              The counter, the tournament and the trades, run from one screen. Sell the
              singles in your case to the players in your room, and let the tournament
              run itself.
            </p>
            <p className="text-text-primary">
              <span className="text-3xl font-bold">{ULTRA_PRICE_LABEL}</span>
              <span className="text-text-muted"> /month</span>
              <span className="text-text-muted"> · {ULTRA_TRIAL_DAYS} days free</span>
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <ButtonLink href="#start" size="lg">
                Start your free trial
              </ButtonLink>
              <ButtonLink href="#auto-mode" size="lg" variant="secondary">
                See Auto Mode
              </ButtonLink>
            </div>
          </div>
        </Section>

        <Section id="sales" labelledBy="sales-title" className="bg-surface">
          <SectionHeading
            id="sales-title"
            eyebrow="More sales"
            title="Sell to the players already in your store"
            description="Every event night is a room full of people hunting specific cards. Ultra puts your case in front of the exact person looking for it."
          />
          <FeatureGrid items={SALES} />
        </Section>

        <Section id="auto-mode" labelledBy="auto-title">
          <SectionHeading
            id="auto-title"
            eyebrow="Auto Mode"
            title="Start the tournament and let FlareCast run the room"
            description="Timers for One Piece, Pokemon, Lorcana, Riftbound, Flesh and Blood and Magic, with each game's real overtime procedure on the wall. Auto Mode takes the round changes off your plate."
          />
          <FeatureGrid items={AUTO} />
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-text-muted">
            Any television with a browser, or a laptop plugged into one. Nothing to
            install, nothing for players to download at the door.
          </p>
        </Section>

        <Section id="flarecast" labelledBy="flarecast-title" className="bg-surface">
          <SectionHeading
            id="flarecast-title"
            eyebrow="FlareCast"
            title="The whole room, on your TV"
            description="Put it on at the start of the night and leave it running. Your counter code, the tournament clocks and what the room is hunting, all on one screen."
          />
          <FeatureGrid items={FLARECAST} />
        </Section>

        <Section id="start" labelledBy="start-title">
          <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1fr_1.1fr]">
            <Card className="flex flex-col gap-6 border-accent">
              <div className="flex flex-col gap-1">
                <h2 id="start-title" className="text-2xl font-bold text-text-primary">
                  {SITE.name} <UltraMark />
                </h2>
                <p className="text-text-secondary">For local game stores</p>
              </div>
              <p className="flex items-baseline gap-1">
                <span className="text-4xl font-bold text-text-primary">
                  {ULTRA_PRICE_LABEL}
                </span>
                <span className="text-sm text-text-muted">/month after the trial</span>
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
              <p className="text-sm text-text-muted">
                {ULTRA_TRIAL_DAYS} days free. Cancel any time from your store console
                and nothing is charged.
              </p>
            </Card>

            <Card className="flex flex-col gap-5">
              {memberStores.length > 0 ? (
                <>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-xl font-bold text-text-primary">
                      Start Ultra for your store
                    </h3>
                    <p className="text-sm text-text-secondary">
                      You are signed in already, so there is nothing to fill in.
                    </p>
                  </div>
                  {memberStores.map((store) => (
                    <form
                      key={store.id}
                      action={startUltraCheckoutAction}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-elevated p-4"
                    >
                      <input type="hidden" name="storeId" value={store.id} />
                      <span className="font-semibold text-text-primary">
                        {store.name}
                      </span>
                      {store.tier === "free" ? (
                        <Button type="submit" size="sm">
                          {sellable
                            ? `Start the ${ULTRA_TRIAL_DAYS}-day trial`
                            : "Go to the console"}
                        </Button>
                      ) : (
                        <Link
                          href={`/store?as=${store.id}`}
                          className="text-sm text-accent underline-offset-4 hover:underline"
                        >
                          Already on Ultra. Open the console
                        </Link>
                      )}
                    </form>
                  ))}
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1">
                    <h3 className="text-xl font-bold text-text-primary">
                      Start your free trial
                    </h3>
                    <p className="text-sm text-text-secondary">
                      Your counter code is ready the moment you finish. Already have a
                      store account?{" "}
                      <Link
                        href="/login?next=/for-stores"
                        className="text-accent underline-offset-4 hover:underline"
                      >
                        Sign in
                      </Link>
                      .
                    </p>
                  </div>
                  <UltraSignupForm sellable={sellable} />
                </>
              )}
            </Card>
          </div>
        </Section>

        <Section labelledBy="faq-title" className="bg-surface">
          <SectionHeading id="faq-title" title="Questions stores ask" />
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
