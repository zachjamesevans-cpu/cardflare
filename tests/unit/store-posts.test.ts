import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Store posts: what a shop tells its followers, in the Feed.
 *
 * The founder: "a store announcing 'OP-12 prerelease Saturday, 20
 * seats' as a Flare-shaped post to its followers. This is the thing
 * that makes following worth it." The rules that keep it honest: the
 * schema's caps, who may post, which followers hear about it and how
 * often, and that both platforms draw the approved card with the same
 * words.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

/* ------------------------------------------------------------------ */
/* The schema                                                          */
/* ------------------------------------------------------------------ */

const {
  storePostSchema,
  upcomingEventChoices,
  STORE_POST_TITLE_MAX,
  STORE_POST_BODY_MAX,
} = await import("@/lib/stores/post-schema");

describe("the post schema", () => {
  it("collapses the title's whitespace and keeps the body's lines", () => {
    const parsed = storePostSchema.parse({
      title: "  OP-12   prerelease\n Saturday ",
      body: "Doors 11.\r\n20 seats.  ",
      eventId: "",
    });
    expect(parsed.title).toBe("OP-12 prerelease Saturday");
    expect(parsed.body).toBe("Doors 11.\n20 seats.");
    expect(parsed.eventId).toBeUndefined();
  });

  it("refuses an empty title and one over the cap", () => {
    expect(
      storePostSchema.safeParse({ title: "   ", body: "", eventId: "" }).success,
    ).toBe(false);
    expect(
      storePostSchema.safeParse({
        title: "x".repeat(STORE_POST_TITLE_MAX + 1),
        body: "",
        eventId: "",
      }).success,
    ).toBe(false);
    expect(
      storePostSchema.safeParse({
        title: "x".repeat(STORE_POST_TITLE_MAX),
        body: "",
        eventId: "",
      }).success,
    ).toBe(true);
  });

  it("caps the body and allows none", () => {
    expect(
      storePostSchema.safeParse({
        title: "Restock",
        body: "y".repeat(STORE_POST_BODY_MAX + 1),
        eventId: "",
      }).success,
    ).toBe(false);
    expect(
      storePostSchema.parse({ title: "Restock", body: "", eventId: "" }).body,
    ).toBe("");
  });

  it("takes an event only as a uuid", () => {
    const id = "6f1a2b3c-4d5e-4f60-8a71-829394a5b6c7";
    expect(
      storePostSchema.parse({ title: "Night", body: "", eventId: id }).eventId,
    ).toBe(id);
    expect(
      storePostSchema.safeParse({ title: "Night", body: "", eventId: "tonight" })
        .success,
    ).toBe(false);
  });

  it("lists only the nights still to come, soonest first", () => {
    const now = Date.parse("2026-09-20T12:00:00Z");
    const event = (
      over: Partial<Parameters<typeof upcomingEventChoices>[0][number]>,
    ) => ({
      id: "e",
      name: "Night",
      kind: "scheduled",
      status: "draft",
      starts_at: "2026-09-27T18:00:00Z",
      ends_at: "2026-09-27T22:00:00Z",
      ...over,
    });
    const choices = upcomingEventChoices(
      [
        event({ id: "later", starts_at: "2026-10-04T18:00:00Z", ends_at: null }),
        event({ id: "closed", status: "closed" }),
        event({ id: "walk-in", kind: "walk_in" }),
        event({
          id: "past",
          starts_at: "2026-09-10T18:00:00Z",
          ends_at: "2026-09-10T22:00:00Z",
        }),
        event({ id: "soon" }),
      ],
      now,
    );
    expect(choices.map((choice) => choice.id)).toEqual(["soon", "later"]);
  });
});

/* ------------------------------------------------------------------ */
/* The Feed, both platforms                                            */
/* ------------------------------------------------------------------ */

