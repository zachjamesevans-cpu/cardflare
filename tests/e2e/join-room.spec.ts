import { expect, test } from "@playwright/test";

/**
 * The store-side and player-side flows both need a live event row, so the
 * assertions that depend on one skip rather than fail. What can be checked
 * without a database is checked, because these are the routes a stranger with
 * a phone reaches.
 */
test.describe("event room", () => {
  test("a malformed code is a 404 before anything is queried", async ({ page }) => {
    const response = await page.goto("/e/nonsense");

    expect(response?.status()).toBe(404);
  });

  test("an unknown room never returns a server error", async ({ page }) => {
    const response = await page.goto("/e/K3M9PZ");

    expect(response?.status() ?? 0).toBeLessThan(500);

    const body = (await response?.text()) ?? "";
    expect(body).not.toMatch(/supabase|service.role|SUPABASE_/i);
  });

  /*
   * The Flare board and the Have list only exist for someone who has joined.
   * A stranger loading the URL gets the join form and nothing else — and a
   * Have list in particular is an inventory of valuable things a named person
   * is carrying, so it must never render for a visitor.
   */
  test("shows no lists to someone who has not joined", async ({ page }) => {
    await page.goto("/e/K3M9PZ");

    const body = await page.locator("body").innerText();

    expect(body).not.toMatch(/wanted in this room|what you brought|post a flare/i);
  });

  test("the room is never indexed", async ({ page }) => {
    await page.goto("/e/K3M9PZ");

    const robots = page.locator('meta[name="robots"]');
    if ((await robots.count()) > 0) {
      await expect(robots).toHaveAttribute("content", /noindex/);
    }

    const txt = await (await page.request.get("/robots.txt")).text();
    expect(txt).toContain("Disallow: /e/");
  });

  /*
   * Joining a room must never render an image from anywhere. Avatars are
   * generated from initials precisely so there is nothing to host or license.
   */
  test("renders no remote images", async ({ page }) => {
    await page.goto("/e/K3M9PZ");

    const remote = await page
      .locator("img")
      .evaluateAll((nodes) =>
        nodes
          .map((node) => (node as HTMLImageElement).getAttribute("src") ?? "")
          .filter((src) => /^https?:\/\//.test(src)),
      );

    expect(remote).toEqual([]);
  });

  test("a player joins, appears in the lobby, and can leave", async ({
    page,
    context,
  }) => {
    test.skip(
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
        !process.env.SUPABASE_SERVICE_ROLE_KEY ||
        !process.env.E2E_EVENT_CODE,
      "Needs Supabase and E2E_EVENT_CODE pointing at an open event.",
    );

    const code = process.env.E2E_EVENT_CODE!;
    await page.goto(`/e/${code}`);

    await page.getByLabel(/what should other players call you/i).fill("E2E Player");
    await page.getByRole("button", { name: /join/i }).click();

    await expect(page.getByText("E2E Player")).toBeVisible();
    await expect(page.getByText(/in this room/i)).toBeVisible();
    await expect(page.getByText(/here now/i)).toBeVisible();

    // The session cookie is a bearer credential and must stay out of script.
    const cookie = (await context.cookies()).find((c) => c.name === "cf_player");
    expect(cookie?.httpOnly).toBe(true);

    // Re-scanning the printed code must rejoin, not duplicate.
    await page.goto(`/e/${code}`);
    await expect(page.getByText("E2E Player")).toHaveCount(2);

    await page.getByRole("button", { name: /leave this room/i }).click();
    await expect(page.getByLabel(/what should other players call you/i)).toBeVisible();
  });
});
