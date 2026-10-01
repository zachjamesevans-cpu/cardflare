"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Select } from "@/components/ui/controls";

const PLAYER_SORTS = ["joined", "active", "name"] as const;
export type PlayerSort = (typeof PLAYER_SORTS)[number];

const LABELS: Record<PlayerSort, string> = {
  joined: "Newest",
  active: "Most recent in a room",
  name: "Name",
};

/**
 * The order of the player list, kept in the URL beside the search so a
 * grant's revalidation brings the admin back to the same view.
 */
export function PlayerSortControl({ current }: { current: PlayerSort }) {
  const router = useRouter();
  const params = useSearchParams();

  return (
    <label className="flex items-center gap-2 text-sm text-text-secondary">
      <span className="shrink-0">Sort by</span>
      <Select
        value={current}
        aria-label="Sort players"
        className="w-auto py-2 text-sm"
        onChange={(event) => {
          const next = new URLSearchParams(params.toString());
          const sort = event.target.value;
          if (sort === "joined") next.delete("sort");
          else next.set("sort", sort);
          router.replace(next.size > 0 ? `/admin/players?${next}` : "/admin/players");
        }}
      >
        {PLAYER_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {LABELS[sort]}
          </option>
        ))}
      </Select>
    </label>
  );
}
