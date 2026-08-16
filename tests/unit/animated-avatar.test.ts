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

  it("caps the loop at a couple of seconds rather than refusing it", () => {
    /* Enforced by decoding only this many pages, so a long GIF is
       shortened instead of turned away. */
    expect(ANIMATED_AVATAR_MAX_FRAMES).toBeGreaterThan(1);
    expect(ANIMATED_AVATAR_MAX_FRAMES).toBeLessThanOrEqual(120);

    const source = readFileSync(
      join(process.cwd(), "src/lib/players/profile.ts"),
      "utf8",
    );
    expect(source).toContain("pages: ANIMATED_AVATAR_MAX_FRAMES");
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
