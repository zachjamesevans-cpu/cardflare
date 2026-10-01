"use client";

import { useState } from "react";
import { SearchX } from "lucide-react";

import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/controls";
import type { SetCoverage } from "@/lib/cards/health";

/** Set codes Bandai prints, and the promo bucket. Everything else is another game. */
const ONE_PIECE = /^(OP|ST|EB|PRB)-?\d|^P$/i;

export function isOnePieceSet(code: string): boolean {
  return ONE_PIECE.test(code);
}

function SetTable({ title, sets }: { title: string; sets: SetCoverage[] }) {
  if (sets.length === 0) return null;

  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h3 className="text-lg font-bold text-text-primary">
        {title}{" "}
        <span className="text-sm font-normal text-text-muted tabular-nums">
          {sets.length} {sets.length === 1 ? "set" : "sets"}
        </span>
      </h3>
      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-text-muted">
              <th scope="col" className="px-4 py-2 font-medium">
                Set code
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Cards
              </th>
            </tr>
          </thead>
          <tbody>
            {sets.map((set) => (
              <tr key={set.setCode} className="border-b border-border last:border-b-0">
                <td className="px-4 py-2 font-mono text-text-secondary">
                  {set.setCode}
                </td>
                <td className="px-4 py-2 text-right text-text-muted tabular-nums">
                  {set.cards.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

/**
 * Every set in the catalog, with a box to find one.
 *
 * Filtered in the browser: the whole list is already on the page, and
 * an admin looking for OP-07 among five hundred codes should not wait
 * on a round trip. One Piece first because it is the catalog the sync
 * builds; everything imported by hand or from another provider sits
 * under its own heading in the same shape.
 */
export function SetList({ sets }: { sets: SetCoverage[] }) {
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? sets.filter((set) => set.setCode.toLowerCase().includes(needle))
    : sets;
  const onePiece = shown.filter((set) => isOnePieceSet(set.setCode));
  const others = shown.filter((set) => !isOnePieceSet(set.setCode));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="set-filter" className="sr-only">
          Filter by set code
        </label>
        <TextInput
          id="set-filter"
          type="search"
          placeholder="Filter by set code, like OP-07"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
        <p className="text-sm text-text-muted tabular-nums" role="status">
          {shown.length === sets.length
            ? `${sets.length} ${sets.length === 1 ? "set" : "sets"}`
            : `${shown.length} of ${sets.length} sets`}
        </p>
      </div>

      {shown.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <SearchX className="size-6 text-text-muted" aria-hidden="true" />
          <p className="text-text-secondary">No set code contains that.</p>
        </Card>
      ) : (
        <>
          <SetTable title="One Piece" sets={onePiece} />
          <SetTable title="Other games" sets={others} />
        </>
      )}
    </div>
  );
}
