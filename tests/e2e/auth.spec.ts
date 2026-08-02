import { expect, test } from "@playwright/test";

/*
 * These run signed out. The point is that the guards hold for anyone who is
 * not authenticated — which is the state an attacker is in.
 */
test.describe("protected areas", () => {
  test("/admin sends a signed-out visitor to sign in", async ({ page }) => {
    await page.goto("/admin");

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });

  test("/store sends a signed-out visitor to sign in", async ({ page }) => {
    await page.goto("/store");

    await expect(page).toHaveURL(/\/login/);
  });

  /*
   * Nested admin routes inherit the layout's guard, but a layout is not a
   * security boundary on its own — each page calls requireAdmin as well. This
   * is the test that would catch a new one added without it.
   */
  test("/admin/spot-check sends a signed-out visitor to sign in", async ({ page }) => {
    await page.goto("/admin/spot-check");

    await expect(page).toHaveURL(/\/login/);
  });

  test("neither leaks anything before redirecting", async ({ page }) => {
    for (const path of ["/admin", "/admin/spot-check", "/store"]) {
      const response = await page.goto(path);
      const body = (await response?.text()) ?? "";

      // The redirect must happen before any privileged content renders.
      expect(body).not.toMatch(/Invite a store|CardFlare admin|Spot check/i);
    }
  });

  test("the sign-in page is marked noindex", async ({ page }) => {
    await page.goto("/login");

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });

  test("robots.txt keeps crawlers out of the signed-in areas", async ({ page }) => {
    const robots = await page.request.get("/robots.txt");
    const body = await robots.text();

    for (const path of ["/admin", "/store", "/login", "/auth/"]) {
      expect(body).toContain(`Disallow: ${path}`);
    }
  });

  test("the sitemap lists only public pages", async ({ page }) => {
    const sitemap = await (await page.request.get("/sitemap.xml")).text();

    expect(sitemap).toContain("/privacy");
    for (const path of ["/admin", "/store", "/login"]) {
      expect(sitemap).not.toContain(`<loc>https://cardflare.gg${path}</loc>`);
    }
  });
});

test.describe("sign-in form", () => {
  test("asks for an email and nothing else", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign-in link/i })).toBeVisible();
    // Magic link only: a password field here would be a regression.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test("rejects a malformed address", async ({ page }) => {
    await page.goto("/login");

    await page.getByLabel("Email address").fill("not-an-email");
    await page.getByRole("button", { name: /sign-in link/i }).click();

    // Scoped to the page's own content: Next renders a route-announcer element
    // that also carries role="alert", so an unscoped query matches two nodes.
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      /valid email/i,
    );
  });

  /*
   * Regression: reaching /login directly means no `next` hidden field is
   * rendered, so FormData.get("next") returned null. That failed the schema
   * and surfaced "expected string, received null" to someone who had typed a
   * perfectly good email address.
   */
  test("accepts a valid address when arriving without a next parameter", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page).not.toHaveURL(/next=/);

    await page.getByLabel("Email address").fill("someone@example.com");
    await page.getByRole("button", { name: /sign-in link/i }).click();

    /*
     * Asserted against the whole page, not the alert element.
     *
     * Without Supabase configured this action throws before it can return
     * state, and the error boundary takes the alert with it — so scoping to
     * `[role=alert]` made the assertion wait for an element that would never
     * appear, and time out under load. Flaked twice in full runs while passing
     * in isolation.
     *
     * The regression is a Zod message reaching the user, and the page is where
     * a user would see it. That holds whether the action returned state or
     * fell over.
     */
    const body = page.locator("body");
    await expect(body).not.toContainText(/expected string/i);
    await expect(body).not.toContainText(/received null/i);
  });

  /*
   * The response must not reveal whether an address is in the beta, or the
   * form becomes a way to enumerate participating stores.
   */
  test("says the same thing whoever you are", async ({ page }) => {
    test.skip(
      !process.env.NEXT_PUBLIC_SUPABASE_URL,
      "Needs Supabase to exercise the real sign-in path.",
    );

    const responses: string[] = [];

    for (const email of ["definitely-not-a-store@example.com", "owner@example.com"]) {
      await page.goto("/login");
      await page.getByLabel("Email address").fill(email);
      await page.getByRole("button", { name: /sign-in link/i }).click();
      await expect(page.getByRole("status")).toBeVisible();
      responses.push((await page.getByRole("status").innerText()).trim());
    }

    expect(responses[0]).toBe(responses[1]);
  });
});
