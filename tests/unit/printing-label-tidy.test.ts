import { describe, expect, it } from "vitest";

import { printingLabel as appPrintingLabel } from "../../mobile/src/flare-copy";
import { printingVariantMark } from "@/lib/cards/schema";

/*
 * The Feed read "OP14-009 · OP14-EB04 · SR · - OP14-0…": a provider
 * name like "Trafalgar Law - OP14-009" left "- OP14-009" as the variant
 * mark, and the card number was already printed in front of the label.
 */
describe("a printing label never repeats the card number or keeps a lone dash", () => {
  it("drops a dashed card number from the variant mark", () => {
    const mark = printingVariantMark(
      { printingName: "Trafalgar Law - OP14-009" } as never,
      "Trafalgar Law",
    );
    expect(mark).toBeNull();
  });

  it("keeps a real variant word beside it", () => {
    const mark = printingVariantMark(
      { printingName: "Trafalgar Law - OP14-009 (Alternate Art)" } as never,
      "Trafalgar Law",
    );
    expect(mark).toBe("Alternate Art");
  });

  it("tidies a label already stored the old way, in the app", () => {
    expect(appPrintingLabel("OP14-EB04 · SR · - OP14-009")).toBe("OP14-EB04 · SR");
    expect(appPrintingLabel("EB-02 · R")).toBe("EB-02 · R");
    expect(appPrintingLabel("SR · SR")).toBe("SR");
    expect(appPrintingLabel(null)).toBe("Any printing");
    expect(appPrintingLabel("- OP14-009")).toBe("Any printing");
  });
});
