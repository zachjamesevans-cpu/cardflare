"use client";

import { useRouter } from "next/navigation";

import type { Area } from "@/lib/auth/areas";

/**
 * The header dropdown that moves one account between its consoles.
 *
 * A plain select that navigates: the options are the areas the server said
 * this account genuinely has, so choosing one is just going there — every
 * page re-checks authorisation on arrival as it always did.
 */
export function AreaSwitcher({ areas, current }: { areas: Area[]; current: string }) {
  const router = useRouter();

  /*
   * A page that is none of the options must not look like the first
   * one. A controlled select with a value that matches nothing shows
   * its first option, "Admin console", and choosing that option then
   * changes nothing, so the founder sat on a store's overview with a
   * switcher that said admin and did not go there. An unlisted page
   * gets a placeholder instead, and every real choice is a change.
   */
  const listed = areas.some((area) => area.href === current);

  return (
    /*
     * min-w-0 so the control shrinks on a phone instead of shoving the
     * logo and sign-out off the header; a long store name clips inside
     * the select rather than breaking the row.
     */
    <div className="relative min-w-0">
      <label htmlFor="area-switcher" className="sr-only">
        Switch area
      </label>
      <select
        id="area-switcher"
        value={listed ? current : ""}
        onChange={(event) => {
          if (event.target.value) router.push(event.target.value);
        }}
        className="w-full appearance-none rounded-[var(--radius-control)] border border-border bg-canvas py-1.5 pr-8 pl-3 text-sm font-medium text-text-secondary transition-colors duration-[var(--duration-base)] hover:text-text-primary"
      >
        {!listed && (
          <option value="" disabled>
            Switch area
          </option>
        )}
        {areas.map((area) => (
          <option key={area.href} value={area.href}>
            {area.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-text-muted"
      >
        <path
          d="m5 7.5 5 5 5-5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
