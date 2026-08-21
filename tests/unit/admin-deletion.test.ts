import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { confirmsName, realCollateral } from "@/lib/admin/deletion-schema";

/**
 * Deleting a store or a player.
 *
 * The founder asked for it in plain terms — "it would be nice to wipe
 * things from my database where necessary" — and the danger is not the
 * delete, it is what the delete takes with it. Every foreign key into
 * `stores` and `players` is ON DELETE CASCADE, and the tree runs two
 * levels deep: a store's rooms go, and a room's Flares go with the
 * room. The database does that instantly and says nothing.
 */
describe("typing the name", () => {
  it("accepts the name exactly", () => {
    expect(confirmsName("Mox Valley Games", "Mox Valley Games")).toBe(true);
  });

  it("forgives a copy-paste's whitespace and nothing else", () => {
    expect(confirmsName("  Mox Valley Games ", "Mox Valley Games")).toBe(true);
    /* Case matters. The whole point of the gesture is that it cannot be
       done by reflex, and a case-insensitive match is one keystroke
       away from being typed without reading. */
    expect(confirmsName("mox valley games", "Mox Valley Games")).toBe(false);
    expect(confirmsName("Mox Valley", "Mox Valley Games")).toBe(false);
    expect(confirmsName("", "Mox Valley Games")).toBe(false);
  });

  it("never confirms against an empty name", () => {
    /* A store with a blank name would otherwise be deletable by
       submitting an empty field, which is no confirmation at all. */
    expect(confirmsName("", "")).toBe(false);
    expect(confirmsName("   ", "  ")).toBe(false);
  });
});

describe("what the admin is shown", () => {
  it("lists only what would actually be lost", () => {
    const shown = realCollateral([
      { label: "room", count: 2 },
      { label: "pending invite", count: 0 },
      { label: "Flare posted at this store", count: 47 },
    ]);

    expect(shown.map((entry) => entry.label)).toEqual([
      "room",
      "Flare posted at this store",
    ]);
  });
});

describe("the rules that make it safe", () => {
  it("re-checks the typed name on the server", async () => {
    /* A Server Action is a public POST endpoint. A browser-side "are you
       sure" is a convenience for the admin and no protection at all. */
    const actions = await readFile("src/lib/admin/deletion-actions.ts", "utf8");

    expect(actions).toContain("confirmsName");
    expect(actions).toContain("requireAdmin");
    /* The name is re-read from the database rather than trusted from the
       form — a form carrying both the name and the confirmation is a
       form that confirms itself. */
    expect(actions).toContain("previewStoreDeletion");
    expect(actions).toContain("previewPlayerDeletion");
  });

  it("refuses to delete the admin's own player account", async () => {
    /* The founder is an admin WITH a player account and the same console
       lists both. Deleting yourself signs you out mid-request. */
    const actions = await readFile("src/lib/admin/deletion-actions.ts", "utf8");

    expect(actions).toContain("playerForUser");
    expect(actions).toMatch(/own\?\.id === playerId/);
  });

  it("removes the sign-in with the player, not just the profile", async () => {
    /* Either half alone is broken: a player row with no auth user is a
       profile nobody can sign into, and an auth user with no player row
       signs in successfully onto an app that thinks they are new —
       which reads as data loss rather than a deletion. */
    const deletion = await readFile("src/lib/admin/deletion.ts", "utf8");

    expect(deletion).toContain("auth.admin.deleteUser");
  });

  it("counts the Flares that die with a store's rooms", async () => {
    /* The reason the preview exists. An admin who sees "2 rooms" and not
       "47 Flares" has not been told the thing that matters. */
    const deletion = await readFile("src/lib/admin/deletion.ts", "utf8");

    expect(deletion).toContain("event_cards");
    expect(deletion).toContain("Flare posted at this store");
  });

  it("never builds a table name from a request", async () => {
    /* The table names are const lists in this file. If one ever came
       from a form field, an admin-authenticated request could count or
       delete against anything. */
    const deletion = await readFile("src/lib/admin/deletion.ts", "utf8");

    expect(deletion).toContain("STORE_COLLATERAL");
    expect(deletion).toContain("PLAYER_COLLATERAL");

    /* Comments stripped first — the file explains this rule in prose,
       and a test that reads its own documentation as a violation is a
       test that fails for being right. */
    const code = deletion.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

    expect(code).not.toMatch(/formData|request\./);
  });
});
