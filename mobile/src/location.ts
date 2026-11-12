import * as Location from "expo-location";

/**
 * Where the phone is, when its owner says so.
 *
 * The app's half of the founder's correction: a player-facing "stores
 * near you" asks the player, it does not infer them from a shop they
 * ticked once. On a phone the permission prompt is worth showing,
 * because iOS asks it well and a granted position is exact.
 *
 * THE RULES THIS FILE KEEPS:
 *
 *   - Never asked for at launch. The prompt appears when somebody taps
 *     a button that says what it is for, so the system dialog is the
 *     second time they have been asked rather than the first. iOS gives
 *     one chance at that dialog forever; spending it on a cold start is
 *     spending it badly.
 *   - Balanced accuracy, not Best. A list of shops within twenty-five
 *     miles cannot tell the difference, and the cheaper mode does not
 *     wake the GPS.
 *   - Nothing is stored. The coordinate goes into one request and out
 *     of memory. The ZIP fallback is the only thing that persists, and
 *     the player types that themselves.
 *   - Foreground only. No background entitlement, so there is nothing
 *     to leak while the app is closed.
 */
export interface Coords {
  latitude: number;
  longitude: number;
}

export type LocationOutcome =
  | { status: "granted"; coords: Coords }
  | { status: "denied" }
  /* Distinct from denied: Settings can turn Location Services off for
     the whole device, and telling somebody to check app permissions
     that are already correct is a dead end. */
  | { status: "unavailable" }
  | { status: "failed"; message: string };

/** True if permission is already ours, without showing a dialog. */
export async function haveLocationPermission(): Promise<boolean> {
  try {
    const { granted } = await Location.getForegroundPermissionsAsync();
    return granted;
  } catch {
    return false;
  }
}

/**
 * The current position, asking for permission if we do not have it.
 *
 * Call this from a tap and nowhere else.
 */
export async function requestCoords(): Promise<LocationOutcome> {
  try {
    if (!(await Location.hasServicesEnabledAsync())) {
      return { status: "unavailable" };
    }

    const { granted, canAskAgain } = await Location.getForegroundPermissionsAsync();

    if (!granted) {
      /* Already refused once and iOS will not re-ask: sending them into
         a dialog that never appears looks like a broken button, so the
         caller gets to offer the ZIP instead. */
      if (!canAskAgain) return { status: "denied" };

      const asked = await Location.requestForegroundPermissionsAsync();
      if (!asked.granted) return { status: "denied" };
    }

    const position = await Location.getLastKnownPositionAsync({
      /* A fix from the last two minutes is indistinguishable from a
         fresh one at this radius, and it returns instantly. */
      maxAge: 120_000,
      requiredAccuracy: 1000,
    });

    const fix =
      position ??
      (await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }));

    return {
      status: "granted",
      coords: {
        latitude: fix.coords.latitude,
        longitude: fix.coords.longitude,
      },
    };
  } catch (error) {
    return {
      status: "failed",
      message: error instanceof Error ? error.message : "Could not read your location.",
    };
  }
}

/** How old a last known fix may be and still be worth asking with. */
const LAST_KNOWN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * The last place the phone already knows, at once, without waking
 * anything: no dialog, no wait for a fix.
 *
 * `silentCoords` below takes a fix only when it is under two minutes
 * old and otherwise waits for a new one, which is right for a tap that
 * asked "where am I" and wrong for opening the Feed: the list for a
 * place a few hours stale is almost always the same list, and it can
 * be on screen seconds sooner. The Feed asks with this, then lets a
 * fresh fix correct it behind the scenes if the phone has really moved
 * (src/quiet-refresh.ts `movedEnough`).
 *
 * `permitted` says whether a position may be read at all, so a caller
 * with no coordinate can tell "not allowed" from "allowed, but the
 * phone has no fix to hand". Like everything here: nothing stored,
 * never throws.
 */
export async function lastKnownCoords(): Promise<{
  permitted: boolean;
  coords: Coords | null;
}> {
  if (!(await haveLocationPermission())) return { permitted: false, coords: null };

  try {
    const position = await Location.getLastKnownPositionAsync({
      maxAge: LAST_KNOWN_MAX_AGE_MS,
    });
    return {
      permitted: true,
      coords: position
        ? {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }
        : null,
    };
  } catch {
    return { permitted: true, coords: null };
  }
}

/**
 * The position we already have permission for, or null.
 *
 * Used on a feed refresh: somebody who granted once should not have to
 * tap again, and somebody who never granted must not see a dialog for
 * simply opening the app.
 */
export async function silentCoords(): Promise<Coords | null> {
  if (!(await haveLocationPermission())) return null;

  const outcome = await requestCoords();
  return outcome.status === "granted" ? outcome.coords : null;
}
