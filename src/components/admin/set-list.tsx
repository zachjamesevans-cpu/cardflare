"use client";

import { useState } from "react";
import { SearchX } from "lucide-react";

import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/controls";
import type { SetCoverage } from "@/lib/cards/health";
import { GAME_SLUGS, gameLabel } from "@/lib/players/games-catalog";

/**
 * The games in the order the catalogue lists them, One Piece first because
 * it is the catalogue the sync builds. A game the list does not know yet
 * still gets a table, after the known ones.
 */
export function gameOrder(sets: SetCoverage[]): string[] {
  const known = GAME_SLUGS.filter((slug) => sets.some((set) => set.game === slug));
  const unknown = [...new Set(sets.map((set) => set.game))]
    .filter((game) => !(GAME_SLUGS as string[]).includes(game))
    .sort();
  return [...known, ...unknown];
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
              <th scope="col" className="px-4 py-2 font-medium">
                Set
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                Cards
              </th>
            </tr>
          </thead>
          <tbody>
            {sets.map((set) => (
              <tr
                key={`${set.game}:${set.setCode}`}
                className="border-b border-border last:border-b-0"
              >
                <td className="px-4 py-2 font-mono whitespace-nowrap text-text-secondary">
                  {set.setCode}
                </td>
                <td className="px-4 py-2 text-text-secondary">{set.setName ?? "-"}</td>
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
 * on a round trip. One table per game, in the catalogue's order, so a
 * Magic set is never mistaken for a One Piece one by the shape of its
 * code; the database says which game each set belongs to.
 */
export function SetList({ sets }: { sets: SetCoverage[] }) {
  const [query, setQuery] = useState("");

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? sets.filter(
        (set) =>
          set.setCode.toLowerCase().includes(needle) ||
          (set.setName ?? "").toLowerCase().includes(needle),
      )
    : sets;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="set-filter" className="sr-only">
          Filter by set code or name
        </label>
        <TextInput
          id="set-filter"
          type="search"
          placeholder="Filter by set code or name, like OP-07"
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
          <p className="text-text-secondary">No set code or name contains that.</p>
        </Card>
      ) : (
        gameOrder(shown).map((game) => (
          <SetTable
            key={game}
            title={gameLabel(game)}
            sets={shown.filter((set) => set.game === game)}
          />
        ))
      )}
    </div>
  );
}
