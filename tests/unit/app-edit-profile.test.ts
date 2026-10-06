import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The founder's round of six, on the app side, read off the source.
 *
 * 1. Edit profile is Instagram's screen: picture beside the effects
 *    circle, one link under them, then Name / Username / Pronouns /
 *    Bio as rows.
 * 2. The picker opens without a cropper (app-cover-aspect.test.ts has
 *    the rest of that story).
 * 3. The centre tab is the flame the website draws.
 * 4. A finished post says so in its status line, not on a row.
 * 5. The compact card has the three dots.
 * 6. A sheet's backdrop is a blur that fades, not a black wall that
 *    slides.
 *
 * The runner is Node with no renderer, so this proves the rules are
 * WRITTEN. The visual pass is a build on a device.
 */
const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

/**
 * The same file with its block comments stripped, for the pins that say
 * a word is GONE. The comments explaining each cut quote the thing they
 * cut, and a guard that trips on its own explanation is a guard nobody
 * can write the explanation for.
 */
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "");

describe("Edit profile, the app's screen", () => {
  const screen = read("mobile/src/screens/edit-profile.tsx");
  const app = read("mobile/App.tsx");
  const profile = read("mobile/src/screens/profile.tsx");
  const settings = read("mobile/src/screens/settings.tsx");

  it("has the four rows, in Instagram's order and words", () => {
    const labels = [...screen.matchAll(/label="(Name|Username|Pronouns|Bio)"/g)].map(
      (m) => m[1],
    );
    expect(labels).toEqual(["Name", "Username", "Pronouns", "Bio"]);
  });

  it("shows the empty rows the way Instagram does", () => {
    expect(screen).toContain('placeholder="Add pronouns"');
    expect(screen).toContain('placeholder="Add a bio"');
    /* The handle is shown without its @: the field draws one. */
    expect(screen).toContain("value={profile.handle}");
  });

  it("puts the effects circle beside the picture and one link under them", () => {
    expect(screen).toContain('navigation.navigate("Customize", { area: "profile" })');
    expect(screen).toContain('name="color-wand"');
    expect(screen).toContain("Edit picture or avatar");
    /* The cover stays reachable from that same door. */
    expect(screen).toContain('"Change cover"');
    expect(screen).toContain('"Change picture"');
    expect(screen).toContain('"Use a GIF (Pro)"');
  });

  it("writes through the same endpoints the website's forms use", () => {
    expect(screen).toContain("renameProfile(");
    expect(screen).toContain("setHandle(");
    expect(screen).toContain("setAbout(");
    /* And says what the server said when it refuses. */
    expect(screen).toContain("describeError(caught)");
  });

  it("keeps the bio and pronouns to the server's limits", () => {
    expect(screen).toContain("export const BIO_MAX = 150");
    expect(screen).toContain("export const BIO_LINES = 4");
    expect(screen).toContain("export const PRONOUNS_MAX = 20");
    expect(screen).toContain("handleWhileTyping(next)");
  });

  it("is a stack screen titled Edit profile, with the plain back chevron", () => {
    expect(app).toContain("EditProfile: undefined;");
    expect(app).toContain('name="EditProfile"');
    expect(app).toContain('title: "Edit profile"');
    /* Round 16: back is a chevron with no words, on every screen. */
    expect(app).not.toContain("BACK_LABELS");
    expect(app).not.toContain("headerBackTitle");
    expect(profile).toContain('navigation.navigate("EditProfile")');
    expect(profile).toContain('label="Edit profile"');
  });

  it("has taken the name and handle out of Settings and the in-place editor off the tab", () => {
    expect(settings).not.toContain("<Title>Your name</Title>");
    expect(settings).not.toContain("How people find you");
    expect(settings).not.toContain("NameField");
    expect(profile).not.toContain("setEditing(");
    expect(profile).not.toContain('"Name and handle"');
    expect(profile).not.toContain("function HandleField");
  });
});

describe("pronouns and bio on the header", () => {
  const header = read("mobile/src/profile-header.tsx");

  it("ride the handle's line and sit under it, on both profile screens", () => {
    expect(header).toContain("`${formatHandle(handle)} · ${pronouns}`");
    expect(header).toContain("numberOfLines={4}");
    for (const path of [
      "mobile/src/screens/profile.tsx",
      "mobile/src/screens/player-profile.tsx",
    ]) {
      const source = read(path);
      expect(source).toContain("pronouns={profile.pronouns ?? null}");
      expect(source).toContain("bio={profile.bio ?? null}");
    }
  });
});

describe("the picker", () => {
  it("no longer passes allowsEditing", () => {
    expect(code("mobile/src/change-picture.ts")).not.toContain("allowsEditing");
  });
});

