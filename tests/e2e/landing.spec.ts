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
   * Stores are invited, so there is no signup to advertise — but an invited
   * owner arriving at the landing page needs a way in that is not "remember
   * the /login URL". In the header since the founder moved it up: an owner on
   * a phone should not have to scroll the whole landing page to get in.
   */
  test("the header offers a store sign-in", async ({ page, isMobile }) => {
    await page.goto("/");
    await openNav(page, isMobile);

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: /store sign-in/i })
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
   * Named for its audience on purpose. A player has no account and must never
   * conclude they need one — scanning a code is the whole point.
   */
  test("does not invite players to sign in or register", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: /^sign in$/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /sign up|register/i })).toHaveCount(0);
  });

  /*
   * Regression: these anchors were bare fragments (`#waitlist`), which do
   * nothing on a page that has no such element. Clicking the header CTA on
   * /privacy just rewrote the address bar and stranded the visitor.
   */
  for (const path of ["/privacy", "/terms"] as const) {
    test(`header CTA on ${path} reaches the waitlist form`, async ({
      page,
      isMobile,
    }) => {
      await page.goto(path);
      await openNav(page, isMobile);

      await page
        .getByRole("navigation", { name: "Main" })
        .getByRole("link", { name: "Join the Waitlist" })
        .click();

      await expect(page).toHaveURL(/\/#waitlist$/);
      await expect(page.getByLabel("Email address")).toBeInViewport();
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
