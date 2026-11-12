"use client";

import { useEffect } from "react";

import { PlayerTabs } from "./player-tabs";

/*
 * The unread count the bar last drew, kept for as long as this browser
 * tab lives. Only ever written in the browser, after a count arrives:
 * on the server it is always zero, so nobody is ever shown a dot that
 * belongs to somebody else.
 */
let lastUnread = 0;

/**
 * The bar while its count is still on the way.
 *
 * The count streams in behind the page, so every page starts with a
 * bar that does not know it yet. Drawn with zero, the Messages dot
 * would blink off and back on at every tab somebody with a message
 * waiting opened. So the bar wears the count the last page had until
 * the new one lands: on a first load that is zero, and after that it
 * is almost always the number about to arrive.
 */
export function TabsWhileCounting() {
  return <PlayerTabs unread={lastUnread} />;
}

/** The bar with its count, which the next page starts from. */
export function TabsWithCount({ unread }: { unread: number }) {
  useEffect(() => {
    lastUnread = unread;
  }, [unread]);

  return <PlayerTabs unread={unread} />;
}
