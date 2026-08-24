import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * What the last visit looked like, painted before this one has loaded.
 *
 * The founder, after a first pass that cached only the Feed: "the entire
 * app pretty much should be cached, within reason, like how tiktok and
 * instagram save posts in your cache so you can quickly see them again
 * offline ... it takes a full 7 seconds to load the full profile."
 *
 * So this is the general version: any screen's answer, keyed by name,
 * scoped to the account, expiring on its own clock. `useCached` is how
 * screens use it — this file is only the shelf.
 *
 * THE RULES, WHICH ARE WHY THIS IS NOT A `setItem`:
 *
 * 1. KEYED TO THE ACCOUNT. A cache read by the wrong account is
 *    somebody else's data on your phone. Every key carries the player
 *    id, and a read with a different one misses rather than falls back.
 *
 * 2. IT EXPIRES, and not all at the same rate. A Feed says "a room is
 *    open right now"; a profile says what cosmetics somebody owns. The
 *    first is false within hours and the second is fine for a day, so
 *    the caller names its own lifetime rather than inheriting one.
 *
 * 3. IT IS A PAINT, NEVER A SOURCE OF TRUTH. Every screen refreshes
 *    over the top, and nothing acts on cached data — no write, no
 *    navigation decision, no balance check reads from here.
 *
 * 4. IT NEVER BREAKS THE APP. Read, write and clear all swallow. A
 *    cache that cannot be read is a cache that is not used, and the
 *    screen must load exactly as it did before this file existed.
 */
const PREFIX = "cardflare.cache.v2";

/** Who the last cache belongs to, read before the network can say. */
const LAST_ACCOUNT_KEY = `${PREFIX}.last`;

/**
 * How long each kind of answer is worth painting.
 *
 * Named here rather than at the call sites so the whole policy can be
 * read at once — the question "what might this app show me that is out
 * of date, and by how much" has one answer and it is this table.
 */
export const CACHE_TTL = {
  /*
   * Three days, not six hours. The founder opened the app the morning
   * after a session and everything was blank again: "opened it the next
   * day and it seems the cached stuff went away - hold cached things
   * for longer?" He is right about the trade: the paint is refreshed
   * over the top within seconds either way, so the cost of an old paint
   * is a moment of yesterday's rooms, and the cost of NO paint is a
   * blank screen every single morning. The refresh is what keeps "right
   * now" honest; the cache only has to keep the app from looking empty.
   */
  feed: 3 * 24 * 60 * 60 * 1000,
  /* A profile: name, picture, cosmetics, showcase. Changes rarely and
     visibly, and the founder's 7-second complaint is this screen. */
  profile: 7 * 24 * 60 * 60 * 1000,
  /* The wardrobe. Big, slow, and almost never different between two
     visits — what somebody owns changes when they buy something, and
     buying something refreshes it anyway. */
  customize: 7 * 24 * 60 * 60 * 1000,
  /* Notifications: painted so the list has shape immediately. The
     unread state refreshes over the top like everything else, so a day
     is fine where half an hour was cautious. */
  inbox: 24 * 60 * 60 * 1000,
  /* A room is the most live thing in the product. Short enough to be
     scaffolding and nothing more — the one entry the founder's "hold it
     longer" deliberately does not touch. */
  room: 5 * 60 * 1000,
  /* A shop's address and phone number. */
  store: 7 * 24 * 60 * 60 * 1000,
} as const;

export type CacheKind = keyof typeof CACHE_TTL;

interface Envelope<T> {
  value: T;
  at: number;
}

const keyFor = (kind: string, playerId: string, suffix?: string) =>
  `${PREFIX}.${kind}.${playerId}${suffix ? `.${suffix}` : ""}`;

/** Whose data was cached last, or null on a fresh install. */
export async function cachedPlayerId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_ACCOUNT_KEY);
  } catch {
    return null;
  }
}

export async function rememberAccount(playerId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_ACCOUNT_KEY, playerId);
  } catch {
    /* Next open simply does not paint. */
  }
}

/**
 * The last value for this key, if it is still worth showing.
 *
 * Null for a miss, a different account, a corrupt payload, or anything
 * past its lifetime. Every one of those is normal and none is an error
 * worth telling anybody about.
 */
export async function readCache<T>(
  kind: CacheKind,
  playerId: string,
  suffix?: string,
): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(kind, playerId, suffix));
    if (!raw) return null;

    const envelope = JSON.parse(raw) as Envelope<T>;
    if (typeof envelope?.at !== "number") return null;
    if (Date.now() - envelope.at > CACHE_TTL[kind]) return null;

    return envelope.value;
  } catch {
    return null;
  }
}

export async function writeCache<T>(
  kind: CacheKind,
  playerId: string,
  value: T,
  suffix?: string,
): Promise<void> {
  try {
    await AsyncStorage.multiSet([
      [
        keyFor(kind, playerId, suffix),
        JSON.stringify({ value, at: Date.now() } satisfies Envelope<T>),
      ],
      [LAST_ACCOUNT_KEY, playerId],
    ]);
  } catch {
    /* Out of space, or a value that will not serialise. What is on
       screen is already right; failing to remember it is not worth
       interrupting anybody over. */
  }
}

/**
 * Forget everything, on sign-out.
 *
 * Sweeps every account rather than the current one, because whoever is
 * signing out may not be whoever the pointer names — and a profile left
 * painted on a phone that has been handed to somebody else is the one
 * failure of this file that would actually matter.
 */
export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((key) => key.startsWith(PREFIX));

    if (ours.length > 0) await AsyncStorage.multiRemove(ours);
  } catch {
    /* Nothing to do about it, and nothing worth saying. */
  }
}
