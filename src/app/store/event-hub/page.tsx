import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Tv } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { CopyLink } from "@/components/events/copy-link";
import { AddTimerForm } from "@/components/event-hub/add-timer-form";
import { ControlPanel } from "@/components/event-hub/control-panel";
import { DisplaySettings } from "@/components/event-hub/display-settings";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { buttonStyles } from "@/components/ui/button";
import { areasForUser } from "@/lib/auth/areas";
import { getViewer } from "@/lib/auth/session";
import { createDisplayAction } from "@/lib/event-hub/actions";
import { displayPayload } from "@/lib/event-hub/display-payload";
import { listDisplays } from "@/lib/event-hub/repository";
import { MAX_TIMERS } from "@/lib/event-hub/layout";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Event Hub",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The Event Hub's control panel.
 *
 * Lives in the store area rather than being its own app, because it is
 * the same account, the same store switcher and the same authorisation
 * every other store screen uses. What it is NOT is the display: nothing
 * on this page appears on the television, and nothing on the television
 * can reach anything here.
 *
 * Built to be used on a phone behind a counter with the television
 * across the room, which is where a Friday night actually happens.
 */
export default async function EventHubPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string }>;
}) {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/store/event-hub");
  if (viewer.kind === "player") redirect("/profile");
  if (viewer.kind === "admin" && viewer.storeIds.length === 0) redirect("/admin");
  if (viewer.kind === "unaffiliated") redirect("/store");

  /* Same `?as=` switcher the store dashboard uses, and the same rule:
     anything not in this account's own list falls back to the first. */
  const { as } = await searchParams;
  const storeIds =
    viewer.kind === "store" || viewer.kind === "admin" ? viewer.storeIds : [];
  const storeId = as && storeIds.includes(as) ? as : storeIds[0];

  if (!storeId) redirect("/store");

  const [displays, areas] = await Promise.all([
    listDisplays(storeId),
    areasForUser(viewer.user.id, viewer.kind === "admin"),
  ]);

  /*
   * ALL of them, not `displays[0]`. That indexing was the bug behind
   * "it literally just deletes the timer": splitting a tournament to
   * its own screen created display #2 and moved the timer there — and
   * this page never showed a second display, so the timer vanished
   * with no trace of where it went. Every screen now gets its section,
   * link included, so a split lands somewhere you can see and open.
   */
  const payloads = await Promise.all(displays.map((d) => displayPayload(d)));

  return (
    <AppShell
      area="Store"
      email={viewer.user.email ?? ""}
      title="Event Hub"
      description="Your tournament timers, your Flare board and your counter code, on the television."
      areas={areas}
      currentArea={`/store?as=${storeId}`}
    >
      <Link
        href={`/store?as=${storeId}`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to your store
      </Link>

      {displays.length === 0 ? (
        <section className="flex flex-col gap-5" aria-labelledby="create-heading">
          <div className="flex flex-col gap-1">
            <h2 id="create-heading" className="text-xl font-bold text-text-primary">
              Set up your display
            </h2>
            <p className="max-w-2xl text-sm text-text-secondary">
              One link, opened on whatever is plugged into your television. It shows
              your tournament timers, what the room is looking for and your counter code
              &mdash; and it needs nobody to sign in.
            </p>
          </div>

          <Card>
            <form action={createDisplayAction} className="flex flex-col gap-4">
              <input type="hidden" name="storeId" value={storeId} />
              <input type="hidden" name="name" value="Main display" />

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="nightTitle"
                  className="text-sm font-medium text-text-secondary"
                >
                  Event night title (optional)
                </label>
                <input
                  id="nightTitle"
                  name="nightTitle"
                  maxLength={60}
                  placeholder="Monday TCG Night"
                  className="h-11 rounded-[var(--radius-control)] border border-border bg-canvas px-3.5 text-text-primary placeholder:text-text-muted focus-visible:border-accent focus-visible:outline-none"
                />
              </div>

              <SubmitButton label="Create the display" pendingLabel="Creating…" />
            </form>
          </Card>
        </section>
      ) : (
        <>
          {displays.map((display, index) => {
            const payload = payloads[index];
            if (!payload) return null;
            const displayUrl = `${siteUrl()}/display/${display.token}`;

            return (
              <section
                key={display.id}
                className={`flex flex-col gap-5 ${
                  index > 0 ? "border-t border-border pt-8" : ""
                }`}
                aria-label={display.name}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-xl font-bold text-text-primary">
                    {display.name}
                  </h2>
                  <span className="text-sm text-text-muted tabular-nums">
                    {payload.timers.length} of {MAX_TIMERS} tournaments
                  </span>
                </div>

                <Card className="flex flex-col gap-3">
                  <p className="text-sm text-text-secondary">
                    Open this link on whatever drives that television, then press Enter
                    Fullscreen once. It asks nobody to sign in.
                  </p>
                  <p className="font-mono text-xs break-all text-text-muted">
                    {displayUrl}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/display/${display.token}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={buttonStyles("primary", "sm")}
                    >
                      <Tv className="size-4" aria-hidden="true" />
                      Open TV display
                    </a>
                    <a
                      href={`/display/${display.token}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={buttonStyles("secondary", "sm")}
                    >
                      <ExternalLink className="size-4" aria-hidden="true" />
                      Preview
                    </a>
                    <CopyLink url={displayUrl} />
                  </div>
                </Card>

                {/* Live from here down: the same polled payload the
                    television reads, so a second staff phone's pause
                    shows up here too. */}
                <ControlPanel initial={payload} token={display.token} />

                {payload.timers.length < MAX_TIMERS && (
                  <details className="group rounded-[var(--radius-card)] border border-border bg-surface">
                    <summary className="cursor-pointer list-none px-4 py-3 font-semibold text-text-primary select-none">
                      Add a tournament to this screen
                    </summary>
                    <div className="border-t border-border p-4">
                      <AddTimerForm displayId={display.id} />
                    </div>
                  </details>
                )}

                <details className="group rounded-[var(--radius-card)] border border-border bg-surface">
                  <summary className="cursor-pointer list-none px-4 py-3 font-semibold text-text-primary select-none">
                    What this screen shows
                  </summary>
                  <div className="border-t border-border p-4">
                    <DisplaySettings
                      displayId={display.id}
                      nightTitle={display.nightTitle}
                      layout={display.layout}
                      announcement={display.announcement}
                      showFlares={display.showFlares}
                      showQr={display.showQr}
                      soundEnabled={display.soundEnabled}
                    />
                  </div>
                </details>
              </section>
            );
          })}

          <section className="flex flex-col gap-3" aria-labelledby="rules-heading">
            <h2 id="rules-heading" className="text-xl font-bold text-text-primary">
              About the rules summaries
            </h2>
            <p className="max-w-2xl text-sm text-text-secondary">
              The end-of-round instructions on the display are a quick reference for the
              room, not an authority. Current official tournament rules and your event
              staff or judges control. Each game&rsquo;s card links to the
              publisher&rsquo;s own documentation, and shows the date we last checked
              it.
            </p>
          </section>
        </>
      )}
    </AppShell>
  );
}
