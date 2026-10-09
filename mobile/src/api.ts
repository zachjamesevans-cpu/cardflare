import * as SecureStore from "expo-secure-store";

import type { GiftBar } from "./gift-copy";
import { clearCache } from "./cache";
import type { RoomTimerWire } from "./room-timer-wire";

import { API_BASE } from "./config";
import type { ArtFile } from "./cosmetic-film";
import type { BinderCoverId } from "./binder-covers";
import { binderOfferFailure } from "./binder-offer-copy";
import { offerFailureMessage } from "./offer-copy";
import type { PushGroup, PushPrefs } from "./push-copy";
import type { ScanRefusal } from "./scan-copy";
import type { ScanCard } from "./scan-hit";

/**
 * The whole client for cardflare.gg's `/api/v1`.
 *
 * Two identities, matching the backend's seam exactly:
 *
 * - **Account** — Supabase access token, sent as `Authorization: Bearer`.
 *   Obtained by password sign-in against the same project the website
 *   uses; refreshed with the stored refresh token when a call comes back
 *   401. Both tokens live in the device keychain, never in JS storage.
 * - **Room session** — the guest identity, sent as `X-Session-Token`.
 *   Handed out once by the join endpoint and kept in the keychain; the
 *   website's cookie in header form. Guests have this and nothing else.
 */

const ACCESS_KEY = "cf_access_token";
const REFRESH_KEY = "cf_refresh_token";
const SESSION_KEY = "cf_room_session";

/* ------------------------------------------------------------------ */
/* Token storage                                                       */
/* ------------------------------------------------------------------ */

const PUSH_KEY = "cf_push_token";

/**
 * Never throws. The keychain is unavailable for a moment after a
 * restart before the first unlock, and a throw here left the front
 * door at "checking" forever: a black screen with nothing to tap.
 * No token is the honest answer until the keychain is back.
 */
export async function storedAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ACCESS_KEY);
  } catch {
    return null;
  }
}

/** The Expo push token this phone registered, so sign-out can unregister it. */
export async function rememberPushToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(PUSH_KEY, token).catch(() => {});
}

export async function storedSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_KEY);
}

async function storeAuth(access: string, refresh: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, access);
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}

/*
 * Who wants to know that somebody signed out.
 *
 * The gate in App.tsx, so far: signing out cleared the tokens and left
 * the person standing in the tabs, looking at a signed-out Feed, with no
 * way back to the front door short of force-quitting. Signing out should
 * put you where signing in starts.
 *
 * A listener rather than a prop because the button is five screens deep
 * inside a navigator the gate renders, and threading a callback down
 * through all of it would touch every screen in between for one event.
 */
const signedOut = new Set<() => void>();

/** Subscribe to sign-out. Returns the unsubscribe, for an effect. */
export function onSignedOut(listener: () => void): () => void {
  signedOut.add(listener);
  return () => {
    signedOut.delete(listener);
  };
}

export async function signOut(): Promise<void> {
  await forgetDevice();
  await forgetAuth();
  await forgetAccountLocals();
  for (const listener of signedOut) listener();
}

/**
 * Everything on this phone that belonged to the account, apart from the
 * tokens and the push registration, which each caller drops its own
 * way (a refused refresh has no live token to unregister with).
 */
async function forgetAccountLocals(): Promise<void> {
  /* The guest room identity goes too: it was joined under this
     account's name and would follow the next sign-in into the room. */
  await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {});

  /*
   * The last room, its game scope and the search game chip. Small
   * things, but together they reopened the previous person's Room tab,
   * narrowed to their game, the moment somebody else signed in on the
   * same phone.
   */
  await SecureStore.deleteItemAsync(LAST_ROOM_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(LAST_ROOM_GAME_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(SEARCH_GAME_KEY).catch(() => {});

  /*
   * And the cached feed, which is the part that is easy to forget.
   * Tokens are what stop the app talking to the server; the cache is
   * what the NEXT person to open this phone would see painted on the
   * screen before it ever tries — a feed, a profile, a wardrobe.
   * Signing out has to take both. Recent searches are kept under the
   * cache's prefix (recent-search-list.ts), so this sweeps them too.
   */
  await clearCache();
}

/**
 * The phone stops being this account's phone. Without this the next
 * person to sign in on it would still get the last account's pushes:
 * the token row on the server is the phone, not the person. Best
 * effort, so a dead network cannot block signing out.
 */
async function forgetDevice(): Promise<void> {
  try {
    const pushToken = await SecureStore.getItemAsync(PUSH_KEY);
    if (pushToken) await unregisterDevice(pushToken).catch(() => {});
    await SecureStore.deleteItemAsync(PUSH_KEY);
  } catch {
    /* Nothing to unregister, or nowhere to say so. */
  }
}

/** Drops the account tokens. The keychain is the only place they live. */
async function forgetAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(REFRESH_KEY).catch(() => {});
}

/* ------------------------------------------------------------------ */
/* Supabase auth (password grant, same accounts as the website)        */
/* ------------------------------------------------------------------ */

type AuthResult = { ok: true } | { ok: false; message: string };

/*
 * Auth goes through cardflare.gg, never straight to Supabase, and the
 * reason is the app's foundational field fact: on some networks (the
 * founder's, for one) every request with a BODY dies in transit. Every
 * other write already rides in the x-cf-payload header to our own
 * server; these two were the last direct Supabase calls left, and a
 * body Supabase never receives is a sign-in that fails with no story.
 * The server relays the grant to Supabase from its side of the network,
 * where bodies survive. Sent bodyless with the header, like everything.
 */
async function authRequest(payload: unknown): Promise<{
  status: number;
  accessToken: string | null;
  refreshToken: string;
  /* The server's one-word reason on a refusal ("handle-taken",
     "already-registered"), and its one-word answer to check-handle.
     Absent on the grants that only carry tokens. */
  errorCode: string | null;
  availability: string | null;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${API_BASE}/api/v1/auth`, {
      method: "POST",
      headers: { "x-cf-payload": encodeURIComponent(JSON.stringify(payload)) },
      signal: controller.signal,
    });

    const body = (await response.json().catch(() => ({}))) as {
      accessToken?: string;
      refreshToken?: string;
      error?: string;
      availability?: string;
    };

    return {
      status: response.status,
      accessToken: body.accessToken ?? null,
      refreshToken: body.refreshToken ?? "",
      errorCode: body.error ?? null,
      availability: body.availability ?? null,
    };
  } catch {
    return {
      status: 0,
      accessToken: null,
      refreshToken: "",
      errorCode: null,
      availability: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Open sign-up: one call creates the account AND signs it in. The
 * server runs both so the phone never makes two round trips over
 * networks that have eaten this app's requests before.
 */
export async function signUp(
  email: string,
  password: string,
  /* Asked at the door now rather than on a second screen. Optional on
     the wire so an older build still works; the server derives both
     from the address in that case. */
  displayName?: string,
  handle?: string,
): Promise<AuthResult> {
  const result = await authRequest({
    action: "sign-up",
    email: email.trim().toLowerCase(),
    password,
    displayName,
    handle,
  });

  if (result.accessToken) {
    await storeAuth(result.accessToken, result.refreshToken);
    return { ok: true };
  }

  if (result.status === 409) {
    return {
      ok: false,
      message:
        result.errorCode === "handle-taken"
          ? "That handle is taken. Try another one."
          : "That address already has an account. Sign in instead.",
    };
  }

  if (result.status === 429) {
    return {
      ok: false,
      message: "That is a lot of new accounts. Try again in a little while.",
    };
  }

  /* The account was made and only the sign-in after it stumbled
     upstream: "try again" would hit "already has an account". */
  if (result.errorCode === "upstream") {
    return {
      ok: false,
      message:
        "Your account is ready, but signing in did not finish. Sign in to continue.",
    };
  }

  return { ok: false, message: "Could not create the account. Try again." };
}

export type HandleAvailability = "available" | "taken" | "invalid" | "unknown";

/**
 * "Is @zach free?", asked while the sign-up form is still being typed.
 * Advisory — the unique index still decides at claim time — and any
 * trouble reads as "unknown", which the form shows as nothing rather
 * than standing between a person and the create button.
 */
export async function checkHandle(handle: string): Promise<HandleAvailability> {
  const result = await authRequest({ action: "check-handle", handle });
  return result.availability === "available" ||
    result.availability === "taken" ||
    result.availability === "invalid"
    ? result.availability
    : "unknown";
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const result = await authRequest({
    action: "sign-in",
    email: email.trim().toLowerCase(),
    password,
  });

  if (result.accessToken) {
    await storeAuth(result.accessToken, result.refreshToken);
    return { ok: true };
  }

  if (result.status === 401) {
    // The same non-oracle answer for every failure, like the website.
    return {
      ok: false,
      message: "That email address and password do not match an account.",
    };
  }

  if (result.status === 429) {
    return {
      ok: false,
      message: "That is a lot of attempts. Try again in a little while.",
    };
  }

  return { ok: false, message: "Could not reach cardflare. Try again." };
}

/**
 * One refresh at a time. Several screens loading at once each hit a
 * 401 together; the first refresh rotates the token and the second,
 * presenting the now-spent refresh token, would be told no. They all
 * wait on the same promise instead.
 */
let refreshing: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshing) {
    refreshing = refreshOnce().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function refreshOnce(): Promise<boolean> {
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refresh) return false;

  const result = await authRequest({ action: "refresh", refreshToken: refresh });

  if (result.accessToken) {
    await storeAuth(result.accessToken, result.refreshToken || refresh);
    return true;
  }

  /*
   * Only a refusal of the refresh token itself signs the phone out: the
   * server answers 401 "invalid-refresh" when Supabase rejected it
   * (password changed on the website, session revoked, long expiry).
   * The tokens would otherwise stay in the keychain, every call 401s,
   * and the profile shows "could not load" with no Sign out in reach,
   * so that case goes back to the front door properly.
   *
   * Everything else is weather, not a verdict: no network (status 0),
   * a rate limit (429), Supabase having a bad minute (503 "upstream").
   * Signing somebody out because the auth server hiccuped once cost
   * them their session for nothing. The tokens stay, this call fails
   * honestly, and the next call tries the refresh again.
   */
  if (isRefreshRefusal(result.status, result.errorCode)) {
    await forgetDeviceWithoutRefresh();
    await forgetAuth();
    await forgetAccountLocals();
    for (const listener of signedOut) listener();
  }
  return false;
}

/** The one refresh answer that means "this session is over". */
export function isRefreshRefusal(status: number, errorCode: string | null): boolean {
  return status === 401 && errorCode === "invalid-refresh";
}

/**
 * forgetDevice, for the one caller already inside a refresh.
 *
 * `call()` refreshes a stale token first, and a refresh in flight is
 * shared, so unregistering through it from here would wait on itself
 * forever. This asks once with whatever access token is left (it can
 * still be good for a few minutes) and, either way, drops the push
 * token from the phone the same as signing out does.
 */
async function forgetDeviceWithoutRefresh(): Promise<void> {
  try {
    const pushToken = await SecureStore.getItemAsync(PUSH_KEY);
    const access = await storedAccessToken();
    if (pushToken && access) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      await fetch(`${API_BASE}/api/v1/devices`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${access}`,
          "x-cf-access-token": access,
          "x-cf-payload": encodeURIComponent(JSON.stringify({ pushToken })),
        },
        signal: controller.signal,
      })
        .catch(() => {})
        .finally(() => clearTimeout(timer));
    }
    await SecureStore.deleteItemAsync(PUSH_KEY);
  } catch {
    /* Nothing to unregister, or nowhere to say so. */
  }
}

/* ------------------------------------------------------------------ */
/* The API client                                                      */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    /**
     * What the server said in words, when it said any: a 409 from a
     * thread opener or a hunt offer carries `{ ok: false, message }`
     * written for the person, and a screen shows it as it came.
     */
    public detail: string | null = null,
  ) {
    super(code);
  }
}

/** The server's own words for a refusal, or null when it gave none. */
export function serverMessage(caught: unknown): string | null {
  return caught instanceof ApiError ? caught.detail : null;
}

/**
 * A failure, named for the log. Generic "could not load" messages cost
 * days of blind debugging, so the console gets this with every error;
 * a screen shows `friendlyError` instead. "timeout" and
 * "unauthorized (401)" point at different bugs from the same couch.
 */
export function describeError(caught: unknown): string {
  /* Not a bug to diagnose but a plan to start: said in words. No URL
     and no price, though: a store's plan is bought on the web, and an
     app that points players at an outside purchase is an App Store
     3.1.1 rejection. The owner knows where their console is. */
  if (caught instanceof ApiError && caught.code === "ultra-required") {
    return "FlareCast is not switched on for this store yet. The store's owner can start it from their store console.";
  }
  if (caught instanceof ApiError) {
    if (caught.status === 0) return caught.code;
    return `${caught.code} ${caught.status}`;
  }
  return caught instanceof Error ? caught.message : "unknown";
}

/**
 * A failure, said to a person: one plain sentence, never a code.
 *
 * `describeError` reads "not-found 404", which is a diagnosis, not
 * something a player can act on. The screen shows this sentence; the
 * code still reaches the console, so a bug report keeps its clue.
 */
export function friendlyError(caught: unknown): string {
  console.warn("[cardflare]", describeError(caught));
  if (caught instanceof ApiError) {
    /* A plan to start, already in words: kept exactly as written. */
    if (caught.code === "ultra-required") return describeError(caught);
    if (caught.detail) return caught.detail;
    const { status, code } = caught;
    if (
      status === 0 ||
      code === "bad-json" ||
      code === "network" ||
      code === "timeout"
    ) {
      return "Couldn't reach cardflare. Check your connection and try again.";
    }
    if (status === 401) return "You've been signed out. Sign in again and retry.";
    if (status === 403) return "That isn't available to your account.";
    if (status === 404 || status === 410) return "That's no longer available.";
    if (status === 409) return "That changed in the meantime. Refresh and try again.";
    if (status === 413) return "That file is too big. Try a smaller one.";
    if (status === 429) return "That's a lot at once. Wait a moment and try again.";
    if (status === 400 || status === 422)
      return "That didn't look right. Check it and try again.";
    if (status >= 500)
      return "Something went wrong on our side. Try again in a moment.";
  }
  return "Something went wrong. Try again.";
}

/**
 * When the access token runs out, read off the token itself.
 *
 * A Supabase access token is a JWT, and its `exp` claim is public: no
 * secret is needed to read when it stops working. Null for anything
 * that does not parse, which is treated as "cannot tell" rather than
 * "expired", so a token this code cannot read is still sent.
 */
function tokenExpiry(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * The access token, refreshed FIRST when it is about to run out.
 *
 * The founder's report: "when I join a room and I'm signed in, this
 * sign up screen still appears. It goes away after a few seconds."
 * The room endpoint does not require an account, so a stale token
 * there is not a 401 - the server quietly answers "no account" and
 * the guest pitch renders. Only a later call that does require one
 * came back 401, refreshed the token, and the next poll fixed the
 * screen. Refreshing a minute ahead of expiry means the first call
 * after a night away already carries a token the server accepts.
 */
async function freshAccessToken(): Promise<string | null> {
  const access = await storedAccessToken();
  if (!access) return null;
  const expiresAt = tokenExpiry(access);
  if (expiresAt !== null && expiresAt - Date.now() < 60_000) {
    if (await refreshAccessToken()) return storedAccessToken();
  }
  return access;
}

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  retried = false,
  timeoutMs = 15_000,
): Promise<T> {
  const headers: Record<string, string> = {};

  const access = await freshAccessToken();
  if (access) {
    headers.authorization = `Bearer ${access}`;
    /*
     * The same token again, in a custom header. Everything the app sends
     * that demonstrably survives the founder's network rides in x-*
     * headers (x-session-token, x-cf-payload); Authorization is the one
     * header class middleboxes love to strip. The server accepts either
     * and prefers Authorization, so on a sane network this is redundant
     * and on a hostile one it is the difference between signed in and
     * silently 401ed.
     */
    headers["x-cf-access-token"] = access;
  }

  const session = await storedSessionToken();
  if (session) headers["x-session-token"] = session;

  /*
   * The payload rides in a header, not the body. Field fact from the
   * founder's own network: every app request *with a body* died in
   * transit while bodyless ones sailed through, under every
   * content-type — the six-probe connection test proved it. Headers
   * demonstrably arrive, so the server accepts `x-cf-payload`
   * (URI-encoded JSON, pure ASCII) as the write's payload everywhere.
   * Our payloads are tiny — a name, a card id, a 120-char note.
   */
  if (body !== undefined) {
    headers["x-cf-payload"] = encodeURIComponent(JSON.stringify(body));
  }

  /*
   * A hard timeout on every call. A phone on flaky store wifi must never
   * hang a spinner forever — a fetch that cannot finish in 15 seconds is
   * an error the screen can show and the player can retry.
   */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    // Deliberately no body — see the header note above.
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      signal: controller.signal,
    });
  } catch (caught) {
    throw new ApiError(0, controller.signal.aborted ? "timeout" : "network");
  } finally {
    clearTimeout(timer);
  }

  // One silent refresh on an expired account token, then give up honestly.
  if (response.status === 401 && access && !retried) {
    if (await refreshAccessToken()) {
      return call<T>(method, path, body, true, timeoutMs);
    }
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as {
      error?: string;
      /* A lib's named refusal (`{ ok: false, reason }`): a thread's
         "closed", a trade's "pending". The code, when there is no error. */
      reason?: string;
      message?: string;
    };
    throw new ApiError(
      response.status,
      detail.error ?? detail.reason ?? `http-${response.status}`,
      typeof detail.message === "string" ? detail.message : null,
    );
  }

  /* A 200 that is not JSON is a captive portal or a CDN error page,
     not our server. Named, so the screen says "bad-json" rather than
     "JSON Parse error: Unexpected character: <". */
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(response.status, "bad-json");
  }
}

