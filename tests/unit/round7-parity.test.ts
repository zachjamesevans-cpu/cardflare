import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/* A file that is not there yet reads as empty, so every pin on it
   fails by name instead of the whole suite failing to load. */
const read = (path: string) => {
  try {
    return readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
  } catch {
    return "";
  }
};

/**
 * Round 7, the audit's third round, both platforms: Report and Block,
 * the Embers tiles that say what raises them, a store's upcoming
 * nights, the pack copy, the admin queue and a Feed tab that answers
 * the tap.
 *
 * Read off the source, because parity is about the same sections, the
 * same wording and the same order on the website and in the app. The
 * strings here are the ones the brief fixed; a platform that says it
 * differently fails here before it ships.
 */

const web = {
  profile: read("src/app/p/[playerId]/page.tsx"),
  profileMenu: read("src/components/players/profile-menu.tsx"),
  blockControls: read("src/components/players/block-controls.tsx"),
  reportSheet: read("src/components/players/report-sheet.tsx"),
  blockedList: read("src/components/players/blocked-list.tsx"),
  postMenu: read("src/components/feed/post-actions.tsx"),
  thread: read("src/components/local/local-screen.tsx"),
  settings: read("src/app/profile/settings/page.tsx"),
  ownProfile: read("src/app/profile/page.tsx"),
  storePage: read("src/app/s/[storeId]/page.tsx"),
  embersStore: read("src/app/profile/store/page.tsx"),
  adminReports: read("src/app/admin/reports/page.tsx"),
  reportQueue: read("src/components/admin/report-queue.tsx"),
  tabs: read("src/components/feed/feed-filter-tabs.tsx"),
  tabFace: read("src/components/feed/feed-tab-face.tsx"),
  feedTile: read("src/components/feed/feed-tile.tsx"),
  safety: read("src/lib/players/safety-reasons.ts"),
  posters: [
    read("src/app/store/events/[id]/page.tsx"),
    read("src/app/admin/stores/[id]/page.tsx"),
    read("src/app/admin/shows/[id]/page.tsx"),
  ],
};

const app = {
  profile: read("mobile/src/screens/player-profile.tsx"),
  reportSheet: read("mobile/src/report-sheet.tsx"),
  postMenu: read("mobile/src/flare-feed-card.tsx"),
  thread: read("mobile/src/screens/thread.tsx"),
  settings: read("mobile/src/screens/settings.tsx"),
  ownProfile: read("mobile/src/screens/profile.tsx"),
  storePage: read("mobile/src/screens/store-profile.tsx"),
  embersStore: read("mobile/src/screens/store.tsx"),
  api: read("mobile/src/api.ts"),
};

describe("report and block live behind the three dots on a profile", () => {
  it("on the website: Report, and Block or Unblock, with the two-step confirm", () => {
    expect(web.profile).toContain("<ProfileMenu");
    expect(web.profile).toContain("blockState(me, playerId)");
    expect(web.profile).toContain("<BlockControls playerId={playerId}>");
    expect(web.profileMenu).toContain('label: "Report"');
    expect(web.profileMenu).toContain('label: "Block"');
    expect(web.profileMenu).toContain('label: "Unblock"');
    expect(web.blockControls).toContain("Block {name}?");
    expect(web.blockControls).toContain(
      "You will not see their posts, and neither of you can message the other.",
    );
    expect(web.blockControls).toMatch(/They\s+are not told\./);
    expect(web.blockControls).toContain("Keep");
    /* After the block: a muted chip and a ghost Unblock, no Follow. */
    expect(web.blockControls).toContain("Blocked");
    expect(web.blockControls).toContain('variant="ghost"');
    /* When they blocked you: nothing at all, not even the chip. */
    expect(web.blockControls).toContain("if (blockedBy) return null;");
  });

  it("in the app, with the same words", () => {
    expect(app.profile).toContain("Report");
    expect(app.profile).toContain("Block");
    expect(app.profile).toContain("Unblock");
    expect(app.profile).toContain("They are not told.");
    expect(app.profile).toContain("Keep");
    expect(app.profile).toContain("Blocked");
    expect(app.api).toContain("export const blockPlayer");
    expect(app.api).toContain("export const unblockPlayer");
    expect(app.api).toContain("export const reportTarget");
  });
});

