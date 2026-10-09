"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

import { BinderCover } from "@/components/binder/binder-cover";
import { binderCardsLine } from "@/components/binder/binder-list";
import { buttonStyles } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import {
  nightBinderStateAction,
  saveNightBindersAction,
} from "@/lib/events/night-binder-actions";
import {
  BRINGING_DONE,
  BRINGING_NO_BINDERS,
  BRINGING_PICKER_HINT,
  BRINGING_PICKER_TITLE,
  BRINGING_PROMISE,
  BRINGING_REFUSALS,
  BRINGING_SKIP,
  consentNeededLine,
  EVENT_ONLY_LABEL,
  eventOnlyHint,
  PRIVATE_TAG,
} from "@/lib/events/night-binder-rules";
import type { NightBinderState } from "@/lib/events/night-binders";

/** The way to the profile's binders when there are none to pick. */
export const YOUR_BINDERS_LINK = "Your binders";
export const CLOSE = "Close";

/**
 * Which binders are you bringing: the sheet a player picks their bag in.
 *
 * The founder (2026-10-09): "Add an attractive binder selection
 * interface within the existing Night RSVP experience. Show the user's
 * existing binders using their current cover artwork, names, and card
 * counts. Allow multiple binder selection with clear visual selection
 * states." So the grid is the binders as the profile draws them, the
 * cover first, and a tap rings the cover in the accent and pins a check
 * to its corner.
 *
 * A private binder never goes out by accident. Picking one opens a row
 * under the grid with its own switch, Show to this Night only, off to
 * begin with; while any picked private binder has it off, Done stays
 * disabled and the row says why. Nothing is shown that the owner did
 * not turn on, and nothing they picked is quietly left behind.
 *
 * Portalled to the body: the Going chip that opens it sits inside a
 * paragraph, and a dialog cannot. The app's bringing-sheet.tsx is the
 * same sheet with the same words.
 */
export function BringingPicker({
  eventId,
  code,
  open,
  state,
  onClose,
  onSaved,
}: {
  eventId: string;
  /** The room's code, so its pages repaint; null where it is not known. */
  code: string | null;
  open: boolean;
  /** What the server last said, or null to read it on opening. */
  state: NightBinderState | null;
  onClose: () => void;
  onSaved?: (state: NightBinderState) => void;
}) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <PickerSheet
      eventId={eventId}
      code={code}
      state={state}
      onClose={onClose}
      onSaved={onSaved}
    />,
    document.body,
  );
}

type Choice = { selected: boolean; eventOnly: boolean };

function choicesOf(state: NightBinderState): Record<string, Choice> {
  return Object.fromEntries(
    state.binders.map((binder) => [
      binder.id,
      { selected: binder.selected, eventOnly: binder.eventOnly },
    ]),
  );
}