describe("a store post in the Feed", () => {
  const repo = read("src/lib/feed/repository.ts");
  const webItems = read("src/components/feed/feed-items.tsx");
  const webCard = read("src/components/feed/store-post-card.tsx");
  const appHome = read("mobile/src/screens/home.tsx");
  const appCard = read("mobile/src/store-post-card.tsx");
  const appApi = read("mobile/src/api.ts");

  it("is a kind of the Feed's union with a section, a reason and a tab", () => {
    expect(repo).toContain('kind: "storePost";');
    expect(repo).toContain("| StorePostItem");
    /* Filed with the people you follow, and said so. */
    expect(repo).toMatch(/case "storePost":\s*return "people";/);
    expect(repo).toContain("`Because you follow ${item.storeName}`");
    expect(repo).toMatch(
      /item\.kind === "storePost"[\s\S]{0,40}\)\s*\{\s*return "following"/,
    );
  });

  it("is drawn on both platforms with the approved words", () => {
    expect(webItems).toContain('item.kind === "storePost"');
    expect(appHome).toContain('item.kind === "storePost"');
    expect(appApi).toContain('kind: "storePost";');
    for (const card of [webCard, appCard]) {
      expect(card).toContain("posted an update");
      expect(card).toContain("I'll be there");
      expect(card).toContain("Going");
      expect(card).toContain("VerifiedMark");
      expect(card).toContain("${count} going");
    }
    /* The heart and the thread every post has. */
    expect(webCard).toContain("<PostSocial");
    expect(appCard).toContain("<PostSocialRow");
  });

  it("lands among the followed Flares and your own in one time order", () => {
    /* The founder: "Following tab needs to be sorted in chronological
       order, with most recent." One list, own posts included. */
    const merged = repo.indexOf("byPostedAt<HuntItem | StorePostItem>");
    const boardsOfOthers = repo.indexOf(
      'boards.filter((item) => item.kind === "board" && item.yours)',
    );
    expect(merged).toBeGreaterThan(-1);
    expect(boardsOfOthers).toBeGreaterThan(merged);
    expect(repo).not.toContain('item.kind === "hunt" && item.yours)');
    expect(repo).toContain("...storePosts,");
  });

  it("makes the logo absolute for a phone, like every other picture", () => {
    expect(read("src/lib/api/absolute-avatars.ts")).toContain('key === "logoUrl"');
  });
});

/* ------------------------------------------------------------------ */
/* The console                                                         */
/* ------------------------------------------------------------------ */

describe("the Posts tab", () => {
  it("is there for owners and organizers", () => {
    const tabs = read("src/components/stores/store-tabs.tsx");
    for (const list of ["const OWNER_TABS", "const ORGANIZER_TABS"]) {
      const slice = tabs.slice(
        tabs.indexOf(list),
        tabs.indexOf("];", tabs.indexOf(list)),
      );
      expect(slice).toContain('"posts"');
    }
    expect(read("src/components/stores/store-tabs-nav.tsx")).toContain(
      'posts: { href: "/store/posts", label: "Posts"',
    );
  });

  it("is not locked to owners on the server", () => {
    const console = read("src/lib/stores/console.ts");
    const locked = console.slice(
      console.indexOf("const OWNER_ONLY_PATHS"),
      console.indexOf("];", console.indexOf("const OWNER_ONLY_PATHS")),
    );
    expect(locked).not.toContain("/store/posts");
  });
});

/* ------------------------------------------------------------------ */
/* The action                                                          */
/* ------------------------------------------------------------------ */

const getViewer = vi.fn();
const createStorePost = vi.fn();
const archiveStorePost = vi.fn();
const notifyStorePost = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth/session", () => ({ getViewer: () => getViewer() }));
vi.mock("@/lib/stores/posts", () => ({
  createStorePost: (...a: unknown[]) => createStorePost(...a),
  archiveStorePost: (...a: unknown[]) => archiveStorePost(...a),
}));
vi.mock("@/lib/notifications/notify", () => ({
  notifyStorePost: (...a: unknown[]) => notifyStorePost(...a),
}));

const { publishStorePostAction, archiveStorePostAction } =
  await import("@/lib/stores/post-actions");
const { STORE_POST_IDLE } = await import("@/lib/stores/post-schema");

const user = { id: "user-1", email: "shop@example.com" };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

let storeSeq = 0;
/** A fresh store per test, so the in-memory rate limit never carries over. */
const nextStore = () => `store-${++storeSeq}`;

beforeEach(() => {
  vi.clearAllMocks();
  createStorePost.mockResolvedValue({ ok: true, postId: "post-1" });
  archiveStorePost.mockResolvedValue(true);
  notifyStorePost.mockResolvedValue(undefined);
});

