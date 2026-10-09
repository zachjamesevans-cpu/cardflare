import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * A `security definer` function runs as its owner, so whoever can call
 * it skips RLS. On Supabase a revoke from PUBLIC does not take EXECUTE
 * away from `anon` and `authenticated` (they hold direct grants from
 * the default privileges), which left grant_embers callable with the
 * anon key. This walks every definer function in the migrations and
 * fails if a new one ships without being taken from the client roles.
 */

const dir = join(process.cwd(), "supabase/migrations");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const sql = files.map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
const lock = readFileSync(
  join(dir, "20261109093100_lock_definer_functions.sql"),
  "utf8",
);

/* Called from RLS policies as the signed-in user, on purpose. */
const CLIENT_CALLABLE = new Set(["is_admin", "is_store_member"]);

function definerFunctions(): string[] {
  const names = new Set<string>();
  const re = /create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(([\s\S]*?)\$/gi;
  for (const m of sql.matchAll(re)) {
    if (/security\s+definer/i.test(m[2])) names.add(m[1]);
  }
  return [...names].sort();
}

describe("definer functions are the service role's alone", () => {
  it("finds the definer functions it is meant to police", () => {
    const found = definerFunctions();
    for (const name of [
      "grant_embers",
      "award_embers",
      "spend_embers",
      "reverse_embers",
      "binder_place_card",
      "binder_save_order",
    ]) {
      expect(found).toContain(name);
    }
  });

  it("revokes the money and binder functions from anon and authenticated", () => {
    for (const signature of [
      "public.grant_embers(uuid, integer, text, text)",
      "public.award_embers(uuid, integer, text, text, text)",
      "public.spend_embers(uuid, integer, text, text)",
      "public.reverse_embers(uuid, integer, text, text)",
      "public.binder_place_card(uuid, uuid, integer)",
      "public.binder_save_order(uuid, uuid[])",
    ]) {
      expect(lock).toContain(`'${signature}'`);
      /* The signature has to match the one the function was made with,
         or the revoke names a function that does not exist and fails. */
      expect(sql).toContain(`revoke all on function ${signature} from public`);
    }
    expect(lock).toContain("revoke all on function %s from anon");
    expect(lock).toContain("revoke all on function %s from authenticated");
    expect(lock).toContain("grant execute on function %s to service_role");
  });

  it("leaves no other definer function open to the client roles", () => {
    for (const name of definerFunctions()) {
      if (CLIENT_CALLABLE.has(name)) continue;
      const direct = new RegExp(
        `revoke all on function public\\.${name}\\([^)]*\\) from anon`,
      ).test(sql);
      const inLock = lock.includes(`'public.${name}(`);
      expect(direct || inLock, `${name} is callable with the anon key`).toBe(true);
    }
  });
});
