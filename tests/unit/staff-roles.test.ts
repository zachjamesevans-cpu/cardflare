import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Owners and organizers.
 *
 * `store_members.role` is "owner" or "staff", and "staff" is an
 * ORGANIZER: a player the owner handed the timers to. The founder's
 * split is that an organizer runs FlareCast, the timers and the
 * remote, and touches nothing about money, membership, singles or
 * settings. These pins hold the seams where that split lives, because
 * each one is a single line that a refactor could quietly drop.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../../", path), "utf8");

describe("an organizer stays a player", () => {
  it("is a player viewer carrying the stores that named them", () => {
    const session = read("src/lib/auth/session.ts");

    /* The Feed and the Flares keep working because the viewer kind
       does not change; only the store list rides along. */
    expect(session).toContain("organizerStoreIds: storeIds");
  });
});

describe("naming an organizer is the owner's", () => {
  it("requires an admin or role owner at that store", () => {
    const actions = read("src/lib/stores/staff-actions.ts");

    expect(actions).toContain('viewer.storeRoles[storeId] === "owner"');
    expect(actions).toContain('viewer.kind === "admin"');
    /* Both actions go through the same gate. */
    expect(actions.match(/await authorizeOwner\(storeId\)/g)).toHaveLength(2);
    /* A player viewer, organizer or not, is never let through here. */
    expect(actions).not.toContain("organizerStoreIds");
  });

  it("never deletes an owner row when removing", () => {
    const staff = read("src/lib/stores/staff.ts");
    const remove = staff.slice(
      staff.indexOf("export async function removeOrganizer"),
      staff.indexOf("export interface OrganizerStore"),
    );

    expect(remove).toContain(".delete()");
    expect(remove).toContain('.eq("role", "staff")');
  });

  it("inserts organizers as role staff and refuses a second membership", () => {
    const staff = read("src/lib/stores/staff.ts");
    const add = staff.slice(
      staff.indexOf("export async function addOrganizer"),
      staff.indexOf("export async function removeOrganizer"),
    );

    expect(add).toContain('role: "staff"');
    expect(add).toContain("if (existing)");
  });
});

describe("what an organizer may run", () => {
  it("is admitted to the event hub actions", () => {
    const actions = read("src/lib/event-hub/actions.ts");
    const authorize = actions.slice(
      actions.indexOf("async function authorizeStore"),
      actions.indexOf("async function presserName"),
    );

    expect(authorize).toContain(
      'if (viewer.kind === "player") return viewer.organizerStoreIds.includes(storeId);',
    );
  });

  it("is admitted to the events actions", () => {
    const actions = read("src/lib/events/actions.ts");
    expect(actions).toContain("viewer.organizerStoreIds.includes(storeId)");
  });

  it("is turned away from billing", () => {
    const ultra = read("src/lib/stores/ultra-actions.ts");

    expect(ultra).toContain('viewer.storeRoles[storeId] === "owner"');
    for (const action of ["manageBillingAction", "startUltraCheckoutAction"]) {
      const body = ultra.slice(ultra.indexOf(`export async function ${action}`));
      const gate = body.indexOf("ownsStore(viewer, storeId)");
      expect(gate, `${action} checks ownership`).toBeGreaterThan(0);
      /* And before anything else the action does. */
      expect(gate).toBeLessThan(
        body.indexOf("await ", body.indexOf("getViewer()") + 12),
      );
    }
  });
});

describe("the console for an organizer", () => {
  it("hides singles, organizers and settings", () => {
    const tabs = read("src/components/stores/store-tabs.tsx");
    const organizer = tabs.slice(
      tabs.indexOf("const ORGANIZER_TABS"),
      tabs.indexOf("];", tabs.indexOf("const ORGANIZER_TABS")),
    );

    expect(organizer).toContain('"event-hub"');
    expect(organizer).toContain('"events"');
    for (const locked of ["singles", "organizers", "settings"]) {
      expect(organizer).not.toContain(`"${locked}"`);
    }
  });

  it("locks the same pages on the server", () => {
    const console = read("src/lib/stores/console.ts");
    const locked = console.slice(
      console.indexOf("const OWNER_ONLY_PATHS"),
      console.indexOf("];", console.indexOf("const OWNER_ONLY_PATHS")),
    );

    for (const path of ["/store/singles", "/store/settings", "/store/organizers"]) {
      expect(locked).toContain(`"${path}"`);
    }
    expect(console).toContain('store.role !== "owner"');

    /* The organizers page carries its own copy of the lock. */
    const page = read("src/app/store/organizers/page.tsx");
    expect(page).toContain('if (store.role !== "owner") redirect(');
  });
});

