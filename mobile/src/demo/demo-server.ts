import type { FeedCard } from "../api";
import type { WantedSort } from "../nearby-shared";
import { PEOPLE } from "./demo-people";
import {
  demoAnswerTrade,
  demoComment,
  demoFeed,
  demoFollow,
  demoHunt,
  demoLike,
  demoMarkRead,
  demoNotifications,
  demoOpenThread,
  demoPeople,
  demoWanted,
  demoPost,
  demoProfile,
  demoProposeTrade,
  demoPublish,
  demoSend,
  demoThread,
  demoThreads,
  demoUnread,
} from "./demo-world";

/**
 * Demo mode's server, on the phone. `call` in api.ts asks here first
 * (see demo-mode.ts for why it exists and where it is allowed to run).
 *
 * Three answers:
 *
 * - a SCRIPTED read - the Feed, a post, a hunt, a made-up person, your
 *   messages, your notices - comes from demo-world.ts;
 * - a WRITE of any kind is answered here and never leaves the phone:
 *   the ones a screen shows (a like, a comment, a message, a trade, a
 *   new post) change the world in memory, everything else says ok;
 * - any other READ returns null, and `call` goes to the real server
 *   for it. Reading changes nothing, and it is how your own profile,
 *   your binders and the card catalogue stay real, as the founder
 *   asked: "can use my own profile for some of the things such as
 *   showing off trade binders".
 */

export type DemoAnswer = { value: unknown } | null;

/* What the real server has told us, for the writes that need it. */
let me: { playerId: string; displayName: string; avatarUrl: string | null } = {
  playerId: "demo-you",
  displayName: "You",
  avatarUrl: null,
};
const cardsSeen = new Map<string, Omit<FeedCard, "match">>();
const huntsSeen = new Map<string, string>();
/*
 * Cards deleted from the Flare tab's list in demo mode. The delete never
 * leaves the phone, but the list is a real read, so without this the
 * card came straight back - the founder: "upon swiping to delete, the
 * card delete for a second, then comes right back." Remembered for the
 * session and left out of every /me read after (demoSaw).
 */
const droppedWants = new Set<string>();
const droppedOfferings = new Set<string>();

const isDemoId = (id: string) => id.startsWith("demo-");

/** The crowd behind your follower count: made-up, pictured, many. */
const CROWD_NAMES = [
  "Riley", "Noah P", "Isla", "Mateo", "Chloe R", "Kenji", "Amara", "Lucas",
  "Sofia M", "Ethan", "Yuki", "Diego", "Nora", "Felix", "Imani", "Oscar",
  "Lena", "Rafael", "Mila", "Jonah", "Aria", "Kai", "Esme", "Tariq",
  "Ruby", "Hugo", "Zara", "Milo", "Ines", "Caleb", "Leah", "Ravi",
  "Elena", "Owen", "Sana", "Finn", "Maeve", "Dante", "Juno", "Arlo",
  "Tess", "Bodhi", "Lila", "Omar", "Wren", "Jasper", "Nina", "Ezra",
];
const STYLES = ["notionists", "lorelei", "open-peeps", "avataaars"];
const BACKGROUNDS = ["b6e3f4", "ffd5dc", "c0aede", "d1d4f9", "ffdfbf", "c1f4c5"];
const RINGS = [null, "ring-sakura", null, "ring-ember", "ring-galaxy", null, "ring-water"];

const crowd = CROWD_NAMES.map((displayName, index) => ({
  playerId: `demo-crowd-${index}`,
  displayName,
  avatarUrl: `https://api.dicebear.com/9.x/${STYLES[index % STYLES.length]}/png?seed=${encodeURIComponent(
    displayName,
  )}&size=256&backgroundColor=${BACKGROUNDS[index % BACKGROUNDS.length]}`,
  frame: null,
  ring: RINGS[index % RINGS.length],
  aura: null,
  partners: index % 3 === 0,
}));

/** How much of the crowd you follow back. */
const FOLLOWING_CROWD = 19;

const named = Object.values(PEOPLE).map((p) => ({
  playerId: p.playerId,
  displayName: p.displayName,
  avatarUrl: p.avatarUrl,
  frame: p.frame,
  ring: p.ring,
  aura: p.aura,
  partners: true,
}));

