import type {
  FeedCard,
  FeedEntry,
  HuntView,
  InboxItem,
  LocalThread,
  LocalThreadMessage,
  MeetSuggestion,
  NearbyMatch,
  PeekProfile,
  PostComment,
  PostDetail,
  ThreadTrade,
  WantedGroup,
  WantedPage,
  WantedSummary,
} from "../api";
import { DEMO_CARDS, type DemoCardKey } from "./demo-cards";
import {
  distinctPeople,
  groupByCard,
  milesLabel,
  type WantedSort,
} from "../nearby-shared";
import { PEOPLE, type DemoPerson, type DemoPersonKey } from "./demo-people";

/**
 * Everything demo mode shows that is not yours: posts, hunts, comments,
 * conversations, a trade on the table, notifications. Built once per
 * launch, timed relative to now so "12m ago" stays "12m ago", and kept
 * in memory so a like, a comment, a message or a post lands on screen
 * like the real thing and is gone on the next launch.
 */

const now = Date.now();
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

/* ------------------------------------------------------------------ */
/* Posts                                                               */
/* ------------------------------------------------------------------ */

interface CardSpec {
  card: DemoCardKey;
  quantity?: number;
  /** Copies still wanted; 0 with `found` is a card done. */
  found?: boolean;
  /** You hold it: the green ring and "You have this". */
  held?: "exact" | "other-printing";
  offered?: boolean;
}

interface PostSpec {
  key: string;
  by: DemoPersonKey;
  direction: "want" | "showcase";
  hunt?: string;
  note?: string;
  cards: CardSpec[];
  likes: number;
  comments: ([DemoPersonKey, string] | [DemoPersonKey, string, "comment" | "offer"])[];
  offers?: number;
  minutes: number;
  tab: "following" | "nearby";
  completed?: boolean;
}

