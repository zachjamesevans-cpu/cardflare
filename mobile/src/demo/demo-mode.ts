import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * DEMO MODE: the app answers itself, for screenshots and screen
 * recordings, and nothing it does reaches the server.
 *
 * The founder (2026-10-11): "we need a test environment though - and
 * the previous way ... made me do a whole new supabase project... surely
 * there is an 'inspect element' way of doing this so that the changes
 * don't actually hit a server", then "go, use made up people. make sure
 * they have profile pictures though. app needs to look activated on all
 * fronts. can use my own profile for some of the things such as showing
 * off trade binders and such."
 *
 * Every request the app makes goes through `call` in api.ts, and with
 * this on, `call` asks src/demo/demo-server.ts first. The screens in the
 * shot list are scripted with made-up people; every write is answered
 * on the phone and never sent; a read nobody scripted (your own
 * profile, your binders, the card catalogue) still goes to the server,
 * because reading changes nothing.
 *
 * DEVELOPMENT BUILDS ONLY. `__DEV__` is false in every TestFlight and
 * App Store build, so `demoOn()` is false there whatever is stored, and
 * the switch that sets it lives in Settings behind the same check
 * (tests/unit/app-demo-mode.test.ts).
 */

const KEY = "cardflare.demoMode";

let on = false;
let loaded: Promise<void> | null = null;

/* A development build. Read as false where there is no __DEV__ at all
   (the unit tests' Node), so nothing outside the app can switch it on. */
const DEV = typeof __DEV__ !== "undefined" && __DEV__;

/** Read the stored switch once; every call waits on the same read. */
export function demoReady(): Promise<void> {
  if (!DEV) return Promise.resolve();
  if (!loaded) {
    loaded = AsyncStorage.getItem(KEY)
      .then((value) => {
        on = value === "on";
      })
      .catch(() => {
        on = false;
      });
  }
  return loaded;
}

/** True only in a development build with the switch on. */
export function demoOn(): boolean {
  return DEV && on;
}

const SHOT_KEY = "cardflare.demoShot";

/**
 * A shot queued for the next launch: its number in the shot list,
 * counting from 1, read once and cleared. How a screen is reached
 * without a tap - for whoever is shooting from the Mac side.
 */
export async function takeQueuedShot(): Promise<number | null> {
  await demoReady();
  if (!demoOn()) return null;
  try {
    const value = await AsyncStorage.getItem(SHOT_KEY);
    if (value === null) return null;
    await AsyncStorage.removeItem(SHOT_KEY);
    const index = Number(value) - 1;
    return Number.isInteger(index) && index >= 0 ? index : null;
  } catch {
    return null;
  }
}

/**
 * Turn it on or off and reload, so no screen keeps data from the other
 * side of the switch.
 */
export async function setDemoMode(next: boolean): Promise<void> {
  if (!DEV) return;
  await AsyncStorage.setItem(KEY, next ? "on" : "off");
  on = next;
  /* Required here rather than at the top, so the modules that load
     api.ts in Node (the unit tests) never load React Native. */
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DevSettings } = require("react-native") as typeof import("react-native");
  DevSettings.reload();
}
