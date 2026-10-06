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
 * The profile IA round, both platforms: a trader's profile, binders as
 * highlights. (The Trade binder it introduced went in binder round 2:
 * every binder is named and has one switch, Up for trade, and the
 * highlights are the binder itself, small, in its cover colour. The
 * pins here read that truth; binder2-parity.test.ts pins the round.)
 *
 * The founder, on the profile before this: it "feels cluttered and
 * more like a management dashboard than a social profile"; "use a
 * more Instagram-like information architecture where important
 * features are represented as clear destinations/icons and users only
 * see deeper information after tapping into them"; it should feel
 * like "This is me as a trader". And: "This should primarily be an
 * information architecture and UX cleanup, not a destructive
 * rewrite"; "Reduce the number of large outlined containers".
 *
 * Read off the source, because parity is the same sections in the
 * same order with the same words on the website and in the app: the
 * header without its boxed tiles, the binder highlights, and the
 * sections as tabs that slide in place (the profile tabs round turned
 * the row of round doors into a strip; tests/unit/profile-tabs-parity
 * pins the strip and the slide themselves), with every feature still
 * reachable from the profile.
 */

const web = {
  ownProfile: read("src/app/profile/page.tsx"),
  playerProfile: read("src/app/p/[playerId]/page.tsx"),
  header: read("src/components/players/profile-header.tsx"),
  tabs: read("src/components/players/profile-tabs.tsx"),
  highlights: read("src/components/binder/binder-highlights.tsx"),
  list: read("src/components/binder/binder-list.tsx"),
  /* The dialog, with the Up for trade switch it draws from its own file. */
  create:
    read("src/components/binder/create-binder.tsx") +
    read("src/components/binder/for-trade-switch.tsx"),
  flares: read("src/components/players/profile-flares.tsx"),
  view: read("src/components/binder/binder-page.tsx"),
  settings: read("src/components/binder/binder-settings.tsx"),
  add: read("src/components/binder/add-binder-card.tsx"),
  huntsPanel: read("src/components/players/hunts-panel.tsx"),
  addShowcase: read("src/components/players/add-showcase-form.tsx"),
  ownHunts: read("src/app/profile/hunts/page.tsx"),
  playerHunts: read("src/app/p/[playerId]/hunts/page.tsx"),
  ownBinders: read("src/app/profile/binders/page.tsx"),
  playerBinders: read("src/app/p/[playerId]/binders/page.tsx"),
  ownBinder: read("src/app/profile/binders/[binderId]/page.tsx"),
  /* The page is a thin door now; its body is PublicBinder, shared with
     the share link /b/<id>. */
  playerBinder:
    read("src/app/p/[playerId]/binders/[binderId]/page.tsx") +
    read("src/components/binder/public-binder.tsx"),
  oldOwnBinder: read("src/app/profile/binder/page.tsx"),
  oldPlayerBinder: read("src/app/p/[playerId]/binder/page.tsx"),
  profileLib: read("src/lib/players/profile.ts"),
  binderLib: read("src/lib/binder/binder.ts"),
};

const app = {
  ownProfile: read("mobile/src/screens/profile.tsx"),
  playerProfile: read("mobile/src/screens/player-profile.tsx"),
  header: read("mobile/src/profile-header.tsx"),
  tabs: read("mobile/src/profile-tabs.tsx"),
  highlights: read("mobile/src/binder-highlights.tsx"),
  list: read("mobile/src/binder-list.tsx"),
  create: read("mobile/src/create-binder-sheet.tsx"),
  flares: read("mobile/src/profile-flares.tsx"),
  hunts: read("mobile/src/screens/hunts.tsx"),
  binders: read("mobile/src/screens/binders.tsx"),
  binder: read("mobile/src/screens/binder.tsx"),
  stack: read("mobile/App.tsx"),
  api: read("mobile/src/api.ts"),
  covers: read("mobile/src/binder-covers.ts"),
};

const platforms = [
  ["web", web],
  ["app", app],
] as const;

/** The first index of each marker, in the order given; -1 when missing. */
const order = (source: string, markers: (string | RegExp)[]) =>
  markers.map((marker) =>
    typeof marker === "string" ? source.indexOf(marker) : source.search(marker),
  );