const POSTS: PostSpec[] = [
  {
    key: "maya-crew",
    by: "maya",
    direction: "want",
    hunt: "Straw Hat Crew",
    note: "Last few for the crew binder. Trades over cash 🏴‍☠️",
    cards: [
      { card: "luffySr", held: "exact" },
      { card: "zoroSec" },
      { card: "nami02", found: true },
      { card: "sanjiSec", held: "other-printing" },
      { card: "robin01", quantity: 2 },
      { card: "luffy14", found: true },
      { card: "zoroEb" },
      { card: "nami14" },
    ],
    likes: 48,
    comments: [
      ["kaito", "That Zoro SEC is so clean. Good luck!"],
      ["ava", "I have the Robin, sent you an offer", "offer"],
      ["jordan", "Bring the binder Friday, I might have Sanji"],
    ],
    offers: 3,
    minutes: 14,
    tab: "following",
  },
  {
    key: "kaito-vintage",
    by: "kaito",
    direction: "want",
    note: "Base set grails. Can trade or add cash.",
    cards: [
      { card: "charizardBase" },
      { card: "umbreonCol", held: "exact" },
      { card: "mewtwoBase" },
      { card: "pikachuBase", quantity: 2 },
    ],
    likes: 21,
    comments: [
      ["sam", "Have a Mewtwo, PSA 8 though"],
      ["zoe", "Umbreon gang 🌙"],
    ],
    offers: 1,
    minutes: 52,
    tab: "following",
  },
  {
    key: "jordan-shanks",
    by: "jordan",
    direction: "showcase",
    note: "Pulled doubles this weekend. Looking for Yamato alts in return.",
    cards: [
      { card: "shanksSec" },
      { card: "shanks06", quantity: 2 },
      { card: "yamatoSec" },
    ],
    likes: 33,
    comments: [
      ["priya", "Need that Shanks SEC so bad"],
      ["leo", "Clean pulls 🔥"],
      ["maya", "Would you do the Yamato for Robin + Nami?", "offer"],
    ],
    offers: 4,
    minutes: 95,
    tab: "following",
  },
  {
    key: "leo-law",
    by: "leo",
    direction: "want",
    note: "Last piece for the regionals deck.",
    cards: [{ card: "lawEb3", held: "exact" }],
    likes: 9,
    comments: [["eli", "Same hunt here lol"]],
    minutes: 180,
    tab: "following",
  },
  {
    key: "priya-redhair",
    by: "priya",
    direction: "want",
    hunt: "Red Hair Pirates",
    cards: [
      { card: "shanks14", held: "exact" },
      { card: "shanksSt" },
      { card: "yamato04" },
      { card: "yamatoEb", found: true },
      { card: "shanks06" },
    ],
    likes: 17,
    comments: [["jordan", "I've got the Shanks SR, DM me"]],
    offers: 2,
    minutes: 260,
    tab: "following",
  },
  {
    key: "hana-ghost",
    by: "hana",
    direction: "want",
    hunt: "Ghost Box",
    cards: [
      { card: "gengarBase", found: true },
      { card: "gengarA3", found: true },
    ],
    likes: 62,
    comments: [
      ["kaito", "Congrats on finishing it!!"],
      ["zoe", "That base Gengar 😮‍💨"],
    ],
    minutes: 420,
    tab: "following",
    completed: true,
  },
  {
    key: "ava-navigators",
    by: "ava",
    direction: "want",
    hunt: "Nami & Robin",
    cards: [
      { card: "nami08" },
      { card: "robinEb", held: "exact" },
      { card: "nami14", quantity: 2 },
      { card: "hancock01" },
    ],
    likes: 26,
    comments: [["maya", "Same taste 💛"]],
    offers: 1,
    minutes: 610,
    tab: "following",
  },
  /* Nearby: people around you, most of whom you do not follow. */
  {
    key: "theo-starter",
    by: "theo",
    direction: "want",
    hunt: "Grand Line Starter",
    cards: [
      { card: "luffy12", held: "exact" },
      { card: "ace03" },
      { card: "ace02" },
      { card: "zoro04", found: true },
    ],
    likes: 11,
    comments: [["leo", "Ace leader is a great pick"]],
    minutes: 38,
    tab: "nearby",
  },
  {
    key: "zoe-umbreon",
    by: "zoe",
    direction: "want",
    note: "At Card Cavern most nights, can meet there.",
    cards: [
      { card: "umbreonBw", held: "other-printing" },
      { card: "rayquazaSl" },
      { card: "pikachuA1" },
    ],
    likes: 14,
    comments: [],
    minutes: 75,
    tab: "nearby",
  },
  {
    key: "sam-offers",
    by: "sam",
    direction: "showcase",
    note: "Trade night clear-out. Everything here is up for trade.",
    cards: [
      { card: "charizardBw" },
      { card: "mewtwoA1", quantity: 2 },
      { card: "charizardA1" },
      { card: "rayquazaDp" },
    ],
    likes: 19,
    comments: [["kaito", "Charizard?? 👀", "offer"]],
    offers: 2,
    minutes: 130,
    tab: "nearby",
  },
  {
    key: "eli-law",
    by: "eli",
    direction: "want",
    hunt: "Law Regionals",
    cards: [
      { card: "law01", held: "exact" },
      { card: "lawEb2" },
      { card: "hancock12" },
      { card: "hancockEb" },
    ],
    likes: 8,
    comments: [],
    minutes: 300,
    tab: "nearby",
  },
];

const flareId = (post: string, index: number) => `demo-f-${post}-${index}`;
export const postId = (key: string) => `demo-post-${key}`;
export const huntId = (key: string) => `demo-hunt-${key}`;

function feedCard(post: PostSpec, spec: CardSpec, index: number): FeedCard {
  const card = DEMO_CARDS[spec.card];
  const quantity = spec.quantity ?? 1;
  const found = Boolean(spec.found);
  return {
    cardId: card.cardId,
    cardName: card.cardName,
    cardNumber: card.cardNumber,
    imageUrl: card.imageUrl,
    match: spec.held ?? null,
    flareId: flareId(post.key, index),
    state: found ? "found" : spec.offered ? "offered" : "open",
    youOffered: false,
    printingId: card.printingId,
    printingLabel: card.printingLabel,
    quantity,
    remaining: found ? 0 : quantity,
    huntRequestId: null,
  };
}

