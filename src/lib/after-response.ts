import { after } from "next/server";

/**
 * Work that belongs after the response: notifications, mostly.
 *
 * Launched with `void`, a fan-out could be frozen with the function the
 * moment the response went out, and stop part way through a room.
 * `after` keeps the function alive until the task settles. Outside a
 * request scope (a unit test, a script) `after` throws, so the task
 * simply runs in the background the way it always did.
 */
export function afterResponse(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}
