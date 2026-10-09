import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import {
  activeThreadIds,
  clearActiveThread,
  isActiveThreadPush,
  setActiveThread,
  threadIdFromPush,
} from "../../mobile/src/active-thread";

/**
 * Messages, live: the open conversation keeps itself current, the list
 * is ordered by each conversation's own talk, and only a NEW
 * conversation counts against the "too many at once" ceiling.
 */
const read = (path: string) => readFileSync(path, "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");

const lib = flat(read("src/lib/local/threads.ts"));
const openRoute = flat(read("src/app/api/v1/local/threads/route.ts"));
const readRoute = flat(read("src/app/api/v1/local/threads/[threadId]/route.ts"));
const thread = flat(read("mobile/src/screens/thread.tsx"));
const app = flat(read("mobile/App.tsx"));
const local = flat(read("mobile/src/screens/local.tsx"));
const unread = flat(read("mobile/src/unread.ts"));

describe("the open conversation (src/active-thread.ts)", () => {
  beforeEach(() => setActiveThread([]));

  it("reads the conversation a message push opens", () => {
    expect(threadIdFromPush({ url: "/local?thread=abc-123" })).toBe("abc-123");
    expect(threadIdFromPush({ url: "/local?x=1&thread=a%2Fb" })).toBe("a/b");
    expect(threadIdFromPush({ url: "/p/xyz" })).toBeNull();
    expect(threadIdFromPush(null)).toBeNull();
    expect(threadIdFromPush({ url: 7 })).toBeNull();
  });

  it("knows a push is about the conversation on screen, by either id", () => {
    setActiveThread(["anchor", "pair", null]);
    expect(isActiveThreadPush({ url: "/local?thread=pair" })).toBe(true);
    expect(isActiveThreadPush({ url: "/local?thread=anchor" })).toBe(true);
    expect(isActiveThreadPush({ url: "/local?thread=other" })).toBe(false);
  });

  it("is cleared only by the screen that set it", () => {
    setActiveThread(["b"]);
    clearActiveThread(["a"]);
    expect(activeThreadIds()).toEqual(["b"]);
    clearActiveThread(["b"]);
    expect(activeThreadIds()).toEqual([]);
  });

  it("holds the banner back for that conversation only", () => {
    expect(app).toContain(
      "const here = isActiveThreadPush(notification.request.content.data);",
    );
    expect(app).toContain("shouldShowBanner: !here,");
  });
});

describe("the thread screen keeps itself current", () => {
  it("polls while focused and in front, and stops otherwise", () => {
    expect(thread).toContain("const THREAD_POLL_MS = 5000;");
    expect(thread).toContain(
      "setInterval(() => void load(isCurrent, true), THREAD_POLL_MS)",
    );
    expect(thread).toContain('AppState.addEventListener("change"');
    expect(thread).toContain("stop();");
  });

  it("refreshes at once when a push for it arrives, and says it is open", () => {
    expect(thread).toContain("Notifications.addNotificationReceivedListener");
    expect(thread).toContain("setActiveThread(ids());");
    expect(thread).toContain("clearActiveThread(ids());");
  });

  it("never lets an older answer paint over a newer one", () => {
    expect(thread).toContain("const seq = ++requestSeq.current;");
    expect(thread).toContain("seq !== requestSeq.current");
  });

  it("pulls to refresh and loads older pages", () => {
    expect(thread).toContain("<RefreshControl");
    expect(thread).toContain("readLocalThread(threadId, oldest.sentAt)");
    expect(thread).toContain('"Load older"');
  });

  it("resyncs the bell and the icon badge after a read", () => {
    expect(thread).toContain("void refreshUnread();");
    expect(unread).toContain("void syncBadge(unread);");
  });
});

describe("the server pages a conversation", () => {
  it("reads before a time when asked, and says when there is more", () => {
    expect(lib).toContain('if (before) page = page.lt("created_at", before);');
    expect(lib).toContain("hasOlder: (messages ?? []).length >= THREAD_PAGE_SIZE,");
    expect(readRoute).toContain('searchParams.get("before")');
    expect(readRoute).toContain("readThread(threadId, player.playerId, cursor)");
  });
});

describe("the Messages list", () => {
  const list = lib.slice(lib.indexOf("export async function listThreads("));

  it("finds each conversation's own newest message", () => {
    expect(list).toContain('.eq("thread_id", row.id)');
    expect(list).toContain(".limit(1) .maybeSingle()");
    /* Not the newest few hundred across every conversation. */
    expect(list).not.toContain(".limit(500)");
  });

  it("does not let empty conversations take a slot", () => {
    expect(list).toContain("if (!message || rows.length >= LIST_SIZE) return;");
    expect(list).toContain(
      ".range(page * LIST_PAGE, page * LIST_PAGE + LIST_PAGE - 1)",
    );
  });

  it("counts unread from the unread messages alone", () => {
    expect(list).toContain('.neq("sender_player_id", playerId) .is("read_at", null)');
  });

  it("is read once on a visit to Messages, not twice", () => {
    expect(app).toContain(
      'if (route.name !== "Messages") void refreshUnreadMessages();',
    );
    expect(local).toContain("setUnreadMessages(totalUnread(nextThreads.threads));");
  });
});

describe("only a new conversation counts against the ceiling", () => {
  it("asks the caller just before inserting a thread, never for one found", () => {
    expect(lib).toContain(
      'if (options.mayCreate && !options.mayCreate()) { return { ok: false, reason: "rate-limited" }; }',
    );
    const direct = lib.slice(lib.indexOf("export async function openDirectThread("));
    expect(
      direct.indexOf("if (existing) return { ok: true, threadId: existing.id };"),
    ).toBeLessThan(direct.indexOf("options.mayCreate"));
  });

  it("the app's route charges thread-open only through mayCreate", () => {
    expect(openRoute).toContain("{ mayCreate }");
    const beforeOpen = openRoute.slice(0, openRoute.indexOf("const mayCreate"));
    expect(beforeOpen).not.toContain("thread-open:");
    expect(openRoute).toContain('outcome.reason === "rate-limited"');
  });
});
