import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MonitorUp, Tv } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { CopyLink } from "@/components/events/copy-link";
import { AddTimerForm } from "@/components/event-hub/add-timer-form";
import { ControlPanel } from "@/components/event-hub/control-panel";
import { DisplaySettings } from "@/components/event-hub/display-settings";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/controls";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonStyles } from "@/components/ui/button";
import { loadStoreConsole } from "@/lib/stores/console";
import { qrSvgFor } from "@/lib/stores/setup-qr";
import { tierHasFeature } from "@/lib/stores/ultra-access";
import { GiftBar } from "@/components/stores/gift-bar";
import { ConsoleLocked } from "@/components/stores/ultra-locked";
import { moveTimerToScreenAction } from "@/lib/event-hub/actions";
import { displayPayload } from "@/lib/event-hub/display-payload";
import { GAME_PROFILES } from "@/lib/event-hub/game-profiles";
import { MAX_TIMERS } from "@/lib/event-hub/layout";
import { findDisplay, listDisplays } from "@/lib/event-hub/repository";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Manage screen",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * One screen, managed.
 *
 * The overview answers "what is on my screens"; this page is everything
 * about ONE of them — the live controls, what is assigned to it, where
 * to open it, and its settings. The raw URL sits behind a disclosure
 * because the founder's brief was exact: "the long raw URL should NOT
 * dominate the interface. Copy Link is enough." And the button that
 * opens the screen on the TV sits at the very top, beside the way back:
 * the founder, a round later, "it should be higher at the top".
 *
 * Who may stand here is decided by `loadStoreConsole`, exactly as on
 * every other console tab. The screen then has to belong to one of the
 * stores that loader returned, or the page does not exist: same
 * non-oracle shape every store page uses.
 */
