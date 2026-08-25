import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";

import { storedAccessToken } from "./api";
import {
  cachedPlayerId,
  readCache,
  writeCache,
  type CacheKind,
} from "./cache";

/**
 * A screen's data: last visit's copy immediately, this visit's shortly.
 *
 * The pattern every screen in the app now uses, and the answer to the
 * founder's complaint that opening cardflare means watching it assemble
 * itself. Paint what we had, fetch what is true, swap. Instagram and
 * TikTok feel instant for exactly this reason and no other.
 *
 * WHAT IT GUARANTEES:
 *
 * - The cached value never replaces something newer. The fetch and the
 *   cache read race on purpose, and if the network wins the cache is
 *   dropped on the floor rather than painted over the top of it.
 * - A failed fetch keeps what is on screen. Blanking a screen somebody
 *   can see because the network blinked is the pop-in complaint in its
 *   worst form: it takes content away rather than adding it late.
 * - `stale` is exposed so a screen can say so if it wants to. Most do
 *   not need to — the real answer lands in under a second — but a
 *   screen showing a number somebody might act on can.
 *
 * WHAT IT DOES NOT DO: decide anything. Nothing writes, navigates or
 * spends based on a cached value. See cache.ts.
 */
export interface Cached<T> {
  data: T | null;
  /** True while showing a cached value with a fetch still in flight. */
  stale: boolean;
  /** True when there is nothing to show at all and a fetch is running. */
  loading: boolean;
  failed: boolean;
  /** Fetch again, for pull-to-refresh. Never paints from cache. */
  refresh: () => Promise<void>;
}

export function useCached<T>(
  kind: CacheKind,
  fetcher: () => Promise<T>,
  {
    /** Distinguishes two of the same kind, e.g. one store from another. */
    suffix,
    /** Skip entirely — a screen that needs a signed-in account. */
    enabled = true,
  }: { suffix?: string; enabled?: boolean } = {},
): Cached<T> {
  const [data, setData] = useState<T | null>(null);
  const [stale, setStale] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  /* Read inside callbacks that must not re-create on every render. */
  const dataRef = useRef<T | null>(null);
  const fetcherRef = useRef(fetcher);
  const alive = useRef(true);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const fetchNow = useCallback(async () => {
    try {
      const fresh = await fetcherRef.current();
      if (!alive.current) return;

      setData(fresh);
      setStale(false);
      setFailed(false);
      setLoading(false);

      const id = await cachedPlayerId();
      if (id) void writeCache(kind, id, fresh, suffix);
    } catch {
      if (!alive.current) return;

      /* Keep whatever is showing. Only a screen with nothing on it
         reports a failure, because only that screen has nothing else
         to say. */
      setStale(false);
      setLoading(false);
      if (dataRef.current === null) setFailed(true);
    }
  }, [kind, suffix]);

  /* The cached paint: once, on first mount, and only if it wins. */
  useEffect(() => {
    if (!enabled) return;

    let live = true;

    void (async () => {
      if (!(await storedAccessToken())) return;

      const id = await cachedPlayerId();
      if (!id || !live) return;

      const cached = await readCache<T>(kind, id, suffix);
      if (!cached || !live) return;

      /* The network got there first. Painting now would replace fresh
         content with old, which is worse than never painting at all. */
      if (dataRef.current !== null) return;

      setData(cached);
      setStale(true);
      setLoading(false);
    })();

    return () => {
      live = false;
    };
  }, [enabled, kind, suffix]);

  /* And the real load, every time the screen is looked at. */
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      void fetchNow();
    }, [enabled, fetchNow]),
  );

  return { data, stale, loading, failed, refresh: fetchNow };
}
