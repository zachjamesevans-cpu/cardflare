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
 * highlights, a Trade binder.
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
 * header without its boxed tiles, the row of round doors, the binder
 * highlights, a lighter showcase, the Flares grid, and every feature
 * that left the page still reachable one tap in.
 */

const web = {
  ownProfile: read("src/app/profile/page.tsx"),
  playerProfile: read("src/app/p/[playerId]/page.tsx"),
  header: read("src/components/players/profile-header.tsx"),
  iconRow: read("src/components/players/profile-icon-row.tsx"),
  highlights: read("src/components/binder/binder-highlights.tsx"),
  list: read("src/components/binder/binder-list.tsx"),
  create: read("src/components/binder/create-binder.tsx"),
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
  playerBinder: read("src/app/p/[playerId]/binders/[binderId]/page.tsx"),
  oldOwnBinder: read("src/app/profile/binder/page.tsx"),
  oldPlayerBinder: read("src/app/p/[playerId]/binder/page.tsx"),
  profileLib: read("src/lib/players/profile.ts"),
  binderLib: read("src/lib/binder/binder.ts"),
};

const app = {
  ownProfile: read("mobile/src/screens/profile.tsx"),
  playerProfile: read("mobile/src/screens/player-profile.tsx"),
  header: read("mobile/src/profile-header.tsx"),
  iconRow: read("mobile/src/profile-icon-row.tsx"),
  highlights: read("mobile/src/binder-highlights.tsx"),
  list: read("mobile/src/binder-list.tsx"),
  create: read("mobile/src/create-binder-sheet.tsx"),
  flares: read("mobile/src/profile-flares.tsx"),
  hunts: read("mobile/src/screens/hunts.tsx"),
  binders: read("mobile/src/screens/binders.tsx"),
  binder: read("mobile/src/screens/binder.tsx"),
  stack: read("mobile/App.tsx"),
  api: read("mobile/src/api.ts"),
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

describe("the icon row: round doors under the header", () => {
  it("has the five doors in the same order with the same words on both", () => {
    for (const [name, source] of platforms) {
      const row = source.iconRow;
      expect(row.length, `${name}: the row exists`).toBeGreaterThan(0);
      const at = order(row, [
        '"Hunts"',
        '"Binders"',
        '"Trades"',
        '"Embers"',
        '"Settings"',
      ]);
      for (const index of at) expect(index, name).toBeGreaterThan(-1);
      expect(
        [...at].sort((a, b) => a - b),
        `${name}: the order`,
      ).toEqual(at);
    }
  });

  it("is a 44px circle with an 11px label, no box, no border", () => {
    expect(web.iconRow).toContain("size-11");
    expect(web.iconRow).toContain("rounded-full bg-elevated");
    expect(web.iconRow).not.toContain("border-border");
    expect(web.iconRow).toContain("text-[11px]");
    expect(app.iconRow).toMatch(/CIRCLE = 44|width: 44/);
    expect(app.iconRow).toContain("fontSize: 11");
    expect(app.iconRow).not.toContain("borderWidth");
  });

  it("opens Hunts and Binders for anyone, and the other three for the owner alone", () => {
    expect(web.iconRow).toContain("if (!yours) return shared;");
    const shared = web.iconRow.slice(
      web.iconRow.indexOf("const shared"),
      web.iconRow.indexOf("if (!yours) return shared;"),
    );
    expect(shared).toContain('"Hunts"');
    expect(shared).toContain('"Binders"');
    expect(shared).not.toContain('"Trades"');
    expect(shared).not.toContain('"Embers"');
    expect(shared).not.toContain('"Settings"');
    for (const href of [
      "/hunts",
      "/binders",
      '"/profile/trades"',
      '"/profile/store"',
      '"/profile/settings"',
    ]) {
      expect(web.iconRow).toContain(href);
    }
    /* The public page never draws their trades, Embers or settings. */
    expect(web.playerProfile).not.toContain("/profile/trades");
    expect(web.playerProfile).not.toContain("/profile/store");
    expect(web.playerProfile).not.toContain("/profile/settings");
    /* The app's five screens behind the same five doors. */
    for (const screen of [
      '"Hunts"',
      '"Binders"',
      '"TradeHistory"',
      '"Store"',
      '"Settings"',
    ]) {
      expect(app.ownProfile, `app own profile: ${screen}`).toContain(screen);
    }
    expect(app.playerProfile).not.toContain('"TradeHistory"');
    expect(app.playerProfile).not.toContain('"Store"');
  });
});

describe("the profile page, top to bottom, on both platforms", () => {
  it("is header, doors, highlights, showcase, Flares, own and theirs", () => {
    for (const [name, source] of platforms) {
      for (const [page, profile] of [
        ["own", source.ownProfile],
        ["theirs", source.playerProfile],
      ] as const) {
        const at = order(profile, [
          "<ProfileHeader",
          "<ProfileIconRow",
          "<BinderHighlights",
          SHOWCASE_HEADING,
          "<ProfileFlares",
        ]);
        for (const index of at) expect(index, `${name} ${page}`).toBeGreaterThan(-1);
        expect(
          [...at].sort((a, b) => a - b),
          `${name} ${page}: the order`,
        ).toEqual(at);
      }
    }
  });

  it("has lost the panels, the cards and the cog", () => {
    for (const [name, source] of platforms) {
      for (const profile of [source.ownProfile, source.playerProfile]) {
        expect(profile, name).not.toContain("<HuntsPanel");
        expect(profile, name).not.toContain("<BinderPanel");
        /* As drawn, not as a comment that remembers them. */
        expect(profile, name).not.toMatch(/>\s*Trade history\s*</);
        expect(profile, name).not.toMatch(/>\s*Embers store\s*</);
        expect(profile, name).not.toContain("<TradeHistoryCard");
        expect(profile, name).not.toContain("<TradeHistoryRow");
        expect(profile, name).not.toContain("Earned by trading");
      }
    }
    /* The cog that sat top right is the Settings door in the row now;
       Share and the wand stay. */
    expect(web.ownProfile).not.toContain('title="Settings"');
    expect(web.ownProfile).toContain("<ShareProfileButton");
    expect(web.ownProfile).toContain("<Wand2");
    expect(app.ownProfile).not.toContain('"settings-outline"');
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
  it("is a row of 64px circles in 72px cells, one line of name, no box", () => {
    expect(web.highlights).toContain("size-16");
    expect(web.highlights).toContain("w-[72px]");
    expect(web.highlights).toContain("truncate");
    expect(web.highlights).toContain("text-[11px]");
    expect(web.highlights).toContain("overflow-x-auto");
    expect(web.highlights).toContain("object-cover");
    expect(app.highlights).toMatch(/CIRCLE = 64/);
    expect(app.highlights).toMatch(/CELL = 72/);
    expect(app.highlights).toContain("numberOfLines={1}");
    expect(app.highlights).toContain("fontSize: 11");
    expect(app.highlights).toContain("horizontal");
  });

  it("rings the Trade binder in lime with the arrows badge, the rest with a hairline", () => {
    expect(web.highlights).toContain('binder.kind === "trade"');
    expect(web.highlights).toContain("ring-2 ring-accent ring-offset-2");
    expect(web.highlights).toContain("ring-1 ring-border-strong");
    expect(web.highlights).toContain("<ArrowLeftRight");
    expect(app.highlights).toContain('binder.kind === "trade"');
    expect(app.highlights).toContain('"swap-horizontal"');
  });

  it("ends with a dashed + for the owner, and is nothing for a visitor with no binders", () => {
    expect(web.highlights).toContain('<CreateBinder trigger="tile" />');
    expect(web.highlights).toContain(
      "if (binders.length === 0 && !yours) return null;",
    );
    expect(web.create).toContain("border-dashed");
    expect(web.create).toContain(">New<");
    expect(app.highlights).toMatch(/binders\.length === 0 && !yours/);
    expect(app.highlights).toContain('borderStyle: "dashed"');
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
  it("asks a name of up to forty characters and one of the seven covers, then Create", () => {
    for (const [name, source] of platforms) {
      expect(source.create, name).toContain("New binder");
      expect(source.create, name).toContain("Cover");
      expect(source.create, name).toContain("BINDER_NAME_MAX");
      expect(source.create, name).toContain("BINDER_COVERS.map(");
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

  it("is the same dialog from the highlights + and the Binders page button", () => {
    expect(web.ownBinders).toContain('<CreateBinder trigger="button" />');
    expect(web.playerBinders).toContain('<CreateBinder trigger="button" />');
    expect(app.binders).toContain("<CreateBinderSheet");
    expect(app.ownProfile).toContain("<CreateBinderSheet");
  });
});

describe("the Binders page", () => {
  it("lists every binder as a row: cover, name, count, a Trade chip, a chevron", () => {
    for (const [name, source] of platforms) {
      expect(source.list.length, `${name}: the list exists`).toBeGreaterThan(0);
      expect(source.list, name).toContain("<BinderCover");
      expect(source.list, name).toContain('yours ? "Yours" : ownerName');
      expect(source.list, name).toContain("binderCountLine(");
      expect(source.list, name).toContain('binder.kind === "trade"');
      expect(source.list, name).toMatch(/>\s*Trade\s*</);
      expect(source.list, name).toContain("Private, only you");
    }
    expect(web.list).toContain("<ChevronRight");
    expect(app.list).toContain('"chevron-forward"');
  });

  it("is reached from /profile/binders and /p/<id>/binders, and the app's Binders screen", () => {
    expect(web.ownBinders).toContain("listBinders(playerId, playerId)");
    expect(web.ownBinders).toContain('title="Your binders"');
    expect(web.ownBinders).toContain("Back to your profile");
    expect(web.playerBinders).toContain("publicProfile(playerId, me)");
    expect(web.playerBinders).toContain("binders={profile.binders}");
    expect(web.playerBinders).toContain("No binders to open.");
    expect(app.stack).toMatch(/name="Binders"/);
    expect(app.stack).toContain("<BindersScreen");
    expect(app.binders).toContain("<BinderList");
    expect(app.binders).toContain("New binder");
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
    expect(web.oldOwnBinder).toContain(
      "redirect(`/profile/binders/${TRADE_BINDER_ID}`)",
    );
    expect(web.oldPlayerBinder).toContain(
      "redirect(`/p/${playerId}/binders/${TRADE_BINDER_ID}`)",
    );
    /* The app's Binder screen takes the id; missing means the Trade binder. */
    expect(app.stack).toMatch(/Binder: \{ playerId\?: string; binderId\?: string \}/);
    expect(app.stack).toMatch(/name="Hunts"/);
    expect(app.stack).toContain("<HuntsScreen");
  });

  it("says what the Trade binder's cards mean, under the title", () => {
    const own =
      "Cards you will trade. Somebody nearby hunting one of them hears about it.";
    expect(web.view).toContain("subtitle");
    expect(web.ownBinder).toContain(own);
    expect(web.playerBinder).toContain(own);
    expect(web.playerBinder).toContain("`Cards ${binder.ownerName} will trade.`");
    expect(app.binder).toContain(own);
    expect(app.binder).toContain("will trade.");
  });

  it("names and deletes a custom binder, never the Trade binder", () => {
    expect(web.settings).toContain('kind === "custom"');
    expect(web.settings).toContain("Name");
    expect(web.settings).toContain("Delete binder");
    expect(web.settings).toContain("Delete {name}?");
    expect(web.settings).toContain("with it.");
    expect(web.settings).toContain("deleteBinderAction(binderId)");
    expect(web.settings).toContain("onBlur={commitName}");
    expect(web.settings).toContain('event.key === "Enter"');
    expect(app.binder).toContain("Delete binder");
    expect(app.binder).toContain("deleteBinder(");
    expect(app.binder).toMatch(/kind === "custom"/);
  });

  it("sends every write to the binder it is looking at", () => {
    expect(web.view).toContain("removeBinderCardAction(card.entryId, binder.id)");
    expect(web.view).toContain("saveBinderSettingsAction(patch, binder.id)");
    expect(web.view).toMatch(
      /reorderBinderAction\(\s*next\.map\(\(card\) => card\.entryId\),\s*binder\.id,?\s*\)/,
    );
    expect(web.view).toContain("binderId={binder.id}");
    expect(web.add).toContain("binderId,");
    expect(web.settings).toContain("saveBinderSettingsAction(patch, binderId)");
  });
});

describe("the Hunts page", () => {
  it("is the hunts panel on a page of its own, every row drawn", () => {
    expect(web.ownHunts).toContain("<HuntsPanel");
    expect(web.ownHunts).toContain("limit={huntLimitFor(profile.tier)}");
    expect(web.ownHunts).toContain("Back to your profile");
    expect(web.playerHunts).toContain("ownerName={profile.displayName}");
    expect(web.huntsPanel).not.toContain("const SHOWN");
    expect(web.huntsPanel).not.toContain("setShowAll");
    expect(web.huntsPanel).toContain("hunts.map((hunt) =>");
    expect(app.hunts).toContain("<HuntsPanel");
  });
});

describe("the showcase, lighter", () => {
  it("is a small heading and the shelf, with the help behind a ? on the own page only", () => {
    expect(web.ownProfile).toContain("What is a showcase?");
    expect(web.ownProfile).toContain("nothing to offer on here");
    expect(web.playerProfile).not.toContain("nothing to offer on here");
    expect(web.playerProfile).toContain(
      '<h2 className="font-semibold text-text-primary">Showcase</h2>',
    );
    /* No bordered panel round the shelf any more. */
    for (const profile of [web.ownProfile, web.playerProfile]) {
      expect(profile).not.toContain("border border-border bg-elevated/40 p-4");
      expect(profile).toContain("<WornBackdrop");
      expect(profile).toContain("<Rail");
    }
    expect(web.ownProfile).toContain('aria-label="What is a showcase?"');
    expect(web.playerProfile).not.toContain("What is a showcase?");
    expect(app.ownProfile).toContain('accessibilityLabel="What is a showcase?"');
    expect(app.playerProfile).not.toContain("What is a showcase?");
    expect(app.playerProfile).toMatch(SHOWCASE_HEADING);
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
  it("is every Flare, three across, with the direction in the two words the product uses", () => {
    for (const [name, source] of platforms) {
      expect(source.flares.length, `${name}: the grid exists`).toBeGreaterThan(0);
      expect(source.flares, name).toContain("Flares");
      expect(source.flares, name).toContain("Looking for");
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
    expect(app.api).toContain('export const TRADE_BINDER_NAME = "Trade binder";');
  });
});

describe("copy and colour rules", () => {
  it("has no em dashes and no literal hex in the new pieces", () => {
    for (const [name, source] of [
      ["web highlights", web.highlights],
      ["web list", web.list],
      ["web create", web.create],
      ["web flares", web.flares],
      ["web icon row", web.iconRow],
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
      ["app icon row", app.iconRow],
    ] as const) {
      expect(source, name).not.toContain("—");
      expect(source, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });

  it("draws the cover's colour through the one cover list, never a spine of its own", () => {
    expect(web.highlights).toContain("binderCover(binder.cover)");
    expect(web.highlights).not.toContain("spine");
    expect(app.highlights).toContain("binderCover(binder.cover)");
    expect(app.highlights).not.toContain("spine");
  });
});
