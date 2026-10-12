/**
 * The backdrop: the green-black surfaces, or pure black. The founder
 * (2026-10-12): "add a dark mode toggle in settings to make our classic
 * green stuff just pure black. green highlights and green 'found' will
 * remain". Only the surfaces, the raised step and the two borders change
 * (globals.css, `[data-backdrop="black"]`); the accent never does.
 *
 * Kept in the browser, not on the account, the way the app keeps it on
 * the phone (mobile/src/backdrop.ts): it is how this screen looks. The
 * Settings row reads word for word the app's.
 */

export type Backdrop = "green" | "black";

export const BACKDROP_KEY = "cardflare.backdrop";

export const LOOK_HEADING = "Look";
export const PURE_BLACK_LABEL = "Pure black";
export const PURE_BLACK_LINE =
  "Backgrounds go pure black instead of green-black. The green highlights stay.";

/*
 * Run in <head> before the first paint (app/layout.tsx), so a page drawn
 * for somebody who chose black never flashes green first. Inline rather
 * than a cookie read on the server: reading a cookie in the root layout
 * would make every page, the static ones too, render per request.
 */
export const BACKDROP_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(
  BACKDROP_KEY,
)})==="black")document.documentElement.dataset.backdrop="black"}catch(e){}`;
