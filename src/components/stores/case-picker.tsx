"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";

import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { CASE_IDLE, CASE_SIZE, type CasePick } from "@/lib/stores/case-schema";
import { saveCaseAction, searchCaseSinglesAction } from "@/lib/stores/case-actions";

/**
 * The six slots and the search that fills them.
 *
 * The search runs over the store's OWN singles, so a card that is not
 * in the case cannot be offered; the server checks again on save. A
 * result lands in the first empty slot; a slot's X empties it. Save
 * posts the whole case as six `cardIds` fields, in order.
 */
export function CasePicker({
  storeId,
  initial,
}: {
  storeId: string;
  initial: CasePick[];
}) {
  const [picks, setPicks] = useState<CasePick[]>(initial.slice(0, CASE_SIZE));
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<CasePick[] | null>(null);
  const [state, formAction, pending] = useActionState(saveCaseAction, CASE_IDLE);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const search = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setFound(null);
      return;
    }
    const ticket = ++latest.current;
    timer.current = setTimeout(async () => {
      const results = await searchCaseSinglesAction(storeId, trimmed);
      if (ticket === latest.current) setFound(results);
    }, 250);
  };

  const full = picks.length >= CASE_SIZE;
  const add = (pick: CasePick) => {
    if (full || picks.some((p) => p.cardId === pick.cardId)) return;
    setPicks([...picks, pick]);
  };
  const remove = (cardId: string) => setPicks(picks.filter((p) => p.cardId !== cardId));

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="storeId" value={storeId} />
      {picks.map((pick) => (
        <input key={pick.cardId} type="hidden" name="cardIds" value={pick.cardId} />
      ))}

      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {Array.from({ length: CASE_SIZE }, (_, index) => {
          const pick = picks[index];
          return (
            <li key={pick?.cardId ?? `empty-${index}`} className="flex flex-col gap-1">
              <div className="relative aspect-[63/88] overflow-hidden rounded-[6px] border border-border bg-elevated">
                {pick?.imageUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={pick.imageUrl}
                    alt=""
                    className="size-full object-contain"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-xs text-text-muted">
                    {pick ? pick.cardNumber : `Slot ${index + 1}`}
                  </span>
                )}
                {pick && (
                  <button
                    type="button"
                    onClick={() => remove(pick.cardId)}
                    aria-label={`Take ${pick.cardName} out of the case`}
                    className="absolute top-1 right-1 rounded-full bg-surface/90 p-1 text-text-secondary hover:text-text-primary"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
              {pick && (
                <p
                  className="truncate text-xs text-text-secondary"
                  title={pick.cardName}
                >
                  {pick.cardName}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">
          {full
            ? "The case is full. Take one out to add another."
            : "Add from your singles"}
        </span>
        <span className="flex items-center gap-2 rounded-[var(--radius-control)] border border-border bg-canvas px-3 py-2">
          <Search className="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => search(event.target.value)}
            disabled={full}
            placeholder="Name or number"
            className="min-w-0 flex-1 bg-transparent text-text-primary outline-none placeholder:text-text-muted"
          />
        </span>
      </label>

      {found && (
        <ul className="flex flex-col divide-y divide-border rounded-[var(--radius-control)] border border-border">
          {found.length === 0 && (
            <li className="p-3 text-sm text-text-secondary">
              Nothing in your singles matches that.
            </li>
          )}
          {found.map((pick) => {
            const taken = picks.some((p) => p.cardId === pick.cardId);
            return (
              <li key={pick.cardId} className="flex items-center gap-3 p-2">
                <span className="aspect-[63/88] w-9 shrink-0 overflow-hidden rounded-[4px] border border-border bg-elevated">
                  {pick.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={pick.imageUrl}
                      alt=""
                      className="size-full object-contain"
                    />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold text-text-primary">
                    {pick.cardName}
                  </span>
                  <span className="font-mono text-xs text-text-muted">
                    {pick.cardNumber}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => add(pick)}
                  disabled={taken || full}
                  className={cn(buttonStyles("secondary", "sm"), "shrink-0")}
                >
                  {taken ? "In the case" : "Add"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className={buttonStyles("primary", "md")}
        >
          {pending ? "Saving" : "Save the case"}
        </button>
        {state.message && (
          <p
            role="status"
            className={cn(
              "text-sm",
              state.status === "error" ? "text-danger" : "text-text-secondary",
            )}
          >
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
