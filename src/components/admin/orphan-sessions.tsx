"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/controls";
import { attachSessionAction } from "@/lib/admin/orphan-actions";
import { ATTACH_IDLE, type AttachState } from "@/lib/admin/orphan-schema";
import type { OrphanSession } from "@/lib/admin/orphan-sessions";
import type { AdminPlayer } from "@/lib/admin/grants";

/**
 * Guest room identities, and a way to give one to an account.
 *
 * A Flare records the SESSION that posted it, so somebody who posted
 * before signing in has Flares hanging off a session that is nobody -
 * drawn as initials with no ring, on the board and in the Feed alike,
 * and never counted toward their profile or their Embers.
 *
 * There is no safe key to repair that automatically: a display name is
 * not an identity and a shared phone would hand the wrong person's posts
 * to somebody. So it is this - a list of what is stranded, and a human
 * saying which account it belongs to.
 */
function AttachButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Attaching…" : "Attach"}
    </Button>
  );
}

export function OrphanSessions({
  sessions,
  players,
}: {
  sessions: OrphanSession[];
  players: AdminPlayer[];
}) {
  const [state, action] = useActionState<AttachState, FormData>(
    attachSessionAction,
    ATTACH_IDLE,
  );
  const [filter, setFilter] = useState("");

  if (sessions.length === 0) {
    return (
      <Card className="flex flex-col gap-2 p-4">
        <h2 className="font-semibold text-text-primary">Guest sessions</h2>
        <p className="text-sm text-text-secondary">
          Nothing stranded. Every Flare posted so far belongs to an account.
        </p>
      </Card>
    );
  }

  const matches = filter.trim()
    ? players.filter((player) =>
        `${player.displayName} ${player.handle}`
          .toLowerCase()
          .includes(filter.trim().toLowerCase()),
      )
    : players;

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-text-primary">Guest sessions</h2>
        <p className="text-sm text-text-secondary">
          Flares posted before somebody signed in. They hang off a session with no
          account, so the board and the Feed both draw them as initials. Attaching one
          folds it into that account&rsquo;s room identity &mdash; its Flares, binder
          and room history come with it.
        </p>
        <p className="text-xs text-text-muted">
          There is no undo. Only attach a session you can confirm is theirs.
        </p>
      </div>

      {state.message && (
        <p
          className={`text-sm ${state.status === "error" ? "text-danger" : "text-accent"}`}
          role="status"
        >
          {state.message}
        </p>
      )}

      <TextInput
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        placeholder="Filter accounts by name or handle"
        aria-label="Filter accounts"
      />

      <div className="flex flex-col divide-y divide-border">
        {sessions.map((session) => (
          <form
            key={session.sessionId}
            action={action}
            className="flex flex-wrap items-center gap-3 py-3"
          >
            <input type="hidden" name="sessionId" value={session.sessionId} />

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-text-primary">
                {session.displayName}
              </p>
              <p className="text-xs text-text-muted tabular-nums">
                {session.flares} {session.flares === 1 ? "Flare" : "Flares"} ·{" "}
                {session.rooms} {session.rooms === 1 ? "room" : "rooms"} · last seen{" "}
                {new Date(session.lastSeenAt).toLocaleDateString()}
              </p>
            </div>

            <label className="sr-only" htmlFor={`account-${session.sessionId}`}>
              Account for {session.displayName}
            </label>
            <select
              id={`account-${session.sessionId}`}
              name="playerId"
              defaultValue=""
              required
              className="min-w-48 rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-text-primary"
            >
              <option value="" disabled>
                Choose an account…
              </option>
              {matches.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.displayName} @{player.handle}
                </option>
              ))}
            </select>

            <UserPlus className="size-4 text-text-muted" aria-hidden="true" />
            <AttachButton />
          </form>
        ))}
      </div>
    </Card>
  );
}