/* ------------------------------------------------------------------ */
/* Typed endpoints                                                     */
/* ------------------------------------------------------------------ */

export interface Me {
  player: {
    id: string;
    displayName: string;
    handle?: string;
    /*
     * For the home header, and OPTIONAL on purpose.
     *
     * A TestFlight build ships on its own clock and can be running
     * against a server that has not deployed these two yet - or, after a
     * rollback, one that has stopped sending them. The header falls back
     * rather than rendering "undefined Embers" at somebody.
     */
    avatarUrl?: string | null;
    embersBalance?: number;
    /**
     * How this player wants the Feed drawn.
     *
     * OPTIONAL, like the two above and for the same reason: a build can
     * meet a server that predates views. `feedViewFrom` turns anything
     * it does not recognise - including nothing at all - into the
     * original card, which is the one answer always drawable.
     */
    feedView?: string;
    /** Joining a room posts their Flares to it. Absent on an older server: on. */
    autoPostFlares?: boolean;
    /** The sign-in email, for Settings. Absent on an older server. */
    email?: string | null;
  };
  wants: {
    id: string;
    cardId: string;
    /** Looking for it, or offering it. Absent from an older server: a want. */
    direction?: "want" | "offering";
    cardName: string;
    cardNumber: string;
    printingId: string | null;
    printingLabel: string | null;
    quantity: number;
    note: string | null;
    /** The named hunt this want belongs to. Null = a loose card. */
    deckLabel: string | null;
    /** Artwork, resolved server-side the way the Flare board resolves it. */
    imageUrl: string | null;
    /**
     * The store this card is live at, or null when it is only saved.
     * Kept beside `postedBoards` for builds older than the tappable one.
     *
     * The list's two states, in one field. Optional because an app build
     * meets servers older than itself, and "not posted" is the safe read
     * of a server that has not started saying.
     */
    postedAt?: string | null;
    /** Where it is up and how to walk in. Absent from an older server. */
    postedBoards?: { name: string; code: string | null }[];
    /**
     * Every copy in hand. The row stays, greyed, saying "Found" where
     * the "Live at" labels would be. Absent from an older server, which
     * reads as not found: the forgiving way round.
     */
    found?: boolean;
  }[];
  collection: { cardsMatched: number; syncedAt: string } | null;
  locals: {
    storeId: string;
    name: string;
    city: string | null;
    region: string | null;
    /** The store's permanent counter code — tap a local, skip the QR. */
    code: string;
    liveNow: boolean;
    nextEventAt: string | null;
    nextEventName: string | null;
    /** The next event's own code, when a board can be walked onto early. */
    nextEventCode: string | null;
    earlyOpen: boolean;
  }[];
  /**
   * The stores this account may RUN, for the timer remote: owners and
   * organizers (the TO badge) alike. Optional so a build against an
   * older server reads it as nobody, which locks nothing.
   *
   * An owner's row carries `gift`, the green bar the store console draws
   * (a beta gift's days, a Founding Store, or the trial's); null for an
   * organizer, and absent from an older server.
   */
  staff?: {
    storeId: string;
    name: string;
    code: string;
    role: "owner" | "staff";
    gift?: GiftBar | null;
  }[];
}

/* The green bar's state lives beside its words, with no app imports,
   so the website's tests can read it. */
export type { GiftBar } from "./gift-copy";

export const getMe = () => call<Me>("GET", "/api/v1/me");

export const removeLocal = (storeId: string) =>
  call<{ ok: true }>("DELETE", "/api/v1/locals", { storeId });

/**
 * Following a store on purpose - the website's `followStoreAction`.
 * Same row as a local saved by joining a room; `removeLocal` is the
 * unfollow.
 */
export const followStore = (storeId: string) =>
  call<{ ok: true; following: boolean }>("POST", "/api/v1/locals", { storeId });

export interface RoomFlare {
  id: string;
  playerSessionId: string;
  displayName: string | null;
  cardId: string;
  cardName: string;
  cardNumber: string;
  printingId: string | null;
  printingLabel: string | null;
  imageUrl: string | null;
  quantity: number;
  note: string | null;
  /** The named hunt this Flare belongs to. Null = a loose card. */
  deckLabel: string | null;
  /**
   * The posting action that created it, shared by every Flare it wrote.
   *
   * What lets a pasted list nobody named still read as one hunt rather
   * than thirty loose rows. Null for a Flare posted on its own, and for
   * anything posted before batches existed.
   */
  postedBatch: string | null;
  /** Which way the card points: wanted, or offered up. */
  intent: "want" | "showcase";
  /** What the poster will take. Trade-only is the board's default. */
  acceptsTrade: boolean;
  acceptsCash: boolean;
  /**
   * When it went up, so your own section can lead with the newest.
   * Absent from an older server, which leaves the board's order alone.
   */
  createdAt?: string;
  /** Copies found so far. Absent from an older server: none. */
  foundQuantity?: number;
  match: "exact" | "other-printing" | null;
  /**
   * Copies of this card the viewer's own binder claims.
   *
   * The card viewer's line, and only the card viewer's: the board already
   * says you are holding it with a green ring, which reads across a table
   * in a way a sentence never will. The number is what the tap is for.
   */
  heldCount?: number;
  counterMayHave: boolean;
  offers: {
    responderSessionId: string;
    displayName: string | null;
    message: string | null;
    /** How many copies they said they can bring. */
    quantity: number;
    present: boolean;
  }[];
}

/**
 * Where a room is in its life, the website's `RoomPhase`.
 *
 * `upcoming` is a night the store has posted and not yet opened, before
 * its early window: the board is browsable and Going is allowed from
 * the moment it is posted. `early` is inside the store's early-board
 * window. `pending` is a draft whose start has passed with the door
 * still shut ("Not open yet"). `live` and `finished` are what they say.
 */
export type RoomPhase = "upcoming" | "early" | "live" | "pending" | "finished";

/** A binder up for trade, as a roster row shows it: a cover and a name. */
export interface RosterBinder {
  id: string;
  name: string;
  cover: BinderCoverId;
  count: number;
}

/**
 * Somebody on a night's roster before it starts: who they are, how
 * many of their Flares are on this board, and the binders they are
 * bringing to trade. The website's `RosterPlayer`.
 */
export interface RosterPlayer {
  playerSessionId: string;
  playerId: string | null;
  displayName: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  aura: string | null;
  present: boolean;
  /** Their Flares on this board. */
  flares: number;
  /** Up to three binders up for trade; empty for a guest. */
  binders: RosterBinder[];
  /**
   * The binders they said they are bringing to this night, as the
   * viewer may see them. Absent from an older server.
   */
  bringing?: RosterBinder[];
  /**
   * How many cards are on their Have list, and how many of those and
   * the viewer's cross: the "42 trade cards" and "2 matches" on a
   * Players going row. Absent from an older server, which draws the
   * row without them.
   */
  tradeCards?: number;
  matches?: number;
}

export interface RoomState {
  state: "room" | "show" | "lobby" | "quiet";
  /** Present on lobby and quiet states: whose counter this is. */
  store?: { name: string };
  /** A nearby board already taking Flares, advertised by lobby and quiet. */
  earlyBoard?: { code: string; name: string; startsAt: string; playersIn: number };
  joined?: boolean;
  room?: {
    name: string;
    status: string;
    storeName: string;
    /** The store's page, linked from the room. Absent from an older server. */
    storeId?: string;
    /** cardflare Verified, drawn beside the name. Absent from an older server. */
    verified?: boolean;
    kind: string;
    startsAt: string | null;
    endsAt: string | null;
    /** The board is open ahead of doors; everyone on it is on their way. */
    early: boolean;
    /**
     * Where the night is in its life. Absent from an older server,
     * which only knew `early` and `status`; see `roomPhaseOf`.
     */
    phase?: RoomPhase;
    /** How many have said Going, and whether this viewer has. Absent
        from an older server. */
    goingCount?: number;
    youGoing?: boolean;
    /**
     * The night's own id: what the Going button in the room says
     * Going TO, since `setGoing` is keyed by event and the room by
     * code. Without it the room draws the door it always had.
     */
    eventId?: string;
    /**
     * How many of the roster are in the room right now, for the
     * header's "3 here now". Absent from an older server: the header
     * counts the present participants it can see instead.
     */
    hereNow?: number;
    /** The store's whereabouts, for the collapsed Event details. */
    store?: {
      address: string | null;
      phone: string | null;
      website: string | null;
    };
  };
  /**
   * The same four, when a server puts them beside the room rather
   * than inside it. Read through `roomPhaseOf` and `goingOf`, which
   * look in both places.
   */
  phase?: RoomPhase;
  goingCount?: number;
  youGoing?: boolean;
  eventId?: string;
  /**
   * Who is going, before the night starts. Carried on the not-joined
   * answer while the board is readable (upcoming, early, live), so a
   * viewer can see who is coming and what they are hunting before
   * saying Going themselves. Absent from an older server.
   */
  roster?: RosterPlayer[];
  you?: { sessionId: string; displayName: string };
  /**
   * Whether the signed-in account follows this room's store, for the
   * Follow chip beside the store's name. False for a guest; absent from
   * an older server, which draws no chip.
   */
  following?: boolean;
  /**
   * The store's live tournament clocks, as instants the phone ticks on
   * its own — see `room-timer-wire.ts`. Present once joined.
   */
  timers?: RoomTimerWire[];
  /**
   * The signed-in account, when there is one.
   *
   * Present so the join screen can stop asking for a name: a signed-in
   * player joins as themselves, and the name is changed in profile
   * settings because it has to be unique. Null for a guest, whose name
   * is theirs to type and is never stored beyond the session.
   */
  account?: { displayName: string } | null;
  participants?: {
    playerSessionId: string;
    displayName: string | null;
    present: boolean;
    openToTrades: boolean;
    /** Absolute, resolved server-side. Null means the initials. */
    avatarUrl?: string | null;
    /** The profile border they wear, drawn around their avatar. */
    frame?: string | null;
    /** The catalogue ring, worn over the frame when both are set. */
    ring?: string | null;
    /** The catalogue avatar effect, which rides with any ring. */
    aura?: string | null;
    /**
     * A dropped-in profile border and avatar effect, when they wear
     * one. The server has sent these since the ring slots existed; the
     * app only started drawing them once it had a renderer for a file.
     */
    ringArt?: ArtFile | null;
    auraArt?: ArtFile | null;
    /** Lifetime Embers, or null for a guest with no account. */
    embersEarned?: number | null;
    /** The account behind the session, for the profile popup. */
    playerId?: string | null;
  }[];
  flares?: RoomFlare[];
}

export const getRoom = (code: string) =>
  call<RoomState>("GET", `/api/v1/rooms/${encodeURIComponent(code)}`);

/**
 * The room's phase, from whichever server answered.
 *
 * A server that says `phase` is believed. An older one only said
 * `early` and `status`, which is enough to tell live from early from
 * the two shut doors, and never says `upcoming`: an old server did not
 * have the phase, so nothing is drawn that it cannot back.
 */
export function roomPhaseOf(state: RoomState): RoomPhase | null {
  const room = state.room;
  if (!room) return null;
  const said = room.phase ?? state.phase;
  if (said) return said;
  if (room.status === "open") return "live";
  if (room.status === "closed") return "finished";
  return room.early ? "early" : "pending";
}

/** Going, from wherever the server put it; nothing from an older one. */
export function goingOf(
  state: RoomState,
): { youGoing: boolean; goingCount: number } | null {
  const count = state.room?.goingCount ?? state.goingCount;
  if (count === undefined) return null;
  return {
    goingCount: count,
    youGoing: state.room?.youGoing ?? state.youGoing ?? false,
  };
}

/* ------------------------------------------------------------------ */
/* Nights                                                              */
/* ------------------------------------------------------------------ */

/** Where a night in the Nights list is: a room open now, an early
    board, a night posted and not yet open, or one that has ended and
    the viewer went to (the Past tab). */
export type NightPhase = "live" | "early" | "upcoming" | "finished";

/**
 * One night that matters to this player: at a store they follow or one
 * near them, or one they are going to wherever it is. The website's
 * `NightItem`, row for row.
 */
export interface NightItem {
  eventId: string;
  code: string | null;
  name: string;
  startsAt: string;
  endsAt: string | null;
  timeZone: string;
  storeId: string;
  storeName: string;
  storeVerified: boolean;
  city: string | null;
  phase: NightPhase;
  youGoing: boolean;
  goingCount: number;
  /** Flares on the board. */
  flares: number;
  following: boolean;
  /**
   * Trade matches for the viewer at this night: the summary total for
   * a night they are going to, null otherwise. Absent from an older
   * server, which reads the same as null: the players count takes the
   * slot on the card.
   */
  matches?: number | null;
  /** How many of the roster are in the room right now. */
  hereNow?: number;
  /**
   * What kind of room: a night the store posted, a day room players
   * opened ("Open trading", named by the server), or a walk-in room.
   * Absent from an older server, which only listed posted nights.
   */
  kind?: "scheduled" | "day" | "walk_in";
}

/** Live rooms first, then upcoming and early by start time, then
    finished nights newest first. The server orders; the app draws in
    the order given. */
export const getNights = () => call<{ nights: NightItem[] }>("GET", "/api/v1/nights");

/* ------------------------------------------------------------------ */
/* Night matches: who can I trade with here, and why                   */
/* ------------------------------------------------------------------ */

/**
 * One card in a match, as the server names it. The website's
 * `MatchCard` in src/lib/events/night-matches.ts, field for field.
 */
export interface MatchCard {
  cardId: string;
  name: string;
  number: string;
  imageUrl: string | null;
  /** The printing the wanter named, or null when any printing will do. */
  printingLabel: string | null;
  /**
   * "exact" when the wanter takes any printing or the holder has the
   * one they named; "other-printing" when the holder's copy is a
   * different printing, or one of unknown printing.
   */
  match: "exact" | "other-printing";
}

/** Somebody on the roster, as a match names them. */
export interface MatchPlayer {
  playerId: string;
  playerSessionId: string | null;
  displayName: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  aura: string | null;
}

/** A player whose Trade binder or Flares hold cards the viewer wants. */
export interface TheyHaveMatch {
  player: MatchPlayer;
  cards: {
    card: MatchCard;
    /** Where the card was found: their Have list, or a Flare here. */
    source: "binder" | "flare";
    /** The viewer's matching want is a Flare at this night. */
    fromYourFlare: boolean;
  }[];
}

/** A player whose wants are on the viewer's Have list. */
export interface TheyWantMatch {
  player: MatchPlayer;
  cards: MatchCard[];
}

/** Both directions at once: the signature match. */
export interface MutualMatch {
  player: MatchPlayer;
  youWant: MatchCard[];
  theyWant: MatchCard[];
}

/** A card of the viewer's that somebody here is looking for. */
export interface BringCard {
  card: MatchCard;
  /** Display names, for "Wanted by CHUNC + 1 other". */
  wantedBy: string[];
  /** Ticked off in the checklist; the server remembers it. */
  packed: boolean;
}

/**
 * Everything the matcher found for the viewer at one night. The
 * website's `NightMatches`; a guest gets the empty one.
 */
