import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { ScreenCard } from "@/components/event-hub/screen-card";
import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { TextInput } from "@/components/ui/controls";
import { areasForUser } from "@/lib/auth/areas";
import { getViewer } from "@/lib/auth/session";
import { createDisplayAction } from "@/lib/event-hub/actions";
import { RULES_DISCLAIMER } from "@/lib/event-hub/game-profiles";
import { listDisplays } from "@/lib/event-hub/repository";
import { screenRows } from "@/lib/event-hub/room-timers";

export const metadata: Metadata = {
  title: "FlareCast",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * FlareCast's front page: the store's physical screens, as cards.
 *
 * The founder's brief, after running real nights on the old page: each
 * display repeated a full block of link instructions, URL, controls and
 * settings, and two screens made "an extremely long repetitive mobile
 * page". So this page now answers exactly one question — WHAT IS ON MY
 * SCREENS — and everything about one screen lives on that screen's own
 * manage page, one tap away. No URLs here, no instructions, and the
 * general explanation appears once at the bottom instead of under
 * every television.
 */
export default async function FlareCastPage({
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

  const screens = await Promise.all(
    displays.map(async (display) => ({
      display,
      rows: await screenRows(display.id),
    })),
  );

  return (
    <AppShell
      area="Store"
      email={viewer.user.email ?? ""}
      title="FlareCast"
      description="Your screens: tournament timers, the room's Flares and your counter code, on every television."
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

      <section className="flex flex-col gap-5" aria-labelledby="screens-heading">
        <h2 id="screens-heading" className="text-xl font-bold text-text-primary">
          Your screens
        </h2>

        {screens.length === 0 && (
          <p className="max-w-2xl text-sm text-text-secondary">
            A screen is one physical television or projector. Add your first one below,
            open its link on that TV, and it runs all night: timers, the room&rsquo;s
            Flares and your counter code.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {screens.map(({ display, rows }) => (
            <ScreenCard
              key={display.id}
              name={display.name}
              rows={rows}
              manageHref={`/store/event-hub/${display.id}?as=${storeId}`}
            />
          ))}

          {/* Adding a television is one field. The link and token are
              generated on create; they live on the manage page. */}
          <Card className="flex flex-col justify-center gap-3 border-dashed">
            <form action={createDisplayAction} className="flex flex-col gap-3">
              <input type="hidden" name="storeId" value={storeId} />
              <label
                htmlFor="new-screen-name"
                className="flex items-center gap-2 font-semibold text-text-primary"
              >
                <Plus className="size-4 text-accent" aria-hidden="true" />
                Add a screen
              </label>
              <TextInput
                id="new-screen-name"
                name="name"
                maxLength={40}
                placeholder={screens.length === 0 ? "Main TV" : "Back TV"}
              />
              <SubmitButton label="Create" pendingLabel="Creating…" size="sm" />
            </form>
          </Card>
        </div>
      </section>

      {/* Everything general, said ONCE — the founder: "'What this screen
          shows' and general FlareCast explanations should NOT repeat
          under every display." */}
      <section className="flex flex-col gap-3" aria-labelledby="about-heading">
        <h2 id="about-heading" className="text-xl font-bold text-text-primary">
          About FlareCast
        </h2>
        <div className="max-w-2xl space-y-2 text-sm text-text-secondary">
          <p>
            Each screen has its own private link. Open it in the browser on whatever
            drives that television, press Enter Fullscreen once, and leave it — it needs
            nobody to sign in and keeps counting through wifi hiccups. The link lives on
            each screen&rsquo;s manage page.
          </p>
          <p>
            A screen running a single game shows a QR scoped to that game: players who
            scan the One Piece screen search One Piece cards. The counter code stays
            universal.
          </p>
          <p>
            One tournament per screen looks best. A screen holds up to four, and the
            layout adapts on its own.
          </p>
          <p className="text-text-muted">{RULES_DISCLAIMER}</p>
        </div>
      </section>
    </AppShell>
  );
}