describe("publishing a post", () => {
  it("is for the store's owner", async () => {
    const storeId = nextStore();
    getViewer.mockResolvedValue({
      kind: "store",
      user,
      storeIds: [storeId],
      storeRoles: { [storeId]: "owner" },
    });
    const state = await publishStorePostAction(
      STORE_POST_IDLE,
      form({ storeId, title: "OP-12 prerelease", body: "20 seats", eventId: "" }),
    );
    expect(state.status).toBe("done");
    expect(createStorePost).toHaveBeenCalledWith(storeId, "user-1", {
      title: "OP-12 prerelease",
      body: "20 seats",
      eventId: undefined,
      image: null,
    });
    expect(notifyStorePost).toHaveBeenCalledWith(storeId, "post-1", "OP-12 prerelease");
  });

  it("is for an organizer the owner named", async () => {
    const storeId = nextStore();
    getViewer.mockResolvedValue({
      kind: "player",
      user,
      playerId: "p1",
      playerName: "Tyler",
      organizerStoreIds: [storeId],
    });
    const state = await publishStorePostAction(
      STORE_POST_IDLE,
      form({ storeId, title: "Restock", body: "", eventId: "" }),
    );
    expect(state.status).toBe("done");
    expect(createStorePost).toHaveBeenCalledTimes(1);
  });

  it("is not for a player who runs nothing here", async () => {
    const storeId = nextStore();
    getViewer.mockResolvedValue({
      kind: "player",
      user,
      playerId: "p1",
      playerName: "Tyler",
      organizerStoreIds: ["some-other-store"],
    });
    const state = await publishStorePostAction(
      STORE_POST_IDLE,
      form({ storeId, title: "Restock", body: "", eventId: "" }),
    );
    expect(state.status).toBe("error");
    expect(createStorePost).not.toHaveBeenCalled();
    expect(notifyStorePost).not.toHaveBeenCalled();
  });

  it("is not for a store account at somebody else's store, nor for a guest", async () => {
    const storeId = nextStore();
    getViewer.mockResolvedValue({
      kind: "store",
      user,
      storeIds: ["theirs"],
      storeRoles: { theirs: "owner" },
    });
    expect(
      (
        await publishStorePostAction(
          STORE_POST_IDLE,
          form({ storeId, title: "Restock", body: "", eventId: "" }),
        )
      ).status,
    ).toBe("error");

    getViewer.mockResolvedValue({ kind: "anonymous" });
    expect(
      (
        await publishStorePostAction(
          STORE_POST_IDLE,
          form({ storeId, title: "Restock", body: "", eventId: "" }),
        )
      ).status,
    ).toBe("error");
    expect(createStorePost).not.toHaveBeenCalled();
  });

  it("validates on the server and says what was wrong", async () => {
    const storeId = nextStore();
    getViewer.mockResolvedValue({
      kind: "admin",
      user,
      storeIds: [storeId],
      storeRoles: { [storeId]: "owner" },
    });
    const state = await publishStorePostAction(
      STORE_POST_IDLE,
      form({ storeId, title: "   ", body: "", eventId: "" }),
    );
    expect(state).toEqual({ status: "error", message: "Give the post a title." });
    expect(createStorePost).not.toHaveBeenCalled();
  });

  it("stops at five an hour per store", async () => {
    const storeId = nextStore();
    getViewer.mockResolvedValue({
      kind: "store",
      user,
      storeIds: [storeId],
      storeRoles: { [storeId]: "staff" },
    });
    for (let n = 0; n < 5; n += 1) {
      const state = await publishStorePostAction(
        STORE_POST_IDLE,
        form({ storeId, title: `Post ${n}`, body: "", eventId: "" }),
      );
      expect(state.status).toBe("done");
    }
    const sixth = await publishStorePostAction(
      STORE_POST_IDLE,
      form({ storeId, title: "Post 6", body: "", eventId: "" }),
    );
    expect(sixth.status).toBe("error");
    expect(createStorePost).toHaveBeenCalledTimes(5);
  });
});

describe("taking a post down", () => {
  it("needs the same role", async () => {
    const storeId = nextStore();
    getViewer.mockResolvedValue({ kind: "unaffiliated", user });
    await archiveStorePostAction(storeId, "post-1");
    expect(archiveStorePost).not.toHaveBeenCalled();

    getViewer.mockResolvedValue({
      kind: "player",
      user,
      playerId: "p1",
      playerName: "Tyler",
      organizerStoreIds: [storeId],
    });
    await archiveStorePostAction(storeId, "post-1");
    expect(archiveStorePost).toHaveBeenCalledWith(storeId, "post-1");
  });
});