export interface NightMatches {
  summary: {
    total: number;
    cardsHuntingHere: number;
    playersWantYours: number;
    mutual: number;
  };
  mutual: MutualMatch[];
  theyHave: TheyHaveMatch[];
  theyWant: TheyWantMatch[];
  bring: BringCard[];
  /** playerId -> how many matched cards that player and the viewer share, both directions. */
  perPlayer: Record<string, number>;
}

/** What a viewer with nothing to match, or no account, reads. */
export const EMPTY_MATCHES: NightMatches = {
  summary: { total: 0, cardsHuntingHere: 0, playersWantYours: 0, mutual: 0 },
  mutual: [],
  theyHave: [],
  theyWant: [],
  bring: [],
  perPlayer: {},
};

/**
 * The matches for the signed-in viewer at a night. A guest's answer is
 * the empty set, not an error, so the room draws the sign-in pitch
 * where the matches would be.
 */
export const getNightMatches = (eventId: string) =>
  call<NightMatches>("GET", `/api/v1/nights/${encodeURIComponent(eventId)}/matches`);

/** Packed, or unpacked, one card on the What to bring list. */
export const setPacked = (eventId: string, cardId: string, packed: boolean) =>
  call<{ ok: true }>("PUT", `/api/v1/nights/${encodeURIComponent(eventId)}/packed`, {
    cardId,
    packed,
  });

/** A Flare on a player's event-facing profile: the board's row, bare. */
export type NightPlayerFlare = Omit<
  RoomFlare,
  "match" | "heldCount" | "counterMayHave" | "offers"
> &
  Partial<Pick<RoomFlare, "match" | "heldCount" | "counterMayHave" | "offers">>;

/**
 * One player as this night sees them: the website's `NightPlayerView`.
 * Their Flares here, their binders up for trade (never a private one),
 * and the cards that cross with the viewer's.
 */
export interface NightPlayerView {
  player: MatchPlayer;
  matches: number;
  theyHave: MatchCard[];
  theyWant: MatchCard[];
  /**
   * Their Flares at this night: the board's entries as the server
   * stores them, without the viewer's match, the counter's shelf and
   * the offers the room route adds. The tiles need none of those.
   */
  flares: NightPlayerFlare[];
  /** Up for trade only. */
  binders: BinderSummary[];
  /**
   * The binders they said they are bringing to this night, as the
   * viewer may see them: a private one only with its owner's "Show to
   * this Night only", and only for players going. Absent from an
   * older server.
   */
  bringing?: BroughtBinder[];
  flaresCount: number;
  /** The size of their Have list. */
  tradeCards: number;
}

/** 404 when they are not on the roster. */
export const getNightPlayer = (eventId: string, playerId: string) =>
  call<NightPlayerView>(
    "GET",
    `/api/v1/nights/${encodeURIComponent(eventId)}/players/${encodeURIComponent(playerId)}`,
  );

/* ------------------------------------------------------------------ */
/* Binders I'm Bringing                                                */
/* ------------------------------------------------------------------ */

/** One binder on the picker: the website's `NightBinderChoice`. */
export interface NightBinderChoice extends BinderSummary {
  /** Picked for this night. */
  selected: boolean;
  /** Picked and private: the owner chose to show it to this night only. */
  eventOnly: boolean;
}

/**
 * The picker's state for the signed-in player at one night: every
 * binder they own, which are picked, and whether the night still takes
 * changes. The website's `NightBinderState`.
 */
export interface NightBinderState {
  /** The night can still take changes: upcoming, early or live. */
  editable: boolean;
  /** The player is on this night's roster. */
  going: boolean;
  /** "tonight", "Friday" or "Oct 24": for "Your binders for tonight". */
  dayWord: string;
  binders: NightBinderChoice[];
  selectedCount: number;
  selectedCards: number;
}

/** One brought binder as another player sees it: the website's `BroughtBinder`. */
export interface BroughtBinder {
  id: string;
  name: string;
  cover: BinderCoverId;
  count: number;
  /** Private, shown to this night's attendees by the owner's choice. */
  eventOnly: boolean;
}

/** One pick as the picker sends it back. */
export interface NightBinderPick {
  binderId: string;
  /** The owner's explicit choice to show a PRIVATE binder to this night. */
  eventOnly: boolean;
}

/** The picker's state. A 404 when there is no such night. */
export const getNightBinders = (eventId: string) =>
  call<{ state: NightBinderState }>(
    "GET",
    `/api/v1/nights/${encodeURIComponent(eventId)}/binders`,
  );

/**
 * Replaces the player's picks at one night; an empty list is "Not
 * bringing any". Refused with the code of one of BRINGING_REFUSALS in
 * src/night-binder-copy.ts: `needs-consent` (400), `not-yours` (404),
 * `not-going` and `not-open` (409), `unavailable` (503).
 */
export const saveNightBinders = (eventId: string, picks: NightBinderPick[]) =>
  call<{ state: NightBinderState }>(
    "PUT",
    `/api/v1/nights/${encodeURIComponent(eventId)}/binders`,
    { picks },
  );

/** What saying Going, or Not going, comes back with. */
export interface GoingAnswer {
  youGoing: boolean;
  goingCount: number;
  /** How many of the account's Flares went on the board with it. */
  posted: number;
}

/**
 * Going (true) or Not going (false) to a night, by its event id.
 *
 * One tap. Going puts the account on the roster with its Flares and
 * trade binders; Not going takes it off. The server refuses with
 * `no-account` for a guest, `not-open` once the night has finished,
 * and `not-found` for an id it does not know.
 */
export async function setGoing(eventId: string, going: boolean): Promise<GoingAnswer> {
  const result = await call<GoingAnswer & { sessionToken?: string }>(
    going ? "POST" : "DELETE",
    `/api/v1/nights/${encodeURIComponent(eventId)}/going`,
  );

  /*
   * Handed out once, when Going had to mint the account's room identity
   * for a phone holding none. Kept exactly as the join keeps it: a phone
   * that dropped it would mint a new identity on every tap.
   */
  if (result.sessionToken) {
    await SecureStore.setItemAsync(SESSION_KEY, result.sessionToken);
  }

  const { sessionToken: _token, ...answer } = result;
  return answer;
}

export async function joinRoom(
  code: string,
  displayName?: string,
): Promise<{
  joined: boolean;
  /**
   * The account was already in this room, from the website or from an
   * earlier install, and this tap picked that seat up rather than adding a
   * second one. Worth saying out loud: a join that looks like it did
   * nothing is exactly how the duplicate used to present.
   */
  resumed?: boolean;
  /** How many of the account's Flares went on the board, and how many
      did not fit. Absent from an older server. */
  posted?: number;
  skipped?: number;
  boardCap?: number;
  you: { sessionId: string; displayName: string };
}> {
  // Joining does the most server work of any call (session creation,
  // walk-in rooms opening, a possible cold start) — it gets double the
  // patience before the screen calls it a timeout.
  const result = await call<{
    joined: boolean;
    resumed?: boolean;
    posted?: number;
    skipped?: number;
    boardCap?: number;
    you: { sessionId: string; displayName: string };
    sessionToken?: string;
  }>(
    "POST",
    `/api/v1/rooms/${encodeURIComponent(code)}`,
    { displayName },
    false,
    30_000,
  );

  // Handed out exactly once; keep it or the membership is lost.
  if (result.sessionToken) {
    await SecureStore.setItemAsync(SESSION_KEY, result.sessionToken);
  }

  return result;
}

/**
 * Nudges a saved want's quantity, plus or minus, and returns where it
 * landed after the server clamped it. A delta rather than an absolute so
 * two quick taps add two, not one.
 */
export const nudgeWant = (wantId: string, delta: number) =>
  call<{ ok: true; quantity: number }>(
    "POST",
    `/api/v1/wants/${encodeURIComponent(wantId)}`,
    { delta },
  );

/** Drops a saved want for good. */
export const dropWant = (wantId: string) =>
  call<{ ok: true }>("DELETE", `/api/v1/wants/${encodeURIComponent(wantId)}`);

/** An offering on the same list: the row is the card, so these take a card id. */
export const nudgeOffering = (cardId: string, delta: number) =>
  call<{ ok: true; quantity: number }>("POST", "/api/v1/offerings", {
    action: "nudge",
    cardId,
    delta,
  });

export const dropOffering = (cardId: string) =>
  call<{ ok: true }>("POST", "/api/v1/offerings", { action: "remove", cardId });

export const postFlare = (
  code: string,
  entry: {
    cardId: string;
    printingId?: string | null;
    quantity: number;
    note?: string;
    deckLabel?: string | null;
    /** "showcase" offers the card up instead of asking for it. */
    intent?: "want" | "showcase";
    /** What the poster will take. Omitted means a plain trade. */
    acceptsTrade?: boolean;
    acceptsCash?: boolean;
  },
) =>
  call<{ ok: true }>("POST", `/api/v1/rooms/${encodeURIComponent(code)}/flares`, entry);

export const withdrawOffer = (code: string, flareId: string) =>
  call<{ ok: true }>("DELETE", `/api/v1/rooms/${encodeURIComponent(code)}/offers`, {
    flareId,
  });

export const offerOnFlare = (
  code: string,
  flareId: string,
  message?: string,
  quantity?: number,
) =>
  call<{ ok: true }>("POST", `/api/v1/rooms/${encodeURIComponent(code)}/offers`, {
    flareId,
    message,
    quantity,
  });

export const confirmTrade = (
  code: string,
  flareId: string,
  partnerSessionId?: string,
) =>
  call<{ ok: true }>("POST", `/api/v1/rooms/${encodeURIComponent(code)}/trades`, {
    flareId,
    partnerSessionId,
  });

/**
 * "Found it": the old Remove. Every copy in hand, everywhere, and the
 * Feed says so. A Flare's other exit is `takeDownRoomFlare` below.
 */
export const removeFlare = (code: string, flareId: string) =>
  call<{ ok: true }>("DELETE", `/api/v1/rooms/${encodeURIComponent(code)}/flares`, {
    flareId,
  });

/**
 * "Take down": the card leaves the board and the Feed and nothing is
 * announced. The ids come back for the one-minute undo. An older
 * server, which knows no `mode`, sends no ids back; an empty list means
 * there is nothing to offer an undo on.
 */
export const takeDownRoomFlare = async (
  code: string,
  flareId: string,
): Promise<{ ok: boolean; flareIds: string[] }> => {
  const result = await call<{ ok: boolean; flareIds?: string[] }>(
    "DELETE",
    `/api/v1/rooms/${encodeURIComponent(code)}/flares`,
    { flareId, mode: "take-down" },
  );
  return { ok: result.ok, flareIds: result.flareIds ?? [] };
};

/** The undo: puts back what `takeDownRoomFlare` took down a moment ago. */
export const restoreRoomFlares = async (
  code: string,
  flareIds: string[],
): Promise<{ ok: boolean; restored: number }> => {
  const result = await call<{ ok: boolean; restored?: number }>(
    "DELETE",
    `/api/v1/rooms/${encodeURIComponent(code)}/flares`,
    { flareId: flareIds[0], mode: "restore", flareIds },
  );
  return { ok: result.ok, restored: result.restored ?? 0 };
};

export const setOpenToTrades = (code: string, open: boolean) =>
  call<{ ok: true }>("POST", `/api/v1/rooms/${encodeURIComponent(code)}/open`, {
    open,
  });

/** The last room joined, so the Room tab reopens where the player was. */
const LAST_ROOM_KEY = "cf_last_room";

export async function rememberRoom(code: string): Promise<void> {
  await SecureStore.setItemAsync(LAST_ROOM_KEY, code);
}

export async function lastRoom(): Promise<string | null> {
  return SecureStore.getItemAsync(LAST_ROOM_KEY);
}

/**
 * Forgetting the last room — the way back out of a code that led nowhere.
 *
 * A typed code is remembered before the room answers, because the screen
 * needs something to load. When the answer is "no such room" that stored
 * code would otherwise reopen the same dead end on every visit, with
 * only a Try again button pointed at the same 404. The game scope goes
 * with it: a scope without its room is a stale filter waiting to narrow
 * the wrong night's search.
 */
export async function forgetRoom(): Promise<void> {
  await SecureStore.deleteItemAsync(LAST_ROOM_KEY);
  await SecureStore.deleteItemAsync(LAST_ROOM_GAME_KEY);
}

/**
 * The TCG the scanned code was scoped to, when it came off a
 * tournament's own screen (`?g=one-piece` in the QR's URL). Kept beside
 * the room code so card search inside that room only offers that
 * game's cards. Cleared whenever a scan carries no game — the counter
 * code is universal, and a stale scope from last week's screen must
 * not narrow tonight's search.
 */
const LAST_ROOM_GAME_KEY = "cf-room-game";

export async function rememberRoomGame(game: string | null): Promise<void> {
  if (game && /^[a-z][a-z0-9-]{1,30}$/.test(game)) {
    await SecureStore.setItemAsync(LAST_ROOM_GAME_KEY, game);
  } else {
    await SecureStore.deleteItemAsync(LAST_ROOM_GAME_KEY);
  }
}

export async function lastRoomGame(): Promise<string | null> {
  return SecureStore.getItemAsync(LAST_ROOM_GAME_KEY);
}

/**
 * The game chip last tapped above a card search on this device - the
 * website keeps the same thing in localStorage under the same name.
 * "all" is a real answer (every game), stored so it beats the sign-up
 * default; anything else is a game slug.
 */
const SEARCH_GAME_KEY = "cf-search-game";

export async function rememberSearchGame(value: string): Promise<void> {
  if (/^[a-z][a-z0-9-]{1,30}$/.test(value)) {
    await SecureStore.setItemAsync(SEARCH_GAME_KEY, value);
  }
}

export async function lastSearchGame(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(SEARCH_GAME_KEY);
  } catch {
    return null;
  }
}

export interface CardHit {
  id: string;
  name: string;
  cardNumber: string;
  cardType: string | null;
  colors: string[];
  cost: number | null;
  life: number | null;
  power: number | null;
  counter: number | null;
  /** The printing whose art leads the row — the website's base-art rule. */
  basePrintingId: string | null;
  printings: { id: string; label: string | null; imageUrl: string | null }[];
  /** The game's slug, for its short name on a search row. Older servers omit it. */
  game?: string | null;
}

export const searchCards = (query: string, game?: string | null) =>
  call<{ cards: CardHit[] }>(
    "GET",
    `/api/v1/cards?q=${encodeURIComponent(query)}${
      game ? `&game=${encodeURIComponent(game)}` : ""
    }`,
  );

/* ------------------------------------------------------------------ */
/* The card page: one card, who has it, who hunts it, where it sits    */
/* ------------------------------------------------------------------ */

/** Somebody on the card page: enough for a face, a name and a door. */
export interface CardPagePlayer {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  aura: string | null;
}

/**
 * The website's /cards/[cardId], the app's copy of
 * src/lib/cards/card-page.ts. Every row a screen draws comes from
 * here; nothing on the page is made up.
 */
export interface CardPage {
  card: {
    cardId: string;
    name: string;
    number: string;
    game: string;
    imageUrl: string | null;
  };
  /** Null when signed out. */
  you: {
    inTradeBinder: boolean;
    onHunt: { huntId: string; name: string } | null;
    wanted: boolean;
  } | null;
  /** The viewer has a postal code, so distances exist. */
  located: boolean;
  /** Players with it in a binder up for trade, nearest first. */
  holders: { player: CardPagePlayer; milesLabel: string | null }[];
  /** Players after it: an open Flare, or a card on a public hunt. */
  hunters: {
    player: CardPagePlayer;
    milesLabel: string | null;
    postId: string | null;
    huntId: string | null;
    printingLabel: string | null;
    quantity: number;
  }[];
  /** Stores with it in the case or the counter's synced singles, nearest first. */
  stores: {
    storeId: string;
    name: string;
    city: string | null;
    region: string | null;
    miles: number | null;
    inCase: boolean;
  }[];
}

/** The card page. A 404 is "no such card", which the screen says. */
export const getCardPage = (cardId: string) =>
  call<{ page: CardPage }>("GET", `/api/v1/cards/${encodeURIComponent(cardId)}/page`);

/** One trade, as the room renders it for one viewer - the web's shape. */
export interface TradeRecord {
  id: string;
  cardId: string;
  cardName: string;
  cardNumber: string;
  quantity: number;
  youWere: "requester" | "holder";
  partnerName: string | null;
  confirmedAt: string;
  /**
   * Where the Embers stand: waiting on the partner, both hands on it,
   * nobody named, paid late to the author alone, or taken back.
   * Optional so an older server still lists trades.
   */
  status?: "pending" | "confirmed" | "unnamed" | "late" | "disputed";
  /** True while the viewer's own tap is what the trade waits for. */
  awaitingYou?: boolean;
  flareId?: string | null;
  requesterSessionId?: string | null;
}