describe("one report sheet, shared by profile, post and conversation", () => {
  /* The server's list is the truth; the two sheets mirror its labels. */
  const labels = [...web.safety.matchAll(/label: "([^"]+)"/g)].map((m) => m[1]);

  it("names the four reasons the server knows", () => {
    expect(labels).toEqual([
      "Spam",
      "Scam or fake listing",
      "Harassment",
      "Something else",
    ]);
  });

  it("on the website", () => {
    /* The sheet reads the one list rather than copying it. */
    expect(web.reportSheet).toContain('from "@/lib/players/safety-reasons"');
    expect(web.reportSheet).toContain("const REASONS = REPORT_REASONS;");
    expect(web.reportSheet).toContain('title="Report"');
    expect(web.reportSheet).toContain(
      'placeholder="Anything that helps us look (optional)"',
    );
    expect(web.reportSheet).toContain("REPORT_NOTE_MAX = 500");
    expect(web.reportSheet).toContain("Send report");
    expect(web.reportSheet).toContain("Thanks. We will take a look.");
    expect(web.reportSheet).toContain("setTimeout(close, 1000)");
    /* Failure: the server's message, inline. */
    expect(web.reportSheet).toContain("setError(result.message)");
  });

  it("in the app", () => {
    /* The app keeps the list beside its API client and the sheet reads
       it from there, so the labels may sit in either file. */
    const appReasons = app.reportSheet + app.api;
    for (const label of labels) expect(appReasons).toContain(`"${label}"`);
    expect(app.reportSheet).toContain("Report");
    expect(app.reportSheet).toContain("Anything that helps us look (optional)");
    expect(app.reportSheet).toContain("500");
    expect(app.reportSheet).toContain("Send report");
    expect(app.reportSheet).toContain("Thanks. We will take a look.");
  });

  it("is the last item of somebody else's post menu, on both", () => {
    expect(web.postMenu).toContain('label: "Report"');
    expect(web.postMenu).toContain("<Flag />");
    expect(web.postMenu).toContain("if (!post.yours) {");
    expect(web.postMenu).toContain('kind="post"');
    expect(web.postMenu).toContain("targetId={post.postId}");
    expect(web.postMenu.indexOf('label: "Report"')).toBeGreaterThan(
      web.postMenu.indexOf('label: "Take down"'),
    );

    expect(app.postMenu).toContain('label: "Report"');
    expect(app.postMenu).toContain('icon: "flag-outline"');
    expect(app.postMenu.indexOf('label: "Report"')).toBeGreaterThan(
      app.postMenu.indexOf('label: "Take down"'),
    );
  });

  /* Round 16: in the chat header's ⋯ on the web, with View profile,
     We traded and Block (tests/unit/r16-web-msg.test.ts). */
  it("sits in a thread's menu, on both", () => {
    expect(web.thread).toContain('label: "Report"');
    expect(web.thread).toContain('kind="thread"');
    expect(web.thread).toContain("targetId={threadId}");
    expect(web.thread.indexOf("Report")).toBeGreaterThan(-1);

    expect(app.thread).toContain("Report");
    expect(app.thread).toMatch(/"thread"/);
  });
});

describe("blocked players have one list, on Settings", () => {
  it("on the website, with Unblock per row and an honest empty state", () => {
    expect(web.settings).toContain("Blocked players");
    expect(web.settings).toContain(
      "<BlockedList people={await listBlocked(playerId)} />",
    );
    expect(web.blockedList).toContain("<UnblockButton");
    expect(web.blockedList).toContain(
      "Nobody. Blocking somebody on their profile puts them here.",
    );
  });

  it("in the app, the same card", () => {
    expect(app.settings).toContain("Blocked players");
    expect(app.settings).toContain(
      "Nobody. Blocking somebody on their profile puts them here.",
    );
  });
});

describe("the admin queue, website only", () => {
  it("sits at the top of the reports page with its own id", () => {
    expect(web.adminReports).toContain("<ReportQueue reports={open} />");
    expect(web.adminReports).toContain("listOpenReports()");
    expect(web.adminReports.indexOf("<ReportQueue")).toBeLessThan(
      web.adminReports.indexOf('aria-labelledby="people-heading"'),
    );
    expect(web.reportQueue).toContain('id="queue"');
    expect(web.reportQueue).toContain("Reports from players");
    expect(web.reportQueue).toContain("Nothing open.");
    expect(web.reportQueue).toContain('label="Resolved"');
    expect(web.reportQueue).toContain("resolveReportAction");
    expect(web.reportQueue).toContain("ago(report.createdAt)");
    expect(web.reportQueue).toContain("href={report.href}");
  });
});

