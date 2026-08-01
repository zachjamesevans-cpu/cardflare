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

  test("refuses a one-character query without searching", async ({ page }) => {
    await page.goto("/cards");

    await page.getByLabel("Card name or number").fill("z");
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      /at least 2 characters/i,
    );
  });

  test("keeps a rejected query so it can be corrected", async ({ page }) => {
    await page.goto("/cards");

    await page.getByLabel("Card name or number").fill("z");
    await page.getByRole("button", { name: /^search$/i }).click();

    await expect(page.getByLabel("Card name or number")).toHaveValue("z");
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
    await page.getByRole("button", { name: /^search$/i }).click();

    const main = page.getByRole("main");
    await expect(main).toContainText(/no card matches|no cards have been loaded/i);
    await expect(main).not.toContainText(/supabase|postgres|service.role/i);
  });

  /*
   * Card artwork is not licensed. Until it is, nothing on this page may render
   * a remote image — a stray <img> is how that gets shipped by accident.
   */
  test("renders no third-party images", async ({ page }) => {
    await page.goto("/cards");

    await page.getByLabel("Card name or number").fill("luffy");
    await page.getByRole("button", { name: /^search$/i }).click();

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
