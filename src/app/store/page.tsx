import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, MonitorPlay, Sparkles } from "lucide-react";

import { CounterCode } from "@/components/events/counter-code";
import { AppShell } from "@/components/layout/app-shell";
import { SetupChecklist, type SetupStep } from "@/components/stores/onboarding";
import { StoreTabs } from "@/components/stores/store-tabs";
import { VendorConsole } from "@/components/stores/vendor-console";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listDisplays } from "@/lib/event-hub/repository";
import { joinQrSvg, joinUrl } from "@/lib/events/qr";
import { listEventsForStore } from "@/lib/events/repository";
import { sweepStaleRooms } from "@/lib/events/rooms";
import { singlesSyncFor } from "@/lib/singles/repository";
import { consoleHref, isOwnerOnlyPath, loadStoreConsole } from "@/lib/stores/console";
import {
  storeOnboardingCompletedAt,
  storePageFor,
  storePageIsSetUp,
} from "@/lib/stores/page";

export const metadata: Metadata = {
  title: "Your store",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** The checklist steps the wizard already walks, by key. */
const WIZARD_STEPS = new Set(["page", "flarecast", "event"]);

/**
 * The console's front page: what to do, and the code to print.
 *
 * It used to be every section of the console on one long scroll. The
 * founder: "kind of just a massive fart of a bunch of screens." Now
 * the front page is the things still to do, the counter code, and a
 * card each for FlareCast and the events; the television, the events,
 * the case, the singles, the organizers, the settings and the plan
 * each have a tab. A store that has done everything sees the code and
 * the two cards and nothing nagging.
 *
 * The welcome is the setup wizard at /store/setup, which is where
 * checkout lands. Until the owner finishes or skips it, the front page
 * offers the wizard and nothing else about setting up: one card, not
 * a card and a checklist saying the same things. After that, the
 * checklist shows what the wizard did not cover, plus anything from
 * the wizard that is still undone.
 */
export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const params = await searchParams;
  const console = await loadStoreConsole(params.as, "/store");
  const { viewer, store, areas, currentArea } = console;

  if (store?.kind === "vendor") return <VendorConsole console={console} />;

  if (!store) {
    return (
      <AppShell
        area="Store"
        email={viewer.user.email ?? ""}
        title="No store yet"
        description="This account is signed in but is not linked to a store."
        areas={areas}
      >
        {/* Almost always an invited owner who signed in with another
            address, or whose setup link had run out. Each way out is a
            link, not an instruction to go and find one. */}
        <Card className="flex flex-col gap-4 text-text-secondary">
          <p>
            You are signed in as{" "}
            <strong className="font-semibold text-text-primary">
              {viewer.user.email ?? "this account"}
            </strong>
            , which is not linked to a store.
          </p>
          <ul className="flex flex-col gap-3 text-sm">
            <li>
              <strong className="font-semibold text-text-primary">
                Invited to cardflare?
              </strong>{" "}
              Your store is on the address the invitation went to. Sign out, then use
              the button in that email, or{" "}
              <Link href="/login/reset" className="text-accent hover:text-accent-hover">
                get a fresh setup link
              </Link>{" "}
              sent to it.
            </li>
            <li>
              <strong className="font-semibold text-text-primary">
                Want to put your store on cardflare?
              </strong>{" "}
              <Link href="/ultra" className="text-accent hover:text-accent-hover">
                Start with cardflare Ultra
              </Link>
              .
            </li>
            <li>
              <strong className="font-semibold text-text-primary">Still stuck?</strong>{" "}
              <Link href="/contact" className="text-accent hover:text-accent-hover">
                Tell us
              </Link>{" "}
              and we will link it by hand.
            </li>
          </ul>
        </Card>
      </AppShell>
    );
  }

  await sweepStaleRooms();

  /*
   * The wizard is the owner's. An organizer landing here runs the
   * timers and FlareCast; the wizard, and every step whose page is
   * owner-only, are not offered to them.
   */
  const owner = store.role === "owner";

  const [events, displays, sync, counterQr, page, onboardedAt] = await Promise.all([
    listEventsForStore(store.id),
    listDisplays(store.id),
    singlesSyncFor(store.id),
    store.join_code ? joinQrSvg(store.join_code) : Promise.resolve(null),
    storePageFor(store.id),
    owner ? storeOnboardingCompletedAt(store.id) : Promise.resolve(null),
  ]);

  const steps: SetupStep[] = [
    /*
     * First, because it is what a player sees. The founder: "make a way
     * and flow for stores to setup their store account once they're
     * subscribed to ultra so players can follow the store." Ticked once
     * the page says something a player could act on.
     */
    {
      key: "page",
      title: "Set up your store page",
      detail:
        "Your logo, banner, hours and a line about the shop, so players can find and follow you",
      done: storePageIsSetUp(page),
      href: `${consoleHref("/store/settings", store.id)}#page`,
      action: "Set up your page",
    },
    {
      key: "flarecast",
      title: "Put FlareCast on your TV",
      detail:
        "Add a screen, open its link on the television and press Enter Fullscreen once. Timers, what the room is looking for and your code, all night.",
      done: displays.length > 0,
      href: consoleHref("/store/event-hub", store.id),
      action: "Add a screen",
    },
    {
      key: "singles",
      title: "Upload your TCGplayer inventory",
      detail:
        "Every Flare in your room is checked against it, and the player is told your counter may have the card.",
      done: sync !== null,
      href: consoleHref("/store/singles", store.id),
      action: "Upload the export",
    },
    {
      key: "event",
      title: "Create your first event night",
      detail:
        "A tournament or a prerelease gets its own room, its own window and its own sheet. Your counter code sends players there while it runs.",
      done: events.length > 0,
      href: consoleHref("/store/events", store.id),
      action: "Create an event",
    },
    {
      key: "timezone",
      title: "Set your time zone",
      detail:
        "So event windows and the early board open when your clock says, not UTC's.",
      done: store.timezone !== "UTC",
      href: consoleHref("/store/settings", store.id),
      action: "Open settings",
    },
  ];
  const upcoming = events.filter((event) => event.status !== "closed").slice(0, 3);

  /*
   * Until the owner finishes or skips the wizard, the wizard is the
   * only thing about setting up on this page. After that, the steps
   * the wizard walked (the page, the screens, the first night) are
   * listed only while still undone; the rest are listed until done,
   * ticked as they go. An organizer never sees a step whose page
   * would turn them away.
   */
  const offerWizard = owner && onboardedAt === null;
  const visibleSteps = offerWizard
    ? []
    : steps.filter(
        (step) =>
          !(WIZARD_STEPS.has(step.key) && step.done) &&
          (owner || !isOwnerOnlyPath(step.href)),
      );
  const settingUp = visibleSteps.some((step) => !step.done);

  return (
    <AppShell
      area="Store"
      email={viewer.user.email ?? ""}
      title={store.name}
      description="One printed code on your counter, plus a room for every event you run."
      areas={areas}
      currentArea={currentArea}
    >
      <StoreTabs storeId={store.id} />

      {/* The wizard, until the owner has finished or skipped it. */}
      {offerWizard && (
        <Card className="flex flex-wrap items-center gap-4 border-accent">
          <Sparkles className="size-6 shrink-0 text-accent" aria-hidden="true" />
          <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
            <p className="font-semibold text-text-primary">Finish setting up</p>
            <p className="text-sm text-text-secondary">
              Your store page, your screens, your first night and your team. Five
              minutes, and every step can wait.
            </p>
          </div>
          <Link
            href={consoleHref("/store/setup", store.id)}
            className="flex items-center gap-1.5 text-sm font-semibold text-accent underline-offset-4 hover:underline"
          >
            Open the setup
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Card>
      )}

      {settingUp && <SetupChecklist steps={visibleSteps} />}

      {counterQr && store.join_code && (
        <section className="flex flex-col gap-5" aria-labelledby="counter-code-heading">
          <h2 id="counter-code-heading" className="text-xl font-bold text-text-primary">
            Your counter code
          </h2>
          <CounterCode
            storeId={store.id}
            storeName={store.name}
            joinCode={store.join_code}
            url={joinUrl(store.join_code)}
            qrSvg={counterQr}
            walkInEnabled={store.walk_in_enabled}
          />
        </section>
      )}

      <section className="grid gap-5 md:grid-cols-2" aria-label="Tonight">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <MonitorPlay className="size-5 text-accent" aria-hidden="true" />
            <h2 className="font-semibold text-text-primary">FlareCast</h2>
          </div>
          <p className="text-sm text-text-secondary">
            {displays.length === 0
              ? "No screens yet. Add one and open its link on the television."
              : displays.length === 1
                ? "One screen. Open its link on the television at the start of the night."
                : `${displays.length} screens ready for the television.`}
          </p>
          <div>
            <ButtonLink
              href={consoleHref("/store/event-hub", store.id)}
              variant="secondary"
              size="sm"
            >
              Open FlareCast
            </ButtonLink>
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-5 text-accent" aria-hidden="true" />
            <h2 className="font-semibold text-text-primary">Events</h2>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-sm text-text-secondary">
              Nothing scheduled. The counter code covers an ordinary night; a tournament
              or prerelease deserves its own event.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm text-text-secondary">
              {upcoming.map((event) => (
                <li key={event.id} className="truncate">
                  <span className="font-semibold text-text-primary">{event.name}</span>
                  {" · "}
                  {event.status}
                </li>
              ))}
            </ul>
          )}
          <div>
            <ButtonLink
              href={consoleHref("/store/events", store.id)}
              variant="secondary"
              size="sm"
            >
              Manage events
            </ButtonLink>
          </div>
        </Card>
      </section>
    </AppShell>
  );
}