const comments = (post: PostSpec): PostComment[] =>
  post.comments.map(([who, body, kind], index) => {
    const p = PEOPLE[who];
    return {
      id: `demo-c-${post.key}-${index}`,
      createdAt: ago(Math.max(1, post.minutes - 5 * (post.comments.length - index))),
      playerId: p.playerId,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      frame: p.frame,
      ring: p.ring,
      kind: kind ?? "comment",
      body,
      cardName: null,
    };
  });

/** Live state: what a like, a comment or a new post changes. */
interface PostState {
  spec: PostSpec;
  cards: FeedCard[];
  liked: boolean;
  likes: number;
  thread: PostComment[];
}

const posts = new Map<string, PostState>(
  POSTS.map((spec) => [
    postId(spec.key),
    {
      spec,
      cards: spec.cards.map((c, i) => feedCard(spec, c, i)),
      liked: spec.likes > 30,
      likes: spec.likes,
      thread: comments(spec),
    },
  ]),
);

/** Your own posts this launch, made in the composer; newest first. */
const yourPosts: FeedEntry[] = [];

function feedItem(id: string, state: PostState): FeedEntry {
  const { spec } = state;
  const p: DemoPerson = PEOPLE[spec.by];
  const remaining = state.cards.reduce((sum, c) => sum + (c.remaining ?? 0), 0);
  return {
    kind: "hunt",
    postId: id,
    likes: state.likes,
    comments: state.thread.length,
    liked: state.liked,
    code: "",
    storeName: "",
    eventName: "",
    playerId: p.playerId,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    frame: p.frame,
    ring: p.ring,
    direction: spec.direction,
    deckLabel: spec.hunt ?? null,
    postedAt: ago(spec.minutes),
    milesAway: p.miles,
    storeId: null,
    acceptsTrade: true,
    acceptsCash: spec.direction === "showcase",
    note: spec.note ?? null,
    offers: spec.offers ?? 0,
    hunt: spec.hunt ? { id: huntId(spec.key), name: spec.hunt } : null,
    remainingCopies: remaining,
    completed: Boolean(spec.completed),
    cards: state.cards,
    total: state.cards.length,
    youCanAnswer: state.cards.filter((c) => c.match).length,
    yours: false,
    around: spec.tab === "nearby",
    section: spec.tab === "nearby" ? "around" : "people",
    tab: spec.tab,
  };
}

/*
 * Wanted near you, as a busy city: twenty-two people across five of
 * your cards, the shape the founder asked about ("in a big city like
 * portland, it's entirely possible that there could be 100+ people").
 * One conversation already open, so the filled icon and "Messaged" at
 * the bottom of its card show too.
 */
const WANTED_DEMO: [DemoCardKey, DemoPersonKey[]][] = [
  ["umbreonCol", ["zoe", "kaito", "hana", "theo", "ava", "marcus", "sam", "leo"]],
  ["law01", ["eli", "maya", "priya", "jordan", "hana", "ava"]],
  ["charizardBase", ["kaito", "marcus", "theo", "sam"]],
  ["shanksSec", ["jordan", "zoe", "eli"]],
  ["mewtwoBase", ["priya"]],
];

const nearbyMatches = (): (NearbyMatch & { when: string })[] =>
  WANTED_DEMO.flatMap(([key, people], cardIndex) =>
    people.map((who, index) => {
      const p = PEOPLE[who];
      const card = DEMO_CARDS[key];
      const miles = Math.max(1, Math.round(p.miles + index * 1.7 + cardIndex));
      return {
        ask: { kind: "flare" as const, id: `demo-ask-${cardIndex}-${index}` },
        haveEntryId: `demo-have-${cardIndex}`,
        wanter: {
          playerId: p.playerId,
          displayName: p.displayName,
          avatarUrl: p.avatarUrl,
          frame: p.frame,
          ring: p.ring,
          aura: p.aura,
          ringArt: null,
          auraArt: null,
        },
        card: {
          cardId: card.cardId,
          cardName: card.cardName,
          cardNumber: card.cardNumber,
          imageUrl: card.imageUrl,
          match: "exact" as const,
        },
        miles,
        milesLabel: milesLabel(miles),
        threadId: cardIndex === 0 && index === 1 ? "demo-thread-wanted" : null,
        when: new Date(Date.now() - (cardIndex * 7 + index) * 3_600_000).toISOString(),
      };
    }),
  );

