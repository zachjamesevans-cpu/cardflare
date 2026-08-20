import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ANIMATED_AVATAR_MAX_BYTES,
  ANIMATED_AVATAR_MAX_FRAMES,
  animatedAvatarObjectPath,
  avatarContentType,
  avatarPathFor,
  checkAnimatedAvatarFile,
  looksLikeGif,
} from "@/lib/players/profile-image";
import { tierAllows, TIERS } from "@/lib/tiers";

/**
 * Animated avatars, and who gets to have one.
 *
 * The founder: "make your avatar a GIF file, that will be viewable in
 * the room and the profile. this will be a pro and up only feature."
 *
 * The gate is the interesting half. A GIF that animates for a free
 * player is the feature leaking; a picture that VANISHES when somebody
 * drops off Pro is worse than the leak, because it looks like data
 * loss. Both are decided by `avatarPathFor`, so that is what most of
 * this exercises.
 */

describe("who may have a moving picture", () => {
  it("is pro and up, and nobody else", () => {
    expect(tierAllows("free", "animatedAvatar")).toBe(false);
    expect(tierAllows(null, "animatedAvatar")).toBe(false);
    expect(tierAllows("pro", "animatedAvatar")).toBe(true);
    expect(tierAllows("ultra", "animatedAvatar")).toBe(true);
    expect(tierAllows("max", "animatedAvatar")).toBe(true);
  });

  it("treats a tier nobody defined as free", () => {
    /* A row hand-edited to something unexpected must not open a gate. */
    expect(tierAllows("platinum", "animatedAvatar")).toBe(false);
    expect(tierAllows("", "animatedAvatar")).toBe(false);
  });

  it("has a home for every tier in the ladder", () => {
    for (const tier of TIERS) {
      expect(typeof tierAllows(tier, "animatedAvatar")).toBe("boolean");
    }
  });
});

describe("which picture gets served", () => {
  const both = { avatar_url: "p/1.jpg", avatar_animated: "p/1.gif" };

  it("gives a Pro their animation", () => {
    expect(avatarPathFor({ ...both, tier: "pro" })).toBe("p/1.gif");
    expect(avatarPathFor({ ...both, tier: "max" })).toBe("p/1.gif");
  });

  it("gives a free player the still, not the GIF", () => {
    expect(avatarPathFor({ ...both, tier: "free" })).toBe("p/1.jpg");
  });

  it("falls back to the still when Pro lapses, rather than to nothing", () => {
    /* The whole downgrade story. The GIF stays in the bucket and comes
       back if the tier does; what must never happen is a profile
       picture disappearing because a subscription ended. */
    const lapsed = avatarPathFor({ ...both, tier: "free" });
    expect(lapsed).toBe("p/1.jpg");
    expect(lapsed).not.toBeNull();
  });

  it("leaves a player with no animation exactly as they were", () => {
    expect(avatarPathFor({ avatar_url: "p/1.jpg", tier: "pro" })).toBe("p/1.jpg");
    expect(avatarPathFor({ avatar_url: "p/1.jpg", tier: "free" })).toBe("p/1.jpg");
  });

  it("still means initials when there is no picture at all", () => {
    expect(avatarPathFor({ tier: "pro" })).toBeNull();
    expect(avatarPathFor({ avatar_url: null, avatar_animated: null })).toBeNull();
  });
});

describe("what counts as a GIF", () => {
  function gifBytes(header: string, length = 64): Uint8Array {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < header.length; i += 1) bytes[i] = header.charCodeAt(i);
    return bytes;
  }

  it("accepts both GIF headers that exist", () => {
    expect(looksLikeGif(gifBytes("GIF89a"))).toBe(true);
    expect(looksLikeGif(gifBytes("GIF87a"))).toBe(true);
  });

  it("refuses a JPEG renamed to .gif", () => {
    const jpeg = new Uint8Array(64);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    expect(looksLikeGif(jpeg)).toBe(false);
  });

  it("refuses something too short to be a GIF at all", () => {
    expect(looksLikeGif(gifBytes("GIF89a", 6))).toBe(false);
    expect(looksLikeGif(new Uint8Array(0))).toBe(false);
  });

  it("checks the file a player picked before it is sent", () => {
    expect(checkAnimatedAvatarFile({ size: 500_000, type: "image/gif" }).ok).toBe(true);
    expect(checkAnimatedAvatarFile({ size: 0, type: "image/gif" }).ok).toBe(false);
    expect(checkAnimatedAvatarFile({ size: 500, type: "image/png" }).ok).toBe(false);
    expect(
      checkAnimatedAvatarFile({
        size: ANIMATED_AVATAR_MAX_BYTES + 1,
        type: "image/gif",
      }).ok,
    ).toBe(false);
  });

  it("says every refusal in words, with no em dashes", () => {
    for (const file of [
      { size: 0, type: "image/gif" },
      { size: 500, type: "image/png" },
      { size: ANIMATED_AVATAR_MAX_BYTES + 1, type: "image/gif" },
    ]) {
      const said = checkAnimatedAvatarFile(file);
      expect(said.ok).toBe(false);
      if (said.ok) return;
      expect(said.message.length).toBeGreaterThan(10);
      expect(said.message).not.toContain("—");
    }
  });
});