/** The partner's "yes, we traded": the tap that pays both sides. */
export const acknowledgeTrade = (
  code: string,
  tradeId: string,
  flareId?: string | null,
  requesterSessionId?: string | null,
) =>
  call<{ ok: true }>("POST", `/api/v1/rooms/${encodeURIComponent(code)}/trades`, {
    action: "acknowledge",
    tradeId,
    flareId: flareId ?? undefined,
    requesterSessionId: requesterSessionId ?? undefined,
  });

export const getTrades = (code: string) =>
  call<{ trades: TradeRecord[] }>(
    "GET",
    `/api/v1/rooms/${encodeURIComponent(code)}/trades`,
  );

export const registerDevice = (platform: "ios" | "android", pushToken: string) =>
  call<{ ok: true }>("POST", "/api/v1/devices", { platform, pushToken });

export const unregisterDevice = (pushToken: string) =>
  call<{ ok: true }>("DELETE", "/api/v1/devices", { pushToken });

/**
 * Which groups of notices reach this phone: the four switches under
 * Push notifications in Settings. The Inbox keeps every notice either
 * way; these only decide what buzzes.
 */
export const getPushPrefs = () => call<{ prefs: PushPrefs }>("GET", "/api/v1/me/push");

export const setPushPref = (group: PushGroup, on: boolean) =>
  call<{ prefs: PushPrefs }>("PUT", "/api/v1/me/push", { group, on });

/**
 * The person behind a notice, dressed: the website's `InboxActor`.
 * The same fields a People row carries, so the face on a notice is the
 * face on the profile, worn ring and all.
 */
export interface InboxActor {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  aura: string | null;
  ringArt: ArtFile | null;
  auraArt: ArtFile | null;
}

export interface InboxItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  createdAt: string;
  readAt: string | null;
  /**
   * Who did it. Null for a board opening, or a person who has since
   * left; absent from an older server, which reads the same way.
   */
  actor?: InboxActor | null;
}

export const getNotifications = () =>
  call<{ notifications: InboxItem[] }>("GET", "/api/v1/notifications");

export const markRead = (ids: string[]) =>
  call<{ ok: true }>("POST", "/api/v1/notifications", { ids });

/**
 * How many notices are still unread, for the dot on the Inbox tab.
 * A number and nothing else, so the tab bar can ask often without
 * pulling the whole list. Signed out is a 401, which the dot reads as
 * "no dot" (src/unread.ts).
 */
export const getUnreadCount = () =>
  call<{ unread: number }>("GET", "/api/v1/notifications/unread");

/* ------------------------------------------------------------------ */
/* Profile, Embers and the wardrobe                                    */
/* ------------------------------------------------------------------ */

/**
 * The tab that used to be Account.
 *
 * Two Ember numbers, exactly as the website carries them. `embersEarned`
 * is the lifetime badge and is public; `embersBalance` is what is left
 * to spend and is private, which is why it is optional here — a profile
 * fetched for somebody else comes back without it, because the server
 * builds those from a type that has no field for it.
 */
/**
 * A named set of cards somebody is looking for - "Sabo", "Red Luffy".
 *
 * Optional wherever it appears, because an app build meets servers older
 * than itself routinely and a profile with no hunts should draw a
 * profile, not a crash.
 */
export interface HuntCard {
  /** The request row, which is what progress writes to. */
  requestId?: string;
  /** An open Flare posted for this card, or null when none is up. */
  flareId: string | null;
  /**
   * The post that Flare went up in, or null when nothing is posted.
   * Informational now: a visitor's "I have this" goes by request
   * through `offerOnHunt`, posted or not, and the server decides
   * whether each card becomes an offer on the post or a message.
   */
  postId?: string | null;
  cardId: string;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
  /** Null is any printing. */
  printingId?: string | null;
  /** "OP01 · SR · Alt art", or null for any printing. */
  printingLabel?: string | null;
  /** Copies wanted, copies in hand, and the difference. */
  needed?: number;
  foundCopies?: number;
  remaining?: number;
  /** Copies that came through a trade closed here, never undoable. */
  tradedCopies?: number;
  /** Every copy is in hand. */
  found: boolean;
  /**
   * Found by a TRADE here, rather than by hand. Only a hand-ticked card
   * offers a box - a trade is a thing that happened between two people,
   * and a box offering to undo it would be lying about what it does.
   *
   * Optional for the same version-skew reason `cards` is: an older
   * server sends neither, and a card with no flag reads as hand-ticked,
   * which is the forgiving way round.
   */
  tradedAway?: boolean;
  quantity: number;
}

export interface Hunt {
  /** Absent from an older server, which folded hunts off the label. */
  id?: string;
  name: string;
  description?: string | null;
  visibility?: "public" | "private";
  looking: number;
  lookingCopies: number;
  found: number;
  /** Copies across the whole list, copies in hand, and the difference. */
  neededCopies?: number;
  foundCopies?: number;
  remainingCopies?: number;
  lastPostedAt: string;
  /**
   * The cards themselves, still looking first.
   *
   * OPTIONAL on purpose. The app ships on TestFlight's clock and the
   * server on Vercel's, so a phone carrying this meets a server that
   * sends hunts with counts and nothing else. A folder that opens on
   * nothing is honest; one that crashes on `undefined.map` is not.
   */
  cards?: HuntCard[];
}

export interface ShowcaseCard {
  id: string;
  cardId: string;
  printingId: string | null;
  name: string;
  number: string;
  imageUrl: string | null;
  position: number;
  /** This card's own dressing, or null to wear the profile's default. */
  frame: string | null;
  holo: string | null;
  /** The owner's caption, or null. Absent from an older server. */
  note?: string | null;
}

/** A note's ceiling, the server's number. */
export const SHOWCASE_NOTE_MAX = 140;

/** Cosmetic slugs. Resolved server-side, so a slot is never null here. */
export interface Equipped {
  /** Around the profile picture, separate from the cards. */
  avatarFrame: string | null;
  /** The DEFAULTS showcase cards wear; a card can override for itself. */
  frame: string | null;
  holo: string | null;
  effect: string | null;
}

/** Where a bought frame lands: on the picture, or as the card default. */
export type EquipSlot = "avatarFrame" | "cardFrame" | "holo" | "effect";

export interface CosmeticItem {
  slug: string;
  kind: "frame" | "holo" | "effect";
  name: string;
  description: string;
  cost: number;
  requiresEarned: number | null;
  owned: boolean;
  equipped: boolean;
  affordable: boolean;
  lockedUntil: number | null;
}

export interface Profile {
  playerId: string;
  displayName: string;
  /** The unique one, written `@handle` wherever a person reads it. */
  handle: string;
  /** The short line under the name, up to four lines, or null. */
  bio?: string | null;
  /** "he/him", or null. */
  pronouns?: string | null;
  avatarUrl: string | null;
  embersEarned: number;
  /** The stores that named this player an organizer: the TO badge. */
  organizerAt?: { storeId: string; name: string }[];
  /**
   * The membership tier, and the one question the app actually asks of
   * it. Optional so a build against an older server keeps working —
   * absent reads as free, which locks nothing that was unlocked before
   * this shipped and never invents an entitlement.
   */
  tier?: string;
  pro?: boolean;
  /**
   * The player's own subscription, for the Pro screen's renewal line and
   * its Manage subscription door. Null with none; absent (undefined)
   * from a server older than this field, which the screen treats as
   * "do not know" and draws no date.
   */
  subscription?: {
    source: "stripe" | "apple";
    renewsAt: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  /**
   * Private. The founder's two-number rule: this is what is left to
   * spend, it never appears on anybody else's screen, and the server
   * only ever puts it on the authenticated player's own profile.
   */
  embersBalance: number;
  /** The banner behind the picture, or null for the plain block. */
  coverUrl: string | null;
  equipped: Equipped;
  /**
   * The profile border and avatar effect worn from the catalogue, and
   * the files behind them when they were dropped in rather than drawn
   * in CSS. The app draws these itself now.
   */
  wear?: {
    ring: string | null;
    aura: string | null;
    ringArt: ArtFile | null;
    auraArt: ArtFile | null;
  } | null;
  /**
   * Every catalogue slot, as the slug worn in it or null.
   *
   * Separate from `equipped`, which carries the LEGACY four - the nine
   * original frames, the four holos, the avatar frame - and is what the
   * app dressed cards with before the catalogue existed. This is the
   * catalogue: 43 card borders, 35 holo patterns, 31 card animations,
   * 30 showcase backgrounds, 19 profile scenes, 13 name styles, and the
   * rings and auras the avatar already draws.
   *
   * Optional because an app build older than the server's payload
   * should keep working, not crash on a missing key.
   */
  equips?: Partial<Record<CustomizeKind, string | null>> | null;
  showcase: ShowcaseCard[];
  showcaseLimit: number;
  /** Their named hunts. Absent from an older server. */
  hunts?: Hunt[];
  /** How many they may keep, which their tier decides. */
  huntLimit?: number;
  /** The three numbers under the picture; absent from an older server. */
  stats?: ProfileStats;
  /**
   * Every binder, in the owner's order: the highlights row and the
   * Binders pane. Absent from an older server.
   */
  binders?: BinderSummary[];
  /**
   * The Flares up right now, newest first: the same list the Flares
   * number counts. Absent from an older server.
   */
  flares?: ProfileFlare[];
}

/**
 * One Flare on a profile: the card, how many, and which way it points.
 * The server's `ProfileFlare`, same names, same shapes.
 */
export interface ProfileFlare {
  id: string;
  cardId: string;
  cardName: string;
  cardNumber: string;
  printingLabel: string | null;
  imageUrl: string | null;
  quantity: number;
  direction: "want" | "offering";
  deckLabel: string | null;
  /** On someone else's want, whether you hold it; absent on your own. */
  match?: "exact" | "other-printing" | null;
}

/** The Instagram row: Flares where posts would be, then followers, following. */
export interface ProfileStats {
  flares: number;
  followers: number;
  following: number;
}

export interface Wardrobe {
  /** Frames marked equipped against the profile-picture slot. */
  avatarFrames: CosmeticItem[];
  /** The same frames, marked against the card default slot. */
  cardFrames: CosmeticItem[];
  holos: CosmeticItem[];
  effects: CosmeticItem[];
}

export const getProfile = () =>
  call<{ profile: Profile; wardrobe: Wardrobe; needsSetup: boolean }>(
    "GET",
    "/api/v1/profile",
  );

/**
 * Step one of account setup: the name people see AND the handle they are
 * found by, which together mark setup done.
 *
 * The handle is optional on the wire so an older app build still
 * finishes setup; the server derives one from the name in that case.
 */
export const chooseUsername = (displayName: string, handle?: string) =>
  call<{ ok: true }>("POST", "/api/v1/profile", {
    action: "choose-username",
    displayName,
    handle,
  });

/** Pronouns and bio, saved together. An empty string clears either. */
export const setAbout = (about: { pronouns: string; bio: string }) =>
  call<{ ok: true; pronouns: string | null; bio: string | null }>(
    "POST",
    "/api/v1/profile",
    { action: "set-about", ...about },
  );

export const renameProfile = (displayName: string) =>
  call<{ ok: true }>("POST", "/api/v1/profile", { action: "rename", displayName });

/**
 * Deleting the account. The handle typed back is the lock; the server
 * checks it again and refuses with "handle-mismatch" if it differs.
 */
export const deleteAccount = (confirmHandle: string) =>
  call<{ ok: true }>("POST", "/api/v1/me/delete", { confirmHandle });

/** Changing the handle. The one field that can still come back taken. */
export const setHandle = (handle: string) =>
  call<{ ok: true; handle: string }>("POST", "/api/v1/profile", {
    action: "set-handle",
    handle,
  });

/** Buys it if it is not yours, wears it if it is. One tap either way. */
export const buyCosmetic = (slug: string, slot?: EquipSlot) =>
  call<{ ok: true; slug: string }>("POST", "/api/v1/profile", {
    action: "buy",
    slug,
    slot,
  });

export const addToShowcase = (
  cardId: string,
  printingId: string | null,
  dressing?: { frame: string | null; holo: string | null },
) =>
  call<{ ok: true }>("POST", "/api/v1/profile", {
    action: "showcase-add",
    cardId,
    printingId,
    frame: dressing?.frame ?? null,
    holo: dressing?.holo ?? null,
  });

/** Dresses one showcase card: its own border and holo. */
export const dressShowcase = (
  entryId: string,
  frame: string | null,
  holo: string | null,
) =>
  call<{ ok: true }>("POST", "/api/v1/profile", {
    action: "showcase-dress",
    entryId,
    frame,
    holo,
  });

/** The caption under one showcase card. Empty clears it. */
export const setShowcaseNote = (entryId: string, note: string) =>
  call<{ ok: true }>("POST", "/api/v1/profile", {
    action: "showcase-note",
    entryId,
    note: note.trim().length > 0 ? note.trim() : null,
  });

/** Apply to all: the pair becomes the default, every override clears. */
export const dressAllShowcase = (frame: string | null, holo: string | null) =>
  call<{ ok: true }>("POST", "/api/v1/profile", {
    action: "showcase-dress-all",
    frame,
    holo,
  });

/**
 * Another player's public face, for the in-room popup and the profile
 * screen: name, picture, badge, and their shelf with each card's
 * dressing already resolved. The server never puts a balance in this
 * shape, so this client could not show one if it tried.
 */
export interface PeekProfile {
  playerId: string;
  displayName: string;
  /** The unique one, so a popup can say who this actually is. */
  handle: string;
  /** The short line under the name, or null. */
  bio?: string | null;
  /** "he/him", or null. */
  pronouns?: string | null;
  avatarUrl: string | null;
  /** The stores that named this player an organizer: the TO badge. */
  organizerAt?: { storeId: string; name: string }[];
  /** Their cover banner, blurred behind the popup header. */
  coverUrl: string | null;
  /** The viewer's side of the relationship; null hides the button. */
  follow: FollowState | null;
  /**
   * Both directions of a block, false on your own profile and for a
   * guest. Absent from an older server, which never blocked anybody.
   */
  blocked?: boolean;
  blockedBy?: boolean;
  /** Their three numbers; absent from an older server. */
  stats?: ProfileStats;
  embersEarned: number;
  /** The ring around their picture. */
  frame: string | null;
  /** The catalogue ring, worn over the frame when both are set. */
  ring: string | null;
  /** The catalogue avatar effect, which rides with any ring. */
  aura: string | null;
  /** A dropped-in profile border and avatar effect, when worn. */
  ringArt: ArtFile | null;
  auraArt: ArtFile | null;
  effect: string | null;
  /** Every catalogue slot they wear; see Profile.equips. */
  equips?: Partial<Record<CustomizeKind, string | null>> | null;
  /** Their named hunts. Absent from an older server. */
  hunts?: Hunt[];
  /**
   * Every binder of theirs that is up for trade, in their order, with
   * how many of its cards are on your hunts. Empty when none is.
   * Absent from an older server.
   */
  binders?: BinderSummary[];
  /** Their Flares, newest first. Absent from an older server. */
  flares?: ProfileFlare[];
  showcase: {
    id: string;
    name: string;
    number: string;
    imageUrl: string | null;
    frame: string | null;
    holo: string | null;
    /** The owner's caption, or null. Absent from an older server. */
    note?: string | null;
  }[];
}

export interface FollowState {
  following: boolean;
  followsYou: boolean;
  partners: boolean;
}

/** Follow or unfollow; returns the settled state for the button. */
export const toggleFollow = (playerId: string, following: boolean) =>
  call<{ follow: FollowState }>(
    "POST",
    `/api/players/${encodeURIComponent(playerId)}`,
    { action: following ? "unfollow" : "follow" },
  );

export interface FollowedPlayer {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  frame: string | null;
  partners: boolean;
}

/** Who you follow - the Profile tab's People list. */
export const getFollowing = () =>
  call<{ following: FollowedPlayer[] }>("GET", "/api/v1/following");

/** Who follows you - the other half of the same list. */
export const getFollowers = () =>
  call<{ followers: FollowedPlayer[] }>("GET", "/api/v1/followers");

/** Somebody else's two lists, behind the numbers on their profile. */
export const getPlayerPeople = (playerId: string) =>
  call<{ followers: FollowedPlayer[]; following: FollowedPlayer[] }>(
    "GET",
    `/api/players/${encodeURIComponent(playerId)}/people`,
  );

/* ------------------------------------------------------------------ */
/* Report and block                                                    */
/* ------------------------------------------------------------------ */

export type ReportKind = "post" | "player" | "thread" | "comment";
export type ReportReason = "spam" | "scam" | "harassment" | "other";

/**
 * The four reasons, in the website's words (src/lib/players/safety.ts
 * REPORT_REASONS). The server validates the value, so a reason the
 * list does not know is refused rather than filed blind.
 */
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "scam", label: "Scam or fake listing" },
  { value: "harassment", label: "Harassment" },
  { value: "other", label: "Something else" },
];

