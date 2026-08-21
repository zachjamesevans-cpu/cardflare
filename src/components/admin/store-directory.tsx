"use client";

import { useState } from "react";
import Link from "next/link";
import { Flame, SearchX } from "lucide-react";

import { Badge, Card } from "@/components/ui/card";
import { Select, TextInput } from "@/components/ui/controls";
import {
  filterOperators,
  pageOf,
  type OperatorKindFilter,
} from "@/lib/stores/directory";

/** Everything a directory row needs, already serialised by the page. */
export interface DirectoryStore {
  id: string;
  name: string;
  contact_email: string;
  city: string | null;
  region: string | null;
  status: string;
  kind: string;
  memberCount: number;
  invitePending: boolean;
  /** The live room's name, null when nothing is running. */
  liveRoomName: string | null;
  /** Open Flares in the live room; null when no room is live. */
  flares: number | null;
  /** Unclaimed, pending, or claimed — the directory funnel. */
  claimStatus: string;
  /** CardFlare has confirmed who controls the profile. */
  verified: boolean;
  /** The commercial tier, separate from verification. */
  ultra: boolean;
}

const KIND_LABEL: Record<string, string> = {
  lgs: "Game store",
  vendor: "Vendor",
};

/**
 * The operator directory: one list, a kind dropdown, a search box.
 *
 * Filtering happens in the browser because the whole roster is already on
 * the page — an admin looking for "Grand Line" should not wait on a round
 * trip per keystroke. Click a name for its settings, poster and room.
 */
export function StoreDirectory({ stores }: { stores: DirectoryStore[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<OperatorKindFilter>("all");
  const [page, setPage] = useState(1);

  const shown = filterOperators(stores, query, kind);
  /* Clamped inside pageOf, so a filter that shortens the list while
     somebody is on page four shows page one rather than nothing. */
  const current = pageOf(shown, page);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="min-w-0 flex-1">
          <label htmlFor="operator-search" className="sr-only">
            Search stores and vendors
          </label>
          <TextInput
            id="operator-search"
            type="search"
            placeholder="Search by name, email or city…"
            value={query}
            /* Back to page one with the search, in the handler rather
               than an effect: staying on page four of a different result
               set reads as a broken filter. */
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="sm:w-56">
          <label htmlFor="operator-kind" className="sr-only">
            Filter by kind
          </label>
          <Select
            id="operator-kind"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as OperatorKindFilter);
              setPage(1);
            }}
          >
            <option value="all">All operators</option>
            <option value="lgs">Game stores</option>
            <option value="vendor">Card-show vendors</option>
          </Select>
        </div>
      </div>

      <p className="text-sm text-text-muted tabular-nums" role="status">
        {shown.length === stores.length
          ? `${stores.length} ${stores.length === 1 ? "operator" : "operators"}`
          : `${shown.length} of ${stores.length} operators`}
        {current.pages > 1 && ` · page ${current.page} of ${current.pages}`}
      </p>

      {shown.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <SearchX className="size-6 text-text-muted" aria-hidden="true" />
          <p className="text-text-secondary">
            Nobody matches that. Check the spelling, or switch the dropdown back to all
            operators.
          </p>
        </Card>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {current.rows.map((store) => (
              <DirectoryRow key={store.id} store={store} />
            ))}
          </ul>

          {current.pages > 1 && (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setPage((n) => n - 1)}
                disabled={current.page === 1}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-text-muted tabular-nums">
                {current.page} / {current.pages}
              </span>
              <button
                type="button"
                onClick={() => setPage((n) => n + 1)}
                disabled={current.page === current.pages}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DirectoryRow({ store }: { store: DirectoryStore }) {
  const location = [store.city, store.region].filter(Boolean).join(", ");

  return (
    <Card as="li" className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          href={`/admin/stores/${store.id}`}
          className="font-semibold text-text-primary underline-offset-4 hover:underline"
        >
          {store.name}
        </Link>
        <p className="truncate text-sm text-text-muted">
          {/* An unclaimed listing has no contact address yet, and saying
              so beats printing an empty gap. */}
          {store.contact_email || "No email yet"}
          {location && ` · ${location}`}
        </p>
      </div>

      {/* Wraps rather than shrink-0: the live badge carries a room name, and
          on a phone that plus the status badges cannot share one line. */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{KIND_LABEL[store.kind] ?? store.kind}</Badge>
        {store.claimStatus === "unclaimed" && <Badge tone="neutral">Unclaimed</Badge>}
        {store.verified && <Badge>Verified</Badge>}
        {store.ultra && <Badge tone="neutral">Ultra</Badge>}
        {store.liveRoomName && (
          <Badge>
            <span className="size-1.5 rounded-full bg-accent" />
            Live · {store.liveRoomName}
          </Badge>
        )}
        {store.flares !== null && (
          <Badge tone="neutral">
            <Flame className="size-3.5" aria-hidden="true" />
            {store.flares} {store.flares === 1 ? "Flare" : "Flares"} out
          </Badge>
        )}
        {store.invitePending ? (
          <Badge tone="neutral">Invite pending</Badge>
        ) : (
          <Badge tone="neutral">
            {store.memberCount} {store.memberCount === 1 ? "member" : "members"}
          </Badge>
        )}
        <Badge tone="neutral">{store.status}</Badge>
      </div>
    </Card>
  );
}
