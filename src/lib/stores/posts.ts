import "server-only";

import { countParticipants } from "@/lib/events/participants";
import { earlyBoardOpensAt, roomPhase, type RoomPhase } from "@/lib/events/schema";
import { socialForPosts, type PostSocial } from "@/lib/feed/post-queries";
import { avatarSrc } from "@/lib/players/profile-image";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type {
  StorePostInsert,
  StorePostRow,
  StorePostUpdate,
} from "@/lib/supabase/types";
import { putStoreImage } from "./store-images";

/**
 * A store's posts: written from the console, read by its followers.
 *
 * The founder: "a store announcing 'OP-12 prerelease Saturday, 20
 * seats' as a Flare-shaped post to its followers. This is the thing
 * that makes following worth it." A post is a title, a line or two, a
 * picture when they have one, and optionally the event night it is
 * about. Likes and comments reuse the Flare post tables, whose post_id
 * is a bare uuid on purpose, so the heart and the thread under a store
 * post are the same heart and thread every Flare has.
 */

/** The event night a post is about, with what "I'll be there" needs. */
export interface StorePostEvent {
  id: string;
  code: string;
  name: string;
  startsAt: string;
  /** When the board starts taking Flares; the start itself with early boards off. */
  opensAt: string;
  timeZone: string;
  /** Who has already said "I'll be there", by the only measure that counts. */
  playersIn: number;
  phase: RoomPhase;
}

export interface FollowedStorePost extends PostSocial {
  postId: string;
  storeId: string;
  storeName: string;
  /** The store's logo, as `/api/avatars/...`, or null for a shop with none. */
  logoUrl: string | null;
  verified: boolean;
  title: string;
  body: string | null;
  imageUrl: string | null;
  postedAt: string;
  event: StorePostEvent | null;
}

/** A post as the console lists it: the post, its counts, its event's name. */
export interface ConsoleStorePost {
  id: string;
  title: string;
  body: string | null;
  imageUrl: string | null;
  publishedAt: string;
  eventName: string | null;
  likes: number;
  comments: number;
}

type Upload = { arrayBuffer(): Promise<ArrayBuffer>; size: number; type: string };

export type CreateStorePostOutcome =
  | { ok: true; postId: string }
  | { ok: false; reason: "unavailable" | "image" | "event" };

/**
 * Publish a post. The picture is stored first so a post never points
 * at nothing; the event, when named, has to be the store's own, so a
 * form cannot attach another shop's night to this shop's news.
 */
