import { expect, test } from "@playwright/test";

test.describe("landing page", () => {
  test("loads with the core proposition and branding", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/CardFlare/);
    await expect(
      page.getByRole("heading", { level: 1, name: /find the card/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /cardflare home/i }).first(),
    ).toBeVisible();
  });

  test("exposes one h1 and a logical heading order", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("h1")).toHaveCount(1);
    await expect(
      page.getByRole("heading", { name: "Three steps to a trade" }),
    ).toBeVisible();
  });

  test("explains the product without claiming it has launched", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText(/currently being built/i)).toBeVisible();
  });

  test("primary hero CTA jumps to the waitlist form", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Join the Waitlist" }).first().click();

    await expect(page).toHaveURL(/#waitlist$/);
    await expect(page.getByLabel("Email address")).toBeInViewport();
  });

  test("store pilot CTA preselects the local game store user type", async ({
    page,
  }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Join the Store Pilot" }).click();

    await expect(page.getByLabel(/which best describes you/i)).toHaveValue("store");
  });

  test("skip link is reachable by keyboard", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");

    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  });

  test("serves robots.txt and sitemap.xml", async ({ page }) => {
    const robots = await page.request.get("/robots.txt");
    expect(robots.ok()).toBeTruthy();
    expect(await robots.text()).toContain("Sitemap:");

    const sitemap = await page.request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();
    expect(await sitemap.text()).toContain("<urlset");
  });

  test("exposes social sharing metadata", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      /CardFlare/,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  });
});

test.describe("legal pages", () => {
  for (const [path, heading] of [
    ["/privacy", "Privacy Policy"],
    ["/terms", "Terms of Service"],
  ] as const) {
    test(`${path} loads and is marked as a draft`, async ({ page }) => {
      await page.goto(path);

      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toBeVisible();
      await expect(page.getByText(/draft document/i)).toBeVisible();
    });
  }

  test("footer links reach the legal pages", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Privacy" }).click();
    await expect(page).toHaveURL(/\/privacy$/);
  });
});