function wantedGroups(sort: WantedSort): WantedGroup[] {
  return groupByCard(nearbyMatches(), sort).map((group) => ({
    card: group.people[0].card,
    haveEntryId: group.people[0].haveEntryId,
    people: group.people,
    nearestLabel: milesLabel(group.nearest),
  }));
}

/** "Wanted near you" for demo mode: the same grouping the server does. */
export function demoWanted(sort: WantedSort): WantedPage {
  const matches = nearbyMatches();
  const groups = wantedGroups(sort);
  return {
    groups,
    totalPeople: distinctPeople(matches),
    totalCards: groups.length,
    nextOffset: null,
  };
}

function wantedSummary(): WantedSummary {
  const matches = nearbyMatches();
  const groups = wantedGroups("most");
  return {
    totalPeople: distinctPeople(matches),
    totalCards: groups.length,
    groups: groups.slice(0, 3).map((group) => ({
      card: group.card,
      count: group.people.length,
      nearestLabel: group.nearestLabel,
      faces: group.people.slice(0, 3).map((person) => person.wanter),
    })),
  };
}

export function demoFeed(): { items: FeedEntry[]; radius: number } {
  const items: FeedEntry[] = [
    ...yourPosts,
    {
      kind: "nearbyMatch",
      matches: nearbyMatches().slice(0, 5),
      summary: wantedSummary(),
      section: "wanted",
      tab: "nearby",
    },
    ...[...posts.entries()].map(([id, state]) => feedItem(id, state)),
  ];
  return { items, radius: 25 };
}

export function demoPost(id: string): PostDetail | null {
  const state = posts.get(id);
  if (!state) {
    const yours = yourPosts.find((item) => item.kind === "hunt" && item.postId === id);
    if (!yours || yours.kind !== "hunt") return null;
    return {
      postId: id,
      author: {
        playerId: yours.playerId,
        displayName: yours.displayName,
        avatarUrl: yours.avatarUrl,
        frame: yours.frame,
        ring: yours.ring,
      },
      code: null,
      storeName: null,
      eventName: null,
      deckLabel: yours.deckLabel,
      direction: yours.direction,
      caption: null,
      hunt: yours.hunt ?? null,
      remainingCopies: yours.remainingCopies,
      completed: false,
      cards: yours.cards.map((c) => ({ ...c, flareId: c.flareId ?? "", state: "open", youOffered: false })),
      yours: true,
      thread: [],
      likes: 0,
      comments: 0,
      liked: false,
    };
  }
  const item = feedItem(id, state);
  if (item.kind !== "hunt") return null;
  const p = PEOPLE[state.spec.by];
  return {
    postId: id,
    author: {
      playerId: p.playerId,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      frame: p.frame,
      ring: p.ring,
      aura: p.aura,
    },
    code: null,
    storeName: null,
    eventName: null,
    deckLabel: state.spec.hunt ?? null,
    direction: state.spec.direction,
    caption: state.spec.note ?? null,
    hunt: item.hunt,
    remainingCopies: item.remainingCopies,
    completed: item.completed,
    cards: state.cards.map((c) => ({
      ...c,
      flareId: c.flareId ?? "",
      state: c.state ?? "open",
      youOffered: c.youOffered ?? false,
    })),
    yours: false,
    thread: state.thread,
    likes: state.likes,
    comments: state.thread.length,
    liked: state.liked,
  };
}

export function demoLike(id: string, liked: boolean): void {
  const state = posts.get(id);
  if (!state || state.liked === liked) return;
  state.liked = liked;
  state.likes += liked ? 1 : -1;
}

