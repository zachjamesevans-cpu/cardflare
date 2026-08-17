import * as SecureStore from "expo-secure-store";

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

export async function storedAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function storedSessionToken(): Promise<string | null> {
  return SecureStore.getItemAsync(SESSION_KEY);
}

async function storeAuth(access: string, refresh: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, access);
  await SecureStore.setItemAsync(REFRESH_KEY, refresh);
}

export async function signOut(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
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
    };

    return {
      status: response.status,
      accessToken: body.accessToken ?? null,
      refreshToken: body.refreshToken ?? "",
    };
  } catch {
    return { status: 0, accessToken: null, refreshToken: "" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Open sign-up: one call creates the account AND signs it in. The
 * server runs both so the phone never makes two round trips over
 * networks that have eaten this app's requests before.
 */
export async function signUp(email: string, password: string): Promise<AuthResult> {
  const result = await authRequest({
    action: "sign-up",
    email: email.trim().toLowerCase(),
    password,
  });

  if (result.accessToken) {
    await storeAuth(result.accessToken, result.refreshToken);
    return { ok: true };
  }

  if (result.status === 409) {
    return {
      ok: false,
      message: "That address already has an account. Sign in instead.",
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

  return { ok: false, message: "Could not reach CardFlare. Try again." };
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refresh) return false;

  const result = await authRequest({ action: "refresh", refreshToken: refresh });
  if (!result.accessToken) return false;

  await storeAuth(result.accessToken, result.refreshToken || refresh);
  return true;
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

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  retried = false,
  timeoutMs = 15_000,
): Promise<T> {
  const headers: Record<string, string> = {};

  const access = await storedAccessToken();
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

  return (await response.json()) as T;
}

/* ------------------------------------------------------------------ */
/* Typed endpoints                                                     */
/* ------------------------------------------------------------------ */

export interface Me {
  player: { id: string; displayName: string };
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
  }>("POST", `/api/v1/rooms/${encodeURIComponent(code)}`, { displayName }, false, 30_000);

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
) => call<{ ok: true }>("POST", `/api/v1/rooms/${encodeURIComponent(code)}/flares`, entry);

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

export const confirmTrade = (code: string, flareId: string, partnerSessionId?: string) =>
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

export const searchCards = (query: string) =>
  call<{ cards: CardHit[] }>(
    "GET",
    `/api/v1/cards?q=${encodeURIComponent(query)}`,
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
}

export const getTrades = (code: string) =>
  call<{ trades: TradeRecord[] }>(
    "GET",
    `/api/v1/rooms/${encodeURIComponent(code)}/trades`,
  );

export const registerDevice = (platform: "ios" | "android", pushToken: string) =>
  call<{ ok: true }>("POST", "/api/v1/devices", { platform, pushToken });

export interface InboxItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  createdAt: string;
  readAt: string | null;
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
}

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
  showcase: ShowcaseCard[];
  showcaseLimit: number;
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
  showcase: {
    id: string;
    name: string;
    number: string;
    imageUrl: string | null;
    frame: string | null;
    holo: string | null;
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
  match: "exact" | "other-printing";
}

export type FeedItem =
  | {
      kind: "board";
      code: string;
      storeName: string;
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
        answers: number;
      }[];
    }
  | {
      kind: "hunt";
      code: string;
      storeName: string;
      eventName: string;
      playerId: string;
      displayName: string;
      avatarUrl: string | null;
      frame: string | null;
      ring: string | null;
      card: FeedCard;
    };

export const getFeed = () => call<{ items: FeedItem[] }>("GET", "/api/v1/feed");

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
   * A dropped-in Rive file, when the cosmetic is one of those.
   *
   * Carried but not yet drawn: playing it needs the native Rive
   * runtime, which is its own milestone (a native module lands in the
   * build, and this app has been crashed by one before - it gets a
   * round of its own). Equipping works today and the file plays on the
   * web profile.
   */
  rive: { url: string; artboard: string | null; stateMachine: string | null } | null;
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
  }>("GET", "/api/v1/customize");

/** Wears one cosmetic, or clears the slot with null. */
export const setCustomizeEquip = (kind: CustomizeKind, slug: string | null) =>
  call<{ ok: true }>("POST", "/api/v1/customize", { kind, slug });
