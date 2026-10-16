import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Edit profile's Done. The founder: "i think we need a 'done' button. it
 * seems like no cosmetics saved when i applied them... the second i press
 * done or whatever, it updates on my account and the server stuff happens
 * in the background. if it doesn't save, it'll just revert back."
 *
 * The app's save runs for real here with the write stubbed; the screens
 * are read off the source, since the app has no renderer in the test run.
 * The website's action runs for real against stubbed session and equips.
 */

class FakeApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
vi.mock("../../mobile/src/api", () => ({
  ApiError: FakeApiError,
  setCustomizeEquip: vi.fn(),
}));

const viewer = { kind: "player" as string, playerId: "p1" };
const setEquip = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getViewer: async () => viewer }));
vi.mock("@/lib/players/accounts", () => ({ playerForUser: async () => null }));
vi.mock("@/lib/players/equips", () => ({
  isEquipKind: (value: string) => ["ring", "aura", "border", "title"].includes(value),
  setEquip: (...args: unknown[]) => setEquip(...args),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/* Loaded by a path TypeScript does not follow, as the other app tests
   load the app's api: following it would pull React Native's globals
   into the website's type check. */
type Pending = {
  equips: Record<string, string | null>;
  ringArt?: { kind: string; url: string } | null;
  auraArt?: { kind: string; url: string } | null;
};
type Wearer = {
  wear?: {
    ring: string | null;
    aura: string | null;
    ringArt: { kind: string; url: string } | null;
    auraArt: { kind: string; url: string } | null;
  } | null;
  equips?: Record<string, string | null> | null;
};
interface LookModule {
  LOOK_NOT_PRO: string;
  saveLook: (
    draft: Record<string, string | null>,
    art: object,
    send: (kind: string, slug: string | null) => Promise<unknown>,
  ) => Promise<boolean>;
  wearPending: <P extends Wearer>(profile: P, pending: Pending | null) => P;
  lookLanded: (round: number) => void;
  lookState: () => { pending: Pending | null; failed: string | null; settled: number };
}
const LOOK_PATH = "../../mobile/src/look-save";
const loadLook = () => import(/* @vite-ignore */ LOOK_PATH) as Promise<LookModule>;

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

describe("the app saves a look behind Done", () => {
  it("wears it at once, then clears the pending look when every slot saved", async () => {
    const look = await loadLook();
    let release!: () => void;
    const sent: [string, string | null][] = [];
    const send = vi.fn(async (kind: string, slug: string | null) => {
      sent.push([kind, slug]);
      if (sent.length === 1) await new Promise<void>((done) => (release = done));
    });

    const saving = look.saveLook({ ring: "ring-haki", title: null }, {}, send);
    /* While the server works, the look is already worn. */
    const profile = {
      wear: { ring: "ring-old", aura: null, ringArt: null, auraArt: null },
      equips: { ring: "ring-old", title: "title-founder" },
    };
    const pendingNow = look.wearPending(profile, {
      equips: { ring: "ring-haki", title: null },
    });
    expect(pendingNow.wear?.ring).toBe("ring-haki");
    expect(pendingNow.equips?.title).toBeNull();

    release();
    expect(await saving).toBe(true);
    expect(sent).toEqual([
      ["ring", "ring-haki"],
      ["title", null],
    ]);
  });

  it("says it did not save, and keeps going past the slot that failed", async () => {
    const look = await loadLook();
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true });
    expect(await look.saveLook({ ring: "ring-haki", aura: null }, {}, send)).toBe(
      false,
    );
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("keeps a saved look on until the profile's re-read lands", async () => {
    const look = await loadLook();
    expect(await look.saveLook({ ring: "ring-gold" }, {}, async () => {})).toBe(true);
    /* Saved, but the profile has not read it back yet: still worn. */
    const { settled, pending } = look.lookState();
    expect(pending?.equips.ring).toBe("ring-gold");
    look.lookLanded(settled - 1);
    expect(look.lookState().pending).not.toBeNull();
    look.lookLanded(settled);
    expect(look.lookState().pending).toBeNull();
  });

  it("drops a look that did not save at once, so the old one is back", async () => {
    const look = await loadLook();
    await look.saveLook({ ring: "ring-gold" }, {}, async () => {
      throw new Error("offline");
    });
    expect(look.lookState().pending).toBeNull();
  });

  it("names Pro when the server refuses for that", async () => {
    const look = await loadLook();
    const send = vi.fn().mockRejectedValue(new FakeApiError("not-pro"));
    expect(await look.saveLook({ ring: "ring-haki" }, {}, send)).toBe(false);
    expect(look.LOOK_NOT_PRO).toContain("Pro");
  });

  it("leaves a profile alone when nothing is pending", async () => {
    const look = await loadLook();
    const profile = { wear: null, equips: { ring: "ring-old" } };
    expect(look.wearPending(profile, null)).toBe(profile);
  });

  it("carries a dropped-in ring's file with its slug", async () => {
    const look = await loadLook();
    const art = { kind: "svg" as const, url: "/cosmetics/ring-lightning.svg" };
    const bare: Wearer = { wear: null, equips: {} };
    const worn = look.wearPending(bare, {
      equips: { ring: "ring-lightning" },
      ringArt: art,
    });
    expect(worn.wear?.ringArt).toEqual(art);
  });
});

describe("the app's screens", () => {
  const edit = read("mobile/src/screens/edit-profile.tsx");
  const wardrobe = read("mobile/src/screens/customize.tsx");
  const profile = read("mobile/src/screens/profile.tsx");

  it("puts Done in Edit profile's header, and asks before Back drops picks", () => {
    expect(edit).toContain('<HeaderTextButton label="Done" onPress={done} />');
    expect(edit).toContain("if (dirty) void saveLook(draft, draftArt);");
    expect(edit).toContain("usePreventRemove(dirty,");
    expect(edit).toContain('"Discard your changes?"');
  });

  it("stages a tap in the wardrobe instead of writing it", () => {
    expect(wardrobe).not.toContain("setCustomizeEquip");
    expect(wardrobe).toContain("onPick(on, slug, art);");
  });

  it("wears the pending look on the profile and reads again when it settles", () => {
    expect(profile).toContain("wearPending(loaded, look.pending)");
    expect(profile).toContain("setMessage(look.failed);");
    expect(profile).toContain("void load().then(() => lookLanded(round));");
  });
});

describe("the website saves a look behind Done", () => {
  beforeEach(() => {
    setEquip.mockReset();
    viewer.kind = "player";
  });

  it("saves every pick and says so", async () => {
    setEquip.mockResolvedValue("equipped");
    const { saveLookAction } = await import("@/lib/players/equip-actions");
    expect(
      await saveLookAction([
        { kind: "ring", slug: "ring-haki" },
        { kind: "title", slug: null },
      ]),
    ).toBe("saved");
    expect(setEquip).toHaveBeenCalledWith("p1", "ring", "ring-haki");
    expect(setEquip).toHaveBeenCalledWith("p1", "title", null);
  });

  it("answers failed or not-pro so the page can put the look back", async () => {
    const { saveLookAction } = await import("@/lib/players/equip-actions");
    setEquip.mockResolvedValueOnce("failed").mockResolvedValueOnce("equipped");
    expect(
      await saveLookAction([
        { kind: "ring", slug: "ring-haki" },
        { kind: "aura", slug: "aura-x" },
      ]),
    ).toBe("failed");
    setEquip.mockResolvedValueOnce("not-pro");
    expect(await saveLookAction([{ kind: "ring", slug: "ring-haki" }])).toBe("not-pro");
  });

  it("trusts nothing it is sent: no player, a made-up slot, a long list", async () => {
    const { saveLookAction } = await import("@/lib/players/equip-actions");
    expect(await saveLookAction([{ kind: "nonsense", slug: "x" }])).toBe("failed");
    expect(
      await saveLookAction(
        Array.from({ length: 21 }, () => ({ kind: "ring", slug: null })),
      ),
    ).toBe("failed");
    viewer.kind = "anonymous";
    expect(await saveLookAction([{ kind: "ring", slug: null }])).toBe("failed");
    expect(setEquip).not.toHaveBeenCalled();
  });

  it("stages clicks in the hub and puts Done over the tabs", () => {
    const hub = read("src/components/players/customize-hub.tsx");
    const draft = read("src/components/players/look-draft.tsx");
    const page = read("src/app/profile/edit/page.tsx");
    expect(hub).not.toContain("equipCosmeticAction");
    expect(hub).toContain("pick(on, slug, saved[on] ?? null)");
    expect(draft).toContain('{saving ? "Saving…" : "Done"}');
    expect(draft).toContain("window.confirm(DISCARD)");
    expect(page).toContain("<LookDraftProvider>");
  });
});
