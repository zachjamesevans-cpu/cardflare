import type { Metadata } from "next";
import { CalendarDays, MonitorPlay } from "lucide-react";

import { CounterCode } from "@/components/events/counter-code";
import { AppShell } from "@/components/layout/app-shell";
import { BillingCard, billingNotice } from "@/components/stores/billing-card";
import {
  SetupChecklist,
  WelcomeHero,
  type SetupStep,
} from "@/components/stores/onboarding";
import { StoreTabs } from "@/components/stores/store-tabs";
import { VendorConsole } from "@/components/stores/vendor-console";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { reconcileCheckoutSession } from "@/lib/billing/reconcile";
import { listDisplays } from "@/lib/event-hub/repository";
import { joinQrSvg, joinUrl } from "@/lib/events/qr";
import { listEventsForStore } from "@/lib/events/repository";
import { sweepStaleRooms } from "@/lib/events/rooms";
import { singlesSyncFor } from "@/lib/singles/repository";
import { consoleHref, loadStoreConsole } from "@/lib/stores/console";
import { planDate, storePlan, ultraIsSellable } from "@/lib/stores/ultra";

export const metadata: Metadata = {
  title: "Your store",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The console's front page: what to do, and the code to print.
 *
 * It used to be every section of the console on one long scroll. The
 * founder: "kind of just a massive fart of a bunch of screens." Now
 * the front page is the welcome, the four things to do first, the
 * counter code, and the plan; the television, the events, the case
 * and the settings each have a tab. A store that has done all four
 * things sees the code and the plan and nothing nagging.
 */
export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<{
    as?: string;
    checkout?: string;
    welcome?: string;
    session_id?: string;
  }>;
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
        <Card className="text-text-secondary">
          If you were invited, make sure you signed in with the same email address the
          invitation was sent to. Otherwise, get in touch and we will sort it out.
        </Card>
      </AppShell>
    );
  }

  /*
   * Back from Stripe: ask Stripe what just happened rather than wait
   * for its webhook, which can land after this page has rendered. The
   * session id is checked against this store before anything is
   * written, so a pasted id entitles nobody.
   */
  const justStarted = params.checkout === "success";
  if (justStarted && params.session_id) {
    await reconcileCheckoutSession(params.session_id, { storeId: store.id });
  }

  await sweepStaleRooms();

  const [events, displays, sync, plan, counterQr] = await Promise.all([
    listEventsForStore(store.id),
    listDisplays(store.id),
    singlesSyncFor(store.id),
    storePlan(store.id),
    store.join_code ? joinQrSvg(store.join_code) : Promise.resolve(null),
  ]);

  const steps: SetupStep[] = [
    {
      key: "flarecast",
      title: "Put FlareCast on your TV",
      detail:
        "Add a screen, open its link on the television and press Enter Fullscreen once. Timers, the room's wants and your code, all night.",
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
  const settingUp = steps.some((step) => !step.done);

  const trialUntil = plan.state === "trialing" ? planDate(plan.until) : null;

  const upcoming = events.filter((event) => event.status !== "closed").slice(0, 3);

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

      {(justStarted || params.welcome === "1" || settingUp) && (
        <WelcomeHero
          storeName={store.name}
          trialUntil={trialUntil}
          fresh={justStarted || params.welcome === "1"}
        />
      )}

      {settingUp && <SetupChecklist steps={steps} />}

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

      <section className="flex flex-col gap-5" aria-labelledby="plan-heading">
        <h2 id="plan-heading" className="text-xl font-bold text-text-primary">
          Your plan
        </h2>
        <BillingCard
          storeId={store.id}
          plan={plan}
          sellable={ultraIsSellable()}
          notice={billingNotice(params)}
          justStarted={justStarted}
        />
      </section>
    </AppShell>
  );
}
