import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ExternalLink,
  Printer,
  Smartphone,
  Store as StoreIcon,
  Users,
} from "lucide-react";

import { CounterCode } from "@/components/events/counter-code";
import { AppShell } from "@/components/layout/app-shell";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { WelcomeHero } from "@/components/stores/onboarding";
import { AddOrganizer } from "@/components/stores/organizers";
import { SetupEventForm } from "@/components/stores/setup-event-form";
import {
  AddScreenForm,
  ScreenRow,
  StepDots,
  StepFrame,
  STEP_TITLES,
} from "@/components/stores/setup-wizard";
import { StoreBannerForm } from "@/components/stores/store-banner-form";
import { StoreLogoForm } from "@/components/stores/store-logo-form";
import { StorePageForm } from "@/components/stores/store-page-form";
import { StorePageHeader } from "@/components/stores/store-page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { reconcileCheckoutSession } from "@/lib/billing/reconcile";
import { listDisplays } from "@/lib/event-hub/repository";
import { defaultEventWindow, formatEventWindow } from "@/lib/events/format";
import { joinQrSvg, joinUrl } from "@/lib/events/qr";
import { listEventsForStore } from "@/lib/events/repository";
import { formatHandle } from "@/lib/players/handle";
import { gameShortName } from "@/lib/players/games-catalog";
import { avatarSrc } from "@/lib/players/profile-image";
import { siteUrl } from "@/lib/site";
import { consoleHref, loadStoreConsole } from "@/lib/stores/console";
import { markStoreOnboarded, storePageFor } from "@/lib/stores/page";
import { finishStoreSetupAction } from "@/lib/stores/setup-actions";
import { qrSvgFor } from "@/lib/stores/setup-qr";
import { isSetupStep, setupHref, type SetupStep } from "@/lib/stores/setup-schema";
import { listStaff } from "@/lib/stores/staff";
import { planDate, storePlan } from "@/lib/stores/ultra";

