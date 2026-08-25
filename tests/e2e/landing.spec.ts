import { expect, test, type Page } from "@playwright/test";

/**
 * On small screens the nav lives behind a disclosure, so its links are not in
 * the document until the menu is opened. On desktop it is always present.
 */
async function openNav(page: Page, isMobile: boolean | undefined) {
  if (isMobile) {
    await page.getByRole("button", { name: /open menu/i }).click();
  }
}

test.describe("landing page", () => {
  test("loads with the core proposition and branding", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/cardflare/);
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

  test("says the product is live", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText(/live now/i).first()).toBeVisible();
    /* The launch deleted every waitlist mention; one reappearing means a
       beta-era component crept back in. */
    await expect(page.getByText(/waitlist/i)).toHaveCount(0);
  });

  test("primary hero CTA opens the free signup", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Create your free account" }).first().click();

    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByLabel(/email/i).first()).toBeVisible();
  });

  test("the store invite CTA preselects the local game store type", async ({
    page,
  }) => {
    await page.goto("/");

    /* Several tiers say "Request an invite"; the store section's own CTA
       is the one that must preselect the store type. */
    await page.locator('[data-analytics-event="store_pilot_cta_clicked"]').click();

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
      /cardflare/,
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

  /*
   * One door for everyone since launch: the link stopped naming stores
   * the day players had accounts too, and it must land on the sign-in
   * page from the header on any device.
   */
  test("the header's sign-in reaches the sign-in page", async ({ page, isMobile }) => {
    await page.goto("/");
    await openNav(page, isMobile);

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: /^sign in$/i })
      .click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });

  test("the footer no longer duplicates the sign-in link", async ({ page }) => {
    await page.goto("/");

    await expect(
      page
        .getByRole("navigation", { name: "Footer" })
        .getByRole("link", { name: /sign-in/i }),
    ).toHaveCount(0);
  });

  /*
   * The launch reversal of an old rule. Through the beta this page had to
   * HIDE sign-in from players, because they had nothing to sign into;
   * accounts are open now, so the header carries one sign-in door for
   * everyone and a join button that creates a free account.
   */
  test("invites everyone through one sign-in door", async ({ page, isMobile }) => {
    await page.goto("/");
    await openNav(page, isMobile);

    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: /^sign in$/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /join free/i })).toBeVisible();
    await expect(nav.getByRole("link", { name: /store sign-in/i })).toHaveCount(0);
  });

  /*
   * Regression: these anchors were bare fragments (`#waitlist`), which do
   * nothing on a page that has no such element. Clicking the header CTA on
   * /privacy just rewrote the address bar and stranded the visitor.
   */
  for (const path of ["/privacy", "/terms"] as const) {
    test(`header CTA on ${path} reaches the signup page`, async ({
      page,
      isMobile,
    }) => {
      await page.goto(path);
      await openNav(page, isMobile);

      await page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: "Join free" })
        .click();

      await expect(page).toHaveURL(/\/signup$/);
    });

    test(`section links on ${path} reach the landing page`, async ({
      page,
      isMobile,
    }) => {
      await page.goto(path);
      await openNav(page, isMobile);

      await page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: "How It Works" })
        .click();

      await expect(page).toHaveURL(/\/#how-it-works$/);
      await expect(
        page.getByRole("heading", { name: "Three steps to a trade" }),
      ).toBeInViewport();
    });
  }
});