export function demoComment(
  id: string,
  body: string,
  me: { playerId: string; displayName: string; avatarUrl: string | null },
): PostComment {
  const comment: PostComment = {
    id: `demo-c-mine-${Date.now()}`,
    createdAt: new Date().toISOString(),
    playerId: me.playerId,
    displayName: me.displayName,
    avatarUrl: me.avatarUrl,
    frame: null,
    ring: null,
    kind: "comment",
    body,
    cardName: null,
  };
  posts.get(id)?.thread.push(comment);
  return comment;
}

export function demoPublish(
  me: { playerId: string; displayName: string; avatarUrl: string | null },
  cards: FeedCard[],
  direction: "want" | "showcase",
  hunt: { id: string; name: string } | null,
  note: string | null,
): string {
  const id = `demo-post-mine-${Date.now()}`;
  yourPosts.unshift({
    kind: "hunt",
    postId: id,
    likes: 0,
    comments: 0,
    liked: false,
    code: "",
    storeName: "",
    eventName: "",
    playerId: me.playerId,
    displayName: me.displayName,
    avatarUrl: me.avatarUrl,
    frame: null,
    ring: null,
    direction,
    deckLabel: hunt?.name ?? null,
    postedAt: new Date().toISOString(),
    milesAway: null,
    storeId: null,
    acceptsTrade: true,
    acceptsCash: false,
    note,
    offers: 0,
    hunt,
    remainingCopies: cards.reduce((sum, c) => sum + (c.remaining ?? 1), 0),
    completed: false,
    cards,
    total: cards.length,
    youCanAnswer: 0,
    yours: true,
    section: "yours",
    tab: "following",
  });
  return id;
}

/* ------------------------------------------------------------------ */
/* Hunts and profiles                                                  */
/* ------------------------------------------------------------------ */

export function demoHunt(id: string): HuntView | null {
  const entry = [...posts.entries()].find(([, s]) => huntId(s.spec.key) === id);
  if (!entry) return null;
  const [pid, state] = entry;
  const p = PEOPLE[state.spec.by];
  const cards = state.cards.map((c, index) => ({
    requestId: `demo-req-${state.spec.key}-${index}`,
    flareId: c.flareId ?? null,
    postId: pid,
    cardId: c.cardId,
    cardName: c.cardName,
    cardNumber: c.cardNumber,
    imageUrl: c.imageUrl,
    printingId: c.printingId ?? null,
    printingLabel: c.printingLabel ?? null,
    needed: c.quantity ?? 1,
    foundCopies: c.state === "found" ? (c.quantity ?? 1) : 0,
    remaining: c.remaining ?? 0,
    found: c.state === "found",
    quantity: c.quantity ?? 1,
  }));
  const needed = cards.reduce((sum, c) => sum + c.needed, 0);
  const foundCopies = cards.reduce((sum, c) => sum + c.foundCopies, 0);
  return {
    id,
    playerId: p.playerId,
    ownerName: p.displayName,
    owner: { avatarUrl: p.avatarUrl, frame: p.frame, ring: p.ring },
    yours: false,
    name: state.spec.hunt ?? "Hunt",
    description: state.spec.note ?? null,
    visibility: "public",
    looking: cards.filter((c) => !c.found).length,
    lookingCopies: needed - foundCopies,
    found: cards.filter((c) => c.found).length,
    neededCopies: needed,
    foundCopies,
    remainingCopies: needed - foundCopies,
    lastPostedAt: ago(state.spec.minutes),
    cards,
  };
}

const huntsOf = (who: DemoPersonKey) =>
  POSTS.filter((s) => s.by === who && s.hunt)
    .map((s) => demoHunt(huntId(s.key)))
    .filter((h): h is HuntView => h !== null);

const following = new Map<string, boolean>();

export function demoFollow(playerId: string, follow: boolean) {
  following.set(playerId, follow);
  return { following: follow, followsYou: true, partners: follow };
}

