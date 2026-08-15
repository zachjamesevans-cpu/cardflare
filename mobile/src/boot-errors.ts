/**
 * The first fatal error of a launch, kept where the error screen can
 * reach it.
 *
 * When a module fails to initialize, Metro's guarded require reports
 * the real error through ErrorUtils and then returns undefined - so
 * what actually crosses an error boundary is a downstream symptom
 * ("Cannot read property X of undefined") that names the victim, not
 * the culprit. Three TestFlight builds died behind that curtain. This
 * trap records the first fatal before handing it to the previous
 * handler, unchanged, so the startup screen can show the root cause
 * next to the symptom.
 */

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;

type ErrorUtilsLike = {
  getGlobalHandler(): GlobalHandler;
  setGlobalHandler(handler: GlobalHandler): void;
};

let first: unknown = null;

export function installBootErrorTrap(): void {
  const utils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!utils) return;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    if (first === null) first = error;
    previous(error, isFatal);
  });
}

export function firstBootError(): unknown {
  return first;
}