/**
 * A block is quiet: the server never tells the other person, and the
 * Feed, threads and conversations forget them on the next read. The
 * profile re-reads `peekPlayer` for the settled state.
 */
export const blockPlayer = (playerId: string) =>
  call<{ ok: boolean }>("POST", "/api/v1/safety", { action: "block", playerId });

export const unblockPlayer = (playerId: string) =>
  call<{ ok: boolean }>("POST", "/api/v1/safety", { action: "unblock", playerId });

/** One row on the settings page's "Blocked players" card. */
export interface BlockedPlayer {
  playerId: string;
  displayName: string;
  handle: string | null;
}

/** The people you have blocked, newest first: the settings card's list. */
export const listBlockedPlayers = () =>
  call<{ blocked: BlockedPlayer[] }>("GET", "/api/v1/safety");

/**
 * A note to the admins about a post, a player or a conversation. A
 * refusal is an ApiError whose code is the server's reason
 * ("not-found", "yourself", "unavailable"); the sheet puts it in words.
 */
export const reportTarget = (
  kind: ReportKind,
  targetId: string,
  reason: ReportReason,
  note?: string,
) =>
  call<{ ok: boolean }>("POST", "/api/v1/safety", {
    action: "report",
    kind,
    targetId,
    reason,
    ...(note ? { note } : {}),
  });

/* ------------------------------------------------------------------ */
/* Nearby matching                                                     */
/* ------------------------------------------------------------------ */

export interface NearbySettings {
  enabled: boolean;
  /** Null means nothing can match until a ZIP is saved. */
  postalCode: string | null;
}

export const getNearbySettings = () => call<NearbySettings>("GET", "/api/v1/me/nearby");

export const setNearbyMatching = (enabled: boolean) =>
  call<NearbySettings>("PUT", "/api/v1/me/nearby", { enabled });

/** What the wanter said, and where the thread opens: a saved want or a room-less Flare. */
export type NearbyAsk = { kind: "want" | "flare"; id: string };

/** One nearby match, as the Feed shows it to the holder. */
export interface NearbyMatch {
  ask: NearbyAsk;
  haveEntryId: string;
  wanter: {
    playerId: string;
    displayName: string;
    avatarUrl: string | null;
    frame: string | null;
    ring: string | null;
    aura: string | null;
    ringArt: ArtFile | null;
    auraArt: ArtFile | null;
  };
  card: {
    cardId: string;
    cardName: string;
    cardNumber: string;
    imageUrl: string | null;
    match: "exact" | "other-printing";
  };
  miles: number;
  milesLabel: string;
  threadId: string | null;
}

/** "I have this": opens the conversation on the ask with a first message. */
export const openMatchThread = (ask: NearbyAsk, body: string) =>
  call<{ ok: boolean; threadId?: string; message?: string }>(
    "POST",
    "/api/v1/local/threads",
    ask.kind === "want" ? { wantId: ask.id, body } : { flareId: ask.id, body },
  );

export interface PackSeries {
  id: string;
  name: string;
  setNumber: number;
  priceEmbers: number;
  slots: number;
  odds: { rarity: string; slugs: string[]; percent: number }[];
  oddsDetail?: { rarity: string; items: { slug: string; percent: number }[] }[];
}

export interface SealedPack {
  id: string;
  series: string;
  source: string;
}

export interface PackPull {
  slug: string;
  rarity: string;
  duplicate: boolean;
  embersInstead: number;
}

export const getPacks = () =>
  call<{ series: PackSeries[]; packs: SealedPack[] }>("GET", "/api/v1/packs");

export const buyPack = (series: string) =>
  call<{ ok: true; packs: SealedPack[] }>("POST", "/api/v1/packs", {
    action: "buy",
    series,
  });

export const openPack = (packId: string) =>
  call<{ series: string; pulls: PackPull[]; packs: SealedPack[] }>(
    "POST",
    "/api/v1/packs",
    { action: "open", packId },
  );

export const peekPlayer = (playerId: string) =>
  call<PeekProfile>("GET", `/api/players/${encodeURIComponent(playerId)}`);

/* ------------------------------------------------------------------ */
/* The binder                                                          */
/* ------------------------------------------------------------------ */

/**
 * Binders: a player's cards in pages of nine pockets, each binder
 * named by its owner, with one switch. The types are the server's
 * `src/lib/binder/binder.ts`, same names, same shapes.
 *
 * There is no system Trade binder. The founder: "Ability for multiple
 * types of binders - and a toggle to enable it as a public / trade
 * binder. Anything that's public is up for trade." So every binder
 * carries `forTrade`: on, it is public to signed-in players and its
 * cards are available to trade (they feed nearby matching and the
 * room); off, it is private, only the owner opens it, and its cards
 * take no part in anything. `isPublic` is the same fact, read back.
 * A player can have several up for trade at once.
 */

export type { BinderCoverId };

/** As long as a binder's name may be. */
export const BINDER_NAME_MAX = 40;

export interface BinderCard {
  entryId: string;
  /**
   * The pocket it sits in: page 1 is 0 to 8, page 2 is 9 to 17. Gaps
   * are real and kept; src/pocket-math.ts draws and moves them.
   */
  pocket: number;
  cardId: string;
  name: string;
  number: string;
  imageUrl: string | null;
  printingLabel: string | null;
  quantity: number;
  note: string | null;
  /** The viewer wants this card (an open want or hunt line). Always false for the owner. */
  onYourHunt: boolean;
}

export interface Binder {
  /** The binder's uuid. */
  id: string;
  /** What the owner called it. */
  name: string;
  /** Up for trade: public, and its cards are there to be traded. */
  forTrade: boolean;
  ownerId: string;
  ownerName: string;
  yours: boolean;
  /** The same fact as `forTrade`, as the server reads it back. */
  isPublic: boolean;
  /** Every page is three by three. */
  layout: 3;
  cover: BinderCoverId;
  /** By pocket, gaps and all. */
  cards: BinderCard[];
  /**
   * The short link's code: www.cardflare.gg/b/<shareCode>. Null before
   * it has one, absent from an older server; the link falls back to
   * the binder's id, which opens the same binder.
   */
  shareCode?: string | null;
  count: number;
  onYourHunts: number;
}

/** The binder closed: the highlights row, the Binders list. */
export interface BinderSummary {
  id: string;
  name: string;
  forTrade: boolean;
  isPublic: boolean;
  count: number;
  layout: 3;
  cover: BinderCoverId;
  onYourHunts: number;
}

/** What the owner may change: the name, the cover, the one switch. */
export type BinderSettingsPatch = {
  name?: string;
  cover?: BinderCoverId;
  forTrade?: boolean;
};

/*
 * Every binder route takes the binder's uuid as its LAST argument,
 * the way the website's actions take `binderId` last. Yours under
 * /api/v1/binders, anybody's under /api/players/[id]/binders, where
 * only the ones up for trade answer.
 */

const binderPath = (binderId: string, playerId?: string) =>
  playerId
    ? `/api/players/${encodeURIComponent(playerId)}/binders/${encodeURIComponent(binderId)}`
    : `/api/v1/binders/${encodeURIComponent(binderId)}`;

/**
 * Every binder in the owner's order: all of yours with no id, or the
 * ones of theirs that are up for trade, which can be none.
 */
export const listBinders = (playerId?: string) =>
  playerId
    ? call<{ binders: BinderSummary[] }>(
        "GET",
        `/api/players/${encodeURIComponent(playerId)}/binders`,
      )
    : call<{ binders: BinderSummary[] }>("GET", "/api/v1/binders");

/**
 * One binder open: yours with no playerId, somebody else's with
 * theirs. A private one that is not yours, an id that is nobody's, or
 * a name with no account behind it is a 404 whose code is "private".
 */
export const getBinder = (playerId: string | undefined, binderId: string) =>
  call<{ binder: Binder }>("GET", binderPath(binderId, playerId));

/**
 * A binder opened from a night's "Binders they're bringing": through
 * /api/v1/binders/<id>?night=, the one door a private binder its owner
 * showed to that night opens through, and only for a signed-in player
 * going. A guest has no such door and reads it the plain way, where a
 * binder up for trade still answers.
 */
export const getBroughtBinder = async (
  playerId: string | undefined,
  binderId: string,
  nightId: string,
) =>
  (await storedAccessToken())
    ? call<{ binder: Binder }>(
        "GET",
        `${binderPath(binderId)}?night=${encodeURIComponent(nightId)}`,
      )
    : getBinder(playerId, binderId);

/** A new binder, private unless `forTrade`. A 409 whose code is "at-cap" at twenty. */
export const createBinder = (input: {
  name: string;
  cover?: BinderCoverId;
  forTrade?: boolean;
}) => call<{ binder: Binder }>("POST", "/api/v1/binders", input);

/** A binder, gone with its cards. Any of them, the last one too. */
export const deleteBinder = (binderId: string) =>
  call<{ ok: true }>("DELETE", binderPath(binderId));

/** One setting at a time or several; the binder comes back whole. */
export const saveBinder = (patch: BinderSettingsPatch, binderId: string) =>
  call<{ binder: Binder }>("PATCH", binderPath(binderId), patch);

/** One card of a batch: the card, its printing (null is any), how many copies. */
export interface BinderAddItem {
  cardId: string;
  printingId: string | null;
  quantity: number;
}

/**
 * Cards into a binder at once: the picker's tray, or a confirmed
 * pasted list. The first new card goes in `pocket` (the "+" tapped)
 * or the next empty one after it, the rest into the empty pockets
 * that follow; null puts them after the last card. A card already in
 * the binder counts up instead. Answers the binder whole, the sentence
 * to say ("Added 3 cards.") and the pocket the first card went into.
 * A 409 whose code is "at-cap" when the binder holds 200 already.
 */
export const addBinderCards = (
  binderId: string,
  items: BinderAddItem[],
  pocket: number | null,
) =>
  call<{ binder: Binder; message: string; firstPocket: number | null }>(
    "POST",
    `${binderPath(binderId)}/cards`,
    { items, pocket },
  );

/**
 * One card to one pocket, the drop at the end of a drag: an empty
 * pocket takes it, a full one slides the run along to the next gap
 * (src/pocket-math.ts's placeInPockets, which the screen paints first).
 */
export const placeBinderCard = (binderId: string, entryId: string, pocket: number) =>
  call<{ binder: Binder }>("PATCH", `${binderPath(binderId)}/cards`, {
    entryId,
    pocket,
  });

export const removeBinderCard = (entryId: string, binderId: string) =>
  call<{ binder: Binder }>("DELETE", `${binderPath(binderId)}/cards`, { entryId });

/** One pasted line, looked up: its card, or null when the number is not known. */
export interface BinderListEntry {
  cardId: string | null;
  cardNumber: string;
  quantity: number;
  name: string | null;
  imageUrl: string | null;
}

/**
 * "Paste a list" for a binder, looked up before anything goes in: one
 * entry per line, matched or not, and the lines that could not be
 * read. Writes nothing; the confirmed cards go to addBinderCards.
 */
export const previewBinderList = (list: string) =>
  call<{ ok: true; entries: BinderListEntry[]; unreadable: string[] }>(
    "POST",
    "/api/v1/binders/list-preview",
    { list },
  );

/** One card of an offer on a binder: its entry, and how many copies. */
export interface BinderOfferItem {
  entryId: string;
  quantity: number;
}

/**
 * "Send offer" in somebody's trade binder: the picked cards as one
 * message in the pair's one conversation, the website's
 * `offerOnBinderAction`. Answers the conversation's id, so the screen
 * can open it, and the sentence to say ("Sent to Mia. It's in your
 * messages."). A refusal is an ApiError whose code is the server's
 * reason; `binderOfferError` says it in words.
 */
export const offerOnBinder = (
  binderId: string,
  items: BinderOfferItem[],
  note: string | null,
  /** The night it was opened from, for a binder brought there. */
  nightId: string | null = null,
) =>
  call<{ ok: true; threadId: string; message: string }>(
    "POST",
    `/api/v1/binders/${encodeURIComponent(binderId)}/offer${
      nightId ? `?night=${encodeURIComponent(nightId)}` : ""
    }`,
    { items, note },
  );

/** A refused offer on a binder, in the website's sentence for it. */
export function binderOfferError(caught: unknown): string {
  if (!(caught instanceof ApiError)) return binderOfferFailure("");
  if (caught.status === 401) return binderOfferFailure("unauthorized");
  if (caught.status === 400) return binderOfferFailure("invalid");
  return binderOfferFailure(caught.code);
}

/**
 * A new profile picture, sent the only way this network allows.
 *
 * The image is already a small JPEG by the time it gets here (the
 * screen resizes and compresses before calling). It still cannot ride
 * in a body, so it goes as numbered base64 chunks inside the same
 * header every other write uses, and the server stitches them back
 * together. Sequential on purpose: a phone on shop wifi does better
 * with one small request at a time than with twelve in flight.
 */
export async function uploadAvatar(
  base64: string,
  onProgress?: (sent: number, total: number) => void,
  kind: "avatar" | "cover" | "avatar-animated" = "avatar",
): Promise<void> {
  const CHUNK = 6000;
  const total = Math.ceil(base64.length / CHUNK);

  const { uploadId } = await call<{ uploadId: string }>("POST", "/api/v1/avatar", {
    action: "begin",
  });

  for (let index = 0; index < total; index += 1) {
    await call<{ ok: true }>("POST", "/api/v1/avatar", {
      action: "chunk",
      uploadId,
      index,
      data: base64.slice(index * CHUNK, (index + 1) * CHUNK),
    });
    onProgress?.(index + 1, total);
  }

  await call<{ ok: true }>("POST", "/api/v1/avatar", {
    action: "commit",
    uploadId,
    count: total,
    kind,
  });
}

/* ------------------------------------------------------------------ */
/* The card scanner                                                    */
/* ------------------------------------------------------------------ */

/** What the reader saw on the card. Empty strings for what it could not read. */
export interface ScanRead {
  found: boolean;
  game: string;
  name: string;
  englishName: string;
  number: string;
  setCode: string;
}

/** One guess: the card, and the printing its set code points at. */
export interface ScanMatch {
  card: ScanCard;
  printingId: string | null;
}

/** The website's ScanOutcome (src/lib/cards/scan.ts), as the route sends it. */
export type ScanOutcome =
  | { ok: true; read: ScanRead; matches: ScanMatch[] }
  | { ok: false; reason: ScanRefusal; read?: ScanRead };

/** "on" scans, "pro-door" is the way to Pro, null draws nothing. */
export type ScanAccess = "on" | "pro-door" | null;

export const getScanAccess = () =>
  call<{ access?: ScanAccess }>("GET", "/api/v1/cards/scan").then(
    (result) => result.access ?? null,
  );

/**
 * One photo of one card, read on the server: the avatar's road (begin,
 * numbered base64 pieces in the payload header one after another, then
 * "read"), because a body does not survive every network this app
 * meets. The photo is already cropped and small by the time it gets
 * here. A phone the server will not let scan hears it at "begin",
 * before a single piece is sent.
 */
export async function scanCardPhoto(
  base64: string,
  onProgress?: (sent: number, total: number) => void,
): Promise<ScanOutcome> {
  const CHUNK = 6000;
  const total = Math.ceil(base64.length / CHUNK);
  const path = "/api/v1/cards/scan";

  let uploadId: string;
  try {
    ({ uploadId } = await call<{ uploadId: string }>("POST", path, {
      action: "begin",
    }));
  } catch (caught) {
    if (caught instanceof ApiError && caught.code === "not-allowed") {
      return { ok: false, reason: "not-allowed" };
    }
    throw caught;
  }

  for (let index = 0; index < total; index += 1) {
    await call<{ ok: true }>("POST", path, {
      action: "chunk",
      uploadId,
      index,
      data: base64.slice(index * CHUNK, (index + 1) * CHUNK),
    });
    onProgress?.(index + 1, total);
  }

  /* The read is a model looking at a photo, with one retry on the
     server: longer than the usual fifteen seconds is not a hang. */
  return call<ScanOutcome>(
    "POST",
    path,
    { action: "read", uploadId, count: total },
    false,
    60_000,
  );
}