/** Remember what a real read said, where a later write needs it. */
export function demoSaw(method: string, path: string, value: unknown): unknown {
  const route = path.split("?")[0];
  if (method !== "GET" || !value || typeof value !== "object") return value;
  const body = value as Record<string, unknown>;

  if (route === "/api/v1/me") {
    if (Array.isArray(body.wants)) {
      body.wants = (body.wants as { id: string; cardId: string; direction?: string }[]).filter(
        (want) =>
          !droppedWants.has(want.id) &&
          !(want.direction === "offering" && droppedOfferings.has(want.cardId)),
      );
    }
    const player = body.player as
      | { id: string; displayName: string; avatarUrl?: string | null }
      | undefined;
    if (player) {
      me = {
        playerId: player.id,
        displayName: player.displayName,
        avatarUrl: player.avatarUrl ?? null,
      };
    }
  }

  if (route === "/api/v1/cards" && Array.isArray(body.cards)) {
    for (const hit of body.cards as {
      id: string;
      name: string;
      cardNumber: string;
      basePrintingId: string | null;
      printings: { id: string; label: string | null; imageUrl: string | null }[];
    }[]) {
      for (const printing of hit.printings) {
        const card = {
          cardId: hit.id,
          cardName: hit.name,
          cardNumber: hit.cardNumber,
          imageUrl: printing.imageUrl ?? hit.printings[0]?.imageUrl ?? null,
          printingId: printing.id,
          printingLabel: printing.label,
        };
        cardsSeen.set(`${hit.id}:${printing.id}`, card);
        if (!cardsSeen.has(hit.id) || printing.id === hit.basePrintingId) {
          cardsSeen.set(hit.id, card);
        }
      }
    }
  }

  /* Your own profile stays real, but its counts agree with the
     followers and following demo mode lists when they are opened. */
  if (route === "/api/v1/profile" && body.profile && typeof body.profile === "object") {
    const profile = body.profile as { stats?: Record<string, number> };
    if (profile.stats) {
      profile.stats = {
        ...profile.stats,
        followers: named.length + crowd.length,
        following: named.length + FOLLOWING_CROWD,
      };
    }
  }

  if (route === "/api/v1/hunts" && Array.isArray(body.hunts)) {
    for (const hunt of body.hunts as { id?: string; name: string }[]) {
      if (hunt.id) huntsSeen.set(hunt.id, hunt.name);
    }
  }

  return value;
}

const ok = (extra: Record<string, unknown> = {}): DemoAnswer => ({
  value: { ok: true, ...extra },
});

