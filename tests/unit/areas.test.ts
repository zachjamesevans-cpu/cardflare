import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The area switcher's source of truth. The rule worth pinning: an entry
 * exists only for something the account already is — a membership, an
 * admin row, a player row — never by assertion, because the switcher's
 * options become navigation targets in the header.
 */

type Response = Record<string, unknown>;

function chain(response: Response) {
  const c: Record<string, unknown> = {};

  for (const method of ["select", "eq", "in", "order"]) {
    c[method] = () => c;
  }

  c.maybeSingle = () => Promise.resolve(response);
  c.then = (resolve: (v: Response) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(response).then(resolve, reject);

  return c;
}

const queues: Record<string, Response[]> = {};

function queue(table: string, ...responses: Response[]) {
  (queues[table] ??= []).push(...responses);
}

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: (table: string) =>
      chain(queues[table]?.shift() ?? { data: null, error: null }),
  }),
}));

const { areasForUser } = await import("@/lib/auth/areas");

beforeEach(() => {
  for (const key of Object.keys(queues)) delete queues[key];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("areasForUser", () => {
  it("lists every console the founder-shaped account genuinely holds", async () => {
    queue("store_members", {
      data: [{ store_id: "s1" }, { store_id: "s2" }],
      error: null,
    });
    queue("stores", {
      data: [
        { id: "s1", name: "Grand Line Games", kind: "lgs" },
        { id: "s2", name: "SlabCity Singles", kind: "vendor" },
      ],
      error: null,
    });
    queue("players", { data: { display_name: "Zach" }, error: null });

    await expect(areasForUser("u1", true)).resolves.toEqual([
      { label: "Admin console", href: "/admin" },
      { label: "Store · Grand Line Games", href: "/store?as=s1" },
      { label: "Vendor · SlabCity Singles", href: "/store?as=s2" },
      { label: "Player · Zach", href: "/profile" },
    ]);
  });

  it("gives a pure player exactly one entry, their account", async () => {
    queue("store_members", { data: [], error: null });
    queue("players", { data: { display_name: "Kaito" }, error: null });

    await expect(areasForUser("u2", false)).resolves.toEqual([
      { label: "Player · Kaito", href: "/profile" },
    ]);
  });

  it("gives an account that is nothing yet no entries at all", async () => {
    queue("store_members", { data: [], error: null });
    queue("players", { data: null, error: null });

    await expect(areasForUser("u3", false)).resolves.toEqual([]);
  });
});
