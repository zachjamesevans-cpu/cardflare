"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, Search } from "lucide-react";

import { BringingPicker } from "@/components/nights/bringing-picker";
import { buttonStyles } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { GOING, YOURE_GOING } from "@/lib/events/going-copy";
import { nightBinderStateAction } from "@/lib/events/night-binder-actions";
import type { NightBinderState } from "@/lib/events/night-binders";
import {
  planVisitAction,
  storeDaysAction,
  storePickerAction,
} from "@/lib/events/store-day-actions";
import {
  CLOSED_THAT_DAY,
  dayRoomLine,
  goingToStoreLine,
  PICK_A_STORE,
  PLAN_REFUSALS,
  SEARCH_STORES,
  STORES_NEAR_YOU,
  NO_STORES_FOUND,
  STORES_YOU_FOLLOW,
  WHICH_DAY,
} from "@/lib/events/store-day-rules";
import type { PickerStore, StoreDays, StorePicker } from "@/lib/events/store-days";
import { searchStoresAction } from "@/lib/stores/search-actions";

/**
 * Plan a visit: a store, then a day, then Going.
 *
 * The founder (2026-10-09): "I miss the simplicity of just getting into
 * a room." The store is the room and the day is the time, so this is
 * two steps and one tap. Step one is Pick a store: a search field over
 * the stores you follow and the ones near you. Step two is the store's
 * name over seven day chips, today first, with the room for the chosen
 * day under them (a night the store posted, or the day room somebody
 * already opened) and one Going button. Going lands you in that room,
 * opening the day room if you are the first.
 *
 * After the tap it says where you are going, offers the binders you are
 * bringing on exactly the rule the Going chip uses, and opens the room.
 * Signed out, Going is the door to sign in, as it is everywhere else.
 *
 * Portalled to the body, as the binder picker is: the starter card and
 * the store page that open it are not places a dialog can sit. The
 * app's plan-visit-sheet.tsx is the same sheet with the same words.
 */
export function PlanVisitSheet({
  open,
  onClose,
  signedIn,
  storeId = null,
}: {
  open: boolean;
  onClose: () => void;
  /** A signed-in account can say Going; a guest gets the sign-in door. */
  signedIn: boolean;
  /** Open straight at the day step for this store, from its own page. */
  storeId?: string | null;
}) {
  const router = useRouter();
  /* The binder offer, once the sheet has closed behind it. */
  const [bringing, setBringing] = useState<{
    eventId: string;
    code: string | null;
    next: string;
    state: NightBinderState;
  } | null>(null);

  const planned = (result: {
    eventId: string;
    code: string | null;
    next: string;
    state: NightBinderState | null;
  }) => {
    onClose();
    if (result.state) {
      setBringing({ ...result, state: result.state });
    } else {
      router.push(result.next);
    }
  };

  return (
    <>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <PlanVisitDialog
            signedIn={signedIn}
            storeId={storeId}
            onClose={onClose}
            onPlanned={planned}
          />,
          document.body,
        )}
      <BringingPicker
        eventId={bringing?.eventId ?? ""}
        code={bringing?.code ?? null}
        open={bringing !== null}
        state={bringing?.state ?? null}
        onClose={() => {
          const next = bringing?.next;
          setBringing(null);
          if (next) router.push(next);
        }}
      />
    </>
  );
}

type Chosen = { storeId: string; name: string };

/** Mounted on opening, so every opening starts from the first step. */
function PlanVisitDialog({
  signedIn,
  storeId,
  onClose,
  onPlanned,
}: {
  signedIn: boolean;
  storeId: string | null;
  onClose: () => void;
  onPlanned: (result: {
    eventId: string;
    code: string | null;
    next: string;
    state: NightBinderState | null;
  }) => void;
}) {
  const [chosen, setChosen] = useState<Chosen | null>(
    storeId ? { storeId, name: "" } : null,
  );
  /* Stable, so the day step reads the store once rather than on every
     render that hands it a new function. */
  const named = useCallback(
    (name: string) => setChosen((current) => current && { ...current, name }),
    [],
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={chosen ? chosen.name || WHICH_DAY : PICK_A_STORE}
    >
      {chosen ? (
        <DayStep
          storeId={chosen.storeId}
          signedIn={signedIn}
          onBack={() => setChosen(null)}
          onNamed={named}
          onPlanned={onPlanned}
        />
      ) : (
        <StoreStep onPick={setChosen} />
      )}
    </Sheet>
  );
}

