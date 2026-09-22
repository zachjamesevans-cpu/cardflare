import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * The Flare tab's list, after the founder posted from the Feed and
 * found nothing there: "This section needs to update the second a
 * flare gets posted." And on the one row that said "Live in the Feed":
 * "they're all technically live on the feed... Delete that entirely."
 */
describe("the Flares list", () => {
  it("gets every want post, whether it went to a board or the Feed", () => {
    const publish = read("src/lib/flares/publish.ts");
    expect(publish).toContain('if (input.intent === "want") {');
    expect(publish).not.toContain('input.intent === "want" && input.eventId');
  });

  it("names only boards at shops, never the Feed, on both platforms", () => {
    const wants = read("src/lib/players/wants.ts");
    expect(wants).not.toContain("AREA_LABEL");
    expect(wants).not.toContain("name: AREA_LABEL");

    const web = read("src/components/players/want-entries.tsx");
    expect(web).not.toContain('"Saved"');
    expect(web).toContain("want.postedWhere && want.postedWhere.length > 0 &&");

    const app = read("mobile/src/want-row.tsx");
    expect(app).not.toContain(">Saved<");
    expect(app).not.toContain("Live at ${want.postedAt}");
  });

  it("keeps the composer's last-on chip lit rather than dimmed", () => {
    const pill = read("mobile/src/flare-bits.tsx");
    expect(pill).toContain("opacity: disabled && !active ? 0.5 : 1,");
    expect(pill).toContain(
      "color: active ? colors.textPrimary : colors.textSecondary,",
    );
  });
});