export const removeFromShowcase = (entryId: string) =>
  call<{ ok: true }>("POST", "/api/v1/profile", {
    action: "showcase-remove",
    entryId,
  });

/** The games question: choices with mine ticked, and the replace-write. */
export const getGames = () =>
  call<{ choices: { slug: string; label: string }[]; mine: string[] }>(
    "GET",
    "/api/v1/games",
  );

export const setGames = (games: string[]) =>
  call<{ ok: true; mine: string[] }>("POST", "/api/v1/games", { games });

/**
 * The Feed: what is on at the places you go, and who needs what you have.
 *
 * Shapes mirror the website's `src/lib/feed/repository.ts` exactly, because
 * both clients render the same server answer - a feed that disagreed between
 * a phone and a laptop would be two products.
 */
export interface FeedCard {
  cardId: string;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
  /** Null when the viewer holds none of it — a friend's hunt shows those. */
  match: "exact" | "other-printing" | null;
  /** The Flare behind a hunt's card, so "I have this" can name it. */
  flareId?: string;
  /** OFFERED when a hand is up on it, FOUND when it traded. */
  state?: CardState;
  /** The viewer is one of the hands up. */
  youOffered?: boolean;
  /** The printing asked for, or null for any. */
  printingId?: string | null;
  /** "OP01 · SR · Alt art", or null for any printing. */
  printingLabel?: string | null;
  /** Copies asked for, and copies still wanted. */
  quantity?: number;
  remaining?: number;
  /** The hunt request this card answers, when the post is in a hunt. */
  huntRequestId?: string | null;
}

export type CardState = "open" | "offered" | "found";

/** One line under a Flare post. An offer line names the card it answers. */
export interface PostComment {
  id: string;
  createdAt: string;
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  kind: "comment" | "offer";
  body: string;
  cardName: string | null;
}

/** A comment's ceiling, the server's number. */
export const POST_COMMENT_MAX = 280;

export interface PostCard {
  cardId: string;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
  flareId: string;
  state: CardState;
  youOffered: boolean;
  match: "exact" | "other-printing" | null;
  printingId?: string | null;
  printingLabel?: string | null;
  /** Copies asked for, and copies still wanted. */
  quantity?: number;
  remaining?: number;
  huntRequestId?: string | null;
}

/** The whole post, for its own screen. Mirrors the server's PostDetail. */
export interface PostDetail {
  postId: string;
  author: {
    playerId: string | null;
    displayName: string;
    avatarUrl: string | null;
    frame: string | null;
    ring: string | null;
    /** The avatar effect. Absent from an older server. */
    aura?: string | null;
  };
  code: string | null;
  storeName: string | null;
  eventName: string | null;
  deckLabel: string | null;
  /** Which way the post points. Absent from an older server. */
  direction?: "want" | "showcase";
  caption?: string | null;
  /** The hunt the post belongs to. */
  hunt?: { id: string; name: string } | null;
  remainingCopies?: number;
  completed?: boolean;
  cards: PostCard[];
  yours: boolean;
  thread: PostComment[];
  likes: number;
  comments: number;
  liked: boolean;
  /**
   * A STORE's post rather than a player's, with the shop's header.
   * Null on every Flare; absent from an older server.
   */
  store?: {
    storeId: string;
    name: string;
    logoUrl: string | null;
    verified: boolean;
    title: string;
    body: string | null;
    imageUrl: string | null;
    postedAt: string;
  } | null;
}

/** A hunt on its own screen: the list plus who owns it. */
export interface HuntView extends Hunt {
  id: string;
  playerId: string;
  ownerName: string;
  yours: boolean;
}

export const getHunts = () =>
  call<{ hunts: Hunt[]; limit: number }>("GET", "/api/v1/hunts");

export const getHunt = (huntId: string) =>
  call<{ hunt: HuntView }>("GET", `/api/v1/hunts/${encodeURIComponent(huntId)}`);

export const createHunt = (input: {
  name: string;
  description?: string | null;
  visibility?: "public" | "private";
}) =>
  call<{ ok: true; huntId: string; hunts: Hunt[] }>("POST", "/api/v1/hunts", {
    action: "create",
    ...input,
  });

export const updateHunt = (
  huntId: string,
  patch: {
    name?: string;
    description?: string | null;
    visibility?: "public" | "private";
  },
) =>
  call<{ hunts: Hunt[]; limit: number }>("POST", "/api/v1/hunts", {
    action: "update",
    huntId,
    ...patch,
  });

/** Copies in hand for one request: "+1 found", the stepper, undo. */
export const setRequestFound = (requestId: string, found: number) =>
  call<{ hunts: Hunt[]; limit: number }>("POST", "/api/v1/hunts", {
    action: "set-found",
    requestId,
    found,
  });

/** The same, addressed by a posted card from the Feed. */
export const setFlareFound = (flareId: string, found: number) =>
  call<{ hunts: Hunt[]; limit: number }>("POST", "/api/v1/hunts", {
    action: "set-flare-found",
    flareId,
    found,
  });

/**
 * "Remove from hunt": one card off the owner's hunt. The server keeps
 * the request row with a removed_at and takes its open Flares down;
 * the pocket is simply gone on the next paint.
 */
export const removeHuntCard = (requestId: string) =>
  call<{ ok: true }>("POST", "/api/v1/hunts", {
    action: "remove-card",
    requestId,
  });

/** One post of one or many cards, to a room by code or to the area. */
export const publishFlare = (input: {
  code?: string;
  intent: "want" | "showcase";
  caption?: string | null;
  items: { cardId: string; printingId?: string | null; quantity: number }[];
  hunt?: { id: string } | { name: string } | null;
  acceptsTrade?: boolean;
  acceptsCash?: boolean;
  latitude?: number;
  longitude?: number;
}) =>
  call<{
    ok: boolean;
    postId?: string;
    /** Per card: what was asked, what went up, and why the rest did not. */
    total?: number;
    posted?: number;
    alreadyUp?: number;
    failed?: number;
    /** The cards that went up; older servers leave it out. */
    postedCardIds?: string[];
    huntId?: string | null;
    atCap?: boolean;
    error?: string;
    message?: string;
  }>("POST", "/api/v1/flares/publish", input);

/** One line of an offer: a card on the post, and how many of it. */
export interface OfferItem {
  flareId: string;
  quantity: number;
}

/** What the server took: how many cards, and the flareIds it would not. */
export interface OfferOutcome {
  offered: number;
  refused: string[];
}

/**
 * "Offer": one card or several from one post, in ONE call, so the
 * poster gets one notice that counts them and one line in the thread.
 * The zoom sends this card alone as a single line; pick mode and the
 * full-list sheet send every pick. A refusal is an ApiError whose code
 * is the server's reason; `offerErrorMessage` says it in words.
 */
export const offerItemsOnPost = (postId: string, items: OfferItem[], message: string) =>
  call<{ ok: true } & OfferOutcome>(
    "POST",
    `/api/v1/posts/${encodeURIComponent(postId)}`,
    { action: "offer-items", items, message },
  );

/** The reasons the website has a sentence for. */
const OFFER_REASONS = new Set([
  "not-found",
  "nothing-left",
  "own-flare",
  "at-cap",
  "too-many",
]);

/**
 * A refused offer, in the website's words (src/lib/feed/offer-copy.ts),
 * keyed by the reason the server named in its 409. A 429 is the
 * throttle, which the website reads as "too-many". Anything else gets
 * the plain line, and the diagnosis goes to the console, where a bug
 * report can still say which failure it was.
 */
export function offerErrorMessage(caught: unknown): string {
  const reason =
    caught instanceof ApiError
      ? caught.status === 429
        ? "too-many"
        : caught.code
      : "";
  /* The diagnosis goes to the console, not the screen: a player can do
     nothing with "http-500", and a bug report still has it. */
  if (!OFFER_REASONS.has(reason))
    console.warn("[cardflare] offer", describeError(caught));
  return offerFailureMessage(reason);
}

/**
 * "I have these", from somebody's hunt, by REQUEST rather than by
 * post: every open card on a hunt can be answered whether or not its
 * owner ever posted a Flare for it. The server offers on the posts
 * where a Flare is live and sends the rest to the owner as one direct
 * message. The website's `offerOnHuntAction` makes the same call.
 *
 * A refusal is a 409 whose body is the `ok: false` shape below; `call`
 * throws it, and `serverMessage` reads the words back.
 */
export type HuntOfferOutcome =
  | {
      ok: true;
      /** Cards offered on a post. */
      offered: number;
      /** Cards sent as a message instead. */
      messaged: number;
      /** The conversation the message went to, when one was sent. */
      threadId: string | null;
      /** Cards that could not be taken, by name. */
      refused: string[];
    }
  | { ok: false; message: string; refused: string[] };

export function offerOnHunt(
  huntId: string,
  lines: { requestId: string; quantity: number }[],
  message: string,
): Promise<HuntOfferOutcome> {
  return call<HuntOfferOutcome>("POST", `/api/v1/hunts/${encodeURIComponent(huntId)}`, {
    action: "offer",
    lines,
    message,
  });
}

/** One trade in your history, both sides. Mirrors the server's entry. */
export interface TradeHistoryEntry {
  id: string;
  /**
   * Confirmed in a room, confirmed inside a conversation, or written
   * down by the player. Optional because a build meets servers older
   * than itself; absent reads as a room trade, which is the only kind
   * an older server has.
   */
  source?: "room" | "conversation" | "logged";
  cardId: string;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
  quantity: number;
  /** The card came TO you. False: it left your binder. */
  got: boolean;
  partnerName: string | null;
  /** The partner's account, when the trade names one. A profile to open. */
  partnerPlayerId?: string | null;
  /** For a logged trade, the place as typed. */
  storeName: string | null;
  eventName: string | null;
  /** A room trade's instant, or a logged trade's day at noon. */
  confirmedAt: string;
  status: "confirmed" | "pending" | "late" | "disputed" | "unnamed" | "logged";
  /** What this trade paid you, net of any reversal. Always 0 when logged. */
  embers: number;
  /** The player's own note on a logged trade. */
  note?: string | null;
}

export interface TradeHistoryTotals {
  trades: number;
  got: number;
  gave: number;
  embers: number;
}

export interface TradeHistory {
  /** Not Pro: `trades` is empty and the totals still true. */
  locked: boolean;
  totals: TradeHistoryTotals;
  trades: TradeHistoryEntry[];
}

/** Every trade you confirmed, newest first. Rows are Pro. */
export const getTradeHistory = () =>
  call<{ history: TradeHistory }>("GET", "/api/v1/trades/history");

/** How a past Flare ended. Mirrors src/lib/flares/history.ts. */
export type FlareOutcome = "found" | "traded" | "taken-down";

/** Somebody who answered a past Flare. */
export interface FlareHistoryResponder {
  playerId: string | null;
  name: string;
  avatarUrl: string | null;
  /** When they answered. */
  at: string;
  /** How many copies they said they could bring. */
  quantity: number;
  /** Your conversation with them, when there is one to open. */
  threadId: string | null;
}

/** One past Flare: found in full, traded, or taken down. */
export interface FlareHistoryEntry {
  flareId: string;
  direction: "want" | "showcase";
  cardId: string;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
  quantity: number;
  outcome: FlareOutcome;
  postedAt: string;
  /** When it stopped being open. */
  endedAt: string;
  responders: FlareHistoryResponder[];
}

/**
 * Your past Flares, newest first, with who answered each. Free for
 * everyone, unlike trade rows: it is your own log of your own posts.
 */
export const getFlareHistory = () =>
  call<{ flares: FlareHistoryEntry[] }>("GET", "/api/v1/flares/history");

/**
 * A trade the player writes down themselves, for what happened off
 * CardFlare. The founder: "allow me to enter my own trades." The
 * server holds it to src/lib/trades/logged-schema.ts; a 400 carries
 * the rule it broke as `error`, a 403 is `locked` (not Pro).
 */
export interface LogTradeInput {
  cardId: string;
  printingId?: string | null;
  quantity?: number;
  direction: "got" | "gave";
  partnerPlayerId?: string | null;
  partnerName?: string | null;
  place?: string | null;
  /** "YYYY-MM-DD", today or earlier. */
  tradedOn: string;
  note?: string | null;
  updateHaveList?: boolean;
}

export const logTrade = (input: LogTradeInput) =>
  call<{ ok: true; id: string }>("POST", "/api/v1/trades/history", input);

/** Removes a logged trade. Only the author's own ever match. */
export const deleteLoggedTrade = (id: string) =>
  call<{ ok: boolean }>("DELETE", "/api/v1/trades/history", { id });

export const getPost = (postId: string) =>
  call<{ post: PostDetail }>("GET", `/api/v1/posts/${encodeURIComponent(postId)}`);

/**
 * Tick a card off a hunt, or untick it.
 *
 * The answer carries the whole hunts list back rather than an ack: a
 * tick moves three numbers on the folder it is in, and a phone that
 * recomputes those for itself is a phone that will eventually disagree
 * with the profile it is sitting on.
 */
/** How this player wants the Feed drawn. Stored on the account. */
/** Whether joining a room posts your Flares to it. */
export const setAutoPost = (on: boolean) =>
  call<{ ok: true; autoPostFlares: boolean }>("POST", "/api/v1/profile", {
    action: "set-auto-post",
    on,
  });

export const setFeedView = (view: string) =>
  call<{ ok: true; feedView: string }>("POST", "/api/v1/profile", {
    action: "set-feed-view",
    view,
  });

export const likePost = (postId: string, liked: boolean) =>
  call<{ ok: true }>("POST", `/api/v1/posts/${encodeURIComponent(postId)}`, {
    action: liked ? "like" : "unlike",
  });

/**
 * "Take down" on your own post: every open card of it withdrawn, nothing
 * announced, the ids back for the undo. The website's
 * `takeDownPostAction` does the same.
 */
export const takeDownPost = async (
  postId: string,
): Promise<{ ok: boolean; flareIds: string[] }> => {
  const result = await call<{ ok: boolean; flareIds?: string[] }>(
    "POST",
    `/api/v1/posts/${encodeURIComponent(postId)}`,
    { action: "take-down" },
  );
  return { ok: result.ok, flareIds: result.flareIds ?? [] };
};

/** The undo, within the server's minute: the same ids, reopened. */
export const restorePost = async (
  postId: string,
  flareIds: string[],
): Promise<{ ok: boolean; restored: number }> => {
  const result = await call<{ ok: boolean; restored?: number }>(
    "POST",
    `/api/v1/posts/${encodeURIComponent(postId)}`,
    { action: "restore", flareIds },
  );
  return { ok: result.ok, restored: result.restored ?? 0 };
};

export const commentOnPost = (postId: string, body: string) =>
  call<{ ok: true; comment: PostComment }>(
    "POST",
    `/api/v1/posts/${encodeURIComponent(postId)}`,
    { action: "comment", body },
  );

/**
 * Takes a comment down: yours, or anybody's under your own post. The
 * server checks which; a refusal is a 403.
 */