export function demoProfile(playerId: string): PeekProfile | null {
  const entry = (Object.entries(PEOPLE) as [DemoPersonKey, DemoPerson][]).find(
    ([, p]) => p.playerId === playerId,
  );
  if (!entry) return null;
  const [key, p] = entry;
  const theirs = POSTS.filter((s) => s.by === key);
  const isFollowing = following.get(playerId) ?? key !== "zoe";
  const seed = key.length;
  const showcaseKeys: DemoCardKey[] = (
    [
      "shanksSec",
      "luffySr",
      "charizardBase",
      "yamatoSec",
      "umbreonCol",
      "zoroSec",
    ] as DemoCardKey[]
  ).slice(seed % 3, (seed % 3) + 3);
  return {
    playerId,
    displayName: p.displayName,
    handle: p.handle,
    bio: p.bio,
    avatarUrl: p.avatarUrl,
    coverUrl: null,
    follow: { following: isFollowing, followsYou: true, partners: isFollowing },
    stats: { flares: 8 + seed * 3, followers: 120 + seed * 47, following: 60 + seed * 13 },
    embersEarned: 400 + seed * 160,
    frame: p.frame,
    ring: p.ring,
    aura: p.aura,
    ringArt: null,
    auraArt: null,
    effect: null,
    hunts: huntsOf(key),
    binders: [],
    flares: theirs.flatMap((s) =>
      s.cards.map((c, index) => {
        const card = DEMO_CARDS[c.card];
        return {
          id: flareId(s.key, index),
          cardId: card.cardId,
          cardName: card.cardName,
          cardNumber: card.cardNumber,
          printingLabel: card.printingLabel,
          imageUrl: card.imageUrl,
          quantity: c.quantity ?? 1,
          direction: s.direction === "showcase" ? ("offering" as const) : ("want" as const),
          deckLabel: s.hunt ?? null,
          match: c.held ?? null,
        };
      }),
    ),
    showcase: showcaseKeys.map((k, index) => {
      const card = DEMO_CARDS[k];
      return {
        id: `demo-show-${key}-${index}`,
        name: card.cardName,
        number: card.cardNumber,
        imageUrl: card.imageUrl,
        frame: null,
        holo: null,
      };
    }),
  };
}

export function demoPeople(playerId: string) {
  const everyone = Object.values(PEOPLE).filter((p) => p.playerId !== playerId);
  const row = (p: DemoPerson) => ({
    playerId: p.playerId,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    frame: p.frame,
    ring: p.ring,
    aura: p.aura,
    partners: true,
  });
  return {
    followers: everyone.slice(0, 9).map(row),
    following: everyone.slice(3).map(row),
  };
}

/* ------------------------------------------------------------------ */
/* Messages and a trade                                                */
/* ------------------------------------------------------------------ */

interface ThreadState {
  thread: LocalThread;
  messages: LocalThreadMessage[];
  trade: ThreadTrade | null;
  meet: MeetSuggestion | null;
}

const msg = (
  id: string,
  minutes: number,
  yours: boolean,
  body: string,
  card?: DemoCardKey,
): LocalThreadMessage => {
  const c = card ? DEMO_CARDS[card] : null;
  return {
    id,
    body,
    sentAt: ago(minutes),
    yours,
    card: c
      ? { cardId: c.cardId, name: c.cardName, number: c.cardNumber, imageUrl: c.imageUrl }
      : null,
  };
};

const CAVERN: MeetSuggestion = {
  storeName: "Card Cavern",
  joinCode: "CAVE42",
  nextEventName: "Friday Locals",
  nextEventAt: new Date(now + 2 * 24 * 60 * 60_000).toISOString(),
  timeZone: "America/New_York",
  shared: true,
};

function thread(
  who: DemoPersonKey,
  card: DemoCardKey | null,
  messages: LocalThreadMessage[],
  unread: number,
  extra: { trade?: ThreadTrade | null; meet?: MeetSuggestion | null } = {},
): ThreadState {
  const p = PEOPLE[who];
  const c = card ? DEMO_CARDS[card] : null;
  const last = messages[messages.length - 1];
  return {
    thread: {
      threadId: `demo-t-${who}`,
      kind: c ? "flare" : "direct",
      flareId: c ? `demo-tf-${who}` : null,
      cardName: c?.cardName ?? null,
      cardNumber: c?.cardNumber ?? null,
      imageUrl: c?.imageUrl ?? null,
      withName: p.displayName,
      withPlayerId: p.playerId,
      withAvatarUrl: p.avatarUrl,
      role: "author",
      lastMessageAt: last.sentAt,
      lastMessagePreview: last.body.startsWith("cardflare://") ? "Sent a Flare" : last.body,
      lastFromYou: last.yours,
      unread,
      closed: false,
    },
    messages,
    trade: extra.trade ?? null,
    meet: extra.meet ?? null,
  };
}