describe("the centre tab", () => {
  const app = read("mobile/App.tsx");

  it("is the raised + (round 16), and never the old mark image", () => {
    /* The flame gave way to the raised accent + that posts a Flare;
       tests/unit/r16-app-nav.test.ts pins it. */
    expect(app).toContain("function PostButton(");
    expect(app).toContain('<Ionicons name="add"');
    expect(app).not.toContain("MarkIcon");
    expect(app).not.toContain("cardflare-mark.png");
    /* The mark still has a home: the pack shop. */
    expect(read("mobile/src/pack-shop.tsx")).toContain("cardflare-mark.png");
  });
});

describe("a finished post", () => {
  const card = read("mobile/src/flare-feed-card.tsx");
  const compact = read("mobile/src/flare-feed-card-compact.tsx");

  it("says so in its status line, in the website's words", () => {
    const status = card.slice(
      card.indexOf("export function statusLabel("),
      card.indexOf("export function FlareStatus("),
    );
    expect(status).toContain('return "offered it all"');
    expect(status).toMatch(/=== 1\s*\? "found it"\s*: "found them all"/);
    expect(status).toContain('"is offering" : "is looking for"');
  });

  it("swaps the crosshair for a check and drops the glow", () => {
    const status = card.slice(
      card.indexOf("export function FlareStatus("),
      card.indexOf("export function FlareActions("),
    );
    expect(status).toContain("done = false");
    expect(status).toContain('<Ionicons name="checkmark-circle"');
    expect(status).toMatch(/done \? \(\s*<Ionicons name="checkmark-circle"/);
    expect(card).toContain("done={completed}");
  });

  it("draws no row of its own, on either card", () => {
    const cardCode = code("mobile/src/flare-feed-card.tsx");
    const compactCode = code("mobile/src/flare-feed-card-compact.tsx");
    const copyCode = code("mobile/src/flare-copy.ts");
    expect(cardCode).not.toContain("All found");
    expect(cardCode).not.toContain("All gone");
    expect(cardCode).not.toContain("doneLabel");
    expect(compactCode).not.toContain("doneLabel");
    expect(compactCode).not.toContain("const done = item.completed");
    expect(copyCode).not.toContain("doneLabel");
    expect(copyCode).not.toContain("stillNeededLabel");
    /* The compact header's small glyph is the check when done. */
    expect(compact).toContain('item.completed\n                ? "checkmark-circle"');
  });
});

describe("the three dots on the compact card", () => {
  const compact = read("mobile/src/flare-feed-card-compact.tsx");
  const home = read("mobile/src/screens/home.tsx");

  it("are drawn, with the classic card's own items behind them", () => {
    expect(compact).toContain("<DotsButton");
    expect(compact).toContain("<ActionSheet");
    expect(compact).toContain("postActions({");
    expect(compact).toContain("onViewAll?: () => void;");
    expect(compact).toContain("onProgress?: () => void;");
  });

  it("are handed both doors by the Feed", () => {
    const block = home.slice(
      home.indexOf("<FlareFeedCardCompact"),
      home.indexOf("<FlareFeedCard\n", home.indexOf("<FlareFeedCardCompact")),
    );
    expect(block).toContain("onViewAll={() => setCardsSheet(");
    expect(block).toContain("onProgress={");
  });
});

describe("what sits behind a sheet", () => {
  it("is a blur that fades in, on the menu and on the sheets it opens", () => {
    const menu = read("mobile/src/action-menu.tsx");
    expect(menu).toContain('from "expo-blur"');
    expect(menu).toContain("<BlurView");
    expect(menu).toContain("intensity={30}");
    expect(menu).toContain('tint="dark"');
    expect(menu).toContain("export function SheetBackdrop");
    expect(menu).toContain('animationType="fade"');

    for (const path of [
      "mobile/src/action-menu.tsx",
      "mobile/src/flare-cards-sheet.tsx",
      "mobile/src/flare-progress-sheet.tsx",
    ]) {
      const source = read(path);
      expect(source).toContain("<SheetBackdrop />");
      expect(source).not.toContain('animationType="slide"');
      expect(source).not.toMatch(/backgroundColor: "rgba\(0,0,0/);
    }
  });
});

describe("pull to refresh ticks when it commits", () => {
  /* The founder: "a small haptic vibration when it pulls all the way
     up to refresh." The Feed draws its own pull and ticks at the
     crossing; the screens on RefreshControl tick when it fires. */
  it("has one tick, used by every pull", () => {
    const tick = read("mobile/src/refresh-tick.ts");
    expect(tick).toContain("Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)");
    for (const screen of ["home", "room", "remote", "local"]) {
      const source = read(`mobile/src/screens/${screen}.tsx`);
      expect(source).toContain('from "../refresh-tick"');
      /* Called outright, or handed to runOnJS from the Feed's worklet. */
      expect(source).toMatch(/refreshTick\(\)|runOnJS\(refreshTick\)\(\)/);
    }
    const home = read("mobile/src/screens/home.tsx");
    expect(home).toContain("pull.value >= PULL_TRIGGER && !armed.value");
  });
});
