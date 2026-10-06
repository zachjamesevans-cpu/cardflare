import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { displayCardName } from "../../mobile/src/card-name";

const read = (path: string) => readFileSync(path, "utf8");

describe("displayCardName", () => {
  it("drops a trailing bracket that repeats the card number", () => {
    expect(displayCardName("Monkey.D.Luffy (EB04-061)", "EB04-061")).toBe("Monkey.D.Luffy");
    expect(displayCardName("Monkey.D.Luffy (eb04-061)", "EB04-061")).toBe("Monkey.D.Luffy");
  });

  it("drops a bracket holding the number's numeric part", () => {
    expect(displayCardName("Pikachu (010)", "010/198")).toBe("Pikachu");
    expect(displayCardName("Pikachu (010)", "SV01-010")).toBe("Pikachu");
    expect(displayCardName("Pikachu (10)", "010")).toBe("Pikachu");
  });

  it("keeps any other bracket, and names without one", () => {
    expect(displayCardName("Pikachu (Alternate Art)", "010")).toBe("Pikachu (Alternate Art)");
    expect(displayCardName("Pikachu (011)", "010")).toBe("Pikachu (011)");
    expect(displayCardName("Pikachu", "010")).toBe("Pikachu");
    expect(displayCardName("(010)", "010")).toBe("(010)");
    expect(displayCardName("Pikachu (010)", "")).toBe("Pikachu (010)");
  });

  it("is what the search results and the card page draw", () => {
    expect(read("mobile/src/screens/search.tsx")).toContain(
      "displayCardName(card.name, card.cardNumber)",
    );
    expect(read("mobile/src/screens/card.tsx")).toContain(
      "displayCardName(card.name, card.number)",
    );
  });
});
