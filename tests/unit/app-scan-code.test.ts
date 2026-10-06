import { describe, expect, it } from "vitest";

import { readScannedCode } from "../../mobile/src/scan-code";

describe("readScannedCode", () => {
  it("reads the poster URL, with or without www", () => {
    expect(readScannedCode("https://cardflare.gg/e/ABC123")).toEqual({
      kind: "code",
      code: "ABC123",
      game: null,
    });
    expect(readScannedCode("https://www.cardflare.gg/e/abc1234/")).toEqual({
      kind: "code",
      code: "ABC1234",
      game: null,
    });
  });

  it("carries the game a tournament screen names", () => {
    expect(readScannedCode("https://cardflare.gg/e/ABC123?g=one-piece")).toEqual({
      kind: "code",
      code: "ABC123",
      game: "one-piece",
    });
  });

  it("reads a bare code of a night, a store or a show", () => {
    expect(readScannedCode("abc123")).toMatchObject({ kind: "code", code: "ABC123" });
    expect(readScannedCode("ABC1234")).toMatchObject({ kind: "code" });
    expect(readScannedCode("ABC12345")).toMatchObject({ kind: "code" });
  });

  it("refuses somebody else's QR code", () => {
    expect(readScannedCode("https://evil.example/e/ABC123").kind).toBe("foreign");
    expect(readScannedCode("https://cardflare.gg.evil.example/e/ABC123").kind).toBe(
      "foreign",
    );
    expect(readScannedCode("https://cardflare.gg/b/ABC123").kind).toBe("foreign");
    expect(readScannedCode("WIFI:S:shop;T:WPA;P:secret;;").kind).toBe("foreign");
    expect(readScannedCode("HELLO").kind).toBe("foreign");
    /* I, L, O and U are never in a code. */
    expect(readScannedCode("https://cardflare.gg/e/HELLO1").kind).toBe("foreign");
  });
});