/* -------------------------------------------------------------------- */
/* The loader, run.                                                     */
/* -------------------------------------------------------------------- */

const getViewer = vi.fn();
const redirect = vi.fn((to: string) => {
  throw Object.assign(new Error(`NEXT_REDIRECT:${to}`), { digest: "NEXT_REDIRECT" });
});
const storesRead = vi.fn();

vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));
vi.mock("@/lib/auth/session", () => ({ getViewer: () => getViewer() }));
vi.mock("@/lib/auth/areas", () => ({ areasForUser: async () => [] }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({ select: () => ({ order: () => storesRead() }) }),
  }),
}));

const { consoleRole, consoleStoreIds, loadStoreConsole } =
  await import("@/lib/stores/console");

const STORE = {
  id: "store-1",
  name: "Mox Valley Games",
  city: null,
  region: null,
  status: "active",
  join_code: null,
  walk_in_enabled: false,
  timezone: "UTC",
  kind: "lgs",
  early_board_hours: 0,
  tier: "free",
};

const ORGANIZER = {
  kind: "player",
  user: { id: "user-1", email: "zach@example.com" },
  playerId: "player-1",
  playerName: "Zach",
  organizerStoreIds: ["store-1"],
};

describe("loadStoreConsole with an organizer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storesRead.mockResolvedValue({ data: [STORE, { ...STORE, id: "store-2" }] });
  });

  it("gives them the console for the stores that named them, as staff", async () => {
    getViewer.mockResolvedValue(ORGANIZER);

    const console = await loadStoreConsole(undefined, "/store/event-hub");

    expect(console.store?.id).toBe("store-1");
    expect(console.store?.role).toBe("staff");
    /* The other store on the read is not theirs, whatever RLS returned. */
    expect(console.stores.map((store) => store.id)).toEqual(["store-1"]);
  });

  it("sends them to the overview from an owner-only page", async () => {
    getViewer.mockResolvedValue(ORGANIZER);

    for (const path of ["/store/settings", "/store/singles", "/store/organizers"]) {
      await expect(loadStoreConsole("store-1", path)).rejects.toThrow(
        "NEXT_REDIRECT:/store?as=store-1",
      );
    }
  });

  it("sends a player nobody named back to their profile", async () => {
    getViewer.mockResolvedValue({ ...ORGANIZER, organizerStoreIds: [] });

    await expect(loadStoreConsole(undefined, "/store")).rejects.toThrow(
      "NEXT_REDIRECT:/profile",
    );
  });

  it("lets an owner open every page", async () => {
    getViewer.mockResolvedValue({
      kind: "store",
      user: { id: "user-2", email: "owner@example.com" },
      storeIds: ["store-1"],
      storeRoles: { "store-1": "owner" },
    });

    const console = await loadStoreConsole("store-1", "/store/settings");
    expect(console.store?.role).toBe("owner");
  });
});

describe("consoleRole", () => {
  it("reads the role from the membership, and staff for an organizer", () => {
    expect(consoleRole(ORGANIZER as never, "store-1")).toBe("staff");
    expect(consoleRole(ORGANIZER as never, "store-9")).toBeNull();
    expect(
      consoleRole(
        {
          kind: "store",
          user: { id: "u" },
          storeIds: ["store-1"],
          storeRoles: { "store-1": "owner" },
        } as never,
        "store-1",
      ),
    ).toBe("owner");
    expect(
      consoleRole(
        {
          kind: "admin",
          user: { id: "u" },
          storeIds: ["store-1"],
          storeRoles: {},
        } as never,
        "store-1",
      ),
    ).toBe("owner");
    expect(consoleStoreIds({ kind: "anonymous" } as never)).toEqual([]);
  });
});
