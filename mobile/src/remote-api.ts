import { apiCall } from "./api";
import type { RemoteDisplay, RemoteOp, RemoteTimer } from "./remote-wire";

/**
 * The two calls the timer remote makes, and nothing else.
 *
 * The phone never computes a countdown: `getHub` returns the same
 * instants the television reads, and the screen ticks from its own
 * clock (see room-timer-wire.ts). A button press is `controlTimer`,
 * one op, and the server's answer replaces that one timer on screen.
 * The words the ops use are the console's own; remote-wire.ts holds
 * the list and the server refuses anything not on it.
 */

export interface HubView {
  displays: RemoteDisplay[];
  /** The server's clock at the moment it answered, ISO. */
  at: string;
}

export interface ControlExtras {
  /** For Next round with Auto Mode: which intermission length to use. */
  intermissionChoice?: string;
  /** The custom length, when the choice says so. */
  intermissionCustom?: string;
}

/** Every display at a store and every timer on each. 403 for non-staff. */
export const getHub = (storeId: string) =>
  apiCall<HubView>("GET", `/api/v1/stores/${encodeURIComponent(storeId)}/hub`);

/** One press. 400 on an op the server does not know, 403 for non-staff. */
export const controlTimer = (
  timerId: string,
  op: RemoteOp,
  extras: ControlExtras = {},
) =>
  apiCall<{ ok: true; timer: RemoteTimer }>(
    "POST",
    `/api/v1/timers/${encodeURIComponent(timerId)}`,
    { op, ...extras },
  );