/* The showcase heading as drawn, not an import that happens to say it. */
const SHOWCASE_HEADING = /[^A-Za-z]Showcase\s*</;

describe("the header: three numbers, no boxed tiles", () => {
  it("draws the numbers as plain stacks on both platforms", () => {
    /* The founder: "Keep this section visually clean and compact",
       "fewer giant bordered boxes". */
    expect(web.header).not.toContain("border border-border bg-elevated/60");
    expect(web.header).not.toContain("const TILE");
    expect(web.header).toContain("const STACK");
    const from = app.header.indexOf("function Stat(");
    const stat = app.header.slice(from, app.header.indexOf("export function", from));
    expect(stat.length).toBeGreaterThan(0);
    expect(stat).not.toContain("borderWidth");
    expect(stat).not.toContain("borderColor");
  });

  it("keeps the tap targets: followers and following still open the lists", () => {
    expect(web.header).toContain("<PeopleDialog");
    expect(web.header).toMatch(/title="Followers"/);
    expect(web.header).toMatch(/title="Following"/);
    expect(app.header).toMatch(/onPress/);
  });
});

describe("the tab strip: the sections as tabs under the highlights", () => {
  it("has the six tabs in the same order with the same words on both", () => {
    for (const [name, source] of platforms) {
      const strip = source.tabs;
      expect(strip.length, `${name}: the strip exists`).toBeGreaterThan(0);
      const at = order(strip, [
        '"Flares"',
        '"Hunts"',
        '"Binders"',
        '"Showcase"',
        '"Trades"',
        '"Embers"',
      ]);
      for (const index of at) expect(index, name).toBeGreaterThan(-1);
      expect(
        [...at].sort((a, b) => a - b),
        `${name}: the order`,
      ).toEqual(at);
    }
  });

  it("opens Flares, Hunts, Binders and Showcase for anyone, Trades and Embers for the owner alone", () => {
    /* The public page never draws their trades, Embers or settings. */
    expect(web.playerProfile).not.toContain("/profile/trades");
    expect(web.playerProfile).not.toContain("/profile/store");
    expect(web.playerProfile).not.toContain("/profile/settings");
    expect(web.playerProfile).not.toContain("trades:");
    expect(web.playerProfile).not.toContain("embers:");
    /* The owner's panes still reach the three screens: See all to the
       trade history, the store door, and the cog to Settings. */
    for (const screen of ['"TradeHistory"', '"Store"', '"Settings"']) {
      expect(app.ownProfile, `app own profile: ${screen}`).toContain(screen);
    }
    expect(app.playerProfile).not.toContain('"TradeHistory"');
    expect(app.playerProfile).not.toContain('"Store"');
  });

  it("has replaced the row of round doors on both platforms", () => {
    for (const [name, source] of platforms) {
      for (const profile of [source.ownProfile, source.playerProfile]) {
        expect(profile, name).not.toContain("<ProfileIconRow");
        expect(profile, name).not.toContain("profile-icon-row");
      }
    }
  });
});

describe("the profile page, top to bottom, on both platforms", () => {
  it("is header, highlights, then the tabs, own and theirs", () => {
    for (const [name, source] of platforms) {
      for (const [page, profile] of [
        ["own", source.ownProfile],
        ["theirs", source.playerProfile],
      ] as const) {
        const at = order(profile, [
          "<ProfileHeader",
          "<BinderHighlights",
          "<ProfileTabs",
        ]);
        for (const index of at) expect(index, `${name} ${page}`).toBeGreaterThan(-1);
        expect(
          [...at].sort((a, b) => a - b),
          `${name} ${page}: the order`,
        ).toEqual(at);
      }
    }
  });

  it("has lost the panels and the cards as blocks of their own", () => {
    for (const [name, source] of platforms) {
      for (const profile of [source.ownProfile, source.playerProfile]) {
        /* The sections live in the panes under the strip; the binder
           panel and the trade history card are gone as cards. */
        expect(profile, name).not.toContain("<BinderPanel");
        expect(profile, name).not.toContain("<TradeHistoryCard");
        /* As drawn, not as a comment that remembers it. */
        expect(profile, name).not.toMatch(/>\s*Trade history\s*</);
      }
    }
    /* The cog is back top right beside Share and the wand: Settings is
       a screen, not a section, so it is not a tab. */
    expect(web.ownProfile).toContain('title="Settings"');
    expect(web.ownProfile).toContain("<ShareProfileButton");
    expect(web.ownProfile).toContain("<Wand2");
    expect(app.ownProfile).toContain('"settings-outline"');
  });

  it("keeps Edit profile, or Follow and Message under the block rule", () => {
    expect(web.ownProfile).toContain("Edit profile");
    expect(web.playerProfile).toContain("<FollowButton");
    expect(web.playerProfile).toContain("<MessageButton");
    expect(web.playerProfile).toContain("<BlockControls playerId={playerId}>");
    expect(web.playerProfile).toContain("<ProfileMenu");
  });
});

