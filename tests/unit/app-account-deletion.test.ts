import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Deleting your own account exists on both platforms and says the same
 * thing on each.
 *
 * App Store Review Guideline 5.1.1(v): an app that creates accounts has
 * to let people delete them inside the app. The website carries the
 * same card so the two clients cannot disagree about what an account
 * can do, and both go through one server-side lock: the handle typed
 * back. This holds the three pieces together.
 */
const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const WARNING = "Everything goes: profile, Flares, lists, showcase and unlocks.";

describe("account deletion", () => {
  it("has a server endpoint the app calls and a helper the website shares", () => {
    expect(existsSync(resolve(root, "src/app/api/v1/me/delete/route.ts"))).toBe(true);
    const route = read("src/app/api/v1/me/delete/route.ts");
    const helper = read("src/lib/players/delete-account.ts");
    const actions = read("src/lib/players/profile-actions.ts");

    expect(route).toContain("deleteAccount(");
    expect(actions).toContain("deleteAccount(");
    /* The handle is the lock, checked on the server, not only on the screen. */
    expect(helper).toContain("handle-mismatch");
    expect(helper).toContain("deletePlayer(");
  });

  it("is offered in the app's settings, behind the typed handle", () => {
    const settings = read("mobile/src/screens/settings.tsx");
    const api = read("mobile/src/api.ts");

    expect(settings).toContain("Delete your account");
    expect(settings).toContain(WARNING);
    expect(settings).toContain("deleteAccount(");
    expect(api).toContain('"/api/v1/me/delete"');
  });

  it("is offered on the website's settings page in the same words", () => {
    const page = read("src/app/profile/settings/page.tsx");
    const form = read("src/components/players/delete-account-form.tsx");

    expect(page).toContain("Delete your account");
    expect(page.replace(/\s+/g, " ")).toContain(WARNING);
    expect(form).toContain("deleteAccountAction");
  });
});