export async function createStorePost(
  storeId: string,
  authorUserId: string,
  post: { title: string; body: string; eventId?: string; image?: Upload | null },
): Promise<CreateStorePostOutcome> {
  if (!isSupabaseConfigured()) return { ok: false, reason: "unavailable" };
  const admin = getSupabaseAdmin();

  if (post.eventId) {
    const { data: event } = await admin
      .from("events")
      .select("id")
      .eq("id", post.eventId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (!event) return { ok: false, reason: "event" };
  }

  let image: string | null = null;
  if (post.image && post.image.size > 0) {
    const put = await putStoreImage(storeId, "post", post.image);
    if (!put.ok) return { ok: false, reason: "image" };
    image = put.path;
  }

  const { data, error } = await admin
    .from("store_posts")
    .insert({
      store_id: storeId,
      author_user_id: authorUserId,
      title: post.title,
      body: post.body.length > 0 ? post.body : null,
      image,
      event_id: post.eventId ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Could not publish the store post", error);
    if (image) await admin.storage.from("avatars").remove([image]);
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true, postId: data.id };
}

/** Take a post down. Scoped to the store, so a post id alone cannot reach another shop's. */
export async function archiveStorePost(
  storeId: string,
  postId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const patch: StorePostUpdate = { archived_at: new Date().toISOString() };
  const { error } = await getSupabaseAdmin()
    .from("store_posts")
    .update(patch)
    .eq("id", postId)
    .eq("store_id", storeId)
    .is("archived_at", null);

  if (error) {
    console.error("Could not archive the store post", error);
    return false;
  }
  return true;
}

/** The store's live posts, newest first, for the console. */
export async function listStorePosts(storeId: string): Promise<ConsoleStorePost[]> {
  if (!isSupabaseConfigured()) return [];
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("store_posts")
    .select("id, title, body, image, event_id, published_at")
    .eq("store_id", storeId)
    .is("archived_at", null)
    .order("published_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Could not list the store's posts", error);
    return [];
  }

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const eventIds = [
    ...new Set(rows.flatMap((row) => (row.event_id ? [row.event_id] : []))),
  ];
  const [social, events] = await Promise.all([
    socialForPosts(
      rows.map((row) => row.id),
      "",
    ),
    eventIds.length > 0
      ? admin.from("events").select("id, name").in("id", eventIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const eventName = new Map((events.data ?? []).map((row) => [row.id, row.name]));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    imageUrl: avatarSrc(row.image),
    publishedAt: row.published_at,
    eventName: row.event_id ? (eventName.get(row.event_id) ?? null) : null,
    likes: social.get(row.id)?.likes ?? 0,
    comments: social.get(row.id)?.comments ?? 0,
  }));
}

/**
 * The events behind a set of posts, with the phase each is in right now.
 *
 * Read with the store's own clock and early-board window, because
 * "I'll be there" only works on a board that is taking Flares, and the
 * card has to say when it will be rather than offer a button that does
 * nothing.
 */
async function eventsFor(
  eventIds: string[],
  now: number,
): Promise<Map<string, StorePostEvent>> {
  const out = new Map<string, StorePostEvent>();
  const ids = [...new Set(eventIds)];
  if (ids.length === 0) return out;
  const admin = getSupabaseAdmin();

  const { data: events, error } = await admin
    .from("events")
    .select("id, name, join_code, kind, status, starts_at, ends_at, store_id")
    .in("id", ids);
  if (error) {
    console.error("Could not read the posts' events", error);
    return out;
  }
  const rows = events ?? [];
  if (rows.length === 0) return out;

  const storeIds = [...new Set(rows.map((row) => row.store_id))];
  const [{ data: stores }, counts] = await Promise.all([
    admin.from("stores").select("id, timezone, early_board_hours").in("id", storeIds),
    countParticipants(rows.map((row) => row.id)),
  ]);
  const storeById = new Map((stores ?? []).map((row) => [row.id, row]));

  for (const row of rows) {
    if (!row.join_code) continue;
    const store = storeById.get(row.store_id);
    const shape = {
      kind: row.kind,
      status: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      earlyBoardHours: store?.early_board_hours ?? 0,
      storeTimeZone: store?.timezone ?? "UTC",
    };
    const opensAt = earlyBoardOpensAt(shape);
    out.set(row.id, {
      id: row.id,
      code: row.join_code,
      name: row.name,
      startsAt: row.starts_at,
      opensAt: opensAt !== null ? new Date(opensAt).toISOString() : row.starts_at,
      timeZone: shape.storeTimeZone,
      playersIn: counts.get(row.id)?.total ?? 0,
      phase: roomPhase(shape, now),
    });
  }
  return out;
}

/**
 * What the stores this player follows have said since a moment, newest
 * first, for the Feed.
 *
 * A follow is a `player_locals` row: joining a room while signed in
 * saves the store, and the Follow button writes the same row. So this
 * is the payoff of following a shop, and the reason the Feed's own
 * "Because you follow <store>" line is honest.
 */
export async function storePostsForFollowers(
  playerId: string,
  sinceIso: string,
  now: number = Date.now(),
): Promise<FollowedStorePost[]> {
  if (!isSupabaseConfigured()) return [];
  const admin = getSupabaseAdmin();

  const { data: locals, error: localsError } = await admin
    .from("player_locals")
    .select("store_id")
    .eq("player_id", playerId);
  if (localsError) {
    console.error("Could not read the player's locals", localsError);
    return [];
  }
  const storeIds = [...new Set((locals ?? []).map((row) => row.store_id))];
  if (storeIds.length === 0) return [];

  const { data, error } = await admin
    .from("store_posts")
    .select("id, store_id, title, body, image, event_id, published_at")
    .in("store_id", storeIds)
    .is("archived_at", null)
    .gte("published_at", sinceIso)
    .order("published_at", { ascending: false })
    .limit(60);
  if (error) {
    console.error("Could not read the followed stores' posts", error);
    return [];
  }
  const rows = (data ?? []) as Pick<
    StorePostRow,
    "id" | "store_id" | "title" | "body" | "image" | "event_id" | "published_at"
  >[];
  if (rows.length === 0) return [];

  const [{ data: stores }, social, events] = await Promise.all([
    admin
      .from("stores")
      .select("id, name, logo_image, verified_at")
      .in("id", [...new Set(rows.map((row) => row.store_id))]),
    socialForPosts(
      rows.map((row) => row.id),
      playerId,
    ),
    eventsFor(
      rows.flatMap((row) => (row.event_id ? [row.event_id] : [])),
      now,
    ),
  ]);
  const storeById = new Map((stores ?? []).map((row) => [row.id, row]));

  return rows.flatMap((row) => {
    const store = storeById.get(row.store_id);
    if (!store) return [];
    const counts = social.get(row.id) ?? { likes: 0, comments: 0, liked: false };
    return [
      {
        postId: row.id,
        storeId: row.store_id,
        storeName: store.name,
        logoUrl: avatarSrc(store.logo_image),
        verified: store.verified_at !== null,
        title: row.title,
        body: row.body,
        imageUrl: avatarSrc(row.image),
        postedAt: row.published_at,
        event: row.event_id ? (events.get(row.event_id) ?? null) : null,
        ...counts,
      },
    ];
  });
}