export const metadata: Metadata = {
  title: "Set up your store",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The setup wizard: six steps from checkout to a shop that is on.
 *
 * The founder: "work on the sign up process for Ultra. needs to be a
 * great onboarding experience. setting up a profile, adding 'screens'
 * and explaining what screens are, etc." So: Welcome, the store page,
 * the screens, the first event night, the team, done. Every step can
 * be skipped, every step can be come back to (the dots along the top
 * are links), and the step lives in the URL so nothing is lost to a
 * refresh. The store's rows are the only state there is.
 *
 * OWNER-ONLY. The page names the shop, hands out organizers and stamps
 * the store as set up. An organizer who lands here goes to the console
 * they do have.
 *
 * Back from Stripe, this is where the browser lands, so the checkout
 * session is reconciled here the way the console home does it: ask
 * Stripe rather than wait for the webhook, and check the session
 * against THIS store before anything is written.
 */
export default async function StoreSetupPage({
  searchParams,
}: {
  searchParams: Promise<{
    as?: string;
    step?: string;
    checkout?: string;
    session_id?: string;
    welcome?: string;
  }>;
}) {
  const params = await searchParams;
  const { viewer, store, areas, currentArea } = await loadStoreConsole(
    params.as,
    "/store/setup",
  );
  if (!store || store.kind === "vendor") redirect("/store");
  if (store.role !== "owner") redirect(`/store?as=${store.id}`);

  const justStarted = params.checkout === "success";
  if (justStarted && params.session_id) {
    await reconcileCheckoutSession(params.session_id, { storeId: store.id });
  }

  const step: SetupStep = isSetupStep(params.step) ? params.step : "welcome";
  const timeZone = store.timezone ?? "UTC";

  return (
    <AppShell
      area="Store"
      email={viewer.user.email ?? ""}
      title={`Set up ${store.name}`}
      description="Five minutes, and every step can wait until later."
      areas={areas}
      currentArea={currentArea}
    >
      <div className="flex flex-col gap-6">
        <StepDots storeId={store.id} step={step} />

        {step === "welcome" && (
          <WelcomeStep storeId={store.id} storeName={store.name} fresh={justStarted} />
        )}
        {step === "page" && <PageStep storeId={store.id} tier={store.tier} />}
        {step === "screens" && <ScreensStep storeId={store.id} />}
        {step === "event" && (
          <EventStep
            storeId={store.id}
            storeName={store.name}
            joinCode={store.join_code}
            walkInEnabled={store.walk_in_enabled}
            timeZone={timeZone}
          />
        )}
        {step === "team" && <TeamStep storeId={store.id} />}
        {step === "done" && (
          <DoneStep
            storeId={store.id}
            storeName={store.name}
            joinCode={store.join_code}
          />
        )}
      </div>
    </AppShell>
  );
}

/* -------------------------------------------------------------------- */
/* 1. Welcome                                                            */
/* -------------------------------------------------------------------- */

async function WelcomeStep({
  storeId,
  storeName,
  fresh,
}: {
  storeId: string;
  storeName: string;
  fresh: boolean;
}) {
  const plan = await storePlan(storeId);
  const trialUntil = plan.state === "trialing" ? planDate(plan.until) : null;

  return (
    <StepFrame
      storeId={storeId}
      step="welcome"
      title={STEP_TITLES.welcome}
      lede="Your store page, your screens, your first night and your team. Each one is a minute, and each one can wait."
    >
      <WelcomeHero storeName={storeName} trialUntil={trialUntil} fresh={fresh} />

      <div className="flex flex-wrap items-center gap-3">
        <ButtonLink href={setupHref(storeId, "page")} size="lg">
          Set up in five minutes
        </ButtonLink>
        {/* Later stamps the store as set up and goes to the console; the
            wizard stays one link away in Settings. */}
        <form action={finishStoreSetupAction}>
          <input type="hidden" name="storeId" value={storeId} />
          <Button type="submit" variant="ghost" size="lg">
            Later
          </Button>
        </form>
      </div>
    </StepFrame>
  );
}

/* -------------------------------------------------------------------- */
/* 2. Your store page                                                    */
/* -------------------------------------------------------------------- */

async function PageStep({ storeId, tier }: { storeId: string; tier: string }) {
  const page = await storePageFor(storeId);

  return (
    <StepFrame
      storeId={storeId}
      step="page"
      title={STEP_TITLES.page}
      lede="What a player sees when they find you or follow you: your logo, a banner, a line about the shop, where you are and when you are open."
    >
      {page ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
          <Card className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <p className="font-semibold text-text-primary">Pictures</p>
              <StoreLogoForm storeId={storeId} hasLogo={page.logoPath !== null} />
              <StoreBannerForm storeId={storeId} hasBanner={page.coverPath !== null} />
            </div>
            <div className="border-t border-border pt-5">
              <StorePageForm page={page} />
            </div>
          </Card>

          {/* The preview: the same header the public page draws, from
              the same rows, so saving here is seeing it there. */}
          <div className="flex flex-col gap-2 lg:sticky lg:top-6">
            <p className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase">
              How it looks
            </p>
            <StorePageHeader
              name={page.name}
              verified={false}
              ultra={tier === "ultra"}
              unclaimed={false}
              city={page.city}
              region={page.region}
              logoUrl={avatarSrc(page.logoPath)}
              coverUrl={avatarSrc(page.coverPath)}
              headingLevel="h2"
            >
              {page.description && (
                <p className="text-sm text-text-secondary">{page.description}</p>
              )}
              {page.games.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label="Games">
                  {page.games.map((game) => (
                    <li
                      key={game}
                      className="rounded-full border border-border bg-elevated px-2.5 py-0.5 text-xs font-medium text-text-secondary"
                    >
                      {gameShortName(game)}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-text-muted">
                Save the page and this updates. Follow, tonight&rsquo;s event and your
                hours appear underneath on the real page.
              </p>
            </StorePageHeader>
            <Link
              href={`/s/${storeId}`}
              className="flex items-center gap-1.5 self-start text-sm font-semibold text-accent underline-offset-4 hover:underline"
            >
              View the real page
              <ExternalLink className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      ) : (
        <Card className="text-text-secondary">
          The store page could not be loaded. Skip this step and set it up from Settings
          later.
        </Card>
      )}
    </StepFrame>
  );
}

/* -------------------------------------------------------------------- */
/* 3. Your screens                                                       */
/* -------------------------------------------------------------------- */

async function ScreensStep({ storeId }: { storeId: string }) {
  const displays = await listDisplays(storeId);
  const origin = siteUrl();
  const screens = await Promise.all(
    displays.map(async (display) => {
      const url = `${origin}/display/${display.token}`;
      return { display, url, qrSvg: await qrSvgFor(url) };
    }),
  );

  return (
    <StepFrame
      storeId={storeId}
      step="screens"
      title={STEP_TITLES.screens}
      lede="A screen is a TV in your shop running FlareCast. It shows your counter code so players scan in, the round clocks for tonight's event, and what the room is hunting. Name one per TV."
    >
      {screens.length > 0 && (
        <ul className="flex flex-col gap-3">
          {screens.map(({ display, url, qrSvg }) => (
            <ScreenRow
              key={display.id}
              name={display.name}
              url={url}
              qrSvg={qrSvg}
              manageHref={`/store/event-hub/${display.id}?as=${storeId}`}
            />
          ))}
        </ul>
      )}

      <AddScreenForm storeId={storeId} first={screens.length === 0} />

      <p className="max-w-2xl text-sm text-text-muted">
        Each screen has its own private link. Scan the code from the TV&rsquo;s browser
        or type the address, press Enter Fullscreen once, and leave it. Nobody has to
        sign in on the television.
      </p>
    </StepFrame>
  );
}

/* -------------------------------------------------------------------- */
/* 4. Your first event night                                             */
/* -------------------------------------------------------------------- */

async function EventStep({
  storeId,
  storeName,
  joinCode,
  walkInEnabled,
  timeZone,
}: {
  storeId: string;
  storeName: string;
  joinCode: string | null;
  walkInEnabled: boolean;
  timeZone: string;
}) {
  const [events, counterQr] = await Promise.all([
    listEventsForStore(storeId),
    joinCode ? joinQrSvg(joinCode) : Promise.resolve(null),
  ]);
  const upcoming = events.filter((event) => event.status !== "closed").slice(0, 3);
  const window = defaultEventWindow(timeZone);

  return (
    <StepFrame
      storeId={storeId}
      step="event"
      title={STEP_TITLES.event}
      lede="A tournament or a prerelease gets its own room, its own window and its own sheet. Your counter code sends players there while it runs; an ordinary afternoon needs nothing."
    >
      {upcoming.length > 0 && (
        <Card className="flex flex-col gap-2">
          <p className="font-semibold text-text-primary">On the calendar</p>
          <ul className="flex flex-col gap-1 text-sm text-text-secondary">
            {upcoming.map((event) => (
              <li key={event.id} className="flex flex-wrap justify-between gap-2">
                <Link
                  href={`/store/events/${event.id}?as=${storeId}`}
                  className="font-semibold text-text-primary underline-offset-4 hover:underline"
                >
                  {event.name}
                </Link>
                <span>
                  {formatEventWindow(event.starts_at, event.ends_at, timeZone)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <SetupEventForm
          storeId={storeId}
          defaultStartsAt={window.startsAt}
          defaultEndsAt={window.endsAt}
          another={events.length > 0}
        />
      </Card>

      {events.length > 0 && counterQr && joinCode && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-bold text-text-primary">Your counter code</h3>
            <ButtonLink
              href={`/poster/${joinCode}`}
              target="_blank"
              rel="noopener"
              variant="secondary"
              size="sm"
            >
              <Printer className="size-4" aria-hidden="true" />
              Print the counter sign
            </ButtonLink>
          </div>
          <CounterCode
            storeId={storeId}
            storeName={storeName}
            joinCode={joinCode}
            url={joinUrl(joinCode)}
            qrSvg={counterQr}
            walkInEnabled={walkInEnabled}
          />
        </div>
      )}
    </StepFrame>
  );
}

/* -------------------------------------------------------------------- */
/* 5. Your team                                                          */
/* -------------------------------------------------------------------- */

async function TeamStep({ storeId }: { storeId: string }) {
  const staff = await listStaff(storeId);
  const organizers = staff.filter((member) => member.role !== "owner");
  const memberPlayerIds = staff
    .map((member) => member.playerId)
    .filter((id): id is string => id !== null);

  return (
    <StepFrame
      storeId={storeId}
      step="team"
      title={STEP_TITLES.team}
      lede="An organizer runs your nights from their phone: FlareCast, the timers and the remote. They never see billing, singles or settings. Running it alone for now is fine."
    >
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Users className="size-5 text-accent" aria-hidden="true" />
          <p className="font-semibold text-text-primary">
            {organizers.length === 0
              ? "Hand the timers to a regular"
              : `${organizers.length} ${organizers.length === 1 ? "organizer" : "organizers"}`}
          </p>
        </div>

        {organizers.length > 0 && (
          <ul className="flex flex-col">
            {organizers.map((member) => (
              <li
                key={member.userId}
                className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0"
              >
                <PlayerAvatar
                  displayName={member.displayName}
                  seed={member.playerId ?? member.userId}
                  avatarUrl={member.avatarUrl}
                  size="sm"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold text-text-primary">
                    {member.displayName}
                  </span>
                  {member.handle && (
                    <span className="truncate text-xs text-text-muted">
                      {formatHandle(member.handle)}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        <AddOrganizer storeId={storeId} memberPlayerIds={memberPlayerIds} />

        <p className="text-xs text-text-muted">
          They need a cardflare player account first. You can add or remove organizers
          any time from the Organizers tab.
        </p>
      </Card>
    </StepFrame>
  );
}

/* -------------------------------------------------------------------- */
/* 6. Done                                                               */
/* -------------------------------------------------------------------- */

async function DoneStep({
  storeId,
  storeName,
  joinCode,
}: {
  storeId: string;
  storeName: string;
  joinCode: string | null;
}) {
  /* Reaching the end IS finishing: the console stops asking. */
  await markStoreOnboarded(storeId);
  const counterQr = joinCode ? await joinQrSvg(joinCode) : null;

  return (
    <StepFrame
      storeId={storeId}
      step="done"
      title={`${storeName} is on`}
      lede="One code on the counter opens whichever room is running. Everything else is a tab in your console."
    >
      {counterQr && joinCode && (
        <Card className="flex flex-col items-center gap-4 text-center">
          <div
            className="w-full max-w-60 rounded-lg bg-white p-3"
            dangerouslySetInnerHTML={{ __html: counterQr }}
          />
          <p className="font-mono text-4xl font-bold tracking-[0.18em] text-text-primary">
            {joinCode}
          </p>
          <p className="text-sm text-text-secondary">
            Your counter code. It never changes.
          </p>
          <ButtonLink href={`/poster/${joinCode}`} target="_blank" rel="noopener">
            <Printer className="size-4" aria-hidden="true" />
            Print the counter sign
          </ButtonLink>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <StoreIcon className="size-5 text-accent" aria-hidden="true" />
            <p className="font-semibold text-text-primary">Your store page</p>
          </div>
          <p className="text-sm text-text-secondary">
            What a player sees when they find you. Followers get your nights in their
            Feed.
          </p>
          <div>
            <ButtonLink href={`/s/${storeId}`} variant="secondary" size="sm">
              View your store page
            </ButtonLink>
          </div>
        </Card>

        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Smartphone className="size-5 text-accent" aria-hidden="true" />
            <p className="font-semibold text-text-primary">
              Follow your own store from the app
            </p>
          </div>
          <p className="text-sm text-text-secondary">
            Open cardflare on your phone, find {storeName} under Nearby and tap Follow.
            You will see your nights the way your players do.
          </p>
        </Card>
      </div>

      <div>
        <ButtonLink href={consoleHref("/store", storeId)} size="lg">
          Go to your console
        </ButtonLink>
      </div>
    </StepFrame>
  );
}
