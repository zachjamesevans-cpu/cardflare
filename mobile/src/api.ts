import * as SecureStore from "expo-secure-store";

import { clearCache } from "./cache";
import type { RoomTimerWire } from "./room-timer-wire";

import { API_BASE } from "./config";
import type { ArtFile } from "./cosmetic-film";

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
  /* The guest room identity goes too: it was joined under this
     account's name and would follow the next sign-in into the room. */
  await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {});

  /*
   * And the cached feed, which is the part that is easy to forget.
   * Tokens are what stop the app talking to the server; the cache is
   * what the NEXT person to open this phone would see painted on the
   * screen before it ever tries — a feed, a profile, a wardrobe.
   * Signing out has to take both.
   */
  await clearCache();

  for (const listener of signedOut) listener();
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
   * The server answered and said no: the refresh token is dead
   * (password changed on the website, session revoked, long expiry).
   * The tokens stay in the keychain otherwise, every call 401s, and the
   * profile shows "could not load" with no Sign out in reach. So a
   * refusal signs the phone out properly, back to the front door. A
   * network failure (status 0) is not a refusal and changes nothing.
   */
  if (result.status !== 0) {
    await forgetAuth();
    await clearCache();
    for (const listener of signedOut) listener();
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* The API client                                                      */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/**
 * A failure, named for a screen. Generic "could not load" messages cost
 * days of blind debugging; every error surface appends this instead, so
 * a screenshot of the failure IS the diagnosis: "timeout" and
 * "unauthorized (401)" point at different bugs from the same couch.
 */
export function describeError(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.status === 0) return caught.code;
    return `${caught.code} ${caught.status}`;
  }
  return caught instanceof Error ? caught.message : "unknown";
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
    const detail = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(response.status, detail.error ?? `http-${response.status}`);
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
  };
  wants: {
    id: string;
    cardId: string;
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
   */
  staff?: { storeId: string; name: string; code: string; role: "owner" | "staff" }[];
}

export const getMe = () => call<Me>("GET", "/api/v1/me");

