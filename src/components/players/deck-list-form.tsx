"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";
import { Check, ClipboardList, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea, TextInput } from "@/components/ui/controls";
import { isRenderableImageUrl } from "@/lib/cards/images";
import {
  DECK_IMPORT_IDLE,
  DECK_LIST_MAX,
  parseDeckList,
  type DeckImportState,
} from "@/lib/players/deck-list";
import {
  importDeckListAction,
  previewDeckListAction,
  type DeckPreviewResult,
} from "@/lib/players/account-actions";
import type { DeckPreviewEntry } from "@/lib/players/deck-list-preview";

/**
 * Paste a deck, get a want list.
 *
 * The fast way to post a lot of cards before a release, and the founder's
 * ask for OP-17 week: "we need a way to post multiple flares at once —
 * such as if you're building a massive deck."
 *
 * Pasting rather than a grid of tick boxes, because a deck already
 * exists as text. It comes out of a builder, a Discord message or a
 * friend's screenshot as a list of numbers, and somewhere to put that is
 * faster than twenty-four perfect checkboxes.
 *
 * Between the paste and the save now sits a confirmation: every line
 * looked up and shown WITH its art. The founder's ask, after a paste in
 * the simulator's format went wrong quietly: "have a loading screen
 * that loads all cards, with images, for confirmation that they are the
 * cards someone wants." A wall of numbers is write-only to a human; a
 * column of card faces is checkable at a glance.
 *
 * What lands here are WANTS, not Flares. A deck is written at home and
 * posted at a counter, often days apart; the room's "still hunting
 * these?" panel posts the lot as one batch when the player walks in,
 * which is what makes it one notification and one Feed item.
 */
export function DeckListForm() {
  const [state, action] = useActionState<DeckImportState, FormData>(
    importDeckListAction,
    DECK_IMPORT_IDLE,
  );

  const [list, setList] = useState("");

  /* Counted here as it is typed, so "how many is this?" is answered
     before a round trip rather than after one. */
  const { lines, unreadable } = parseDeckList(list);

  /*
   * The looked-up preview, held WITH the text that produced it, so
   * "still loading" is derived by comparison rather than tracked as a
   * second flag — the same settled-value shape the sign-up handle check
   * and the card search use, and for the same reason: a stale answer
   * landing late must not be pinned under a fresher paste.
   */
  const [settled, setSettled] = useState<{
    list: string;
    result: DeckPreviewResult;
  } | null>(null);

  useEffect(() => {
    if (parseDeckList(list).lines.length === 0) return;

    let current = true;
    const timer = setTimeout(() => {
      void previewDeckListAction(list).then((result) => {
        if (current) setSettled({ list, result });
      });
    }, 500);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [list]);

  const preview = settled?.list === list ? settled.result : null;
  const loading = lines.length > 0 && preview === null;

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="deck-list" className="text-sm font-medium text-text-secondary">
          Your list
        </label>
        <Textarea
          id="deck-list"
          name="list"
          required
          rows={8}
          spellCheck={false}
          value={list}
          onChange={(event) => setList(event.target.value)}
          className="font-mono text-xs"
          placeholder={"4x OP17-001\n2xOP17-005\nOP17-013"}
        />
        <p className="text-xs text-text-muted">
          One card per line. Counts in front or behind both work, with or without a
          space, and anything after the number is ignored, so a list copied straight out
          of a deck builder or simulator goes in as it is.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="deck-label" className="text-sm font-medium text-text-secondary">
          Call it something (optional)
        </label>
        <TextInput
          id="deck-label"
          name="deckLabel"
          maxLength={40}
          placeholder="Red Luffy"
        />
        <p className="text-xs text-text-muted">
          Groups these on a board and in the Feed, so people see one hunt rather than a
          pile of loose cards.
        </p>
      </div>

      {loading && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-text-secondary"
        >
          <Loader2 className="size-4 animate-spin text-accent" aria-hidden="true" />
          Loading your cards…
        </p>
      )}

      {preview !== null && preview.entries.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary tabular-nums">
            {preview.entries.length} card{preview.entries.length === 1 ? "" : "s"} read
            {lines.length >= DECK_LIST_MAX ? " (the most one paste takes)" : ""}
            {unreadable.length > 0
              ? ` · ${unreadable.length} line${unreadable.length === 1 ? "" : "s"} with no card number`
              : ""}
            . Check the faces, then save.
          </p>

          <DeckPreviewList entries={preview.entries} />
        </div>
      )}

      <SaveButton count={lines.length} loading={loading} />

      {state.status === "error" && (
        <p role="status" className="text-sm text-danger">
          {state.message}
        </p>
      )}

      {state.status === "saved" && (
        <div className="flex flex-col gap-1.5">
          <p role="status" className="flex items-center gap-1.5 text-sm text-success">
            <Check className="size-3.5" aria-hidden="true" />
            {state.saved} card{state.saved === 1 ? "" : "s"} saved to your list.
          </p>
          <p className="text-xs text-text-muted">
            Walk into any room and it will offer to post them all at once.
          </p>
          {state.unknown.length > 0 && (
            /* Named, not counted. A number tells you something went
               wrong; the numbers tell you which ones to go back for —
               and for an unreleased set, which ones are not in the
               catalogue yet. */
            <p className="text-xs text-danger">
              Not in the catalogue: {state.unknown.slice(0, 12).join(", ")}
              {state.unknown.length > 12
                ? ` and ${state.unknown.length - 12} more`
                : ""}
            </p>
          )}
          {state.atCap && (
            <p className="text-xs text-danger">
              Your want list is full, so the rest were not saved.
            </p>
          )}
        </div>
      )}
    </form>
  );
}

/**
 * The confirmation itself: one row per pasted line, face first.
 *
 * A grey slot where a picture should be is itself the message — this
 * number matched nothing — and the name line says so in words beside it.
 */
export function DeckPreviewList({ entries }: { entries: DeckPreviewEntry[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-[var(--radius-control)] border border-border">
      {entries.map((entry) => (
        <li
          key={entry.cardNumber}
          className="flex items-center gap-3 bg-elevated px-3 py-2"
        >
          <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded-[4px] border border-border bg-canvas">
            {isRenderableImageUrl(entry.imageUrl) && (
              <Image
                src={entry.imageUrl}
                alt=""
                fill
                sizes="40px"
                className="object-cover"
              />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className={`truncate text-sm font-medium ${
                entry.name ? "text-text-primary" : "text-danger"
              }`}
            >
              {entry.name ?? "Not in the catalogue yet"}
            </span>
            <span className="text-xs text-text-muted">{entry.cardNumber}</span>
          </span>
          <span className="shrink-0 text-sm font-semibold text-text-secondary tabular-nums">
            ×{entry.quantity}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SaveButton({ count, loading }: { count: number; loading: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending || loading || count === 0}
      className="w-fit"
    >
      {pending || loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <ClipboardList className="size-4" aria-hidden="true" />
      )}
      {pending
        ? "Saving…"
        : loading
          ? "Loading your cards…"
          : count === 0
            ? "Paste a list first"
            : `These are right, save ${count}`}
    </Button>
  );
}
