import { describe, expect, it } from "vitest";

import { text } from "@/lib/form-value";

describe("text", () => {
  it("returns the value of a present field", () => {
    const data = new FormData();
    data.set("email", "zach@example.com");

    expect(text(data, "email")).toBe("zach@example.com");
  });

  /*
   * Regression. `FormData.get` returns null for an absent field, and feeding
   * that to a string schema produced "expected string, received null" — an
   * internal message about a hidden field, shown to someone who had simply
   * typed their email address.
   */
  it("returns an empty string for an absent field, not null", () => {
    expect(text(new FormData(), "next")).toBe("");
    expect(text(new FormData(), "next")).not.toBeNull();
  });

  it("returns an empty string for a file input", () => {
    const data = new FormData();
    data.set("upload", new File(["x"], "x.txt"));

    expect(text(data, "upload")).toBe("");
  });

  it("preserves an empty string as an empty string", () => {
    const data = new FormData();
    data.set("city", "");

    expect(text(data, "city")).toBe("");
  });

  it("does not trim — callers decide", () => {
    const data = new FormData();
    data.set("name", "  Zach  ");

    expect(text(data, "name")).toBe("  Zach  ");
  });
});