describe("the Feed tab answers the tap at once, website only", () => {
  it("draws the pending tab lit, with the ring in the icon's place", () => {
    /* The tab list stays on the server, where its titles live; the
       face of each Link is the client child that watches the status. */
    expect(web.tabs).toContain("<FeedTabFace");
    expect(web.tabs).toContain('aria-current={on ? "page" : undefined}');
    expect(web.tabs).not.toContain("prefetch={false}");
    expect(web.tabFace).toContain('import { useLinkStatus } from "next/link"');
    expect(web.tabFace).toContain("const { pending } = useLinkStatus();");
    expect(web.tabFace).toContain("const lit = on || pending;");
    expect(web.tabFace).toContain('{pending ? <Spinner size="sm" /> : icon}');
  });
});

describe("Embers are three facts, not one number three ways", () => {
  /*
   * The profile tabs round put the Embers tile and the store door back
   * on the owner's profile, in the Embers pane under the strip: the
   * founder wanted the sections sliding in place, nothing navigating.
   * The badge in the header is the public number; the balance is on
   * the store door, in the one pane, and never on somebody else's
   * page, where `publicProfile` has no field to put it in.
   */
  it("keeps the badge in the header and the balance in the Embers pane, both platforms", () => {
    expect(web.ownProfile).toContain("embersEarned={profile.embersEarned}");
    for (const source of [web.ownProfile, app.ownProfile]) {
      /* Round 15: the label dropped "by trading", since attendance
         and grants raise the badge too. */
      expect(source).toContain("Earned, all time");
      expect(source).toContain("to spend");
      expect(source).not.toContain("Earned by trading");
    }
    expect(web.ownProfile).toMatch(/>\s*Embers shop\s*</);
    for (const source of [web.profile, app.profile]) {
      expect(source).not.toContain("Earned, all time");
      expect(source).not.toContain("to spend");
      expect(source).not.toMatch(/>\s*Embers shop\s*</);
    }
  });

  it("says to spend on the store page, both platforms", () => {
    for (const source of [web.embersStore, app.embersStore]) {
      expect(source).toContain("to spend");
    }
  });

  it("in the admin report", () => {
    expect(web.adminReports).toContain('label="Embers earned by trading"');
    expect(web.adminReports).not.toContain('label="Embers earned"');
  });
});

describe("a store page shows its upcoming nights", () => {
  it("on the website, inside the player chrome for a player", () => {
    expect(web.storePage).toContain("Upcoming nights");
    expect(web.storePage).toContain("Join the room");
    expect(web.storePage).toContain("Nothing scheduled yet.");
    expect(web.storePage).toContain("store.upcoming.map(");
    expect(web.storePage).toContain("href={`/e/${night.joinCode}`}");
    /* The empty state only for a claimed store. */
    expect(web.storePage).toContain("store.upcoming.length > 0 || !store.unclaimed");
    /* The shell for a player, the plain main for a visitor. */
    expect(web.storePage).toContain(
      "<TabPageShell title={store.name}>{content}</TabPageShell>",
    );
    expect(web.storePage).toContain('<main\n      id="main"');
  });

  it("in the app", () => {
    expect(app.storePage).toContain("Upcoming nights");
    expect(app.storePage).toContain("Join the room");
    expect(app.storePage).toContain("Nothing scheduled yet.");
    expect(app.storePage).toContain("upcoming");
  });
});

describe("the pack copy and the poster's game line", () => {
  it("says the first pack was on the house, on both", () => {
    for (const source of [web.embersStore, app.embersStore]) {
      expect(source).toContain(
        "Sealed packs of cosmetics, opened like the real thing.",
      );
      expect(source).toMatch(/Your first one\s+was\s+on the house\./);
      expect(source).not.toContain("Every new account");
    }
  });

  it("hands every poster what the shop plays", () => {
    const [event, adminStore, adminShow] = web.posters;
    expect(event).toContain("gameLine={await storeGameLine(store.id)}");
    expect(adminStore).toContain("gameLine={await storeGameLine(store.id)}");
    expect(adminShow).toContain('gameLine="Trading card games"');
  });

  it("names the card in the Feed tile's alt text", () => {
    expect(web.feedTile).toContain("alt={cardImageAlt(name, cardNumber)}");
    expect(web.feedTile).toContain(
      'import { cardImageAlt, cardImagesEnabled } from "@/lib/cards/images"',
    );
  });
});
