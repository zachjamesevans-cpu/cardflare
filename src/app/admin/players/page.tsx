import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, UserRound } from "lucide-react";

import { AdminPlayerRow } from "@/components/admin/admin-player-row";
import { AvatarProbe } from "@/components/admin/avatar-probe";
import { InvitePlayerForm } from "@/components/admin/invite-player-form";
import { PlayerSearch } from "@/components/admin/player-search";
import { Badge, Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { avatarDiagnostics } from "@/lib/admin/avatar-check";
import { searchPlayers } from "@/lib/admin/grants";
import { listPlayersForAdmin, playerForUser } from "@/lib/players/accounts";

export const metadata: Metadata = {
  title: "Players",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Player accounts, invite-only for now.
 *
 * Deliberately not a directory of everyone who ever scanned a code — guests
 * are the product's front door and never appear here. These are the handful
 * of pilot players whose wants follow them between stores.
 */
export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  // The layout guards too. Duplicated deliberately: a layout is not a
  // security boundary on its own.
  const user = await requireAdmin();

  const query = (await searchParams).q ?? "";

  /* The admin's own player, for the picture check at the bottom. */
  const self = await playerForUser(user.id);
  const check = self ? await avatarDiagnostics(self.id) : null;

  /*
   * Two lists, and they answer different questions. `listPlayersForAdmin`
   * carries the email addresses and the pending invitations — the
   * invite-management view. `searchPlayers` is the one that finds a
   * person and carries what an admin grants against: Embers, unlocks,
   * whether they ever finished setting up.
   */
  const [{ players, pending }, found] = await Promise.all([
    listPlayersForAdmin(),
    searchPlayers(query),
  ]);

  const emailFor = new Map(players.map((player) => [player.id, player.email]));

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <Link
          href="/admin"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to the console
        </Link>

        <h2 className="text-xl font-bold text-text-primary">Players</h2>
        <p className="max-w-2xl text-sm text-text-secondary">
          Accounts are optional and invite-only: guests scan and trade with nothing but
          a nickname, exactly as before. An account makes a player&rsquo;s wants follow
          them between stores.
        </p>
      </div>

      <section className="flex flex-col gap-5" aria-labelledby="invite-player-heading">
        <div className="flex flex-col gap-1.5">
          <h3
            id="invite-player-heading"
            className="text-lg font-bold text-text-primary"
          >
            Invite a player
          </h3>
          <p className="text-sm text-text-secondary">
            Creates their account and emails them a sign-in link.
          </p>
        </div>

        <Card>
          <InvitePlayerForm />
        </Card>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="players-heading">
        <div className="flex items-center justify-between gap-4">
          <h3 id="players-heading" className="text-lg font-bold text-text-primary">
            Accounts
          </h3>
          <span className="text-sm text-text-muted tabular-nums">
            {players.length} {players.length === 1 ? "player" : "players"}
            {pending.length > 0 && ` · ${pending.length} invited`}
          </span>
        </div>

        <p className="text-sm text-text-secondary">
          Tap a player to grant Embers, unlock every cosmetic, or rename them.
        </p>

        <PlayerSearch initial={query} />

        {found.length === 0 && pending.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <UserRound className="size-6 text-text-muted" aria-hidden="true" />
            <p className="text-text-secondary">
              {query
                ? `Nobody matching "${query}".`
                : "No player accounts yet. Invite the first one above."}
            </p>
          </Card>
        ) : (
          <Card className="p-4">
            <ul className="flex flex-col">
              {found.map((player) => (
                <AdminPlayerRow
                  key={player.id}
                  playerId={player.id}
                  displayName={player.displayName}
                  handle={player.handle}
                  email={emailFor.get(player.id) ?? null}
                  avatarUrl={player.avatarUrl}
                  embersEarned={player.embersEarned}
                  embersBalance={player.embersBalance}
                  cosmeticsUnlocked={player.cosmeticsUnlocked}
                  cosmeticsUnlockedDraft={player.cosmeticsUnlockedDraft}
                  purchasedCount={player.purchasedCount}
                  setupOwed={!player.onboardedAt}
                  tier={player.tier}
                />
              ))}
              {/* Invitations are not search results: they have no
                  account yet, so there is nothing to grant against. */}
              {(query ? [] : pending).map((invite) => (
                <li
                  key={invite.email}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-1 basis-48 flex-col">
                    <span className="truncate font-semibold text-text-primary">
                      {invite.displayName}
                    </span>
                    <span className="truncate text-xs text-text-muted">
                      {invite.email}
                    </span>
                  </div>
                  <Badge tone="neutral">Invite pending</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/*
       * The picture pipeline, tested link by link against the admin's
       * own account. Lives here because this is where the founder
       * already is when something about a player looks wrong, and
       * because four blind rounds of "same exact issue" earned the
       * system a way to name its own broken layer.
       */}
      <section className="flex flex-col gap-5" aria-labelledby="avatar-check-heading">
        <div className="flex flex-col gap-1.5">
          <h3 id="avatar-check-heading" className="text-lg font-bold text-text-primary">
            Picture system check
          </h3>
          <p className="text-sm text-text-secondary">
            Tests your own profile picture through every layer it passes: the database
            row, the storage bucket, the serving route, and finally this very browser.
            The first red line is the broken one.
          </p>
        </div>

        <Card className="flex flex-col gap-3">
          {check ? (
            <>
              <ul className="flex flex-col gap-2">
                {check.steps.map((step) => (
                  <li
                    key={step.label}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
                  >
                    <span
                      className={`w-32 shrink-0 text-sm font-semibold ${
                        step.ok ? "text-success" : "text-danger"
                      }`}
                    >
                      {step.ok ? "OK" : "FAILED"} · {step.label}
                    </span>
                    <span className="min-w-0 flex-1 text-xs break-all text-text-muted">
                      {step.detail}
                    </span>
                  </li>
                ))}
              </ul>

              {check.src && <AvatarProbe src={check.src} />}
            </>
          ) : (
            <p className="text-sm text-text-muted">
              Your admin account has no player attached, so there is no picture to
              check.
            </p>
          )}
        </Card>
      </section>
    </div>
  );
}