describe("the binder highlights row", () => {
  it("is a row of small binders in 72px cells, one line of name, no box", () => {
    /* Each highlight is the binder itself at the cover's xs size, the
       founder's "actual binder as a curved rectangle like how it is
       under the binder view"; no circle, no initial, no picture. */
    expect(web.highlights).toContain(
      '<BinderCover cover={binder.cover} size="xs" plain />',
    );
    expect(web.highlights).not.toContain('rounded-full"');
    expect(web.highlights).not.toContain("binderInitial");
    expect(web.highlights).toContain("w-[72px]");
    expect(web.highlights).toContain("truncate");
    expect(web.highlights).toContain("text-[11px]");
    expect(web.highlights).toContain("overflow-x-auto");
    expect(web.highlights).not.toContain("<img");
    expect(app.highlights).toContain(
      '<BinderCover cover={binder.cover} size="xs" plain />',
    );
    expect(app.highlights).not.toContain("binderInitial");
    expect(app.highlights).toMatch(/CELL = 72/);
    expect(app.highlights).toContain("numberOfLines={1}");
    expect(app.highlights).toContain("fontSize: 11");
    expect(app.highlights).toContain("horizontal");
    /* The xs cover is 58x76 on both, and the ring follows its corners. */
    expect(read("src/components/binder/binder-cover.tsx")).toContain(
      'xs: "h-[76px] w-[58px] rounded-r-[6px]"',
    );
    expect(read("mobile/src/binder-cover.tsx")).toContain(
      "xs: { width: 58, height: 76 }",
    );
    expect(web.highlights).toContain("rounded-l-[4px] rounded-r-[8px]");
    expect(app.highlights).toContain("BINDER = { width: 58, height: 76 }");
    expect(app.highlights).toContain("OPEN_RADIUS = Math.round(BINDER.width * 0.1)");
  });

  it("rings a binder up for trade in lime with the arrows badge, a private one with a hairline", () => {
    expect(web.highlights).toContain("binder.forTrade");
    expect(web.highlights).not.toContain("binder.kind");
    expect(web.highlights).toContain("ring-2 ring-accent ring-offset-2");
    expect(web.highlights).toContain("ring-1 ring-border-strong");
    expect(web.highlights).toContain("<ArrowLeftRight");
    expect(app.highlights).toContain("binder.forTrade");
    expect(app.highlights).not.toContain("binder.kind");
    expect(app.highlights).toContain('"swap-horizontal"');
  });

  it("ends with a dashed + for the owner, and is nothing for a visitor with no binders", () => {
    expect(web.highlights).toContain('<CreateBinder trigger="tile" />');
    expect(web.highlights).toContain(
      "if (binders.length === 0 && !yours) return null;",
    );
    /* The + tile is a binder's outline, dashed, the cover's box. */
    expect(web.create).toContain("border-dashed");
    expect(web.create).toMatch(
      /h-\[76px\] w-\[58px\][^"]*rounded-l-\[2px\] rounded-r-\[6px\]/,
    );
    expect(web.create).toContain(">New<");
    expect(app.highlights).toMatch(/binders\.length === 0 && !yours/);
    expect(app.highlights).toContain('borderStyle: "dashed"');
    expect(app.highlights).toContain("width: BINDER.width,");
    expect(app.highlights).toContain("New");
  });

  it("opens the binder page from a circle", () => {
    expect(web.highlights).toContain("href={`${base}/binders/${binder.id}`}");
    expect(web.ownProfile).toContain(
      "<BinderHighlights binders={profile.binders} yours",
    );
    expect(web.playerProfile).toContain("binders={profile.binders}");
    expect(app.highlights).toContain("onOpen(binder.id)");
  });
});

describe("the create binder dialog", () => {
  it("asks a name of up to forty characters, one of the seven covers and Up for trade, then Create", () => {
    for (const [name, source] of platforms) {
      expect(source.create, name).toContain("New binder");
      expect(source.create, name).toContain("Cover");
      expect(source.create, name).toContain("BINDER_NAME_MAX");
      expect(source.create, name).toContain("BINDER_COVERS.map(");
      expect(source.create, name).toContain("Up for trade");
      expect(source.create, name).toContain(
        "People nearby hunting one of these cards hear about it.",
      );
      expect(source.create, name).toMatch(/[>"]Create["<]/);
    }
    /* The client's copy of the server's ceiling, and the app's. */
    expect(web.binderLib).toContain("export const BINDER_NAME_MAX = 40;");
    expect(web.create).toContain("export const BINDER_NAME_MAX = 40;");
    expect(app.api).toContain("export const BINDER_NAME_MAX = 40;");
    /* Never the server-only module from a client component. */
    expect(web.create).not.toContain('from "@/lib/binder/binder"');
  });

  it("goes to the new binder once it exists", () => {
    expect(web.create).toContain("createBinderAction(");
    expect(web.create).toContain("router.push(`/profile/binders/${result.id}`)");
    expect(app.create).toContain("createBinder(");
    expect(app.create).toContain("onCreated(");
  });

  it("is the same dialog from the highlights + and the Binders tab's button", () => {
    expect(web.ownProfile).toContain('<CreateBinder trigger="button" />');
    expect(web.playerProfile).toContain('<CreateBinder trigger="button" />');
    expect(app.ownProfile).toContain("<CreateBinderSheet");
  });
});

describe("the Binders tab", () => {
  it("lists every binder as a row: cover with its name, name, count, Up for trade or Private, a chevron", () => {
    for (const [name, source] of platforms) {
      expect(source.list.length, `${name}: the list exists`).toBeGreaterThan(0);
      expect(source.list, name).toContain("<BinderCover");
      /* The binder's own name on the cover, not "Yours". */
      expect(source.list, name).toContain("label={binder.name}");
      expect(source.list, name).not.toContain('"Yours"');
      expect(source.list, name).toContain("binder.forTrade");
      expect(source.list, name).not.toContain("binder.kind");
      expect(source.list, name).toMatch(/>\s*Up for trade\s*</);
      expect(source.list, name).toMatch(/>\s*Private\s*</);
      expect(source.list, name).not.toContain("Private, only you");
    }
    /* "12 cards": inline on the web, inline or through the app's own
       cover helpers. */
    expect(web.list).toContain('=== 1 ? "card" : "cards"');
    expect(app.list + app.covers).toContain('=== 1 ? "card" : "cards"');
    expect(app.list + app.covers).not.toContain("to trade");
    expect(web.list).toContain("<ChevronRight");
    expect(app.list).toContain('"chevron-forward"');
  });

  it("is the Binders tab on the profile, with the old pages redirecting to it", () => {
    for (const [name, source] of platforms) {
      expect(source.ownProfile, name).toContain("<BinderList");
      expect(source.playerProfile, name).toContain("<BinderList");
    }
    expect(web.ownProfile).toContain("binders={profile.binders}");
    expect(web.playerProfile).toContain("No binders to open.");
    expect(web.ownBinders).toContain('redirect("/profile?tab=binders")');
    expect(web.playerBinders).toContain("redirect(`/p/${playerId}?tab=binders`)");
    /* The app's Binders screen stays registered for other screens to
       open; the profile slides to the tab instead. */
    expect(app.stack).toMatch(/name="Binders"/);
    expect(app.stack).toContain("<BindersScreen");
    expect(app.binders).toContain("<BinderList");
  });
});

describe("the binder page, by id", () => {
  it("lives at /binders/<id> on both profiles, with the old address redirecting", () => {
    expect(web.ownBinder).toContain("readBinder(playerId, playerId, binderId)");
    expect(web.ownBinder).toContain("title={binder.name}");
    expect(web.ownBinder).toContain("Back to your binders");
    expect(web.playerBinder).toContain("readBinder(playerId, me, binderId)");
    expect(web.playerBinder).toContain("if (!binder) notFound();");
    expect(web.playerBinder).toContain("`${binder.ownerName}'s ${binder.name}`");
    /* There is no Trade binder to send the old address to: it lands
       on the profile's Binders tab. */
    expect(web.oldOwnBinder).toContain('redirect("/profile?tab=binders")');
    expect(web.oldPlayerBinder).toContain("redirect(`/p/${playerId}?tab=binders`)");
    /* The app's Binder screen takes the id, always. */
    expect(app.stack).toMatch(/Binder: \{ playerId\?: string; binderId: string \}/);
    expect(app.stack).toMatch(/name="Hunts"/);
    expect(app.stack).toContain("<HuntsScreen");
  });

  it("says what the binder's cards mean, under the title", () => {
    /* The line follows the switch: up for trade, or private. */
    const own = "Up for trade. Somebody nearby hunting one of these hears about it.";
    const ownPrivate = "Private. Only you can open it.";
    expect(web.view).toContain(own);
    expect(web.view).toContain(ownPrivate);
    expect(web.view).toContain("`Cards ${ownerName} will trade.`");
    expect(app.binder).toContain(own);
    expect(app.binder).toContain(ownPrivate);
    expect(app.binder).toContain("will trade.");
  });

  it("names and deletes every binder", () => {
    expect(web.settings).not.toContain("kind");
    expect(web.settings).toContain("Name");
    expect(web.settings).toContain("Delete binder");
    expect(web.settings).toContain("Delete {name}?");
    expect(web.settings).toContain("with it.");
    expect(web.settings).toContain("deleteBinderAction(binderId)");
    expect(web.settings).toContain("onBlur={commitName}");
    expect(web.settings).toContain('event.key === "Enter"');
    expect(app.binder).toContain("Delete binder");
    expect(app.binder).toContain("deleteBinder(");
    expect(app.binder).not.toMatch(/kind === "custom"/);
  });

  it("sends every write to the binder it is looking at", () => {
    expect(web.view).toContain("removeBinderCardAction(card.entryId, binder.id)");
    expect(web.view).toContain("placeBinderCardAction(binder.id, { entryId, pocket })");
    expect(web.view).toContain("binderId={binder.id}");
    expect(web.add).toContain("binderId,");
    expect(web.settings).toContain("saveBinderSettingsAction(patch, binderId)");
  });
});

describe("the Hunts tab", () => {
  it("is the hunts panel in a pane, every row drawn, with the old pages redirecting", () => {
    expect(web.ownProfile).toContain("<HuntsPanel");
    expect(web.ownProfile).toContain("limit={huntLimitFor(profile.tier)}");
    /* A visitor's panel is the rows alone: the send moved to the
       hunt's page with the hunts-as-binders round. */
    expect(web.playerProfile).toMatch(/<HuntsPanel hunts=\{profile\.hunts\} \/>/);
    expect(web.ownHunts).toContain('redirect("/profile?tab=hunts")');
    expect(web.playerHunts).toContain("redirect(`/p/${playerId}?tab=hunts`)");
    expect(web.huntsPanel).not.toContain("const SHOWN");
    expect(web.huntsPanel).not.toContain("setShowAll");
    expect(web.huntsPanel).toContain("hunts.map((hunt) =>");
    expect(app.ownProfile).toContain("<HuntsPanel");
    expect(app.playerProfile).toContain("<HuntsPanel");
    expect(app.hunts).toContain("<HuntsPanel");
  });
});

describe("the showcase, lighter", () => {
  it("is the shelf under the Showcase tab, no heading, with the help behind a ? on the own page only", () => {
    expect(web.ownProfile).toContain("What is a showcase?");
    expect(web.ownProfile).toContain("nothing to offer on here");
    expect(web.playerProfile).not.toContain("nothing to offer on here");
    /* No bordered panel round the shelf, and no heading: the tab is
       the heading now. */
    for (const profile of [web.ownProfile, web.playerProfile]) {
      expect(profile).not.toContain("border border-border bg-elevated/40 p-4");
      expect(profile).not.toMatch(SHOWCASE_HEADING);
      expect(profile).toContain("<WornBackdrop");
      expect(profile).toContain("<Rail");
    }
    expect(web.ownProfile).toContain('aria-label="What is a showcase?"');
    expect(web.playerProfile).not.toContain("What is a showcase?");
    expect(app.ownProfile).toContain('accessibilityLabel="What is a showcase?"');
    expect(app.playerProfile).not.toContain("What is a showcase?");
    expect(app.playerProfile).not.toMatch(SHOWCASE_HEADING);
  });

  it("folds the owner's Add behind a + tile at the end of the shelf", () => {
    const shelf = web.ownProfile.slice(
      web.ownProfile.indexOf("<Rail"),
      web.ownProfile.indexOf("</Rail>"),
    );
    expect(shelf).toContain("<AddShowcaseForm");
    expect(shelf).toMatch(/<AddShowcaseForm\s+tile/);
    expect(web.addShowcase).toContain('title="Add to showcase"');
    expect(web.addShowcase).toMatch(/>\s*\+\s*</);
  });
});

describe("the Flares grid", () => {
  it("is every Flare, three across, with only an offer labelled", () => {
    for (const [name, source] of platforms) {
      expect(source.flares.length, `${name}: the grid exists`).toBeGreaterThan(0);
      expect(source.flares, name).toContain("Flares");
      /* The founder: "Delete the 'looking for' part on all cards."
         A want wears nothing; a showcase keeps its chip. */
      expect(source.flares, name).not.toMatch(/>\s*Looking for|"Looking for"/);
      expect(source.flares, name).toContain("Offering");
      expect(source.flares, name).not.toContain("Letting go");
      expect(source.flares, name).toContain(
        "No Flares up. Post one from the Flare tab.",
      );
      expect(source.flares, name).toMatch(/"No Flares up\."|>\s*No Flares up\.\s*</);
      expect(source.flares, name).toContain("flares.length");
    }
    expect(web.flares).toContain("grid-cols-3");
    expect(web.flares).toContain("<CardImageZoom");
    expect(web.flares).toContain('href="/flare"');
    expect(web.flares).toContain("flares.map(");
    expect(app.flares).toContain("<CardImage");
  });

  it("is handed the profile's whole list on both pages", () => {
    expect(web.ownProfile).toContain("flares={profile.flares}");
    expect(web.playerProfile).toContain("flares={profile.flares}");
    expect(web.profileLib).toContain("binders: BinderSummary[];");
    expect(web.profileLib).toContain("flares: ProfileFlare[];");
    expect(app.api).toContain("binders?: BinderSummary[];");
    expect(app.api).toContain("flares?: ProfileFlare[];");
    expect(app.api).toContain("forTrade: boolean;");
    expect(app.api).not.toContain("TRADE_BINDER_NAME");
  });
});

describe("copy and colour rules", () => {
  it("has no em dashes and no literal hex in the new pieces", () => {
    for (const [name, source] of [
      ["web highlights", web.highlights],
      ["web list", web.list],
      ["web create", web.create],
      ["web flares", web.flares],
      ["web tabs", web.tabs],
      ["web own hunts", web.ownHunts],
      ["web player hunts", web.playerHunts],
      ["web own binders", web.ownBinders],
      ["web player binders", web.playerBinders],
      ["web own binder", web.ownBinder],
      ["web player binder", web.playerBinder],
      ["app highlights", app.highlights],
      ["app list", app.list],
      ["app create", app.create],
      ["app flares", app.flares],
      ["app tabs", app.tabs],
    ] as const) {
      expect(source, name).not.toContain("—");
      expect(source, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it("draws the cover's colours through the one cover list, never a colour of its own", () => {
    /* The colours come through the cover drawing, which reads the
       list; the highlight names no colour of its own. */
    for (const [name, source] of platforms) {
      expect(source.highlights, name).toContain("<BinderCover");
      expect(source.highlights, name).not.toContain("binderCover(");
      expect(source.highlights, name).not.toMatch(/spine\s*:/);
      expect(source.highlights, name).not.toMatch(/edge\s*:/);
    }
  });
});
