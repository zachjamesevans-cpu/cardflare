import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  SETTINGS_SECTIONS,
  displaySummary,
  isSettingsSection,
  notificationsSummary,
  privacySummary,
} from "@/lib/players/settings-sections";

/**
 * Settings in categories. The founder (2026-10-12): "can we put the
 * settings into different categories so it's just not a bunch of random
 * settings on one page? instagram for example has things like account
 * settings/ profile settings, security, etc." Then: "okay build it".
 */

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("the categories", () => {
  it("are these seven, in this order", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.title)).toEqual([
      "Account",
      "Notifications",
      "Privacy & safety",
      "Feed & display",
      "Collection & Flares",
      "Your stores",
      "Help",
    ]);
    expect(isSettingsSection("privacy")).toBe(true);
    expect(isSettingsSection("nope")).toBe(false);
  });

  it("are the same module, word for word, in the app", () => {
    expect(read("mobile/src/settings-sections.ts")).toBe(
      read("src/lib/players/settings-sections.ts"),
    );
  });

  it("say where each stands on the menu", () => {
    expect(notificationsSummary({ a: true, b: true, c: false, d: true })).toBe(
      "3 of 4 on",
    );
    expect(notificationsSummary({ a: true, b: true })).toBe("All on");
    expect(notificationsSummary(null)).toBeNull();
    expect(privacySummary({ nearbyOn: true, blocked: 2 })).toBe(
      "Nearby on · 2 blocked",
    );
    expect(privacySummary({ nearbyOn: false, blocked: 0 })).toBe("Nearby off");
    expect(displaySummary("Classic", true)).toBe("Classic · Pure black");
  });
});

describe("each card in its category, on both platforms", () => {
  it("on the website", () => {
    const web = read("src/app/profile/settings/settings-content.tsx");
    expect(web).toContain(
      "account: [nameCard, emailCard, passwordCard, proCard, deleteCard],",
    );
    expect(web).toContain("privacy: [locationCard, nearbyCard, blockedCard],");
    expect(web).toContain("display: [feedViewCard, lookCard],");
    expect(web).toContain("collection: [collectionCard, deckListCard, roomsCard],");
    expect(read("src/app/profile/settings/[section]/page.tsx")).toContain(
      "<SettingsContent section={section} />",
    );
  });

  it("in the app", () => {
    const app = read("mobile/src/screens/settings.tsx");
    const between = (from: string, to: string) =>
      app.slice(app.indexOf(from), app.indexOf(to, app.indexOf(from)));
    expect(between('case "account":', 'case "notifications":')).toMatch(
      /<AccountCard[\s\S]*<ProCard \/>[\s\S]*\{deleteBlock\}/,
    );
    expect(between('case "privacy":', 'case "display":')).toMatch(
      /<PostalCard[\s\S]*<NearbyCard \/>[\s\S]*<BlockedPlayers/,
    );
    expect(between('case "display":', 'case "collection":')).toMatch(
      /\{feedViewBlock\}[\s\S]*<LookCard \/>/,
    );
    expect(between('case "collection":', 'case "stores":')).toMatch(
      /\{collectionBlock\}[\s\S]*Paste a deck list[\s\S]*\{roomsBlock\}/,
    );
    /* The menu opens each category as its own screen. */
    expect(app).toContain('navigation.push("Settings", { section: entry.key })');
  });

  it("keeps Sign out under the menu and Delete account inside Account", () => {
    const app = read("mobile/src/screens/settings.tsx");
    const menu = app.slice(app.indexOf("THE MENU."));
    expect(menu).toContain('label="Sign out"');
    expect(menu).not.toContain("<DeleteAccount");
    const web = read("src/app/profile/settings/settings-content.tsx");
    expect(web).toContain("<form action={signOut}>");
  });
});