describe("where it is stored and how it is served", () => {
  it("lands in the player's own folder, stamped", () => {
    const path = animatedAvatarObjectPath("player-1", 1_700_000_000_000);
    expect(path).toBe("player-1/1700000000000.gif");
  });

  it("is served as a GIF, and the still beside it is not", () => {
    expect(avatarContentType("p/1.gif")).toBe("image/gif");
    expect(avatarContentType("p/1.jpg")).toBe("image/jpeg");
    expect(avatarContentType("p/1.webp")).toBe("image/webp");
  });

  it("caps the loop by asking how long it is first", () => {
    /*
     * The founder's GIF was refused with "that file could not be read
     * as a GIF" because `pages` was set to the cap outright, and
     * libvips throws "bad page number" when a four-frame file is asked
     * for sixty. Nearly every GIF is shorter than the cap, so nearly
     * every GIF was refused. The cap has to be a MINIMUM against the
     * real page count, never a demand.
     */
    expect(ANIMATED_AVATAR_MAX_FRAMES).toBeGreaterThan(1);
    expect(ANIMATED_AVATAR_MAX_FRAMES).toBeLessThanOrEqual(120);

    const source = readFileSync(
      join(process.cwd(), "src/lib/players/profile.ts"),
      "utf8",
    );
    /* Whatever the cap is on a given rung, it is always a floor
       against the file's real length rather than a demand. */
    expect(source).toContain("Math.min(probe.pages ?? 1, rung.frames)");
    expect(source).not.toContain("pages: ANIMATED_AVATAR_MAX_FRAMES");
  });

  it("shrinks a heavy GIF instead of refusing it", () => {
    /* The founder asked whether to compress by hand or pay for a
       bigger limit. Neither: each rung gives up a little size, then
       frames, then palette, and the first one under target is stored.
       Only a file that survives every rung is turned away. */
    const source = readFileSync(
      join(process.cwd(), "src/lib/players/profile.ts"),
      "utf8",
    );
    expect(source).toContain("const rungs");
    expect(source).toContain("ANIMATED_AVATAR_MAX_STORED_BYTES");
    /* Descending, so the cheapest sacrifice is tried first. */
    const sizes = [...source.matchAll(/size: (\d+), frames/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(2);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
  });

  it("forgives a GIF that has been round a few tools", () => {
    /* A photograph out of a camera is clean; a GIF off the internet
       carries warning-level oddities no viewer cares about. Truncated
       is still refused. */
    const source = readFileSync(
      join(process.cwd(), "src/lib/players/profile.ts"),
      "utf8",
    );
    expect(source).toContain('failOn: "truncated"');
  });

  it("is served from our own origin, never the storage host", () => {
    /* The same rule the pictures follow, for the same reason: a phone
       on real-world wifi could not fetch the storage host, and that is
       why the founder's ring did not appear in the app. */
    const art = readFileSync(
      join(process.cwd(), "src/lib/players/art-files.ts"),
      "utf8",
    );
    expect(art).toContain("/api/avatars/");
    /* The word survives in the comment explaining why it went. */
    expect(art).not.toMatch(/\.getPublicUrl\(/);
  });

  it("names the new formats honestly through the proxy", () => {
    expect(avatarContentType("cosmetics/x.svg")).toBe("image/svg+xml");
    expect(avatarContentType("cosmetics/x.html")).toBe("text/html; charset=utf-8");
  });

  it("the app's frame is allowed to load the art it was given", () => {
    /*
     * An empty originWhitelist does not mean "deny navigation", it
     * means "deny everything, including the page you were asked to
     * show", and a flat false from onShouldStartLoadWithRequest blocks
     * the first load too. Both were in the first cut, and between them
     * no ring could ever appear on a phone.
     */
    const film = readFileSync(
      join(process.cwd(), "mobile/src/cosmetic-film.tsx"),
      "utf8",
    );
    expect(film).not.toContain("originWhitelist={[]}");
    expect(film).not.toContain("onShouldStartLoadWithRequest={() => false}");
    /* By prefix, not equality: iOS may re-serialise our own query
       encoding, and an equality check would refuse our own page. And
       against every spelling of our host, because the apex 308s to www
       and a redirect is a navigation the gate has to admit. */
    expect(film).toContain("request.url.startsWith(`${origin}/cosmetic-player`)");
    expect(film).toContain("siteOrigins().some((origin) =>");
    /* And iOS paints a white page behind a WebView without this. */
    expect(film).toContain("opaque={false}");
    /*
     * The containment that actually matters is still off for uploaded
     * art. It is ON for exactly one thing - our own Rive player page,
     * where the script is our bundle and the uploaded file is data it
     * reads - and `player` is null for every other kind, so this
     * expression IS the rule rather than a comment about it. See
     * tests/unit/cosmetic-player.test.ts.
     */
    expect(film).toContain('javaScriptEnabled={art.kind === "rive"}');
  });
});

describe("the column reaches the database", () => {
  const sql = readdirSync(join(process.cwd(), "supabase/migrations"))
    .map((file) =>
      readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8"),
    )
    .join("\n");

  it("adds a place for the animation without touching the still", () => {
    expect(sql).toContain("add column if not exists avatar_animated");
    /* The still column is never dropped or renamed: it is the fallback
       that keeps a lapsed Pro's face on their profile. */
    expect(sql).not.toContain("drop column avatar_url");
  });

  it("writes both objects on an animated upload", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/players/profile.ts"),
      "utf8",
    );
    expect(source).toContain("avatar_url: stillPath, avatar_animated: gifPath");
  });

  it("checks the tier where the column is written, not only at the door", () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/players/profile.ts"),
      "utf8",
    );
    expect(source).toContain('tierAllows(player.tier, "animatedAvatar")');
  });
});
