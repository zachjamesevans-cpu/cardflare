import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The founder, after posting an offer from the composer: "The 'I am
 * offering' flare appears nowhere." Both hunt builders read wants
 * alone, and the session bridge never carried the viewer's own room
 * identity, so an offer went nowhere and a board post of your own
 * reached everyone's Feed but yours.
 */
const repo = readFileSync(
  resolve(__dirname, "../../src/lib/feed/repository.ts"),
  "utf8",
);

describe("offers and your own room posts reach the Feed", () => {
  it("the area reader takes both directions and says which", () => {
    expect(repo).toContain('.in("intent", ["want", "showcase"])');
    expect(repo).not.toMatch(
      /\.eq\("intent", "want"\)\s*\n\s*\.is\("event_id", null\)/,
    );
    expect(repo).toContain(
      'direction: group[0]?.intent === "showcase" ? "showcase" : "want"',
    );
  });

  it("the board reader keeps offers and says which", () => {
    expect(repo).not.toContain('if (flare.intent !== "want") continue;');
    expect(repo).toContain(
      'direction: ordered[0]?.flare.intent === "showcase" ? "showcase" : "want"',
    );
  });

  it("the viewer's own room session is on the bridge", () => {
    expect(repo).toContain("if (sessionId) playerBySession.set(sessionId, playerId);");
  });

  it("nobody is told they can answer an offer", () => {
    expect(repo.match(/=== "showcase"\s*\?\s*0/g)?.length).toBe(2);
  });
});
