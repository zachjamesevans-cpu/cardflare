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
   * Artwork is now rendered, so "no remote images" is no longer the rule. The
   * rule that replaces it is narrower and permanent: every image must resolve
   * to a host on the allow-list.
   *
   * Checked through the optimiser too. Next renders `/_next/image?url=...`,
   * which is same-origin, so a naive "is it absolute" test would pass while
   * the optimiser fetched from anywhere — exactly the open-proxy shape that
   * `remotePatterns` exists to prevent.
   *
   * Vacuous without a live database, since search returns nothing to render.
   * It earns its keep against a build where images point somewhere unexpected.
   */
  test("renders images only from allow-listed hosts", async ({ page }) => {
    const ALLOWED = ["optcgapi.com", "www.optcgapi.com"];

    await page.goto("/cards");

    await page.getByLabel("Card name or number").fill("luffy");
    await page.waitForTimeout(800);

    const hosts = await page.locator("img").evaluateAll((nodes) =>
      nodes.flatMap((node) => {
        const src = (node as HTMLImageElement).getAttribute("src") ?? "";
        if (!src || src.startsWith("data:")) return [];

        const url = new URL(src, window.location.origin);

        // Unwrap the optimiser: the host that matters is the one it fetches.
        const proxied = url.pathname === "/_next/image" && url.searchParams.get("url");
        const target = proxied ? new URL(proxied, window.location.origin) : url;

        return target.origin === window.location.origin ? [] : [target.hostname];
      }),
    );

    expect(hosts.filter((host) => !ALLOWED.includes(host))).toEqual([]);
  });
});
