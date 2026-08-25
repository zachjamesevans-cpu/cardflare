import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import * as app from "../../mobile/src/local-shared";
import * as web from "../../src/lib/local/shared";

/**
 * Local's shared values, held identical across the platforms.
 *
 * The app cannot import across the workspace boundary, so
 * mobile/src/local-shared.ts is a copy of src/lib/local/shared.ts —
 * and a copy is only safe with a test standing on it, the same
 * arrangement worn-words has. A radius offered on one platform and
 * rejected by the other would be a settings screen that lies.
 */
describe("Local's shared values agree across platforms", () => {
  it("offers the same distances", () => {
    expect([...app.LOCAL_RADII]).toEqual([...web.LOCAL_RADII]);
    expect(app.DEFAULT_LOCAL_RADIUS).toBe(web.DEFAULT_LOCAL_RADIUS);
  });

  it("caps messages at the same length", () => {
    expect(app.MESSAGE_MAX_LENGTH).toBe(web.MESSAGE_MAX_LENGTH);
  });

  it("says distances the same way", () => {
    for (const miles of [0, 0.4, 0.9, 1, 1.4, 12.6, 48]) {
      expect(app.milesLabel(miles)).toBe(web.milesLabel(miles));
    }
    expect(web.milesLabel(0.4)).toBe("nearby");
    expect(web.milesLabel(12.6)).toBe("13 mi");
  });

  it("says time the same way", () => {
    const now = Date.parse("2026-08-25T12:00:00Z");
    for (const iso of [
      "2026-08-25T11:59:40Z",
      "2026-08-25T11:30:00Z",
      "2026-08-25T03:00:00Z",
      "2026-08-22T12:00:00Z",
      "2026-08-01T12:00:00Z",
    ]) {
      expect(app.agoLabel(iso, now)).toBe(web.agoLabel(iso, now));
    }
    expect(web.agoLabel("2026-08-25T11:30:00Z", now)).toBe("30m");
    expect(web.agoLabel("2026-08-22T12:00:00Z", now)).toBe("3d");
  });

  it("matches the database's own list of radii", () => {
    /* The check constraint is the third copy of this list; the
       migration is read as text so a new radius cannot ship to one
       layer and not the others. */
    const migration = readFileSync(
      "supabase/migrations/20260926090000_local_tab.sql",
      "utf8",
    );
    expect(migration).toContain(
      `check (local_radius_miles in (${web.LOCAL_RADII.join(", ")}))`,
    );

    const messageCheck = `between 1 and ${web.MESSAGE_MAX_LENGTH}`;
    expect(migration).toContain(messageCheck);
  });
});
