import { expect, test } from "@playwright/test";

test.describe("joining as a player", () => {
  test("asks only for a display name", async ({ page }) => {
    await page.goto("/play");

    await expect(page.getByLabel(/what should other players call you/i)).toBeVisible();

    // The whole point is that there is no account. Any of these is a regression.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
  });

  test("is not indexed and not in the sitemap", async ({ page }) => {
    await page.goto("/play");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );

    const robots = await (await page.request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /play");

    const sitemap = await (await page.request.get("/sitemap.xml")).text();
    expect(sitemap).not.toContain("<loc>https://cardflare.gg/play</loc>");
  });

  test("rejects a name that is too short, keeping what was typed", async ({ page }) => {
    await page.goto("/play");

    await page.getByLabel(/what should other players call you/i).fill("Z");
    await page.getByRole("button", { name: /continue/i }).click();

    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      /at least 2 characters/i,
    );
    await expect(page.getByLabel(/what should other players call you/i)).toHaveValue(
      "Z",
    );
  });

  /**
   * Requires a database, since joining writes a session row. Skipped rather
   * than failed so the suite stays meaningful without one, and honest about
   * what it did not cover.
   */
  test("signs the player in and remembers them", async ({ page, context }) => {
    test.skip(
      !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Supabase is not configured in this environment.",
    );

    await page.goto("/play");
    await page.getByLabel(/what should other players call you/i).fill("Zach E2E");
    await page.getByRole("button", { name: /continue/i }).click();

    await expect(page.getByText("Zach E2E")).toBeVisible();

    // The credential must never be readable by script on the page.
    const cookie = (await context.cookies()).find((c) => c.name === "cf_player");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(await page.evaluate(() => document.cookie)).not.toContain("cf_player");

    // A reload must not ask again.
    await page.reload();
    await expect(page.getByText("Zach E2E")).toBeVisible();
  });

  test("lets a player change their name and leave", async ({ page, context }) => {
    test.skip(
      !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Supabase is not configured in this environment.",
    );

    await page.goto("/play");
    await page.getByLabel(/what should other players call you/i).fill("Before");
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText("Before")).toBeVisible();

    await page.getByRole("button", { name: /change your display name/i }).click();
    await page.getByLabel("Display name").fill("After");
    await page.getByRole("button", { name: /^save$/i }).click();
    await expect(page.getByText("After")).toBeVisible();

    await page.getByRole("button", { name: /leave and forget/i }).click();

    await expect(page.getByLabel(/what should other players call you/i)).toBeVisible();
    expect(
      (await context.cookies()).find((c) => c.name === "cf_player"),
    ).toBeUndefined();
  });
});
