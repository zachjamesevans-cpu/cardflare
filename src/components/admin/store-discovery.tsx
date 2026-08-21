"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, MapPin, Search, ShieldCheck } from "lucide-react";

import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import {
  discoverStoresAction,
  importStoresAction,
} from "@/lib/stores/discovery-actions";
import { pageOf } from "@/lib/stores/directory";
import {
  DISCOVER_IDLE,
  IMPORT_IDLE,
  RADIUS_CHOICES,
  type DiscoverState,
  type ImportState,
} from "@/lib/stores/discovery-schema";

/**
 * Finding shops, judging them, and importing only what an admin picked.
 *
 * The two gates the founder asked for are structural rather than
 * cosmetic. "Select all likely" only SELECTS - it never imports - and
 * importing is a separate button behind a confirmation that says how many
 * rows are about to exist. Nothing here publishes: an import creates
 * drafts, and publishing is a later decision.
 *
 * The verdict is a recommendation with its reasons printed beside it, so
 * the admin is reading an argument rather than trusting a badge.
 */
/* The Badge only knows two tones, and a verdict is a recommendation
   rather than a status: accent for the one worth acting on, neutral for
   the two that need a human to look. */
const VERDICT_TONE = {
  likely: "accent",
  possible: "neutral",
  unlikely: "neutral",
} as const;

const VERDICT_LABEL = {
  likely: "Likely LGS",
  possible: "Possible LGS",
  unlikely: "Unlikely LGS",
} as const;

function SearchButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Search className="size-4" aria-hidden="true" />
      )}
      {pending ? "Searching…" : "Find stores"}
    </Button>
  );
}

function ImportButton({ count }: { count: number }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || count === 0}>
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending ? "Importing…" : `Import ${count} selected`}
    </Button>
  );
}

export function StoreDiscovery() {
  const [found, discoverAction] = useActionState<DiscoverState, FormData>(
    discoverStoresAction,
    DISCOVER_IDLE,
  );
  const [imported, importAction] = useActionState<ImportState, FormData>(
    importStoresAction,
    IMPORT_IDLE,
  );
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [page, setPage] = useState(1);

  const selectable = useMemo(
    () => found.candidates.filter((c) => c.duplicate !== "already-in-cardflare"),
    [found.candidates],
  );

  const selected = useMemo(
    () => selectable.filter((c) => picked.has(c.providerPlaceId)),
    [selectable, picked],
  );

  /* Ten to a page. A search of one metro comes back in the hundreds, and
     a single list with the Import button under it means scrolling past
     every result to act on the first one. Selection is held by id, so it
     survives paging - "select all likely" still means all of them, not
     the ones currently on screen. */
  const shown = pageOf(found.candidates, page, 10);

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-text-primary">
            Discover local game stores
          </h2>
          <p className="text-sm text-text-secondary">
            Searches the approved places provider and shows candidates. Nothing is
            created until you import, and an import makes drafts, not published
            listings.
          </p>
          <p className="text-xs text-text-muted">
            Provider: fixtures (development). No real places have been queried.
          </p>
        </div>

        <form action={discoverAction} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-text-secondary">Location</span>
            <TextInput
              name="area"
              onChange={() => setPage(1)}
              defaultValue={found.area || "Austin, TX"}
              placeholder="Austin, TX"
              aria-label="City or area"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-text-secondary">Radius</span>
            <select
              name="radiusMiles"
              defaultValue={found.radiusMiles}
              className="rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-text-primary"
            >
              {RADIUS_CHOICES.map((miles) => (
                <option key={miles} value={miles}>
                  {miles} miles
                </option>
              ))}
            </select>
          </label>
          <SearchButton />
        </form>

        {found.message && (
          <p
            className={`text-sm ${found.status === "error" ? "text-danger" : "text-text-secondary"}`}
            role="status"
          >
            {found.message}
          </p>
        )}
      </Card>

      {imported.message && (
        <Card className="p-4">
          <p
            className={`text-sm ${imported.status === "error" ? "text-danger" : "text-accent"}`}
            role="status"
          >
            {imported.message}
          </p>
        </Card>
      )}

      {found.candidates.length > 0 && (
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm text-text-secondary">
              {selected.length} of {selectable.length} selected
              {shown.pages > 1 && " · across all pages"}
            </p>
            {/* Selects only. Importing is the separate button below. */}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setPicked(
                  new Set(
                    selectable
                      .filter((c) => c.relevance.verdict === "likely")
                      .map((c) => c.providerPlaceId),
                  ),
                )
              }
            >
              Select all likely LGS
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPicked(new Set())}
            >
              Clear
            </Button>
          </div>

          <form action={importAction} className="flex flex-col gap-3">
            <input
              type="hidden"
              name="selected"
              value={JSON.stringify(selected)}
              readOnly
            />

            {confirming ? (
              <div className="flex flex-col gap-3 rounded-lg border border-border-strong bg-elevated p-4">
                <p className="text-sm text-text-primary">
                  You are about to create {selected.length} unclaimed CardFlare store{" "}
                  {selected.length === 1 ? "listing" : "listings"}. They will be drafts
                  until you publish them.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </Button>
                  <ImportButton count={selected.length} />
                </div>
              </div>
            ) : (
              <Button
                type="button"
                disabled={selected.length === 0}
                onClick={() => setConfirming(true)}
              >
                <ShieldCheck className="size-4" aria-hidden="true" />
                Import selected stores
              </Button>
            )}
          </form>

          <ul className="flex flex-col divide-y divide-border">
            {shown.rows.map((candidate) => {
              const known = candidate.duplicate === "already-in-cardflare";

              return (
                <li key={candidate.providerPlaceId} className="flex gap-3 py-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-accent"
                    checked={picked.has(candidate.providerPlaceId)}
                    disabled={known}
                    onChange={() => toggle(candidate.providerPlaceId)}
                    aria-label={`Select ${candidate.name}`}
                  />

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-text-primary">{candidate.name}</p>
                      <Badge tone={VERDICT_TONE[candidate.relevance.verdict]}>
                        {VERDICT_LABEL[candidate.relevance.verdict]}
                      </Badge>
                      {known && <Badge tone="neutral">Already in CardFlare</Badge>}
                      {candidate.duplicate === "possible-duplicate" && (
                        <Badge tone="neutral">Possible duplicate</Badge>
                      )}
                      {candidate.rejected && (
                        <Badge tone="neutral">Dismissed before</Badge>
                      )}
                    </div>

                    <p className="flex items-center gap-1.5 text-sm text-text-secondary">
                      <MapPin
                        className="size-3.5 shrink-0 text-text-muted"
                        aria-hidden
                      />
                      {[candidate.addressLine, candidate.city, candidate.region]
                        .filter(Boolean)
                        .join(", ") || "No address on record"}
                    </p>

                    {/* The argument, not just the verdict. */}
                    <p className="text-xs text-text-muted">
                      {candidate.relevance.reasons.join(" · ")}
                    </p>

                    <p className="text-xs text-text-muted">
                      Source: {candidate.license ?? "unknown licence"} ·{" "}
                      {candidate.attribution ?? "no attribution given"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          {shown.pages > 1 && (
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={shown.page === 1}
                onClick={() => setPage((n) => n - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-text-muted tabular-nums">
                Page {shown.page} of {shown.pages} · {shown.total} candidates
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={shown.page === shown.pages}
                onClick={() => setPage((n) => n + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