const luffy = DEMO_CARDS.luffySr;
const umbreon = DEMO_CARDS.umbreonCol;

const threads = new Map<string, ThreadState>(
  [
    thread(
      "maya",
      "luffySr",
      [
        msg("m1", 41, false, "Hey! Saw you have the Luffy SR on your list 👀"),
        msg("m2", 39, true, "Yep, it's mint. What do you have from my hunts?"),
        msg("m3", 33, false, "Could do this Yamato for it?", "yamatoEb"),
        msg("m4", 30, true, "Deal 🤝 Friday at Card Cavern?"),
        msg("m5", 6, false, "Perfect. I'll be there at 7, just confirm the trade 🙌"),
      ],
      2,
      {
        trade: {
          id: "demo-trade-maya",
          cardId: luffy.cardId,
          cardName: luffy.cardName,
          cardNumber: luffy.cardNumber,
          quantity: 1,
          got: false,
          saidByYou: false,
          status: "pending",
          awaitingYou: true,
          proposedAt: ago(6),
        },
        meet: CAVERN,
      },
    ),
    thread(
      "kaito",
      "umbreonCol",
      [
        msg("k1", 1500, false, "Is the Umbreon still up for trade?"),
        msg("k2", 1490, true, "It is! Got anything from my Straw Hat hunt?"),
        msg("k3", 1480, false, "I can do the Sanji SEC", "sanjiSec"),
        msg("k4", 1460, true, "Done, see you at locals"),
        msg("k5", 70, false, "Good trade! 🤝 Thanks again"),
      ],
      0,
      {
        trade: {
          id: "demo-trade-kaito",
          cardId: umbreon.cardId,
          cardName: umbreon.cardName,
          cardNumber: umbreon.cardNumber,
          quantity: 1,
          got: false,
          saidByYou: true,
          status: "confirmed",
          awaitingYou: false,
          proposedAt: ago(90),
        },
      },
    ),
    thread(
      "jordan",
      null,
      [
        msg("j1", 130, false, `cardflare://post/${postId("jordan-shanks")}`),
        msg("j2", 128, false, "You were after a Shanks right? These are all up"),
      ],
      1,
    ),
    thread(
      "priya",
      "shanks14",
      [
        msg("p1", 300, false, "Do you still have the Shanks alt?"),
        msg("p2", 290, true, "Yes! It's in my trade binder"),
        msg("p3", 240, false, "Amazing, I'll bring my Red Hair doubles Friday"),
      ],
      1,
    ),
    thread(
      "leo",
      "lawEb3",
      [
        msg("l1", 900, false, "Would you take cash for the Law?"),
        msg("l2", 880, true, "Prefer a trade, but send me your list"),
      ],
      0,
    ),
    thread(
      "hana",
      null,
      [msg("h1", 2900, false, "Thanks for the Gengar!! Ghost Box is done 👻")],
      0,
    ),
    thread(
      "theo",
      "luffy12",
      [
        msg("t1", 4200, true, "Hey, I have the Luffy for your starter hunt"),
        msg("t2", 4100, false, "No way, can we meet at Grand Line Games?"),
      ],
      0,
    ),
  ].map((t) => [t.thread.threadId, t]),
);

export function demoThreads(): { threads: LocalThread[] } {
  return {
    threads: [...threads.values()]
      .map((t) => t.thread)
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
  };
}

export function demoThread(id: string) {
  const t = threads.get(id);
  if (!t) return null;
  t.thread.unread = 0;
  return {
    ok: true,
    closed: false,
    threadId: id,
    hasOlder: false,
    kind: t.thread.kind,
    cardName: t.thread.cardName,
    withName: t.thread.withName,
    withPlayerId: t.thread.withPlayerId,
    withAvatarUrl: t.thread.withAvatarUrl,
    withHandle: t.thread.withPlayerId.replace("demo-", ""),
    messages: t.messages,
    meet: t.meet,
    trade: t.trade,
  };
}

