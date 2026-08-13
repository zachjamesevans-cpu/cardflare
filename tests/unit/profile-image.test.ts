import { describe, expect, it } from "vitest";

import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  AVATAR_SIZE,
  avatarObjectPath,
  checkAvatarFile,
} from "@/lib/players/profile-image";

/**
 * The limits on a profile picture.
 *
 * The founder's brief was "keep the image size normal and usual, no
 * crazy upload size", so what is actually being tested here is that the
 * numbers the UI quotes, the numbers the Server Action enforces and the
 * numbers in the storage bucket are all the same numbers.
 */

const png = { size: 100_000, type: "image/png" };

describe("checkAvatarFile", () => {
  it("accepts an ordinary phone photo", () => {
    expect(checkAvatarFile(png)).toEqual({ ok: true });
    expect(checkAvatarFile({ size: 1_900_000, type: "image/jpeg" })).toEqual({
      ok: true,
    });
  });

  it("accepts every type the bucket allows, and only those", () => {
    for (const type of AVATAR_MIME_TYPES) {
      expect(checkAvatarFile({ size: 1000, type }).ok).toBe(true);
    }
    for (const type of ["image/gif", "image/svg+xml", "application/pdf", "text/html"]) {
      expect(checkAvatarFile({ size: 1000, type }).ok).toBe(false);
    }
  });

  it("refuses an empty file rather than sending nothing to the encoder", () => {
    expect(checkAvatarFile({ size: 0, type: "image/png" }).ok).toBe(false);
  });

  it("refuses anything over the ceiling, exactly at the ceiling", () => {
    expect(checkAvatarFile({ size: AVATAR_MAX_BYTES, type: "image/png" }).ok).toBe(
      true,
    );
    expect(checkAvatarFile({ size: AVATAR_MAX_BYTES + 1, type: "image/png" }).ok).toBe(
      false,
    );
  });

  it("says what to do about it, in words, with no em dash", () => {
    const rejected = checkAvatarFile({ size: AVATAR_MAX_BYTES + 1, type: "image/png" });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.message).toMatch(/2MB/);
      /* Customer-facing copy: the founder's standing rule. */
      expect(rejected.message).not.toContain("—");
    }
  });

  it("keeps the ceiling at the bucket's own file_size_limit", () => {
    // supabase/migrations/20260827090000_profiles_embers.sql
    expect(AVATAR_MAX_BYTES).toBe(2_097_152);
  });
});

describe("avatarObjectPath", () => {
  it("files a picture under the player it belongs to", () => {
    expect(avatarObjectPath("player-1", 1000)).toBe("player-1/1000.webp");
  });

  /*
   * The timestamp is what makes a new picture actually appear. A fixed
   * path would be cached by every CDN and browser between the bucket and
   * a phone at a counter, and the player would swear the upload failed.
   */
  it("gives a new picture a new path, so no cache can serve the old one", () => {
    expect(avatarObjectPath("player-1", 1000)).not.toBe(
      avatarObjectPath("player-1", 2000),
    );
  });

  it("stores a square, at the one size the app renders", () => {
    expect(AVATAR_SIZE).toBe(512);
  });
});
