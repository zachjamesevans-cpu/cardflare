import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LOCAL_ENABLED as WEB } from "@/lib/local/enabled";
import { LOCAL_ENABLED as APP } from "../../mobile/src/local-enabled";

/**
 * Local is off, on both platforms, by one constant each.
 *
 * The founder's call on 2026-09-02: the room is the product; Local is
 * kept, built, and switched off. These hold the two copies of the
 * switch equal and pin what "off" means on each surface, so Local
 * cannot creep back on one platform without the other.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("the Local switch", () => {
  it("is the same on the website and in the app", () => {
    expect(APP).toBe(WEB);
  });

  it("is off", () => {
    expect(WEB).toBe(false);
  });

  it("puts the Room tab back and keeps the conversations readable", () => {
    /* Every door into the room goes through one helper, so the tab
       and the stack arrangements cannot be mixed. */
    const home = read("mobile/src/screens/home.tsx");
    expect(home).not.toContain('navigate("Room")');
    expect(home).toContain("openRoom(navigation)");
    const app = read("mobile/App.tsx");
    expect(app).toContain("openRoom(navigation)");
    expect(app).toContain('name="Messages"');

    /* The Inbox's message notices still open somewhere on both. */
    const inbox = read("mobile/src/screens/inbox.tsx");
    expect(inbox).toContain('navigate("Messages")');
    const page = read("src/app/local/page.tsx");
    expect(page).toContain('LOCAL_ENABLED ? "Local" : "Messages"');
  });

  it("keeps the Local endpoints answering for older app builds", () => {
    for (const route of [
      "src/app/api/v1/local/route.ts",
      "src/app/api/v1/local/flares/route.ts",
      "src/app/api/v1/local/threads/route.ts",
    ]) {
      expect(read(route)).not.toContain("LOCAL_ENABLED");
    }
  });
});