export default async function ManageScreenPage({
  params,
  searchParams,
}: {
  params: Promise<{ displayId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const { displayId } = await params;
  const { as } = await searchParams;
  const { viewer, stores, areas } = await loadStoreConsole(
    as,
    `/store/event-hub/${displayId}`,
  );

  const display = await findDisplay(displayId);
  const store = display ? stores.find((entry) => entry.id === display.storeId) : null;

  if (!display || !store) notFound();
  /* Ultra's. A screen's page has nothing to run without it. */
  if (!tierHasFeature("flarecast", store.tier)) {
    return (
      <ConsoleLocked
        email={viewer.user.email ?? ""}
        areas={areas}
        title="FlareCast"
        description="Your screens: tournament timers, the room's Flares and your counter code, on every TV."
        storeId={store.id}
        owner={store.role === "owner"}
        feature="FlareCast"
        pitch="Your tournament clocks, the room's Flares and your counter code on the TV, with Auto Mode running the rounds and a remote on your phone."
      />
    );
  }

  const [payload, displays] = await Promise.all([
    displayPayload(display),
    listDisplays(store.id),
  ]);

  const otherScreens = displays.filter((entry) => entry.id !== display.id);
  const displayUrl = `${siteUrl()}/display/${display.token}`;
  const displayQr = await qrSvgFor(displayUrl);
  const backHref = `/store/event-hub?as=${store.id}`;

  return (
    <AppShell
      area="Store"
      email={viewer.user.email ?? ""}
      title={display.name}
      description="Everything on this screen: the live controls, its tournaments and its display link."
      areas={areas}
      currentArea={`/store?as=${store.id}`}
    >
      {/* No tab bar on a single screen's page, so the green bar is drawn
          here directly: every console page carries it. */}
      <GiftBar storeId={store.id} owner={store.role === "owner"} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          All screens
        </Link>

        {/* The two things done most on this page, before anything
            scrolls: open the screen on the TV, and copy its display
            link for one. */}
        <div className="flex flex-wrap items-center gap-2">
          <CopyLink url={displayUrl} label="Copy display link" />
          <a
            href={`/display/${display.token}`}
            target="_blank"
            rel="noreferrer noopener"
            className={buttonStyles("primary", "sm")}
          >
            <Tv className="size-4" aria-hidden="true" />
            Open on the TV
          </a>
        </div>
      </div>

      {payload.timers.length > 0 ? (
        <section className="flex flex-col gap-5" aria-labelledby="running-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="running-heading" className="text-xl font-bold text-text-primary">
              On this screen
            </h2>
            {/* The cap, said only where somebody is about to hit it. */}
            <span className="text-sm text-text-muted tabular-nums">
              {payload.timers.length} of {MAX_TIMERS} slots used
            </span>
          </div>

          {/* Live from here down: the same polled payload the TV reads,
              so a second staff phone's pause shows up here too. */}
          <ControlPanel initial={payload} token={display.token} />

          {/* Reassigning without recreating: the clock never notices. */}
          {otherScreens.length > 0 && (
            <Card className="flex flex-col gap-3">
              <p className="flex items-center gap-2 font-semibold text-text-primary">
                <MonitorUp className="size-4 text-accent" aria-hidden="true" />
                Move a tournament to another screen
              </p>
              <div className="flex flex-col gap-2">
                {payload.timers.map((timer) => (
                  <form
                    key={timer.id}
                    action={moveTimerToScreenAction}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="timerId" value={timer.id} />
                    <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
                      <span className="font-semibold text-text-primary">
                        {GAME_PROFILES[timer.game].shortName}
                      </span>{" "}
                      · {timer.eventName}
                    </span>
                    <Select
                      name="targetDisplayId"
                      aria-label={`Move ${timer.eventName} to`}
                      defaultValue={otherScreens[0].id}
                      className="w-40"
                    >
                      {otherScreens.map((screen) => (
                        <option key={screen.id} value={screen.id}>
                          {screen.name}
                        </option>
                      ))}
                    </Select>
                    <SubmitButton label="Move" pendingLabel="Moving…" size="sm" />
                  </form>
                ))}
              </div>
            </Card>
          )}
        </section>
      ) : (
        <Card className="flex flex-col gap-1">
          <p className="font-semibold text-text-primary">Nothing on this screen yet</p>
          <p className="text-sm text-text-secondary">
            Add a tournament below and this screen lights up with its timer, the
            room&rsquo;s Flares and your counter code.
          </p>
        </Card>
      )}

      {payload.timers.length < MAX_TIMERS && (
        <section className="flex flex-col gap-4" aria-labelledby="add-heading">
          <h2 id="add-heading" className="text-xl font-bold text-text-primary">
            Add a tournament
          </h2>
          <Card>
            <AddTimerForm displayId={display.id} />
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-4" aria-labelledby="display-heading">
        <h2 id="display-heading" className="text-xl font-bold text-text-primary">
          On the TV
        </h2>

        {/* The code used to appear once, in the setup wizard, and never
            again; getting a second TV on, or the same one back after a
            new display link, meant hunting for a 60-character URL. */}
        <Card className="flex flex-wrap items-start gap-5">
          <div
            className="w-32 shrink-0 rounded-md bg-white p-1.5"
            /* Generated server-side by the `qrcode` package from a URL
               this app built, never from user input. */
            dangerouslySetInnerHTML={{ __html: displayQr }}
          />
          <div className="flex min-w-0 flex-1 basis-64 flex-col gap-3">
            <p className="font-semibold text-text-primary">Put this screen on a TV</p>
            {/* Fullscreen and the rest are said once, on the FlareCast
                tab's About paragraph, not on every screen's page. */}
            <p className="text-sm text-text-secondary">
              Open this screen&rsquo;s link on the TV&rsquo;s browser or the laptop
              plugged into it, or scan the code with a phone and cast that tab to the
              TV.
            </p>
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-text-secondary select-none">
                View display link
              </summary>
              <p className="mt-2 font-mono text-xs break-all text-text-muted">
                {displayUrl}
              </p>
            </details>
          </div>
        </Card>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="settings-heading">
        <h2 id="settings-heading" className="text-xl font-bold text-text-primary">
          Screen settings
        </h2>
        <Card>
          <DisplaySettings
            displayId={display.id}
            name={display.name}
            nightTitle={display.nightTitle}
            layout={display.layout}
            announcement={display.announcement}
            showFlares={display.showFlares}
            showQr={display.showQr}
            soundEnabled={display.soundEnabled}
          />
        </Card>
      </section>
    </AppShell>
  );
}
