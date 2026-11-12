import { useState } from "react";

/**
 * Whether an overlay has been opened yet: false until the first time
 * `open` is true, and true from then on.
 *
 * A sheet that is only ever seen after a tap is loaded with
 * `next/dynamic`, and this is what its parent asks before drawing it,
 * so the sheet's code is downloaded on the first open and not with the
 * page. It stays drawn after that, closed, exactly as it was when it
 * was part of the page from the start: what was typed in it is still
 * there on the second open.
 */
export function useOpened(open: boolean): boolean {
  const [opened, setOpened] = useState(open);
  /* Set while rendering: the documented way to derive state from a prop. */
  if (open && !opened) setOpened(true);
  return open || opened;
}
