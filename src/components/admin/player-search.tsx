"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { TextInput } from "@/components/ui/controls";

/**
 * Finding one player among however many there eventually are.
 *
 * The query lives in the URL rather than in component state, so a search
 * survives a grant: the Server Action revalidates the page, the page
 * re-renders from the same query, and the admin is still looking at the
 * person they were looking at. Holding it in state would drop them back
 * to the full list every time they handed out anything.
 *
 * Debounced, and `replace` rather than `push` so typing eight characters
 * does not put eight entries in the back button.
 */
export function PlayerSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = useState(initial);

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (query === current) return;

    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (query.trim()) next.set("q", query.trim());
      else next.delete("q");

      router.replace(next.size > 0 ? `/admin/players?${next}` : "/admin/players");
    }, 250);

    return () => clearTimeout(timer);
  }, [query, params, router]);

  return (
    <label className="relative flex items-center">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 size-4 text-text-muted"
      />
      <span className="sr-only">Search players by name</span>
      <TextInput
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search players by name"
        autoComplete="off"
        className="pl-9"
      />
    </label>
  );
}