export const removeLocal = (storeId: string) =>
  call<{ ok: true }>("DELETE", "/api/v1/locals", { storeId });

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
    kind: string;
    startsAt: string | null;
    endsAt: string | null;
    /** The board is open ahead of doors; everyone on it is on their way. */
    early: boolean;
  };
  you?: { sessionId: string; displayName: string };
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
  you: { sessionId: string; displayName: string };
}> {
  // Joining does the most server work of any call (session creation,
  // walk-in rooms opening, a possible cold start) — it gets double the
  // patience before the screen calls it a timeout.
  const result = await call<{
    joined: boolean;
    resumed?: boolean;
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
 * A hunt saved straight to the account — no room involved, so a
 * midnight Flare never keeps a closed store's room warm. The next room
 * the player walks into offers to post it.
 */
export const saveToList = (entry: {
  cardId: string;
  printingId?: string | null;
  quantity: number;
  note?: string;
  deckLabel?: string | null;
}) => call<{ ok: true }>("POST", "/api/v1/wants", entry);

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

export const removeFlare = (code: string, flareId: string) =>
  call<{ ok: true }>("DELETE", `/api/v1/rooms/${encodeURIComponent(code)}/flares`, {
    flareId,
  });

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
}

export const searchCards = (query: string, game?: string | null) =>
  call<{ cards: CardHit[] }>(
    "GET",
    `/api/v1/cards?q=${encodeURIComponent(query)}${
      game ? `&game=${encodeURIComponent(game)}` : ""
    }`,
  );

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
   * The post that Flare went up in, so a visitor's "I have this" can
   * be sent through `offerItemsOnPost`. Null when nothing is posted.
   * Optional because the server grows it in the same round as this
   * screen and an older one never sends it; absent reads as "not
   * posted yet", which offers nothing rather than something broken.
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
  avatarUrl: string | null;
  /** Their cover banner, blurred behind the popup header. */
  coverUrl: string | null;
  /** The viewer's side of the relationship; null hides the button. */
  follow: FollowState | null;
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
/* The Have list and nearby matching                                   */
/* ------------------------------------------------------------------ */

/** One card on the Have list: the room's binder row, with the switch. */
export interface HaveEntry {
  id: string;
  cardId: string;
  cardName: string;
  cardNumber: string;
  printingId: string | null;
  printingLabel: string | null;
  imageUrl: string | null;
  quantity: number;
  note: string | null;
  /** The owner will trade this one with people nearby. */
  localTrade: boolean;
}

/** The account's Have list, no room needed. Private to its owner. */
export const getHaves = () => call<{ haves: HaveEntry[] }>("GET", "/api/v1/haves");

export const addHave = (cardId: string, printingId: string | null, quantity = 1) =>
  call<{ ok: true }>("POST", "/api/v1/haves", { cardId, printingId, quantity });

export const removeHave = (entryId: string) =>
  call<{ ok: boolean }>("DELETE", "/api/v1/haves", { entryId });

/** Trade locally on or off, for one card. */
export const setHaveLocalTrade = (entryId: string, localTrade: boolean) =>
  call<{ ok: true }>("PUT", "/api/v1/haves", { entryId, localTrade });

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

export const addHuntCards = (
  huntId: string,
  items: { cardId: string; printingId?: string | null; quantity: number }[],
) =>
  call<{ hunts: Hunt[]; limit: number }>("POST", "/api/v1/hunts", {
    action: "add-cards",
    huntId,
    items,
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
    posted?: number;
    huntId?: string | null;
    atCap?: boolean;
    error?: string;
    message?: string;
  }>("POST", "/api/v1/flares/publish", input);

/** "I have these": several cards from one post, each with how many. */
export const offerItemsOnPost = (
  postId: string,
  items: { flareId: string; quantity: number }[],
  message: string,
) =>
  call<{ ok: true; offered: number; refused: string[] }>(
    "POST",
    `/api/v1/posts/${encodeURIComponent(postId)}`,
    { action: "offer-items", items, message },
  );

/** One trade in your history, both sides. Mirrors the server's entry. */
export interface TradeHistoryEntry {
  id: string;
  cardId: string;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
  quantity: number;
  /** The card came TO you. False: it left your binder. */
  got: boolean;
  partnerName: string | null;
  storeName: string | null;
  eventName: string | null;
  confirmedAt: string;
  status: "confirmed" | "pending" | "late" | "disputed" | "unnamed";
  /** What this trade paid you, net of any reversal. */
  embers: number;
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
export const setFeedView = (view: string) =>
  call<{ ok: true; feedView: string }>("POST", "/api/v1/profile", {
    action: "set-feed-view",
    view,
  });

export const tickHuntCard = (flareId: string, found: boolean) =>
  call<{ hunts: Hunt[] }>("POST", "/api/v1/hunts", { flareId, found });

export const likePost = (postId: string, liked: boolean) =>
  call<{ ok: true }>("POST", `/api/v1/posts/${encodeURIComponent(postId)}`, {
    action: liked ? "like" : "unlike",
  });

export const commentOnPost = (postId: string, body: string) =>
  call<{ ok: true; comment: PostComment }>(
    "POST",
    `/api/v1/posts/${encodeURIComponent(postId)}`,
    { action: "comment", body },
  );

/** "I have this" on one card of a post, with a note for the thread. */
export const offerFromPost = (postId: string, flareId: string, note: string) =>
  call<{ ok: true }>("POST", `/api/v1/posts/${encodeURIComponent(postId)}`, {
    action: "offer",
    flareId,
    note,
  });

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
  tonight: "Tonight",
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
  | {
      kind: "wanted";
      total: number;
      entries: {
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
  address: string | null;
  phone: string | null;
  website: string | null;
  verified: boolean;
  ultra: boolean;
  unclaimed: boolean;
  attribution: string | null;
}

export const getStore = (storeId: string) =>
  call<{ store: PublicStore }>("GET", `/api/v1/stores/${encodeURIComponent(storeId)}`);

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

/** The roles the picker offers, matching the website's. */
export const CLAIM_ROLES = [
  "Owner",
  "Manager",
  "Staff",
  "Event organiser",
  "Other",
] as const;

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
  /** Null for a thread on a saved want (a nearby match). */
  flareId: string | null;
  wantId?: string | null;
  cardName: string;
  cardNumber: string;
  imageUrl: string | null;
  withName: string;
  withPlayerId: string;
  role: "author" | "responder";
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unread: number;
  closed: boolean;
}

export interface LocalThreadMessage {
  id: string;
  body: string;
  sentAt: string;
  yours: boolean;
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

/** Somewhere public to suggest meeting: a store, never an address. */
export interface MeetSuggestion {
  storeName: string;
  joinCode: string;
  nextEventName: string | null;
  nextEventAt: string | null;
  timeZone: string;
  shared: boolean;
}

/** Reading a thread is what marks it read. */
export const readLocalThread = (threadId: string) =>
  call<{
    ok: boolean;
    closed: boolean;
    cardName: string | null;
    withName: string | null;
    messages: LocalThreadMessage[];
    /** Optional: an older server does not send one. */
    meet?: MeetSuggestion | null;
  }>("GET", `/api/v1/local/threads/${encodeURIComponent(threadId)}`);

export const sendLocalMessage = (threadId: string, body: string) =>
  call<{ ok: boolean }>(
    "POST",
    `/api/v1/local/threads/${encodeURIComponent(threadId)}`,
    { body },
  );

export const closeLocalThread = (threadId: string) =>
  call<{ ok: boolean }>(
    "DELETE",
    `/api/v1/local/threads/${encodeURIComponent(threadId)}`,
  );

/**
 * The same request the rest of this file makes, for a module that
 * lives beside it (the remote's calls in remote-api.ts) rather than
 * inside it.
 */
export const apiCall = call;
