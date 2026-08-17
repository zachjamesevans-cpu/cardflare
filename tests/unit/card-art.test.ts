import { describe, expect, it } from "vitest";

import {
  CARD_ART_ROUTE,
  cardArtContentType,
  cardArtExtension,
  cardArtObjectPath,
  cardArtSrc,
  isHostedCardArt,
} from "@/lib/cards/art-storage";
import { isRenderableImageUrl } from "@/lib/cards/images";
import {
  compactNumber,
  duplicatePrintings,
  importExternalId,
  importManifestSchema,
} from "@/lib/cards/import-schema";

/**
 * Card art CardFlare hosts itself.
 *
 * The value in `card_printings.image_url` used to be one shape — a
 * provider's https URL — and is now two, because OP-17 has no provider
 * and a spoiler image cannot be hotlinked to the founder's phone. A
 * second legal shape on a column that feeds an `<img>` is exactly the
 * kind of loosening that turns into a hole, so the shape is checked
 * three times: the database constraint (probed in
 * scripts/probe-migrations.sh), the render gate below, and the serving
 * route's own per-segment validation.
 */

describe("isHostedCardArt", () => {
  it("accepts a path this application actually serves", () => {
    expect(isHostedCardArt("/api/card-art/kaizoku/op17/OP17-001.png")).toBe(true);
  });

  it("refuses a protocol-relative URL", () => {
    /* The one that matters. A "starts with a slash" rule would admit
       this, and a browser reads it as a pointer at another server. */
    expect(isHostedCardArt("//evil.example/op17.png")).toBe(false);
  });

  it.each([
    "/api/card-art/../../etc/passwd",
    "/api/card-art/kaizoku/../../avatars/someone.png",
    "/api/card-art/..%2F..%2Fsecret.png",
  ])("refuses traversal: %s", (url) => {
    expect(isHostedCardArt(url)).toBe(false);
  });

  it("refuses a path on another route", () => {
    expect(isHostedCardArt("/api/avatars/someone.png")).toBe(false);
    expect(isHostedCardArt("/api/card-artichoke/x.png")).toBe(false);
  });

  it.each([null, undefined, "", "https://optcgapi.com/x.png"])("refuses %j", (url) => {
    expect(isHostedCardArt(url)).toBe(false);
  });
});

describe("isRenderableImageUrl", () => {
  it("still accepts an allow-listed provider over https", () => {
    expect(isRenderableImageUrl("https://optcgapi.com/images/OP01-025.png")).toBe(true);
  });

  it("still refuses a host nobody allow-listed", () => {
    expect(isRenderableImageUrl("https://evil.example/OP01-025.png")).toBe(false);
  });

  it("still refuses plain http", () => {
    expect(isRenderableImageUrl("http://optcgapi.com/images/OP01-025.png")).toBe(false);
  });

  it("now accepts art we host ourselves", () => {
    expect(isRenderableImageUrl("/api/card-art/kaizoku/op17/OP17-001.png")).toBe(true);
  });

  it("does not let the new shape smuggle in a host", () => {
    expect(isRenderableImageUrl("//evil.example/x.png")).toBe(false);
    expect(isRenderableImageUrl("/api/card-art/../../../etc/passwd")).toBe(false);
  });

  it("refuses a relative path that is not card art", () => {
    /* The relative branch must not become "anything starting with a
       slash is fine" — that would make every internal route an image. */
    expect(isRenderableImageUrl("/api/avatars/someone.png")).toBe(false);
    expect(isRenderableImageUrl("/anything")).toBe(false);
  });
});

describe("cardArtObjectPath", () => {
  it("puts provider, set and card in the path", () => {
    expect(
      cardArtObjectPath({
        providerKey: "kaizoku",
        setCode: "OP17",
        cardNumber: "OP17-001",
        extension: "png",
      }),
    ).toBe("kaizoku/op17/OP17-001.png");
  });

  it("produces a path the render gate accepts", () => {
    const path = cardArtObjectPath({
      providerKey: "kaizoku",
      setCode: "OP17",
      cardNumber: "OP17-001",
      extension: "png",
    });

    expect(isRenderableImageUrl(cardArtSrc(path))).toBe(true);
    expect(cardArtSrc(path).startsWith(CARD_ART_ROUTE)).toBe(true);
  });

  it("squeezes anything dangerous out of its inputs", () => {
    /* The inputs come from a pasted manifest, so they are as
       attacker-controlled as anything else an admin pastes. */
    const path = cardArtObjectPath({
      providerKey: "../../etc",
      setCode: "OP 17/../..",
      cardNumber: "OP17-001",
      extension: "png",
    });

    expect(path).not.toContain("..");
    expect(isRenderableImageUrl(cardArtSrc(path))).toBe(true);
  });

  it("keeps a printing label distinct from its base art", () => {
    const base = cardArtObjectPath({
      providerKey: "kaizoku",
      setCode: "OP17",
      cardNumber: importExternalId({
        cardNumber: "OP17-001",
        name: "X",
        file: "a.png",
      }),
      extension: "png",
    });
    const alt = cardArtObjectPath({
      providerKey: "kaizoku",
      setCode: "OP17",
      cardNumber: importExternalId({
        cardNumber: "OP17-001",
        name: "X",
        file: "b.png",
        printingLabel: "Alternate art",
      }),
      extension: "png",
    });

    expect(base).not.toBe(alt);
  });
});

