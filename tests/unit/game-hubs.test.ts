import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/*
 * The founder (2026-11-25): "like a 'top 10 most searched cards' for each
 * TCG", then "build it all out". Most hunted, price moves this week, most
 * searched, per game, on both platforms.
 */
describe("game hubs", () => {
  const sql = read("supabase/migrations/20261126090000_game_hubs.sql");

  it("counts opens per card per day, and nothing about who", () => {
    expect(sql).toContain("create table if not exists public.card_opens_daily");
    expect(sql).not.toMatch(/card_opens_daily \([^)]*player/);
    expect(sql).toContain("do update set opens = public.card_opens_daily.opens + 1");
  });

  it("keeps its functions the server's alone", () => {
    for (const fn of [
      "bump_card_open(uuid)",
      "game_hub_opened(text, integer, integer)",
      "game_hub_hunted(text, integer)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${fn} from anon;`);
      expect(sql).toContain(`grant execute on function public.${fn} to service_role;`);
    }
  });

  it("counts a card's open after its page has gone out, on both platforms' reads", () => {
    for (const file of [
      "src/app/api/v1/cards/[cardId]/page/route.ts",
      "src/app/cards/[cardId]/page.tsx",
      "src/app/@modal/(.)cards/[cardId]/page.tsx",
    ]) {
      expect(read(file), file).toMatch(/after\(\(\) => countCardOpen\(/);
    }
  });

  it("serves one hub per game, held an hour, drawn on both platforms", () => {
    expect(read("src/app/api/v1/games/[game]/hub/route.ts")).toContain("s-maxage=3600");
    const hub = read("src/lib/cards/game-hub.ts");
    for (const list of ["hunted", "movers", "searched"])
      expect(hub).toContain(`${list}:`);
    expect(read("src/app/games/[game]/page.tsx")).toContain("<GameHubView");
    expect(read("mobile/src/screens/game-hub.tsx")).toContain("getGameHub(game)");
    expect(read("mobile/src/screens/search-lab.tsx")).toContain(
      'navigation.navigate("GameHub", { game: entry.slug })',
    );
    expect(read("src/components/feed/everything-search.tsx")).toContain(
      "href={`/games/${entry.slug}`}",
    );
  });
});