export function demoAnswer(method: string, path: string, body: unknown): DemoAnswer {
  const route = path.split("?")[0];
  const parts = route.split("/").filter(Boolean).map(decodeURIComponent);
  const input = (body ?? {}) as Record<string, unknown>;

  /* --- Reads ------------------------------------------------------ */
  if (method === "GET") {
    if (route === "/api/v1/feed") return { value: demoFeed() };
    if (route === "/api/v1/nearby/wanted") {
      const sort = /[?&]sort=(most|closest|newest)/.exec(path)?.[1] ?? "most";
      return { value: demoWanted(sort as WantedSort) };
    }
    if (route === "/api/v1/notifications") return { value: demoNotifications() };
    if (route === "/api/v1/notifications/unread") return { value: demoUnread() };
    if (route === "/api/v1/local/threads") return { value: demoThreads() };
    if (route === "/api/v1/followers") return { value: { followers: [...named, ...crowd] } };
    if (route === "/api/v1/following") {
      return { value: { following: [...named, ...crowd.slice(0, FOLLOWING_CROWD)] } };
    }

    /* /api/v1/local/threads/:id */
    if (parts.length === 5 && route.startsWith("/api/v1/local/threads/")) {
      const thread = demoThread(parts[4]);
      if (thread) return { value: thread };
    }
    /* /api/v1/posts/:id */
    if (parts.length === 4 && parts[2] === "posts" && isDemoId(parts[3])) {
      const post = demoPost(parts[3]);
      return post ? { value: { post } } : null;
    }
    /* /api/v1/hunts/:id */
    if (parts.length === 4 && parts[2] === "hunts" && isDemoId(parts[3])) {
      const hunt = demoHunt(parts[3]);
      return hunt ? { value: { hunt } } : null;
    }
    /* /api/players/:id and its people and binders */
    if (parts[0] === "api" && parts[1] === "players" && parts[2] && isDemoId(parts[2])) {
      if (parts.length === 3) {
        const profile = demoProfile(parts[2]);
        if (profile) return { value: profile };
      }
      if (parts[3] === "people") return { value: demoPeople(parts[2]) };
      if (parts[3] === "binders") return { value: { binders: [] } };
    }
    /* Everything else is real: your profile, your binders, the catalogue. */
    return null;
  }

  /* --- Writes: never sent ----------------------------------------- */
  if (method === "DELETE" && parts[2] === "wants" && parts[3]) {
    droppedWants.add(parts[3]);
    return ok();
  }
  if (
    route === "/api/v1/offerings" &&
    input.action === "remove" &&
    typeof input.cardId === "string"
  ) {
    droppedOfferings.add(input.cardId);
    return ok();
  }

  if (route === "/api/v1/notifications") {
    demoMarkRead(Array.isArray(input.ids) ? (input.ids as string[]) : []);
    return ok();
  }

  if (parts[2] === "posts" && parts[3]) {
    const id = parts[3];
    switch (input.action) {
      case "like":
      case "unlike":
        demoLike(id, input.action === "like");
        return ok();
      case "comment":
        return ok({ comment: demoComment(id, String(input.body ?? ""), me) });
      case "offer-items": {
        const items = Array.isArray(input.items) ? input.items : [];
        return ok({ offered: items.length, refused: [] });
      }
      case "take-down":
        return ok({ flareIds: [] });
      case "restore":
        return ok({ restored: 0 });
      default:
        return ok();
    }
  }

  if (route === "/api/v1/local/threads") {
    return ok({ threadId: demoOpenThread(input.playerId as string | undefined) });
  }
  if (route.startsWith("/api/v1/local/threads/")) {
    const id = parts[4];
    if (parts[5] === "trade") {
      if (method === "PATCH") {
        demoAnswerTrade(id, input.answer === "no" ? "no" : "yes");
        return ok();
      }
      return ok({
        trade: demoProposeTrade(
          id,
          Number(input.quantity ?? 1) || 1,
          Boolean(input.got),
        ),
      });
    }
    demoSend(id, String(input.body ?? ""));
    return ok();
  }

  if (parts[0] === "api" && parts[1] === "players" && parts[2] && parts.length === 3) {
    return { value: { follow: demoFollow(parts[2], input.action !== "unfollow") } };
  }

  if (route === "/api/v1/flares/publish") {
    const items = Array.isArray(input.items)
      ? (input.items as { cardId: string; printingId?: string | null; quantity: number }[])
      : [];
    const cards: FeedCard[] = items.map((item, index) => {
      const seen =
        (item.printingId ? cardsSeen.get(`${item.cardId}:${item.printingId}`) : null) ??
        cardsSeen.get(item.cardId);
      return {
        cardId: item.cardId,
        cardName: seen?.cardName ?? "Card",
        cardNumber: seen?.cardNumber ?? "",
        imageUrl: seen?.imageUrl ?? null,
        printingId: item.printingId ?? seen?.printingId ?? null,
        printingLabel: seen?.printingLabel ?? null,
        match: null,
        flareId: `demo-f-mine-${Date.now()}-${index}`,
        state: "open",
        youOffered: false,
        quantity: item.quantity,
        remaining: item.quantity,
        huntRequestId: null,
      };
    });
    const asked = input.hunt as { id?: string; name?: string } | null | undefined;
    const huntName = asked?.name ?? (asked?.id ? huntsSeen.get(asked.id) : undefined);
    const hunt =
      input.intent !== "showcase" && huntName
        ? { id: asked?.id ?? `demo-hunt-mine-${Date.now()}`, name: huntName }
        : null;
    const postId = demoPublish(
      me,
      cards,
      input.intent === "showcase" ? "showcase" : "want",
      hunt,
      typeof input.caption === "string" ? input.caption : null,
    );
    return ok({
      postId,
      total: cards.length,
      posted: cards.length,
      alreadyUp: 0,
      failed: 0,
      postedCardIds: cards.map((c) => c.cardId),
      huntId: hunt?.id ?? null,
      atCap: false,
    });
  }

  if (parts[2] === "hunts" && parts[3] && input.action === "offer") {
    const lines = Array.isArray(input.lines) ? input.lines : [];
    return ok({ offered: lines.length, messaged: 1, threadId: "demo-t-maya", refused: [] });
  }

  /* Any other write: done, as far as the screen can tell. */
  return ok();
}