export function demoSend(id: string, body: string) {
  const t = threads.get(id);
  if (!t) return;
  const sent: LocalThreadMessage = {
    id: `demo-m-${Date.now()}`,
    body,
    sentAt: new Date().toISOString(),
    yours: true,
    card: null,
  };
  t.messages.push(sent);
  t.thread.lastMessageAt = sent.sentAt;
  t.thread.lastMessagePreview = body;
  t.thread.lastFromYou = true;
}

export function demoAnswerTrade(id: string, answer: "yes" | "no") {
  const t = threads.get(id);
  if (!t?.trade) return;
  t.trade = {
    ...t.trade,
    status: answer === "yes" ? "confirmed" : "declined",
    awaitingYou: false,
  };
}

export function demoProposeTrade(id: string, quantity: number, got: boolean): ThreadTrade {
  const t = threads.get(id);
  const card = t?.thread.cardName ? luffy : umbreon;
  const trade: ThreadTrade = {
    id: `demo-trade-${Date.now()}`,
    cardId: card.cardId,
    cardName: t?.thread.cardName ?? card.cardName,
    cardNumber: t?.thread.cardNumber ?? card.cardNumber,
    quantity,
    got,
    saidByYou: true,
    status: "pending",
    awaitingYou: false,
    proposedAt: new Date().toISOString(),
  };
  if (t) t.trade = trade;
  return trade;
}

/** A conversation with somebody, opening the one there is. */
export function demoOpenThread(playerId: string | undefined): string {
  const existing = [...threads.values()].find((t) => t.thread.withPlayerId === playerId);
  return existing?.thread.threadId ?? "demo-t-maya";
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

const notice = (
  id: string,
  who: DemoPersonKey,
  kind: string,
  title: string,
  body: string | null,
  minutes: number,
  read: boolean,
): InboxItem => {
  const p = PEOPLE[who];
  return {
    id: `demo-n-${id}`,
    kind,
    title,
    body,
    url: null,
    createdAt: ago(minutes),
    readAt: read ? ago(minutes - 1) : null,
    actor: {
      playerId: p.playerId,
      displayName: p.displayName,
      avatarUrl: p.avatarUrl,
      frame: p.frame,
      ring: p.ring,
      aura: p.aura,
      ringArt: null,
      auraArt: null,
    },
  };
};

const notices: InboxItem[] = [
  notice("1", "maya", "offer-received", "Maya Chen has your Roronoa Zoro", "They said: “Mint, can bring it Friday”", 6, false),
  notice("2", "zoe", "nearby-match", "Zoe P is looking for your Umbreon", "3.9 mi away. It's in your binder.", 22, false),
  notice("3", "priya", "new-follower", "Priya followed you", "Follow back and you're trade partners.", 48, false),
  notice("4", "kaito", "trade-confirmed", "Trade confirmed: Umbreon", "Kaito marked your trade done. Good trade.", 70, true),
  notice("5", "ava", "post-comment", "Ava Kim commented on your Flare", "“I have the Robin, sent you an offer”", 160, true),
  notice("6", "jordan", "message-received", "Jordan B sent you a Flare", "You were after a Shanks right? These are all up", 130, true),
  notice("7", "eli", "nearby-match", "Eli Novak is looking for your Trafalgar Law", "6.2 mi away. It's in your binder.", 400, true),
  notice("8", "theo", "new-follower", "Theo W followed you", "Follow back and you're trade partners.", 1300, true),
];

export function demoNotifications() {
  return { notifications: notices };
}

export function demoUnread() {
  return { unread: notices.filter((n) => !n.readAt).length };
}

export function demoMarkRead(ids: string[]) {
  for (const n of notices) {
    if (ids.includes(n.id) && !n.readAt) n.readAt = new Date().toISOString();
  }
}

export function demoPostCards(id: string): FeedCard[] {
  return posts.get(id)?.cards ?? [];
}
