import { expect, test } from "@playwright/test";

test.describe("event routes are protected", () => {
  test("an event page sends a signed-out visitor to sign in", async ({ page }) => {
    await page.goto("/store/events/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    await expect(page).toHaveURL(/\/login/);
  });

  test("nothing about an event leaks before redirecting", async ({ page }) => {
    const response = await page.goto(
      "/store/events/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    );
    const body = (await response?.text()) ?? "";

    expect(body).not.toMatch(/join code|Open the room/i);
  });

  test("crawlers are kept out of the join routes", async ({ page }) => {
    const robots = await (await page.request.get("/robots.txt")).text();

    for (const path of ["/join", "/e/"]) {
      expect(robots).toContain(`Disallow: ${path}`);
    }
  });

  test("the sitemap still lists only public marketing pages", async ({ page }) => {
    const sitemap = await (await page.request.get("/sitemap.xml")).text();

    for (const path of ["/join", "/store", "/admin", "/play"]) {
      expect(sitemap).not.toContain(`<loc>https://cardflare.gg${path}</loc>`);
    }
  });
});

test.describe("joining by typed code", () => {
  test("offers a code field and nothing that needs an account", async ({ page }) => {
    await page.goto("/join");

    await expect(page.getByLabel("Event code")).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });

  test("is marked noindex", async ({ page }) => {
    await page.goto("/join");

    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });

  test("reports a malformed code without needing a database", async ({ page }) => {
    await page.goto("/join");
    await page.getByLabel("Event code").fill("!!!!!!");
    await page.getByRole("button", { name: /find event/i }).click();

    const alert = page.getByRole("main").getByRole("alert");
    await expect(alert).toBeVisible();
    // Never the internals, whatever went wrong.
    await expect(alert).not.toContainText(/supabase|postgres|service.role/i);
  });

  /*
   * A malformed code and a well-formed one that matches nothing must be
   * indistinguishable, or the form confirms the code alphabet and length to
   * anyone probing it. Needs a database: without one the unknown-code path
   * correctly reports an outage instead, which is a different message on
   * purpose.
   */
  test("says the same thing for a malformed code as for an unknown one", async ({
    page,
  }) => {
    test.skip(
      !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Supabase is not configured in this environment.",
    );

    const messages: string[] = [];

    for (const code of ["!!!!!!", "K3M9PZ"]) {
      await page.goto("/join");
      await page.getByLabel("Event code").fill(code);
      await page.getByRole("button", { name: /find event/i }).click();

      const alert = page.getByRole("main").getByRole("alert");
      await expect(alert).toBeVisible();
      messages.push((await alert.innerText()).trim());
    }

    expect(messages[0]).toBe(messages[1]);
  });

  test("keeps what was typed so it can be corrected", async ({ page }) => {
    await page.goto("/join");

    await page.getByLabel("Event code").fill("K3M9PZ");
    await page.getByRole("button", { name: /find event/i }).click();

    await expect(page.getByLabel("Event code")).toHaveValue("K3M9PZ");
  });

  /*
   * Rejected by shape before any query, so this holds with or without a
   * database — and it is the case a crawler or scanner will actually hit.
   */
  test("a malformed code in the URL is a 404", async ({ page }) => {
    const response = await page.goto("/e/nonsense");

    expect(response?.status()).toBe(404);
  });

  /*
   * Regression: this used to be a 500. `getSupabaseAdmin` throws when the
   * service-role key is absent, so an outage turned a page reached by
   * scanning a printed code into a crash. It must always be a real page.
   */
  test("a well-formed unknown code never returns a server error", async ({ page }) => {
    const response = await page.goto("/e/K3M9PZ");
    const status = response?.status() ?? 0;

    expect(status).toBeLessThan(500);

    const body = (await response?.text()) ?? "";
    expect(body).not.toMatch(/supabase|service.role|SUPABASE_/i);
  });
});
