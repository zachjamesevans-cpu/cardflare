import AsyncStorage from "@react-native-async-storage/async-storage";

import { applyBackdrop, type Backdrop } from "./theme";

/**
 * The player's backdrop - the green-black surfaces, or pure black - kept
 * on the phone and applied before the app's screens load (index.ts), so
 * every colour read at load time is already the right one. Choosing a
 * new one in Settings applies it and redraws the app where it was.
 */

const KEY = "cardflare.backdrop";

/* The Settings row, word for word the website's
   (src/lib/players/backdrop.ts). */
export const LOOK_HEADING = "Look";
export const PURE_BLACK_LABEL = "Pure black";
export const PURE_BLACK_LINE =
  "Backgrounds go pure black instead of green-black. The green highlights stay.";

let current: Backdrop = "green";
let redraw: (() => void) | null = null;

export function backdrop(): Backdrop {
  return current;
}

/** Read the saved choice and apply it. Never throws: green on any doubt. */
export async function loadBackdrop(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    current = saved === "black" ? "black" : "green";
  } catch {
    current = "green";
  }
  applyBackdrop(current);
}

/** The root registers how to redraw the whole app (index.ts). */
export function onRedraw(callback: (() => void) | null): void {
  redraw = callback;
}

/*
 * Where the player was, so a redraw puts them back on the same screen
 * (Settings) rather than on the Feed. App keeps it current and takes it
 * back once, when it mounts again.
 */
let navigation: object | undefined;

export function keepNavigation(state: object | undefined): void {
  navigation = state;
}

export function takeNavigation(): object | undefined {
  const state = navigation;
  navigation = undefined;
  return state;
}

/** Save, apply and redraw. */
export async function setBackdrop(next: Backdrop): Promise<void> {
  current = next;
  applyBackdrop(next);
  try {
    await AsyncStorage.setItem(KEY, next);
  } catch {
    /* Applied for now; the next launch falls back to green. */
  }
  redraw?.();
}
