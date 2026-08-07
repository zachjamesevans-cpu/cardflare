import * as SecureStore from "expo-secure-store";

import { API_BASE, SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

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

export async function signIn(email: string, password: string): Promise<AuthResult> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      },
    );

    const body = await response.json().catch(() => ({}));

    if (!response.ok || !body.access_token) {
      // The same non-oracle answer for every failure, like the website.
      return {
        ok: false,
        message: "That email address and password do not match an account.",
      };
    }

    await storeAuth(body.access_token, body.refresh_token ?? "");
    return { ok: true };
  } catch {
    return { ok: false, message: "Could not reach CardFlare. Try again." };
  }
}

async function refreshAccessToken(): Promise<boolean> {
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refresh) return false;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ refresh_token: refresh }),
      },
    );

    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) return false;

    await storeAuth(body.access_token, body.refresh_token ?? refresh);
    return true;
  } catch {
    return false;
  }
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

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = {};

  const access = await storedAccessToken();
  if (access) headers.authorization = `Bearer ${access}`;

  const session = await storedSessionToken();
  if (session) headers["x-session-token"] = session;

  if (body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  // One silent refresh on an expired account token, then give up honestly.
  if (response.status === 401 && access && !retried) {
    if (await refreshAccessToken()) return call<T>(method, path, body, true);
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
  }[];
  collection: { cardsMatched: number; syncedAt: string } | null;
}

export const getMe = () => call<Me>("GET", "/api/v1/me");

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
  match: "exact" | "other-printing" | null;
  counterMayHave: boolean;
  offers: {
    responderSessionId: string;
    displayName: string | null;
    message: string | null;
    present: boolean;
  }[];
}

export interface RoomState {
  state: "room" | "show" | "lobby" | "quiet";
  joined?: boolean;
  room?: {
    name: string;
    status: string;
    storeName: string;
    kind: string;
    startsAt: string | null;
    endsAt: string | null;
  };
  you?: { sessionId: string; displayName: string };
  participants?: {
    playerSessionId: string;
    displayName: string | null;
    present: boolean;
    openToTrades: boolean;
  }[];
  flares?: RoomFlare[];
}

export const getRoom = (code: string) =>
  call<RoomState>("GET", `/api/v1/rooms/${encodeURIComponent(code)}`);

export async function joinRoom(
  code: string,
  displayName?: string,
): Promise<{ joined: boolean; you: { sessionId: string; displayName: string } }> {
  const result = await call<{
    joined: boolean;
    you: { sessionId: string; displayName: string };
    sessionToken?: string;
  }>("POST", `/api/v1/rooms/${encodeURIComponent(code)}`, { displayName });

  // Handed out exactly once; keep it or the membership is lost.
  if (result.sessionToken) {
    await SecureStore.setItemAsync(SESSION_KEY, result.sessionToken);
  }

  return result;
}

export const postFlare = (
  code: string,
  entry: { cardId: string; printingId?: string | null; quantity: number; note?: string },
) => call<{ ok: true }>("POST", `/api/v1/rooms/${encodeURIComponent(code)}/flares`, entry);

export const offerOnFlare = (code: string, flareId: string, message?: string) =>
  call<{ ok: true }>("POST", `/api/v1/rooms/${encodeURIComponent(code)}/offers`, {
    flareId,
    message,
  });

export const confirmTrade = (code: string, flareId: string, partnerSessionId?: string) =>
  call<{ ok: true }>("POST", `/api/v1/rooms/${encodeURIComponent(code)}/trades`, {
    flareId,
    partnerSessionId,
  });

export interface CardHit {
  id: string;
  name: string;
  cardNumber: string;
  printings: { id: string; label: string | null; imageUrl: string | null }[];
}

export const searchCards = (query: string) =>
  call<{ cards: CardHit[] }>(
    "GET",
    `/api/v1/cards?q=${encodeURIComponent(query)}`,
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
