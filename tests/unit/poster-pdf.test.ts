import { describe, expect, it, vi } from "vitest";

import { PDFDocument } from "pdf-lib";

vi.mock("server-only", () => ({}));

const { posterPdf } = await import("@/lib/events/poster-pdf");

/**
 * The PDF poster exists to make two promises no browser print path can:
 * exactly one page, and nothing on it but the card. The one-page promise is
 * checked here for every kind and for hostile inputs — a store name long
 * enough to wrap would be exactly the regression that quietly brings page
 * two back.
 */
describe("posterPdf", () => {
  const pageCount = async (bytes: Uint8Array) =>
    (await PDFDocument.load(bytes)).getPageCount();

  it.each([
    ["counter", { title: "Grand Line Games", kind: "counter", joinCode: "K3M9PZQ" }],
    [
      "event",
      {
        title: "Friday Night Locals",
        subtitle: "Fri, Sep 12, 6:00 PM – 10:00 PM CDT",
        kind: "event",
        joinCode: "K3M9PZ",
      },
    ],
    [
      "show",
      {
        title: "Dallas Card Show",
        subtitle: "Sat, Sep 12 – Sun, Sep 13",
        kind: "show",
        joinCode: "K3M9PZQ8",
      },
    ],
  ] as const)("renders a %s poster as exactly one page", async (_kind, input) => {
    const bytes = await posterPdf(input);

    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    expect(await pageCount(bytes)).toBe(1);
  });

  it("stays one page for a marathon store name", async () => {
    const bytes = await posterPdf({
      title:
        "The Absolutely Unreasonably Long Trading Card Emporium of Greater Metropolitan Austin, Texas",
      kind: "counter",
      joinCode: "K3M9PZQ",
    });

    expect(await pageCount(bytes)).toBe(1);
  });

  it("names the document after the store, so downloads are findable", async () => {
    const bytes = await posterPdf({
      title: "Grand Line Games",
      kind: "counter",
      joinCode: "K3M9PZQ",
    });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toContain("Grand Line Games");
  });
});
