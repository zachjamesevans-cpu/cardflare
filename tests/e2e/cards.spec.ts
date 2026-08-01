import { expect, test } from "@playwright/test";

test.describe("card search", () => {
  test("offers a search field and needs no account", async ({ page }) => {
    await page.goto("/cards");

    await expect(page.getByLabel("Card name or number")).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });

  test("is not indexed while the card pool is being loaded", async ({ page }) => {
    await page.goto("/cards");

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });

  test("is a combobox with the accessibility wiring a listbox needs", async ({
    page,
  }) => {
    await page.goto("/cards");

    const input = page.getByLabel("Card name or number");
    await expect(input).toHaveAttribute("role", "combobox");
    await expect(input).toHaveAttribute("aria-autocomplete", "list");
  });

  test("searches on a debounce rather than needing a submit", async ({ page }) => {
    await page.goto("/cards");

    // No submit button: typing is the interaction.
    await expect(page.getByRole("button", { name: /^search$/i })).toHaveCount(0);
  });

  test("says nothing while the query is too short to be useful", async ({ page }) => {
    await page.goto("/cards");

    await page.getByLabel("Card name or number").fill("z");
    await page.waitForTimeout(500);

    const main = page.getByRole("main");
    await expect(main).not.toContainText(/no matching cards/i);
    await expect(main).not.toContainText(/no cards have been loaded/i);
  });

  test("shows the data-source and trademark note", async ({ page }) => {
    await page.goto("/cards");

    await expect(page.getByRole("main")).toContainText(
      /trademarks of their respective owners/i,
    );
    await expect(page.getByRole("main")).toContainText(/not affiliated/i);
  });

  /*
   * An empty result set is an answer, not a failure, and must not surface as
   * an error or leak why the lookup found nothing.
   *
   * Which of the two messages appears depends on whether any cards are loaded,
   * and both are correct — the point is that one of them shows and neither
   * mentions the infrastructure.
   */
  test("reports an empty result without erroring or leaking internals", async ({
    page,
  }) => {
    await page.goto("/cards");

    await page.getByLabel("Card name or number").fill("zzzzqqqq");

    const main = page.getByRole("main");
    await expect(main).toContainText(
      /no matching cards found|no cards have been loaded|unavailable right now/i,
      { timeout: 10_000 },
    );
    await expect(main).not.toContainText(/supabase|postgres|service.role/i);
  });

  /*
   * Card artwork is not licensed. Until it is, nothing on this page may render
   * a remote image — a stray <img> is how that gets shipped by accident.
   */
  test("renders no third-party images", async ({ page }) => {
    await page.goto("/cards");

    await page.getByLabel("Card name or number").fill("luffy");
    await page.waitForTimeout(800);

    const external = await page
      .locator("img")
      .evaluateAll((nodes) =>
        nodes
          .map((node) => (node as HTMLImageElement).getAttribute("src") ?? "")
          .filter((src) => /^https?:\/\//.test(src)),
      );

    expect(external).toEqual([]);
  });
});
