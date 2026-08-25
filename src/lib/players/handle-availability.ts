import { HANDLE_PATTERN, type HandleAvailability } from "./handle";
import { isHandleFree } from "./profile";

/**
 * Is this handle free to claim, asked by somebody with NO account yet?
 *
 * The signed-in setup flow has its own checker (`checkHandleAction` in
 * `setup-actions.ts`) which excludes the asker's current handle; this
 * one exists because the sign-up forms ask before any account exists,
 * so there is nothing to exclude and no viewer to identify.
 *
 * `isHandleFree` runs the actual lookup — one query, stated once — and
 * keeps its own manner on trouble: say yes and let the unique index
 * decide, because a false "taken" blocks a name that was free. The
 * answer here is advisory either way; the index is the gate at claim
 * time, since two people can be told "available" in the same second
 * and only the index sees both.
 */
export async function handleAvailability(
  candidate: string,
): Promise<HandleAvailability> {
  const handle = candidate.trim().toLowerCase();
  if (!HANDLE_PATTERN.test(handle)) return "invalid";
  return (await isHandleFree(handle)) ? "available" : "taken";
}