/** Mounted on opening, so every opening starts from the server's picks. */
function PickerSheet({
  eventId,
  code,
  state,
  onClose,
  onSaved,
}: {
  eventId: string;
  code: string | null;
  state: NightBinderState | null;
  onClose: () => void;
  onSaved?: (state: NightBinderState) => void;
}) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(state);
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    state ? choicesOf(state) : {},
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (loaded) return;
    let live = true;
    nightBinderStateAction(eventId)
      .then((result) => {
        if (!live) return;
        if (result.ok) {
          setLoaded(result.state);
          setChoices(choicesOf(result.state));
        } else {
          setError(result.message);
        }
      })
      .catch(() => {
        if (live) setError(BRINGING_REFUSALS.unavailable);
      });
    return () => {
      live = false;
    };
  }, [eventId, loaded]);

  const binders = loaded?.binders ?? [];
  const picked = binders.filter((binder) => choices[binder.id]?.selected);
  const privatePicked = picked.filter((binder) => !binder.forTrade);
  const waiting = privatePicked.filter((binder) => !choices[binder.id]?.eventOnly);

  /* The private binder just picked: its switch can sit below the fold,
     so it is brought into view once it is drawn. */
  const [asking, setAsking] = useState<string | null>(null);
  useEffect(() => {
    if (!asking) return;
    document
      .getElementById(`event-only-row-${asking}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [asking]);

  const toggle = (binderId: string) => {
    setError(null);
    const binder = binders.find((row) => row.id === binderId);
    if (binder && !binder.forTrade && !choices[binderId]?.selected) setAsking(binderId);
    setChoices((current) => {
      const was = current[binderId] ?? { selected: false, eventOnly: false };
      /* Unpicking forgets the switch, so picking again asks again. */
      return {
        ...current,
        [binderId]: was.selected
          ? { selected: false, eventOnly: false }
          : { selected: true, eventOnly: was.eventOnly },
      };
    });
  };

  const setEventOnly = (binderId: string, on: boolean) => {
    setError(null);
    setChoices((current) => ({
      ...current,
      [binderId]: { selected: true, eventOnly: on },
    }));
  };

  const save = (picks: { binderId: string; eventOnly: boolean }[]) => {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveNightBindersAction(eventId, picks, code);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        onSaved?.(result.state);
        onClose();
        router.refresh();
      } catch {
        setError(BRINGING_REFUSALS.unavailable);
      }
    });
  };

  const done = () =>
    save(
      picked.map((binder) => ({
        binderId: binder.id,
        eventOnly: !binder.forTrade && (choices[binder.id]?.eventOnly ?? false),
      })),
    );

  const empty = loaded !== null && binders.length === 0;

  const footer = !loaded ? null : empty ? (
    <button
      type="button"
      onClick={onClose}
      className={cn(buttonStyles("secondary", "md"), "w-full")}
    >
      {CLOSE}
    </button>
  ) : (
    <div className="flex flex-col gap-2">
      {waiting.length > 0 && (
        <p className="text-xs text-warning">
          {consentNeededLine(waiting.map((binder) => binder.name))}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => save([])}
          disabled={pending}
          className={cn(buttonStyles("secondary", "md"), "flex-1")}
        >
          {BRINGING_SKIP}
        </button>
        <button
          type="button"
          onClick={done}
          disabled={pending || waiting.length > 0}
          aria-describedby={
            waiting.length > 0
              ? waiting.map((binder) => `event-only-${binder.id}`).join(" ")
              : undefined
          }
          className={cn(buttonStyles("primary", "md"), "flex-1")}
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {BRINGING_DONE}
        </button>
      </div>
      <p className="text-xs text-text-muted">{BRINGING_PROMISE}</p>
    </div>
  );

  return (
    <Sheet open onClose={onClose} title={BRINGING_PICKER_TITLE} footer={footer}>
      <div className="flex flex-col gap-4">
        {!loaded ? (
          error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : (
            <div role="status" className="flex justify-center py-8">
              <Spinner />
              <span className="sr-only">Loading</span>
            </div>
          )
        ) : empty ? (
          <>
            <p className="text-sm text-text-secondary">{BRINGING_NO_BINDERS}</p>
            <Link
              href="/profile/binders"
              onClick={onClose}
              className={cn(buttonStyles("primary", "sm"), "self-start")}
            >
              {YOUR_BINDERS_LINK}
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm text-text-secondary">{BRINGING_PICKER_HINT}</p>

            <ul className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-x-3 gap-y-4">
              {binders.map((binder) => {
                const on = choices[binder.id]?.selected ?? false;
                const cards = binderCardsLine(binder.count);
                return (
                  <li key={binder.id} className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => toggle(binder.id)}
                      aria-pressed={on}
                      aria-label={[
                        binder.name,
                        cards,
                        binder.forTrade ? null : PRIVATE_TAG,
                        on ? "selected" : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                      className="flex w-[108px] cursor-pointer flex-col items-center gap-1 rounded-[var(--radius-control)] p-1 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    >
                      <span className="relative mb-1">
                        <BinderCover
                          cover={binder.cover}
                          label={binder.name}
                          size="sm"
                          className={cn(
                            "transition-shadow duration-[var(--duration-base)]",
                            on &&
                              "ring-2 ring-accent ring-offset-2 ring-offset-surface",
                          )}
                        />
                        {on && (
                          <span
                            aria-hidden="true"
                            className="absolute -top-2 -right-2 inline-flex size-5 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-[var(--shadow-card)]"
                          >
                            <Check className="size-3.5" strokeWidth={3} />
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          "line-clamp-2 w-full text-center text-sm leading-tight font-semibold break-words",
                          on ? "text-text-primary" : "text-text-secondary",
                        )}
                      >
                        {binder.name}
                      </span>
                      <span className="text-xs text-text-muted tabular-nums">
                        {cards}
                      </span>
                      {!binder.forTrade && (
                        <span className="rounded-full border border-border bg-elevated px-2 py-0.5 text-[10px] font-semibold text-text-secondary">
                          {PRIVATE_TAG}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {privatePicked.map((binder) => {
              const on = choices[binder.id]?.eventOnly ?? false;
              return (
                <label
                  key={binder.id}
                  id={`event-only-row-${binder.id}`}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] border bg-elevated p-3",
                    on ? "border-border" : "border-warning/60",
                  )}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-semibold text-text-primary">
                      {EVENT_ONLY_LABEL}
                    </span>
                    <span
                      id={`event-only-${binder.id}`}
                      className={cn("text-xs", on ? "text-text-muted" : "text-warning")}
                    >
                      {eventOnlyHint(binder.name)}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={on}
                    aria-checked={on}
                    onChange={(event) => setEventOnly(binder.id, event.target.checked)}
                    className="size-5 shrink-0 cursor-pointer rounded-[6px] border border-border-strong bg-canvas accent-accent"
                  />
                </label>
              );
            })}

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
