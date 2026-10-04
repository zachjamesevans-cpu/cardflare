import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Edit profile, laid out the way Instagram lays it out, and the two
 * lines it adds to the profile header.
 *
 * The founder: "match the edit profile screen to this. Add bio,
 * pronouns, username editing, name changing, into a menu that looks
 * like this. The avatar effects should also be here." Read off the
 * source, because this runner is Node with no renderer: this proves
 * the rows are still WRITTEN in that order with those words, not that
 * a browser drew them.
 */
const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("Edit profile", () => {
  const page = read("src/app/profile/edit/page.tsx");
  const rows = read("src/components/players/edit-profile-rows.tsx");
  const door = read("src/components/players/picture-door.tsx");

  it("lists Name, Username, Pronouns, Bio, in that order", () => {
    const labels = [...rows.matchAll(/\{ key: "\w+", label: "([^"]+)" \}/g)].map(
      (match) => match[1],
    );
    expect(labels).toEqual(["Name", "Username", "Pronouns", "Bio"]);
    expect(page).toContain("<EditProfileRows");
  });

  it("shows the muted placeholders when there is nothing yet", () => {
    expect(rows).toContain('"Add pronouns"');
    expect(rows).toContain('"Add a bio"');
    expect(rows).toContain("text-text-muted");
  });

  it("draws the label muted, the value primary, a hairline between rows", () => {
    expect(rows).toContain("text-text-secondary");
    expect(rows).toContain("text-text-primary");
    expect(rows).toContain("border-b border-border");
  });

  it("opens a row into the one action that already saves it", () => {
    expect(rows).toContain("renameProfileAction(previous, formData)");
    expect(rows).toContain("changeHandleAction(previous, formData)");
    expect(rows).toContain("setAboutAction(previous, formData)");
    /* One row open at a time. */
    expect(rows).toContain("useState<RowKey | null>(null)");
  });

  it("keeps the bio and pronouns within the schema's ceilings", () => {
    expect(rows).toContain("maxLength={max}");
    expect(rows).toContain('field === "bio" ? BIO_MAX : PRONOUNS_MAX');
  });

  it("puts the avatar effects beside the picture, behind the wand", () => {
    expect(page).toContain("<PictureDoor");
    expect(door).toContain('href="/profile/customize"');
    expect(door).toContain("<Wand2");
    expect(door).toContain("Edit picture or avatar");
    /* The picture and cover controls are behind that one link. */
    expect(page).toContain("<AvatarForm");
    expect(page).toContain("<CoverForm");
  });

  it("is where settings sends you for your name and username", () => {
    const settings = read("src/app/profile/settings/page.tsx");
    expect(settings).toContain('href="/profile/edit"');
    expect(settings).toContain("Name and username");
    expect(settings).not.toContain("DisplayNameForm");
    expect(settings).not.toContain("HandleForm");
  });
});

describe("the profile header", () => {
  const header = read("src/components/players/profile-header.tsx");

  it("shows pronouns after the handle and the bio under it", () => {
    expect(header).toContain("pronouns?: string | null");
    expect(header).toContain("bio?: string | null");
    /* "@handle · he/him": the dot is decoration, not read aloud. */
    expect(header).toContain('<span aria-hidden="true"> · </span>');
    expect(header).toContain(
      '<p className="text-sm whitespace-pre-line text-text-secondary">{bio}</p>',
    );
    expect(header).toContain("{bio && (");
  });

  it("is handed both lines by the own profile and the public one", () => {
    for (const path of ["src/app/profile/page.tsx", "src/app/p/[playerId]/page.tsx"]) {
      const source = read(path);
      expect(source).toContain("pronouns={profile.pronouns}");
      expect(source).toContain("bio={profile.bio}");
    }
  });
});

describe("the three dots and the sheet behind them", () => {
  it("are on the compact card too", () => {
    /* "The 3 dots contextual menu isn't present in the compact view." */
    const compact = read("src/components/feed/flare-feed-card-compact.tsx");
    expect(compact).toContain("<PostMenu");
    expect(compact).toContain(
      'import { PostMenu, UnlessHidden } from "@/components/feed/post-actions"',
    );
  });

  it("open over a blur that fades in, not a black wall", () => {
    /* "a black full screen opaque thing that slides up from the
       bottom... Remove that thing entirely... slightly blur the
       background instead, like fade into it." */
    const sheet = read("src/components/ui/sheet.tsx");
    expect(sheet).not.toContain("backdrop:bg-black/75");
    expect(sheet).toContain("backdrop:bg-black/30 backdrop:backdrop-blur-md");
    expect(sheet).toContain("motion-safe:backdrop:animate-[cf-sheet-in_");
    expect(sheet).toContain("motion-safe:animate-[cf-sheet-in_");
    const css = read("src/app/globals.css");
    const frames = css.slice(
      css.indexOf("@keyframes cf-sheet-in"),
      css.indexOf("@keyframes cf-flare-in"),
    );
    expect(frames).toContain("opacity: 0;");
    expect(frames).toContain("opacity: 1;");
    /* Opacity only: the dialog never slides. */
    expect(frames).not.toContain("transform");
  });
});