describe("cardArtContentType", () => {
  it.each([
    ["kaizoku/op17/OP17-001.png", "image/png"],
    ["kaizoku/op17/OP17-001.jpg", "image/jpeg"],
    ["kaizoku/op17/OP17-001.jpeg", "image/jpeg"],
    ["kaizoku/op17/OP17-001.webp", "image/webp"],
  ])("serves %s as %s", (path, expected) => {
    expect(cardArtContentType(path)).toBe(expected);
  });
});

describe("cardArtExtension", () => {
  it("knows the three the bucket accepts", () => {
    expect(cardArtExtension("image/png")).toBe("png");
    expect(cardArtExtension("image/jpeg")).toBe("jpg");
    expect(cardArtExtension("image/webp")).toBe("webp");
  });

  it("refuses anything else rather than guessing", () => {
    expect(cardArtExtension("image/gif")).toBeNull();
    expect(cardArtExtension("text/html")).toBeNull();
  });
});

describe("the import manifest", () => {
  const valid = {
    provider: "kaizoku",
    setCode: "op17",
    setName: "A Spoiled Set",
    cards: [{ cardNumber: "op17-001", name: "Someone", file: "OP17-001.png" }],
  };

  it("upper-cases the set code and card numbers", () => {
    const parsed = importManifestSchema.parse(valid);
    expect(parsed.setCode).toBe("OP17");
    expect(parsed.cards[0].cardNumber).toBe("OP17-001");
  });

  it("refuses a file name with a folder in it", () => {
    /* The uploader matches these against selected file names, so a path
       here would be a way to reach outside the chosen folder. */
    const result = importManifestSchema.safeParse({
      ...valid,
      cards: [{ ...valid.cards[0], file: "../../etc/passwd" }],
    });
    expect(result.success).toBe(false);
  });

  it.each(["OP17001", "OP17-", "-001", "OP 17-001"])(
    "refuses %j as a card number",
    (cardNumber) => {
      expect(
        importManifestSchema.safeParse({
          ...valid,
          cards: [{ ...valid.cards[0], cardNumber }],
        }).success,
      ).toBe(false);
    },
  );

  it("refuses an empty set", () => {
    expect(importManifestSchema.safeParse({ ...valid, cards: [] }).success).toBe(false);
  });
});

describe("duplicatePrintings", () => {
  const base = { provider: "kaizoku" as const, setCode: "OP17", setName: "X" };

  it("allows the same number twice when the labels differ", () => {
    const manifest = importManifestSchema.parse({
      ...base,
      cards: [
        { cardNumber: "OP17-001", name: "A", file: "a.png" },
        {
          cardNumber: "OP17-001",
          name: "A",
          file: "b.png",
          printingLabel: "Alternate art",
        },
      ],
    });

    expect(duplicatePrintings(manifest)).toEqual([]);
  });

  it("catches the same number and label twice", () => {
    /* Two rows with one key: PostgreSQL refuses an ON CONFLICT batch
       that hits the same key twice, so this has to be caught before it
       becomes a constraint error nobody can read. */
    const manifest = importManifestSchema.parse({
      ...base,
      cards: [
        { cardNumber: "OP17-001", name: "A", file: "a.png" },
        { cardNumber: "OP17-001", name: "A", file: "b.png" },
      ],
    });

    expect(duplicatePrintings(manifest)).toEqual(["OP17-001"]);
  });
});

describe("compactNumber", () => {
  it("strips the dash so a number typed without one still matches", () => {
    expect(compactNumber("OP17-001")).toBe("OP17001");
  });
});