export const deletePostComment = (postId: string, commentId: string) =>
  call<{ ok: true }>(
    "DELETE",
    `/api/v1/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
  );

/** Which part of the screen an item belongs to. Mirrors the server. */
export type FeedSection =
  | "wanted"
  | "tonight"
  /* Your own Flares. The app was missing this one while the server was
     already sending it, so every heading over your own posts looked up
     an undefined title and drew an empty line - forty-three points of
     nothing above the first card. The founder: "see how under
     'following' there's a big gap? close that gap." */
  | "yours"
  | "people"
  | "walkin"
  | "nearby"
  | "store";

/** The heading each section is drawn under. Same words as the website. */
export const SECTION_TITLES: Record<FeedSection, string> = {
  wanted: "Wanted from you",
  tonight: "Coming up",
  yours: "Your flares",
  people: "People you follow",
  walkin: "Where you play",
  nearby: "Nearby stores",
  store: "New in the store",
};

export type FeedItem =
  /**
   * A notice from cardflare. The only authored item on the Feed, and
   * not a player: it wears the mark, cannot be followed, and carries
   * an expiry that takes it away without anybody remembering to.
   */
  | {
      kind: "announcement";
      id: string;
      headline: string;
      body: string;
      linkLabel: string | null;
      /** A path on our own origin. The server refuses anything else. */
      linkHref: string | null;
    }
  /** One of the two questions the Feed cannot answer until you answer it. */
  | {
      kind: "start";
      topic: "store" | "deck";
    }
  | {
      kind: "board";
      code: string;
      storeName: string;
      /** Where the shop is, for a store you have never been to. */
      city: string | null;
      /** True when this is one of your own stores. */
      yours: boolean;
      eventName: string;
      live: boolean;
      startsAt: string | null;
      timeZone: string;
      youCanAnswer: number;
      sample: FeedCard[];
    }
  | {
      kind: "traded";
      storeName: string;
      eventName: string;
      requester: string;
      holder: string | null;
      cardName: string;
      cardNumber: string;
      imageUrl: string | null;
      confirmedAt: string;
    }
  | {
      kind: "added";
      playerId: string;
      displayName: string;
      avatarUrl: string | null;
      frame: string | null;
      ring: string | null;
      total: number;
      onYourListCount: number;
      cards: {
        cardId: string;
        cardName: string;
        cardNumber: string;
        imageUrl: string | null;
        onYourList: boolean;
      }[];
    }
  | {
      kind: "suggest";
      players: {
        playerId: string;
        displayName: string;
        avatarUrl: string | null;
        frame: string | null;
        ring: string | null;
        aura: string | null;
        answers: number;
      }[];
    }
  | {
      kind: "hunt";
      /** The posting action: what a heart or a comment hangs off. */
      postId: string;
      likes: number;
      comments: number;
      /** The viewer's own heart. */
      liked: boolean;
      code: string;
      storeName: string;
      eventName: string;
      playerId: string;
      displayName: string;
      avatarUrl: string | null;
      frame: string | null;
      ring: string | null;
      /** The hunt's name, when they gave it one. */
      /** Which way the card points: wanted, or offered up. */
      direction?: "want" | "showcase";
      deckLabel: string | null;
      /** When it went up. Absent from an older server. */
      postedAt?: string;
      /** How far away, or null when either side has no position. */
      milesAway?: number | null;
      storeId?: string | null;
      /** What the poster will do for it: the Trade and Cash chips. */
      acceptsTrade?: boolean;
      acceptsCash?: boolean;
      /** What they wrote with it. Collapsed entirely when absent. */
      note?: string | null;
      /** How many people have raised a hand on any card in it. */
      offers?: number;
      /** The hunt the post belongs to, for "Green Zoro · View hunt". */
      hunt?: { id: string; name: string } | null;
      /** Copies still wanted across every card shown. */
      remainingCopies?: number;
      /** Every copy is in hand: nothing left to offer on. */
      completed?: boolean;
      /** Every card in one posting action, the viewer's first. */
      cards: FeedCard[];
      total: number;
      youCanAnswer: number;
      /** The viewer's own post. */
      yours: boolean;
    }
  /**
   * A store you have saved, with something to come.
   *
   * The item that answers a Tuesday: a board item needs a room open NOW,
   * and most days there isn't one. A night on the calendar, or a counter
   * code you can walk in on, is still place and time.
   */
  | {
      kind: "upcoming";
      storeId: string;
      storeName: string;
      city: string | null;
      joinCode: string;
      nextEventAt: string | null;
      nextEventName: string | null;
      nextEventCode: string | null;
      /** The store's clock, so "Friday 7pm" is their Friday. */
      timeZone: string;
      walkIn: boolean;
      /** Cards on your want list — what there is to go and ask about. */
      wants: number;
      /**
       * The next night's id, for the Going button, and who has said
       * so. Null and 0/false when there is no next night; absent from
       * an older server, which draws no button.
       */
      nextEventId?: string | null;
      goingCount?: number;
      youGoing?: boolean;
    }
  /** A Flare somebody posted lately, wherever they posted it. */
  | {
      kind: "recent";
      id: string;
      playerSessionId: string;
      /**
       * The account behind the session, or null for a guest.
       *
       * Both answers in one field: a linked session has a profile worth
       * opening, so the row navigates; an unlinked one IS a guest and
       * says so instead, because a tap that goes nowhere is worse than
       * no tap at all.
       *
       * OPTIONAL, because the app and the server ship on different
       * clocks. An older server never sends it, and absent must mean
       * "we do not know" rather than "guest" — labelling a real account
       * a guest is a worse lie than showing no label.
       */
      playerId?: string | null;
      displayName: string | null;
      avatarUrl: string | null;
      /** Worn, so a ring somebody paid Embers for is seen here too. */
      frame: string | null;
      ring: string | null;
      aura: string | null;
      storeName: string;
      city: string | null;
      joinCode: string;
      when: string;
      /** Stated as words, never as a texture. See PRODUCT.md. */
      direction: "want" | "showcase";
      deckLabel: string | null;
      cards: FeedCard[];
      more: number;
    }
  /**
   * Open Flares, anywhere, that your own collection answers.
   *
   * The item the Feed was missing. Every other kind is a record of an
   * event - true whether or not you own the card. This one is a fact
   * about YOU, it moves on its own, and its only resolution is a trade.
   */
  /**
   * Somebody near you is hunting a card you marked Trade locally. Only
   * the holder's Feed carries it; the wanter hears nothing until the
   * holder answers.
   */
  | { kind: "nearbyMatch"; matches: NearbyMatch[] }
  /**
   * A store you follow, saying something: the founder's "OP-12
   * prerelease Saturday, 20 seats". Drawn as the post a Flare is, with
   * the logo for a face and "I'll be there" when it is about a night.
   */
  | {
      kind: "storePost";
      postId: string;
      storeId: string;
      storeName: string;
      logoUrl: string | null;
      verified: boolean;
      title: string;
      body: string | null;
      imageUrl: string | null;
      postedAt: string;
      event: {
        code: string;
        name: string;
        startsAt: string;
        opensAt: string;
        timeZone: string;
        playersIn: number;
        /** "I'll be there" works right now: the board is early or live. */
        open: boolean;
      } | null;
      likes: number;
      comments: number;
      liked: boolean;
      /** The viewer already has a seat at the event. */
      going: boolean;
    }
  | {
      kind: "wanted";
      total: number;
      entries: {
        playerSessionId: string;
        /**
         * The account behind the session. Never null any more: a
         * guest's want is left out of the item altogether, because the
         * one thing this row is for, messaging them that you have it,
         * needs an inbox on the other end and a guest has none.
         */
        playerId: string;
        /** The Flare itself, which is what "I have this" opens a thread on. */
        flareId: string;
        /** The conversation you already have open on it, if any. */
        threadId: string | null;
        displayName: string | null;
        avatarUrl: string | null;
        frame: string | null;
        ring: string | null;
        aura: string | null;
        storeName: string;
        joinCode: string;
        when: string;
        card: FeedCard;
      }[];
    }
  /**
   * Shops near you, whether or not they use cardflare yet.
   *
   * Verified and Ultra travel separately and mean different things:
   * Verified is "cardflare confirmed this profile is controlled by the
   * listed business", Ultra is a product tier. Never infer one from the
   * other. No coordinate reaches here — miles only.
   */
  | {
      kind: "nearbyStores";
      stores: {
        storeId: string;
        name: string;
        city: string | null;
        miles: number;
        verified: boolean;
        ultra: boolean;
        unclaimed: boolean;
      }[];
      /**
       * We do not know where the player is, so the card asks instead of
       * listing. Optional because the app and the server ship on
       * different clocks: an older server never sends it, and absent
       * has to mean "we know where they are", never a crash.
       */
      needsLocation?: boolean;
      /** How we placed them, so a wrong ZIP is visible rather than mysterious. */
      source?: "device" | "postal";
    }
  /** A pack in the Embers store. Evergreen — true with nobody else here. */
  | {
      kind: "pack";
      slug: string;
      name: string;
      description: string;
      priceEmbers: number;
      artUrl: string | null;
      balance: number;
    }
  /** Cosmetics worth a look, and what they cost. Evergreen. */
  | {
      kind: "shop";
      cosmetics: {
        slug: string;
        name: string;
        description: string;
        family: string;
        costEmbers: number;
      }[];
      balance: number;
    };

/**
 * One item, with the two things the screen needs to place it.
 *
 * Optional on purpose: a TestFlight build meets servers older than
 * itself, and a feed with no sections is a plain list rather than a
 * broken one.
 */
export type FeedEntry = FeedItem & {
  section?: FeedSection;
  reason?: string;
  /** Which of the two filters it belongs to. Absent from an older server. */
  tab?: FeedTab;
};

/**
 * The Feed's two filters. Decided by the server, same as the sections.
 *
 * There was a third, "My Flares", and the founder cut it as redundant
 * with the Flare tab - your own posts go in the main feed now. An older
 * server can still send `tab: "mine"`, and an item whose tab is not one
 * of these simply shows on every filter, which is the same forgiving
 * path an older server with no `tab` at all already takes.
 */
/**
 * The heading a section is drawn under, or null when it should not be
 * drawn at all.
 *
 * "YOUR FLARES" is the one section whose every post already says so:
 * each carries a "Your Flare" badge in its own header, and since the
 * filter came back there is a whole tab with the same name. A heading
 * over them is the third telling of one fact, and it was spending the
 * vertical space the founder asked to get back - "see how under
 * 'following' there's a big gap? close that gap."
 *
 * A heading earns its line by saying something the posts beneath it do
 * not. "People you follow" and "Nearby stores" do; this one does not.
 */
export function sectionHeading(section: FeedSection | undefined): string | null {
  if (!section) return null;
  if (section === "yours") return null;
  return SECTION_TITLES[section] ?? null;
}

export type FeedTab = "following" | "nearby" | "mine";

export const TAB_TITLES: Record<FeedTab, string> = {
  following: "Following",
  nearby: "Nearby",
  mine: "My Flares",
};

/** The filters this build knows, in the order they are drawn. */
export const FEED_TAB_VALUES: FeedTab[] = ["following", "nearby", "mine"];

/**
 * Whether an item shows under a filter. The app's half of
 * `belongsToTab` in src/lib/feed/repository.ts - same rules, so the two
 * platforms can never disagree about what a tab contains.
 *
 * My Flares is a VIEW of your posts, not a place they are moved to:
 * they stay in Following with everyone else's, which is what the
 * Instagram round was for. So this reads the post's own `yours` rather
 * than its `tab`, and one item can sit under two filters.
 *
 * An item with no tab, or one filed under a tab this build has never
 * heard of, shows everywhere rather than nowhere. The app ships on
 * TestFlight's clock and the server on Vercel's; matching only the
 * known tabs is how a new server silently empties an old phone's feed.
 */
export function belongsToTab(
  item: { tab?: FeedTab; yours?: boolean },
  tab: FeedTab,
): boolean {
  if (tab === "mine") return item.yours === true;
  if (!item.tab) return true;
  if (item.tab === tab) return true;
  return !FEED_TAB_VALUES.includes(item.tab);
}

/**
 * The Feed, optionally saying where the phone is.
 *
 * Coordinates ride the request and are never stored - not here, not on
 * the server. A player who has not granted permission simply sends
 * nothing, and the server falls back to the ZIP on their profile.
 */
export const getFeed = (coords?: { latitude: number; longitude: number } | null) => {
  const query = coords
    ? `?lat=${encodeURIComponent(coords.latitude)}&lng=${encodeURIComponent(coords.longitude)}`
    : "";

  return call<{ items: FeedEntry[] }>("GET", `/api/v1/feed${query}`);
};

/** A player found by name search: enough for a row and a door. */
export interface FoundPlayer {
  playerId: string;
  displayName: string;
  /** What tells two people with the same name apart. */
  handle: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  aura: string | null;
}

/** Finding somebody by username, to view and follow them. */
export const searchPlayersByName = (query: string) =>
  call<{ players: FoundPlayer[] }>(
    "GET",
    `/api/players/search?q=${encodeURIComponent(query)}`,
  );

/** A shop found by name or city: the website's `FoundStore`. */
export interface FoundStore {
  storeId: string;
  name: string;
  city: string | null;
  region: string | null;
  verified: boolean;
}

/** Published stores by name or city, eight at most. */
export const searchStores = (query: string) =>
  call<{ stores: FoundStore[] }>(
    "GET",
    `/api/v1/stores/search?q=${encodeURIComponent(query)}`,
  );

/* ------------------------------------------------------------------ */
/* Customize: the catalogue categories, worn one slot each             */
/* ------------------------------------------------------------------ */

export type CustomizeKind =
  | "ring"
  | "aura"
  | "border"
  | "pattern"
  | "animation"
  | "background"
  | "scene"
  | "nameplate"
  | "title"
  | "badge";

export interface CustomizeItem {
  slug: string;
  name: string;
  description: string;
  /** draft = unreleased; the server only sends these to a granted account. */
  status: "live" | "draft";
  owned: boolean;
  equipped: boolean;
  /**
   * A dropped-in file, when the cosmetic is one of those — the same
   * `art` the profile route sends, drawn by the same CosmeticFilm.
   *
   * The name matters: this used to be declared as `rive`, which the
   * server stopped sending when art files grew past Rive into SVG and
   * HTML. A field that is never present reads as "no art" forever, so
   * the founder's own uploaded ring sat in the picker as a name with a
   * blank space beside it while every catalogue ring turned.
   */
  art: ArtFile | null;
}

export interface CustomizeSection {
  kind: CustomizeKind;
  items: CustomizeItem[];
}

/** Every category with ownership and what is currently worn. */
export const getCustomize = () =>
  call<{
    sections: CustomizeSection[];
    equips: Record<CustomizeKind, string | null>;
    /**
     * Whether this player's tier may WEAR any of it. Optional so a
     * build against an older server keeps working; absent reads as
     * allowed, and the server still refuses with "not-pro" either way.
     */
    customizationAllowed?: boolean;
  }>("GET", "/api/v1/customize");

/** Wears one cosmetic, or clears the slot with null. */
export const setCustomizeEquip = (kind: CustomizeKind, slug: string | null) =>
  call<{ ok: true }>("POST", "/api/v1/customize", { kind, slug });

/**
 * Tells the server an Apple purchase happened, by its original
 * transaction id. The server treats this as a POKE, not proof: it asks
 * Apple's App Store Server API what that transaction really is before
 * writing anything, so a made-up id buys nothing. Returns whether the
 * player is Pro NOW, from the server's own read.
 */
export const syncApplePurchase = (originalTransactionId: string) =>
  call<{ ok: true; pro: boolean }>("POST", "/api/v1/billing/apple", {
    originalTransactionId,
  });

/**
 * A pasted deck list, saved to the want list under one name.
 *
 * The app's half of "post multiple flares at once". These land as WANTS,
 * not Flares: a deck is written at home and posted at a counter, often
 * days apart, and the room's "still hunting these?" panel posts the lot
 * as ONE batch when the player walks in — one notification, one Feed
 * item, however many cards.
 */
/** One pasted line, looked up: the confirmation screen's row. */
export interface DeckPreviewEntry {
  cardNumber: string;
  quantity: number;
  /** Null when the number is not in the catalogue (yet). */
  name: string | null;
  imageUrl: string | null;
}

/**
 * The pasted list with names and art, nothing saved — what the
 * confirmation screen shows before `saveDeckList` writes anything.
 */
export const previewDeckList = (list: string) =>
  call<{ ok: true; entries: DeckPreviewEntry[]; unreadable: string[] }>(
    "POST",
    "/api/v1/wants",
    { list, preview: true },
  );

export const saveDeckList = (list: string, deckLabel?: string | null) =>
  call<{
    ok: true;
    saved: number;
    /** Matched cards in the paste; older servers leave these out. */
    total?: number;
    alreadyUp?: number;
    failed?: number;
    unknown: string[];
    unreadable: string[];
    atCap: boolean;
  }>("POST", "/api/v1/wants", { list, deckLabel: deckLabel || null });

/**
 * Saving the ZIP a player typed, when they will not grant location.
 *
 * Five digits, or an empty string to clear it. Coarse on purpose: it
 * places somebody within a few miles, which is all a list of nearby
 * shops needs and is a long way from an address.
 */
/** The ZIP on the account, for Settings to show and change. */
export const getPostalCode = () =>
  call<{ postalCode: string | null }>("GET", "/api/v1/me/location");

export const savePostalCode = (postalCode: string) =>
  call<{ postalCode: string | null }>("PUT", "/api/v1/me/location", { postalCode });

/**
 * A store as a player sees it — claimed or not.
 *
 * Mirrors the website's PublicStore exactly, privacy boundary included:
 * no coordinates, no contact address, and no provenance beyond the
 * attribution line the source licence requires.
 */
export interface PublicStore {
  storeId: string;
  name: string;
  /** Where it is, for the line under the name. Absent from an older server. */
  city?: string | null;
  region?: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  verified: boolean;
  ultra: boolean;
  /** One of the ten Founding Stores: wears the mark. Absent from an older server. */
  founding?: boolean;
  unclaimed: boolean;
  /** What the store says about itself. Absent from an older server. */
  description?: string | null;
  /** The store's own pictures, absolute. Absent from an older server. */
  logoUrl?: string | null;
  coverUrl?: string | null;
  /** Seven days, Sunday first, {open, close} or null; see store-hours.ts. */
  hours?: ({ open: string; close: string } | null)[] | null;
  /** Slugs from the one game list. Absent from an older server. */
  games?: string[];
  timeZone?: string;
  /** Decided by the server in the store's own zone; null without hours. */
  openNow?: boolean | null;
  /** Up to six cards from the store's singles, chosen by hand. */
  casePicks?: {
    cardId: string;
    cardName: string;
    cardNumber: string;
    imageUrl: string | null;
  }[];
  /** Whether the signed-in account follows it; absent for a guest or an older server. */
  following?: boolean;
  /** A room open right now, or the next night on the calendar. Absent from an older server. */
  board?: {
    liveNow: boolean;
    joinCode: string;
    nextEventAt: string | null;
    nextEventName: string | null;
    timeZone: string | null;
  } | null;
  /**
   * The next nights on the calendar, soonest first, three at most; a
   * night running now is the first of them. Absent from an older
   * server, which draws no section rather than an empty one.
   */
  upcoming?: UpcomingNight[];
  attribution: string | null;
}

export interface UpcomingNight {
  eventId: string;
  name: string;
  startsAt: string;
  endsAt: string | null;
  joinCode: string | null;
  /** Running right now. */
  live: boolean;
  /** When the board opens before doors, or null. Optional: older servers. */
  boardOpensAt?: string | null;
  /** Who has said Going, and whether this viewer has. Absent from an
      older server, which draws no Going button. */
  goingCount?: number;
  youGoing?: boolean;
  /** Where the night is; null once it has started without a room. */
  phase?: NightPhase | null;
}

export const getStore = (storeId: string) =>
  call<{ store: PublicStore }>("GET", `/api/v1/stores/${encodeURIComponent(storeId)}`);

/* ------------------------------------------------------------------ */
/* Store days: the store is the room and a day is the time             */
/* ------------------------------------------------------------------ */

/** The room on one of a store's days: its night, or the day room. */
export interface StoreDayRoom {
  eventId: string;
  code: string | null;
  name: string;
  kind: "scheduled" | "day" | "walk_in";
  goingCount: number;
  youGoing: boolean;
}

/** One of the seven days on offer at a store. The website's `StoreDay`. */
export interface StoreDay {
  /** The store-local date, "2026-10-16". */
  date: string;
  /** "Today", "Tomorrow", "Fri 17". */
  label: string;
  /** The store is closed that day by its own hours. */
  closed: boolean;
  /** The room for that day, when there is one yet. */
  room: StoreDayRoom | null;
}

/** A store's week, for the plan-a-visit sheet's second step. */
export interface StoreDays {
  storeId: string;
  storeName: string;
  /** The store's today, so "today" and "tomorrow" are the store's. */
  today: string;
  /** The store takes days players open: walk-in trading is on. */
  openTrading: boolean;
  days: StoreDay[];
}

/** The store a phone is standing in, and its counter code. */
export interface StoreHere {
  storeId: string;
  storeName: string;
  code: string;
}

/** A store in the picker's first step. */
export interface PickerStore {
  storeId: string;
  name: string;
  city: string | null;
  /** Miles from the player, rounded; null when it cannot be placed. */
  miles: number | null;
}

/** The picker's first step: followed stores, then nearby ones. */
export interface StorePicker {
  following: PickerStore[];
  near: PickerStore[];
}

/**
 * The stores to pick from. The position goes only when the caller
 * already has it, which on this app means permission was granted
 * before: the picker never asks.
 */
export const getStorePicker = (position?: { latitude: number; longitude: number }) =>
  call<{ picker: StorePicker }>(
    "GET",
    position
      ? `/api/v1/stores/picker?lat=${position.latitude}&lng=${position.longitude}`
      : "/api/v1/stores/picker",
  );

/** A store's next seven days and the room on each. */
export const getStoreDays = (storeId: string) =>
  call<{ days: StoreDays }>(
    "GET",
    `/api/v1/stores/${encodeURIComponent(storeId)}/days`,
  );

/** What planning a visit comes back with: Going's answer and the room. */
export interface PlanVisitAnswer extends GoingAnswer {
  eventId: string;
  code: string | null;
}

/**
 * "Going to this store on this day." Opens the day room when nobody has
 * yet, and says Going exactly as the Going button does. A refusal is an
 * ApiError whose code is a `PLAN_REFUSALS` key (src/store-day-copy.ts).
 */
export async function planVisit(
  storeId: string,
  date: string,
): Promise<PlanVisitAnswer> {
  const result = await call<PlanVisitAnswer & { sessionToken?: string }>(
    "POST",
    `/api/v1/stores/${encodeURIComponent(storeId)}/days`,
    { date },
  );

  /* Kept exactly as Going keeps it: see setGoing. */
  if (result.sessionToken) {
    await SecureStore.setItemAsync(SESSION_KEY, result.sessionToken);
  }

  const { sessionToken: _token, ...answer } = result;
  return answer;
}

/**
 * The store this position is inside, or null. The position is used for
 * one comparison on the server and kept nowhere.
 */
export const getStoreHere = (latitude: number, longitude: number) =>
  call<{ store: StoreHere | null }>(
    "GET",
    `/api/v1/stores/here?lat=${latitude}&lng=${longitude}`,
  );

/** What somebody at the shop tells us when claiming a listing. */
export interface ClaimFields {
  claimantName: string;
  claimantEmail: string;
  claimantRole: string;
  businessEmail: string;
  notes: string;
}

/**
 * Claiming a listing. No account needed, on purpose — the person behind
 * the counter has never heard of cardflare, and a sign-in wall in front
 * of "this shop is mine" defeats the whole directory.
 */
export const claimStore = (storeId: string, fields: ClaimFields) =>
  call<{ ok: true }>(
    "POST",
    `/api/v1/stores/${encodeURIComponent(storeId)}/claim`,
    fields,
  );

/** The roles the picker offers: the website's claim-schema.ts, verbatim. */
export const CLAIM_ROLES = ["Owner", "Organizer"] as const;

/* -------------------------------------------------------------------------- */
/* Local: Flares near you, and the conversations they start                   */
/* -------------------------------------------------------------------------- */

/** One Flare on the Local list, as the server shaped it. */
export interface LocalFlare {
  flareId: string;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
  printingLabel: string | null;
  quantity: number;
  note: string | null;
  intent: string;
  acceptsTrade: boolean;
  acceptsCash: boolean;
  postedAt: string;
  /** The posting act this belonged to, when several went up at once. */
  batchId: string | null;
  /** What the poster called the group, when they named it. */
  deckLabel: string | null;
  /** The shop whose board it is on, or null for a Flare posted to an area. */
  storeName: string | null;
  storeCity: string | null;
  /** Rounded server-side; no coordinate ever reaches the app. */
  miles: number;
  poster: { name: string; playerId: string | null; handle: string | null };
  canMessage: boolean;
  isYours: boolean;
}

export interface LocalFeed {
  /** Where the origin came from: device, postal, or none (show the ask). */
  source: "device" | "postal" | "none";
  radius: number;
  flares: LocalFlare[];
}

/**
 * The Local list. Coordinates ride this one request and are never
 * stored — the same promise the Feed makes.
 */
export const getLocal = (coords?: { latitude: number; longitude: number } | null) => {
  const query = coords
    ? `?lat=${encodeURIComponent(coords.latitude)}&lng=${encodeURIComponent(coords.longitude)}`
    : "";

  return call<LocalFeed>("GET", `/api/v1/local${query}`);
};

/**
 * Posting a Flare to your area, with no room involved.
 *
 * The website's Server Action and this call reach the same lib, so the
 * rule about who may post one and where it lands cannot drift between
 * the two platforms.
 */
export const postAreaFlare = (input: {
  /** One card, or `cards` for a list that goes up as a single post. */
  cardId?: string;
  cards?: {
    cardId: string;
    printingId?: string | null;
    quantity?: number;
    note?: string | null;
    intent?: "want" | "showcase";
    acceptsTrade?: boolean;
    acceptsCash?: boolean;
  }[];
  deckLabel?: string | null;
  printingId?: string | null;
  quantity?: number;
  note?: string | null;
  intent?: "want" | "showcase";
  acceptsTrade?: boolean;
  acceptsCash?: boolean;
  /* Where the phone is, when it has permission. Rides this one request
     and anchors the Flare to a ZIP; the position is never stored. */
  latitude?: number;
  longitude?: number;
}) =>
  call<{
    ok: boolean;
    batchId?: string;
    posted?: number;
    error?: string;
    message?: string;
  }>("POST", "/api/v1/local/flares", input);

/** Taking your own area Flare down. */
export const withdrawAreaFlare = (flareId: string) =>
  call<{ ok: boolean }>("DELETE", "/api/v1/local/flares", { flareId });

export const setLocalRadius = (radius: number) =>
  call<{ ok: boolean }>("PUT", "/api/v1/local", { radius });

/** One conversation on the Messages list. */
export interface LocalThread {
  threadId: string;
  /**
   * What it is about: a posted Flare, a saved want, or just the two
   * people. Optional because an older server never says; the card
   * fields tell the same story either way.
   */
  kind?: "flare" | "want" | "direct";
  /** Null for a thread on a saved want (a nearby match) or a direct message. */
  flareId: string | null;
  wantId?: string | null;
  /** The card, or null for a direct message. */
  cardName: string | null;
  cardNumber: string | null;
  imageUrl: string | null;
  withName: string;
  withPlayerId: string;
  /** Their face, as an absolute URL, or null for the initials. */
  withAvatarUrl: string | null;
  role: "author" | "responder";
  lastMessageAt: string;
  lastMessagePreview: string | null;
  /** The last message was the viewer's: the row reads "You: ...". */
  lastFromYou: boolean;
  unread: number;
  closed: boolean;
}

export interface LocalThreadMessage {
  id: string;
  body: string;
  sentAt: string;
  yours: boolean;
  /** The card this message offered ("I have this", a nearby match), or null. */
  card: {
    cardId: string;
    name: string;
    number: string;
    imageUrl: string | null;
  } | null;
  /**
   * Every card the message carries, `card` first: an offer on a
   * binder carries several. Absent from an older server, where `card`
   * is the only one.
   */
  cards?: {
    cardId: string;
    name: string;
    number: string;
    imageUrl: string | null;
  }[];
}

export const listLocalThreads = () =>
  call<{ threads: LocalThread[] }>("GET", "/api/v1/local/threads");

/** "I have this": opens the Flare's thread with a first message. */
export const openLocalThread = (flareId: string, body: string) =>
  call<{ ok: boolean; threadId?: string; message?: string }>(
    "POST",
    "/api/v1/local/threads",
    { flareId, body },
  );

/**
 * A direct message: opens (or finds) the conversation with one person,
 * about nothing in particular, and sends nothing. The composer is the
 * next screen. A refusal ("That is you.", "This conversation was
 * ended.") is a 409 whose words `serverMessage` reads back.
 */
export const openDirectThread = (playerId: string) =>
  call<{ ok: boolean; threadId?: string; message?: string }>(
    "POST",
    "/api/v1/local/threads",
    { playerId },
  );

/** Somewhere public to suggest meeting: a store, never an address. */
export interface MeetSuggestion {
  storeName: string;
  joinCode: string;
  nextEventName: string | null;
  nextEventAt: string | null;
  timeZone: string;
  shared: boolean;
}

export type ThreadTradeStatus = "pending" | "confirmed" | "late" | "declined";

/**
 * "We traded", said inside a conversation. Mirrors the server's
 * src/lib/trades/thread-trades.ts: the newest trade in the thread, as
 * the viewer sees it.
 */
export interface ThreadTrade {
  id: string;
  cardId: string;
  cardName: string;
  cardNumber: string;
  quantity: number;
  /** The card came TO the viewer. */
  got: boolean;
  /** The viewer is the one who said it. */
  saidByYou: boolean;
  status: ThreadTradeStatus;
  /** Pending, and the viewer is the one asked. */
  awaitingYou: boolean;
  proposedAt: string;
}

/** The limit the form and the server share. */
export const THREAD_TRADE_QUANTITY_MAX = 99;

/**
 * Reading a thread is what marks it read. `before` (a message's
 * `sentAt`) reads the page of messages before it, for "Load older".
 */
export const readLocalThread = (threadId: string, before?: string) =>
  call<{
    ok: boolean;
    closed: boolean;
    /**
     * The conversation actually read, which may differ from the id
     * asked for when an old link held an anchor's id.
     */
    threadId?: string | null;
    /**
     * More messages wait before the oldest one returned. Optional: an
     * older server does not say, and then there is no "Load older".
     */
    hasOlder?: boolean;
    /**
     * A block stands between the two, either way round: nothing can be
     * sent, and the screen says so in place of the composer. Absent
     * from an older server.
     */
    blocked?: boolean;
    /**
     * What it is about: a posted Flare, a saved want, or the two
     * people. Optional: an older server does not say, and a thread
     * with a card name is then read as one about that card.
     */
    kind?: "flare" | "want" | "direct";
    cardName: string | null;
    withName: string | null;
    withPlayerId?: string | null;
    /** Their face for the header, as an absolute URL, or null for the initials. */
    withAvatarUrl: string | null;
    /**
     * Their handle, without the at-sign, drawn under the name in the
     * header. Optional: an older server does not send it, and a player
     * without one gets the name alone.
     */
    withHandle?: string | null;
    messages: LocalThreadMessage[];
    /** Optional: an older server does not send one. */
    meet?: MeetSuggestion | null;
    /** The newest "We traded" in this conversation. Optional, as above. */
    trade?: ThreadTrade | null;
  }>(
    "GET",
    `/api/v1/local/threads/${encodeURIComponent(threadId)}${
      before ? `?before=${encodeURIComponent(before)}` : ""
    }`,
  );

/**
 * "We traded": one side's word, written as a trade that waits for the
 * other side's. The card is the conversation's own on a Flare or a
 * want; a direct message names it here, and which way it went.
 */
export interface ProposeThreadTradeInput {
  cardId?: string | null;
  printingId?: string | null;
  quantity: number;
  /** On a direct message: the card came to the person saying it. */
  got?: boolean;
}

export const proposeThreadTrade = (threadId: string, input: ProposeThreadTradeInput) =>
  call<{ ok: true; trade: ThreadTrade }>(
    "POST",
    `/api/v1/local/threads/${encodeURIComponent(threadId)}/trade`,
    input,
  );

/** The other side's answer. Yes pays both; no takes the claim back. */
export const answerThreadTrade = (
  threadId: string,
  tradeId: string,
  answer: "yes" | "no",
) =>
  call<{ ok: true }>(
    "PATCH",
    `/api/v1/local/threads/${encodeURIComponent(threadId)}/trade`,
    { tradeId, answer },
  );

/**
 * What a refused "We traded" says, in the website's words
 * (src/lib/trades/thread-trade-copy.ts), keyed by the reason the
 * server named. Anything else is the plain failure line.
 */
export function threadTradeFailureMessage(caught: unknown): string {
  const reason = caught instanceof ApiError ? caught.code : "";
  switch (reason) {
    case "closed":
      return "You can't message this player.";
    case "pending":
      return "One trade at a time. Wait for their answer first.";
    case "already-traded":
      return "That Flare already traded.";
    case "no-card":
      return "Pick a card from the list.";
    case "answered":
      return "That one was already answered.";
    case "not-found":
      return "That trade is not here any more.";
    default:
      return "Something went wrong. Please try again in a moment.";
  }
}

export const sendLocalMessage = (threadId: string, body: string) =>
  call<{ ok: boolean }>(
    "POST",
    `/api/v1/local/threads/${encodeURIComponent(threadId)}`,
    { body },
  );

/**
 * The same request the rest of this file makes, for a module that
 * lives beside it (the remote's calls in remote-api.ts) rather than
 * inside it.
 */
export const apiCall = call;