/* ---- Step one: Pick a store ---------------------------------------- */

/** How long the field waits for the typing to stop before it asks. */
const SEARCH_DEBOUNCE_MS = 250;

function StoreStep({ onPick }: { onPick: (store: Chosen) => void }) {
  const [picker, setPicker] = useState<StorePicker | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerStore[] | null>(null);
  const searching = query.trim().length >= 2;

  useEffect(() => {
    let live = true;
    storePickerAction()
      .then((found) => {
        if (live) setPicker(found);
      })
      .catch(() => {
        if (live) setPicker({ following: [], near: [] });
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!searching) return;
    let live = true;
    const timer = setTimeout(() => {
      searchStoresAction(query)
        .then((found) => {
          if (!live) return;
          setResults(
            found.map((store) => ({
              storeId: store.storeId,
              name: store.name,
              city: store.city,
              miles: null,
            })),
          );
        })
        .catch(() => {
          if (live) setResults([]);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, searching]);

  return (
    <div className="flex flex-col gap-4">
      <label className="relative flex items-center">
        <span className="sr-only">{SEARCH_STORES}</span>
        <Search
          className="pointer-events-none absolute left-3 size-4 text-text-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={SEARCH_STORES}
          autoComplete="off"
          className="h-11 w-full rounded-[var(--radius-control)] border border-border bg-canvas pr-3 pl-9 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-accent focus-visible:outline-none"
        />
      </label>

      {searching ? (
        results === null ? (
          <Loading />
        ) : results.length === 0 ? (
          <p className="text-sm text-text-secondary">{NO_STORES_FOUND}</p>
        ) : (
          <StoreRows stores={results} onPick={onPick} />
        )
      ) : picker === null ? (
        <Loading />
      ) : (
        <>
          {picker.following.length > 0 && (
            <StoreSection title={STORES_YOU_FOLLOW}>
              <StoreRows stores={picker.following} onPick={onPick} />
            </StoreSection>
          )}
          {picker.near.length > 0 && (
            <StoreSection title={STORES_NEAR_YOU}>
              <StoreRows stores={picker.near} onPick={onPick} />
            </StoreSection>
          )}
        </>
      )}
    </div>
  );
}

function StoreSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold tracking-wide text-text-muted uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** "3 mi" when the distance is known, the city otherwise. */
export function storeWhereLine(store: Pick<PickerStore, "miles" | "city">): string {
  return store.miles !== null ? `${store.miles} mi` : (store.city ?? "");
}

function StoreRows({
  stores,
  onPick,
}: {
  stores: PickerStore[];
  onPick: (store: Chosen) => void;
}) {
  return (
    <ul className="flex flex-col">
      {stores.map((store) => (
        <li key={store.storeId}>
          <button
            type="button"
            onClick={() => onPick({ storeId: store.storeId, name: store.name })}
            className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] px-2 py-2.5 text-left transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <span className="min-w-0 truncate text-sm font-semibold text-text-primary">
              {store.name}
            </span>
            <span className="shrink-0 text-xs text-text-muted tabular-nums">
              {storeWhereLine(store)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Loading() {
  return (
    <div role="status" className="flex justify-center py-6">
      <Spinner />
      <span className="sr-only">Loading</span>
    </div>
  );
}

/* ---- Step two: Which day? ------------------------------------------ */

/** How long "You're going to Mox on Friday." stays before the room opens. */
const DONE_PAUSE_MS = 1200;

function DayStep({
  storeId,
  signedIn,
  onBack,
  onNamed,
  onPlanned,
}: {
  storeId: string;
  signedIn: boolean;
  onBack: () => void;
  /** The store's name, once read, for the sheet's title. */
  onNamed: (name: string) => void;
  onPlanned: (result: {
    eventId: string;
    code: string | null;
    next: string;
    state: NightBinderState | null;
  }) => void;
}) {
  const [days, setDays] = useState<StoreDays | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    storeDaysAction(storeId)
      .then((found) => {
        if (!live) return;
        if (!found) {
          setError(PLAN_REFUSALS["not-found"]);
          return;
        }
        setDays(found);
        onNamed(found.storeName);
        setDate(found.days.find((day) => !day.closed)?.date ?? null);
      })
      .catch(() => {
        if (live) setError(PLAN_REFUSALS.unavailable);
      });
    return () => {
      live = false;
    };
  }, [storeId, onNamed]);

  const day = days?.days.find((entry) => entry.date === date) ?? null;
  const room = day?.room ?? null;
  /* A store with open trading off has only the nights it posted. */
  const noRoom = days !== null && !days.openTrading && room === null;

  const going = () => {
    if (!days || !day || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await planVisitAction(days.storeId, day.date);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setDone(goingToStoreLine(days.storeName, day.date, days.today));
        /* Long enough to read where you are going before the room opens. */
        const shown = new Promise((resolve) => setTimeout(resolve, DONE_PAUSE_MS));
        const next = result.code ? `/e/${result.code}` : `/s/${days.storeId}`;
        /* The binders, on the Going chip's rule: an editable night, a
           binder to pick, and nothing picked yet. */
        let state: NightBinderState | null = null;
        try {
          const binders = await nightBinderStateAction(result.eventId);
          if (
            binders.ok &&
            binders.state.editable &&
            binders.state.binders.length > 0 &&
            binders.state.selectedCount === 0
          ) {
            state = binders.state;
          }
        } catch {
          /* The offer is a convenience; the room's own row still has it. */
        }
        await shown;
        onPlanned({ eventId: result.eventId, code: result.code, next, state });
      } catch {
        setError(PLAN_REFUSALS.unavailable);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        {/* Back to the first step, named for where it goes. */}
        <button
          type="button"
          onClick={onBack}
          aria-label={PICK_A_STORE}
          title={PICK_A_STORE}
          className="-ml-1 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-secondary hover:bg-elevated hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        <h3 className="text-sm font-semibold text-text-primary">{WHICH_DAY}</h3>
      </div>

      {!days ? (
        error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : (
          <Loading />
        )
      ) : (
        <>
          {/* Seven chips in a row, today first; the row scrolls inside the
              sheet on a narrow phone rather than wrapping a week in two. */}
          <ul
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
            aria-label={WHICH_DAY}
          >
            {days.days.map((entry) => {
              const on = entry.date === date;
              return (
                <li key={entry.date} className="w-[4.5rem] shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setDate(entry.date);
                      setError(null);
                    }}
                    disabled={entry.closed || pending}
                    aria-pressed={on}
                    className={cn(
                      "flex h-14 w-full cursor-pointer flex-col items-center justify-center rounded-[var(--radius-control)] border px-1 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none disabled:pointer-events-none",
                      on
                        ? "border-accent bg-accent/10 text-text-primary"
                        : "border-border bg-elevated text-text-secondary hover:border-border-strong",
                      entry.closed && "opacity-55",
                    )}
                  >
                    <span className="truncate">{entry.label}</span>
                    {entry.closed && (
                      <span className="text-[10px] font-medium text-text-muted">
                        {CLOSED_THAT_DAY}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {room && (
            <p className="text-sm text-text-secondary">
              {dayRoomLine(room.name, room.goingCount)}
            </p>
          )}
          {noRoom && (
            <p className="text-sm text-text-secondary">
              {PLAN_REFUSALS["no-open-trading"]}
            </p>
          )}

          {!signedIn ? (
            <Link
              href={`/login?next=${encodeURIComponent("/nights")}`}
              className={cn(buttonStyles("primary", "md"), "w-full")}
            >
              {GOING}
            </Link>
          ) : (
            <button
              type="button"
              onClick={going}
              disabled={!day || pending || noRoom || Boolean(room?.youGoing) || !!done}
              className={cn(buttonStyles("primary", "md"), "w-full")}
            >
              {pending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              {room?.youGoing ? YOURE_GOING : GOING}
            </button>
          )}

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {done && (
            <p role="status" className="text-sm font-semibold text-accent">
              {done}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * A button that opens the sheet: Plan a visit on the Rooms page and a
 * store's page, Find your store on the Feed's starter card.
 */
export function PlanVisitButton({
  label,
  signedIn,
  storeId = null,
  variant = "primary",
  size = "sm",
  className,
}: {
  label: string;
  signedIn: boolean;
  /** Open at the day step for this store. */
  storeId?: string | null;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(buttonStyles(variant, size), className)}
      >
        {label}
      </button>
      <PlanVisitSheet
        open={open}
        onClose={() => setOpen(false)}
        signedIn={signedIn}
        storeId={storeId}
      />
    </>
  );
}
